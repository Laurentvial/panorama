from __future__ import annotations

from django.core.management.base import BaseCommand

from api.process_positions_runner import run_process_positions


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
        parser.add_argument(
            "--client-id",
            type=str,
            default=None,
            help="If set, only process positions and related transfers for this client id.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        client_id = options.get("client_id") or None
        if client_id is not None:
            client_id = str(client_id).strip() or None

        result = run_process_positions(
            client_id=client_id,
            dry_run=dry_run,
            interest_trigger="process_positions_command",
        )

        if result["dry_run"]:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] {result['to_pending']} position(s) would become PENDING, "
                    f"{result['to_open']} would OPEN, {result['to_done']} would CLOSE. "
                    f"now={result['now']}"
                )
            )
            return

        if result.get("interest_transactions_created", 0) > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created {result['interest_transactions_created']} automatic interest transaction(s) "
                    f"for completed periods."
                )
            )

        if result.get("fallback_interest_checked", 0) > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Checked {result['fallback_interest_checked']} validated transfer transaction(s) without positions; "
                    f"created {result.get('fallback_interest_created', 0)} fallback interest transaction(s)."
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Pending {result['to_pending']} position(s), opened {result['to_open']} position(s), "
                f"closed {result['to_done']} position(s). now={result['now']}"
            )
        )
