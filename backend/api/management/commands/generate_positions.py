from django.core.management.base import BaseCommand

from api.models import Transaction
from api.position_service import create_positions_for_investment

COMPLETED_TRANSACTION_STATUSES = ("valide", "cloture")


class Command(BaseCommand):
    help = "Generate missing monthly positions for investment transactions (transfert to product)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--status",
            default=None,
            help="Optionally filter transactions by status (e.g. valide, en_cours).",
        )
        parser.add_argument(
            "--transaction-id",
            default=None,
            help="Optionally process a single transaction id.",
        )
        parser.add_argument(
            "--client-id",
            default=None,
            help="Optionally filter by client id.",
        )

    def handle(self, *args, **options):
        status_filter = options.get("status")
        transaction_id = options.get("transaction_id")
        client_id = options.get("client_id")

        qs = Transaction.objects.filter(type="transfert").exclude(transfer_to__isnull=True).exclude(transfer_to="solde")
        if transaction_id:
            qs = qs.filter(id=transaction_id)
        if client_id:
            qs = qs.filter(client_id=client_id)
        # By default, only generate for validated transactions (admin-approved).
        # Use --status to override.
        if status_filter:
            qs = qs.filter(status=status_filter)
        else:
            qs = qs.filter(status__in=COMPLETED_TRANSACTION_STATUSES)

        total_created = 0
        total_txn = 0

        for txn in qs.iterator():
            total_txn += 1
            created = create_positions_for_investment(txn, trigger="management_command")
            total_created += len(created)

        self.stdout.write(self.style.SUCCESS(f"Processed {total_txn} transaction(s). Created {total_created} position(s)."))

