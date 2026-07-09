"""
Shared runner for ``manage.py process_live_pricing_positions`` and cron endpoint.
"""
from __future__ import annotations

from datetime import date, datetime

from django.utils import timezone

from api.live_pricing_service import iter_active_live_pricing_transactions, run_live_pricing_for_transaction


def run_process_live_pricing(
    *,
    client_id: str | None = None,
    dry_run: bool = False,
    force_session_date: date | None = None,
) -> dict:
    session_date = force_session_date or timezone.now().date()
    results: list[dict] = []
    processed = 0
    skipped = 0
    errors = 0

    for txn in iter_active_live_pricing_transactions(client_id=client_id):
        processed += 1
        try:
            result = run_live_pricing_for_transaction(
                txn,
                session_date=session_date,
                dry_run=dry_run,
            )
            if result.get("status") == "skipped":
                skipped += 1
            elif result.get("status") == "error":
                errors += 1
            results.append({"transaction_id": str(txn.id), **result})
        except Exception as exc:
            errors += 1
            results.append(
                {
                    "transaction_id": str(txn.id),
                    "status": "error",
                    "reason": str(exc),
                }
            )

    return {
        "session_date": session_date.isoformat(),
        "dry_run": dry_run,
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "results": results,
    }
