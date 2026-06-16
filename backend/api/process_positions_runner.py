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


def create_missing_interest_for_transactions(
    now: datetime,
    *,
    client_id: str | None = None,
    transaction_ids: list[str] | None = None,
    dry_run: bool = False,
    trigger: str = "process_positions_backfill",
    only_without_positions: bool = False,
) -> dict:
    """
    Create missing periodic interest transactions for selected source transfers.

    Returns a JSON-serializable dict with per-transaction and summary stats.
    """
    candidates = (
        Transaction.objects.filter(type="transfert", status__in=["valide", "cloture"])
        .exclude(transfer_to__isnull=True)
        .exclude(transfer_to="solde")
        .select_related("product", "client")
    )
    if client_id is not None:
        candidates = candidates.filter(client_id=client_id)

    normalized_ids: list[str] | None = None
    if transaction_ids is not None:
        seen: set[str] = set()
        normalized_ids = []
        for raw_id in transaction_ids:
            txn_id = str(raw_id or "").strip()
            if not txn_id or txn_id in seen:
                continue
            seen.add(txn_id)
            normalized_ids.append(txn_id)
        candidates = candidates.filter(id__in=normalized_ids)

    checked_count = 0
    created_count = 0
    skipped_count = 0
    results: list[dict] = []

    for txn in candidates.iterator():
        result: dict = {
            "source_transaction_id": str(txn.id),
            "periods_checked": 0,
            "created_count": 0,
            "skipped_reason": None,
        }

        has_positions = Position.objects.filter(transaction_id=txn.id).exists()
        if only_without_positions and has_positions:
            result["skipped_reason"] = "has_positions"
            skipped_count += 1
            results.append(result)
            continue

        product = txn.product
        if not product and txn.transfer_to and txn.transfer_to != "solde":
            product = Product.objects.filter(id=txn.transfer_to).first()
        if not product:
            result["skipped_reason"] = "missing_product"
            skipped_count += 1
            results.append(result)
            continue

        checked_count += 1

        period_summaries = generate_rates_for_investment(txn)
        if not period_summaries:
            result["skipped_reason"] = "no_periods"
            skipped_count += 1
            results.append(result)
            continue

        payment_periods = _group_calculation_periods_by_payment_period(
            txn, product, period_summaries
        )

        for payment_group in payment_periods:
            payment_end = payment_group.get("endDate")
            if not payment_end:
                continue
            try:
                payment_end_date = date.fromisoformat(str(payment_end))
            except Exception:
                continue
            if payment_end_date > now.date():
                continue

            calculation_periods = payment_group.get("calculationPeriods", [])
            if not calculation_periods:
                continue

            representative_period_idx = calculation_periods[-1]
            result["periods_checked"] += 1

            if dry_run:
                sp = db_transaction.savepoint()
                try:
                    interest_txn = create_interest_transaction_for_period_if_complete(
                        txn,
                        int(representative_period_idx),
                        trigger=f"{trigger}_dry_run",
                    )
                    if interest_txn:
                        created_count += 1
                        result["created_count"] += 1
                finally:
                    db_transaction.savepoint_rollback(sp)
            else:
                interest_txn = create_interest_transaction_for_period_if_complete(
                    txn,
                    int(representative_period_idx),
                    trigger=trigger,
                )
                if interest_txn:
                    created_count += 1
                    result["created_count"] += 1

        if result["created_count"] == 0 and result["periods_checked"] == 0:
            result["skipped_reason"] = "no_elapsed_periods"
            skipped_count += 1

        results.append(result)

    return {
        "dry_run": dry_run,
        "client_id": client_id,
        "requested_transaction_ids": normalized_ids if normalized_ids is not None else None,
        "now": now.isoformat(),
        "checked_count": checked_count,
        "created_count": created_count,
        "skipped_count": skipped_count,
        "results": results,
    }


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
    result = create_missing_interest_for_transactions(
        now,
        client_id=client_id,
        transaction_ids=None,
        dry_run=dry_run,
        trigger="process_positions_command_no_positions",
        only_without_positions=True,
    )
    return int(result.get("checked_count", 0)), int(result.get("created_count", 0))


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
