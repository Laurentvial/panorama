from django.core.management.base import BaseCommand

from api.live_pricing_runner import run_process_live_pricing


class Command(BaseCommand):
    help = "Process Live Pricing daily batch (default: today UTC session date)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Simulate without creating positions")
        parser.add_argument("--client-id", type=str, default=None, help="Limit to one client")
        parser.add_argument(
            "--session-date",
            type=str,
            default=None,
            help="Force trading session date (YYYY-MM-DD, UTC calendar date)",
        )

    def handle(self, *args, **options):
        from datetime import date

        force_session_date = None
        if options.get("session_date"):
            force_session_date = date.fromisoformat(options["session_date"])

        result = run_process_live_pricing(
            client_id=options.get("client_id"),
            dry_run=bool(options.get("dry_run")),
            force_session_date=force_session_date,
        )
        self.stdout.write(self.style.SUCCESS(str(result)))
