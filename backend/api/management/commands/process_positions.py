from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone
from datetime import date

from api.models import Position, Transaction, Product
from api.position_service import (
    create_interest_transaction_for_period_if_complete,
    generate_rates_for_investment,
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
        now = timezone.now()
        dry_run = bool(options.get("dry_run"))

        # We only process trade-like positions (those with scheduled timestamps).
        base = Position.objects.filter(opened_at__isnull=False, closed_at__isnull=False)

        # 1) Close anything whose close time has passed (idempotent).
        close_qs = base.filter(status__in=["open", "pending"], closed_at__lte=now)
        # 2) Open anything whose open time has passed, but not yet closed.
        open_qs = base.filter(status="pending", opened_at__lte=now).exclude(closed_at__lte=now)

        to_close = close_qs.count()
        to_open = open_qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] {to_open} position(s) would OPEN, {to_close} position(s) would CLOSE. now={now.isoformat()}"
                )
            )
            return

        # Get IDs of positions to close before updating (since .update() doesn't return objects)
        positions_to_close_ids = list(close_qs.values_list('id', flat=True))
        
        opened = open_qs.update(status="open")
        closed = close_qs.update(status="done")
        
        # After closing positions, create interest transfers for completed periods
        # Note: .update() doesn't trigger signals, so we need to process manually
        if closed > 0 and positions_to_close_ids:
            self._create_interest_transfers_for_closed_positions(positions_to_close_ids)

        # Also handle validated transfer transactions that may legitimately have no generated
        # positions/trades (manual or edge-case flows). We still create "interets" at period end.
        self._create_interest_transfers_for_validated_transactions_without_positions(now)

        self.stdout.write(
            self.style.SUCCESS(
                f"Opened {opened} position(s), closed {closed} position(s). now={now.isoformat()}"
            )
        )
    
    def _create_interest_transfers_for_closed_positions(self, position_ids):
        """
        Create interest transactions for completed periods.
        This handles the case where positions are closed via .update() which doesn't trigger signals.
        
        IMPORTANT: This now groups calculation periods by payment period to avoid
        creating dozens of interest transactions for daily/weekly profitability.
        """
        from api.position_service import _group_calculation_periods_by_payment_period, generate_rates_for_investment
        
        # Get the actual closed positions (after the update)
        closed_positions = Position.objects.filter(
            id__in=position_ids,
            status='done'
        ).select_related('client', 'product', 'transaction')
        
        # Group positions by transaction
        transactions_to_check = {}
        for position in closed_positions:
            if not position.transaction_id or position.period_index is None:
                continue
            
            if position.transaction_id not in transactions_to_check:
                transactions_to_check[position.transaction_id] = position.transaction
        
        interest_transactions_created = 0
        for txn_id, txn in transactions_to_check.items():
            try:
                if not txn:
                    continue
                
                # Get product
                product = txn.product
                if not product and txn.transfer_to and txn.transfer_to != 'balance':
                    product = Product.objects.filter(id=txn.transfer_to).first()
                if not product:
                    continue
                
                # Get calculation periods and group them by payment period
                period_summaries = generate_rates_for_investment(txn)
                if not period_summaries:
                    continue
                
                payment_periods = _group_calculation_periods_by_payment_period(
                    txn, product, period_summaries
                )
                
                # For each payment period, check if we should create an interest transaction
                for payment_group in payment_periods:
                    calculation_periods = payment_group.get('calculationPeriods', [])
                    if not calculation_periods:
                        continue
                    
                    # Check if all positions in ALL calculation periods of this payment group are done
                    all_done = True
                    for calc_period_idx in calculation_periods:
                        positions_in_calc_period = Position.objects.filter(
                            transaction_id=txn_id,
                            period_index=calc_period_idx
                        )
                        if positions_in_calc_period.exists():
                            total = positions_in_calc_period.count()
                            done = positions_in_calc_period.filter(status='done').count()
                            if done < total:
                                all_done = False
                                break
                    
                    if not all_done:
                        continue
                    
                    # Use the last calculation period as representative
                    representative_period_idx = calculation_periods[-1]
                    
                    # Try to create interest transaction for this payment period
                    interest_txn = create_interest_transaction_for_period_if_complete(
                        txn,
                        representative_period_idx,
                        trigger="process_positions_command"
                    )
                    
                    if interest_txn:
                        interest_transactions_created += 1
                    
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"Failed to create interest transaction for transaction {txn_id}: {e}"
                    )
                )
        
        if interest_transactions_created > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created {interest_transactions_created} automatic interest transaction(s) for completed periods."
                )
            )

    def _create_interest_transfers_for_validated_transactions_without_positions(self, now):
        """
        Ensure validated transfer transactions generate 'interets' at each completed
        selected interest period, even when no positions were created for that transaction.
        
        IMPORTANT: This now respects the interest_period (payment frequency) to avoid
        creating dozens of interest transactions when using daily/weekly profitability.
        """
        from api.position_service import _group_calculation_periods_by_payment_period
        
        candidates = (
            Transaction.objects
            .filter(type='transfert', status='valide')
            .exclude(transfer_to__isnull=True)
            .exclude(transfer_to='balance')
            .select_related('product', 'client')
        )

        created_count = 0
        checked_count = 0
        for txn in candidates.iterator():
            # This fallback is only for transactions with no related positions.
            if Position.objects.filter(transaction_id=txn.id).exists():
                continue

            product = txn.product
            if not product and txn.transfer_to and txn.transfer_to != 'balance':
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

