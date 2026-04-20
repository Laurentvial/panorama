from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone
from datetime import date

from api.models import Position, Transaction, Product
from api.position_service import (
    create_interest_transaction_for_period_if_complete,
    generate_rates_for_investment,
    sync_position_statuses_from_schedule,
    _group_calculation_periods_by_payment_period,
)


class Command(BaseCommand):
    help = (
        "Process scheduled Position rows: move status pending→open when opened_at passes, "
        "and open/pending→done when closed_at passes. Safe to run frequently."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Don't update DB, only print what would change.",
        )

    @db_transaction.atomic
    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        base = Position.objects.exclude(status="cancelled")

        if dry_run:
            stats = sync_position_statuses_from_schedule(
                base,
                dry_run=True,
                run_interest_for_closed=False,
            )
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] {stats['to_pending']} position(s) would become PENDING, "
                    f"{stats['to_open']} would OPEN, {stats['to_done']} would CLOSE. "
                    f"now={stats['now'].isoformat()}"
                )
            )
            return

        stats = sync_position_statuses_from_schedule(
            base,
            dry_run=False,
            run_interest_for_closed=True,
            interest_trigger="process_positions_command",
        )
        now = stats["now"]

        if stats.get("interest_transactions_created", 0) > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created {stats['interest_transactions_created']} automatic interest transaction(s) "
                    f"for completed periods."
                )
            )

        # Also handle validated transfer transactions that may legitimately have no generated
        # positions/trades (manual or edge-case flows). We still create "interets" at period end.
        self._create_interest_transfers_for_validated_transactions_without_positions(now)

        self.stdout.write(
            self.style.SUCCESS(
                f"Pending {stats['to_pending']} position(s), opened {stats['to_open']} position(s), "
                f"closed {stats['to_done']} position(s). now={now.isoformat()}"
            )
        )

    def _create_interest_transfers_for_validated_transactions_without_positions(self, now):
        """
        Ensure validated transfer transactions generate 'interets' at each completed
        selected interest period, even when no positions were created for that transaction.

        IMPORTANT: This now respects the interest_period (payment frequency) to avoid
        creating dozens of interest transactions when using daily/weekly profitability.
        """
        candidates = (
            Transaction.objects.filter(type='transfert', status='valide')
            .exclude(transfer_to__isnull=True)
            .exclude(transfer_to='solde')
            .select_related('product', 'client')
        )

        created_count = 0
        checked_count = 0
        for txn in candidates.iterator():
            # This fallback is only for transactions with no related positions.
            if Position.objects.filter(transaction_id=txn.id).exists():
                continue

            product = txn.product
            if not product and txn.transfer_to and txn.transfer_to != 'solde':
                product = Product.objects.filter(id=txn.transfer_to).first()
            if not product:
                continue
            checked_count += 1

            # Get calculation periods (based on profitability_period)
            period_summaries = generate_rates_for_investment(txn)
            if not period_summaries:
                continue

            # Group calculation periods into payment periods (based on interest_period)
            # This prevents creating dozens of interest transactions for daily/weekly profitability
            payment_periods = _group_calculation_periods_by_payment_period(
                txn, product, period_summaries
            )

            # For each payment period (not each calculation period!)
            for payment_group in payment_periods:
                payment_idx = payment_group.get('paymentPeriodIndex')
                if payment_idx is None:
                    continue

                try:
                    payment_end = payment_group.get('endDate')
                    if not payment_end:
                        continue
                    payment_end_date = date.fromisoformat(str(payment_end))
                    if payment_end_date > now.date():
                        # Skip future payment periods.
                        continue
                except Exception:
                    continue

                # Use the first calculation period index from this payment group
                # for the interest transaction reference
                calculation_periods = payment_group.get('calculationPeriods', [])
                if not calculation_periods:
                    continue

                # Use the last calculation period index as the representative period
                # This ensures we create one interest transaction per payment period
                representative_period_idx = calculation_periods[-1]

                interest_txn = create_interest_transaction_for_period_if_complete(
                    txn,
                    int(representative_period_idx),
                    trigger="process_positions_command_no_positions",
                )
                if interest_txn:
                    created_count += 1

        if checked_count > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Checked {checked_count} validated transfer transaction(s) without positions; "
                    f"created {created_count} fallback interest transaction(s)."
                )
            )
