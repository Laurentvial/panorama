from django.core.management.base import BaseCommand

from api.models import Transaction
from api.position_service import create_positions_for_investment


class Command(BaseCommand):
    help = "Generate missing monthly positions for investment transactions (transfert to product)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--status",
            default=None,
            help="Optionally filter transactions by status (e.g. termine, en_cours).",
        )

    def handle(self, *args, **options):
        status_filter = options.get("status")

        qs = Transaction.objects.filter(type="transfert").exclude(transfer_to__isnull=True).exclude(transfer_to="balance")
        if status_filter:
            qs = qs.filter(status=status_filter)

        total_created = 0
        total_txn = 0

        for txn in qs.iterator():
            total_txn += 1
            created = create_positions_for_investment(txn)
            total_created += len(created)

        self.stdout.write(self.style.SUCCESS(f"Processed {total_txn} transaction(s). Created {total_created} position(s)."))

