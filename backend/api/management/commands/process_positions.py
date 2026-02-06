from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

from api.models import Position, Transaction, Product
from api.position_service import _product_compounds, create_interest_transaction_for_period_if_complete
from decimal import Decimal
import uuid


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
        
        # After closing positions, create interest transfers for non-compounding products
        # Note: .update() doesn't trigger signals, so we need to process manually
        if closed > 0 and positions_to_close_ids:
            self._create_interest_transfers_for_closed_positions(positions_to_close_ids)

        self.stdout.write(
            self.style.SUCCESS(
                f"Opened {opened} position(s), closed {closed} position(s). now={now.isoformat()}"
            )
        )
    
    def _create_interest_transfers_for_closed_positions(self, position_ids):
        """
        Create interest transactions for completed periods on non-compounding products.
        This handles the case where positions are closed via .update() which doesn't trigger signals.
        """
        # Get the actual closed positions (after the update)
        closed_positions = Position.objects.filter(
            id__in=position_ids,
            status='done'
        ).select_related('client', 'product', 'transaction')
        
        # Group positions by transaction and period_index
        periods_to_check = {}
        for position in closed_positions:
            if not position.transaction_id or position.period_index is None:
                continue
            
            key = (position.transaction_id, position.period_index)
            if key not in periods_to_check:
                periods_to_check[key] = position
        
        interest_transactions_created = 0
        for (txn_id, period_idx), position in periods_to_check.items():
            try:
                if not position.transaction:
                    continue
                
                # Try to create interest transaction for this period
                interest_txn = create_interest_transaction_for_period_if_complete(
                    position.transaction,
                    period_idx,
                    trigger="process_positions_command"
                )
                
                if interest_txn:
                    interest_transactions_created += 1
                    
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"Failed to create interest transaction for transaction {txn_id}, period {period_idx}: {e}"
                    )
                )
        
        if interest_transactions_created > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created {interest_transactions_created} automatic interest transaction(s) for completed periods."
                )
            )

