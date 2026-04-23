"""
Shared logic for ``manage.py process_positions`` and the CRM client refresh endpoint.
"""
from __future__ import annotations

from datetime import date, datetime

from django.db import transaction as db_transaction
from django.utils import timezone

from api.models import Position, Product, Transaction
from api.position_service import (
    _group_calculation_periods_by_payment_period,
    create_interest_transaction_for_period_if_complete,
    generate_rates_for_investment,
    sync_position_statuses_from_schedule,
)


def _create_interest_transfers_for_validated_transactions_without_positions(
    now: datetime,
    *,
    client_id: str | None = None,
    dry_run: bool = False,
) -> tuple[int, int]:
    """
    Validated transfer transactions with no related positions: create interest at period end.
    Returns (checked_count, created_count).
    """
    candidates = (
        Transaction.objects.filter(type="transfert", status="valide")
        .exclude(transfer_to__isnull=True)
        .exclude(transfer_to="solde")
        .select_related("product", "client")
    )
    if client_id is not None:
        candidates = candidates.filter(client_id=client_id)

    created_count = 0
    checked_count = 0
    for txn in candidates.iterator():
        if Position.objects.filter(transaction_id=txn.id).exists():
            continue

        product = txn.product
        if not product and txn.transfer_to and txn.transfer_to != "solde":
            product = Product.objects.filter(id=txn.transfer_to).first()
        if not product:
            continue
        checked_count += 1

        period_summaries = generate_rates_for_investment(txn)
        if not period_summaries:
            continue

        payment_periods = _group_calculation_periods_by_payment_period(
            txn, product, period_summaries
        )

        for payment_group in payment_periods:
            payment_idx = payment_group.get("paymentPeriodIndex")
            if payment_idx is None:
                continue

            try:
                payment_end = payment_group.get("endDate")
                if not payment_end:
                    continue
                payment_end_date = date.fromisoformat(str(payment_end))
                if payment_end_date > now.date():
                    continue
            except Exception:
                continue

            calculation_periods = payment_group.get("calculationPeriods", [])
            if not calculation_periods:
                continue

            representative_period_idx = calculation_periods[-1]

            # In dry-run, we want to report "would create" without persisting any DB writes.
            # We rely on a savepoint rollback because the underlying helper creates rows.
            if dry_run:
                sp = db_transaction.savepoint()
                try:
                    interest_txn = create_interest_transaction_for_period_if_complete(
                        txn,
                        int(representative_period_idx),
                        trigger="process_positions_command_no_positions_dry_run",
                    )
                    if interest_txn:
                        created_count += 1
                finally:
                    db_transaction.savepoint_rollback(sp)
            else:
                interest_txn = create_interest_transaction_for_period_if_complete(
                    txn,
                    int(representative_period_idx),
                    trigger="process_positions_command_no_positions",
                )
                if interest_txn:
                    created_count += 1

    return checked_count, created_count


@db_transaction.atomic
def run_process_positions(
    *,
    client_id: str | None = None,
    dry_run: bool = False,
    interest_trigger: str = "process_positions_command",
) -> dict:
    """
    Same behavior as the ``process_positions`` management command, optionally scoped to one client.

    Returns a JSON-serializable dict (``now`` as ISO string after processing).
    """
    base = Position.objects.exclude(status="cancelled")
    if client_id is not None:
        base = base.filter(client_id=client_id)

    if dry_run:
        stats = sync_position_statuses_from_schedule(
            base,
            dry_run=True,
            run_interest_for_closed=False,
        )
        now = stats["now"]
        checked_n, would_create_fb = _create_interest_transfers_for_validated_transactions_without_positions(
            now,
            client_id=client_id,
            dry_run=True,
        )
        return {
            "dry_run": True,
            "client_id": client_id,
            "now": now.isoformat(),
            "to_pending": stats["to_pending"],
            "to_open": stats["to_open"],
            "to_done": stats["to_done"],
            "interest_transactions_created": 0,
            "fallback_interest_checked": checked_n,
            "fallback_interest_created": would_create_fb,
        }

    stats = sync_position_statuses_from_schedule(
        base,
        dry_run=False,
        run_interest_for_closed=True,
        interest_trigger=interest_trigger,
    )
    now = stats["now"]

    checked_n, created_fb = _create_interest_transfers_for_validated_transactions_without_positions(
        now, client_id=client_id, dry_run=False
    )

    return {
        "dry_run": False,
        "client_id": client_id,
        "now": now.isoformat(),
        "to_pending": stats["to_pending"],
        "to_open": stats["to_open"],
        "to_done": stats["to_done"],
        "interest_transactions_created": stats.get("interest_transactions_created", 0),
        "fallback_interest_checked": checked_n,
        "fallback_interest_created": created_fb,
    }
