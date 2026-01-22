from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

from api.models import Position


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

        opened = open_qs.update(status="open")
        closed = close_qs.update(status="done")

        self.stdout.write(
            self.style.SUCCESS(
                f"Opened {opened} position(s), closed {closed} position(s). now={now.isoformat()}"
            )
        )

