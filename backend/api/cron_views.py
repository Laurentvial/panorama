"""
Cron HTTP endpoints for Coolify Scheduled Tasks.

These endpoints trigger Django management commands and are protected by
CRON_SECRET_TOKEN. Schedulers often use curl to POST to these URLs; if the
runtime has no curl (e.g. minimal image), run the same commands inside the
backend container instead: ``python manage.py process_positions`` and
``python manage.py refresh_external_asset_prices`` (see COOLIFY_DEPLOYMENT.md).

HTTP examples (when curl is available):
  curl --fail -X POST "https://api.yourdomain.com/api/cron/refresh-prices/?token=YOUR_CRON_SECRET_TOKEN"
  curl --fail -X POST "https://api.yourdomain.com/api/cron/process-positions/?token=YOUR_CRON_SECRET_TOKEN"
  curl --fail -X POST "https://api.yourdomain.com/api/cron/database-backup/?token=YOUR_CRON_SECRET_TOKEN"
"""
from __future__ import annotations

import os
from io import StringIO

from django.core.management import call_command
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


def _validate_cron_token(request) -> bool:
    """Validate CRON_SECRET_TOKEN from query param or X-Cron-Token header."""
    expected = os.getenv("CRON_SECRET_TOKEN")
    if not expected:
        return False
    token = request.GET.get("token") or request.headers.get("X-Cron-Token")
    return token == expected


@csrf_exempt
@require_POST
def cron_refresh_prices(request):
    """Trigger refresh_external_asset_prices management command."""
    if not _validate_cron_token(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    scope = request.GET.get("scope", os.getenv("PRICE_REFRESH_SCOPE", "product-assets"))
    limit = int(request.GET.get("limit", os.getenv("PRICE_REFRESH_LIMIT", "50")))
    min_age_seconds = int(
        request.GET.get("min_age_seconds", os.getenv("PRICE_REFRESH_MIN_AGE_SECONDS", "240"))
    )
    failed_retry_hours = int(
        request.GET.get("failed_retry_hours", os.getenv("PRICE_REFRESH_FAILED_RETRY_HOURS", "6"))
    )

    out = StringIO()
    try:
        call_command(
            "refresh_external_asset_prices",
            scope=scope,
            limit=limit,
            min_age_seconds=min_age_seconds,
            failed_retry_hours=failed_retry_hours,
            stdout=out,
        )
        return JsonResponse({"status": "ok", "output": out.getvalue()})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@require_POST
def cron_process_positions(request):
    """Trigger process_positions management command."""
    if not _validate_cron_token(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    out = StringIO()
    try:
        call_command("process_positions", stdout=out)
        return JsonResponse({"status": "ok", "output": out.getvalue()})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@require_POST
def cron_database_backup(request):
    """Trigger backup_database_to_s3 management command."""
    if not _validate_cron_token(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    out = StringIO()
    try:
        call_command("backup_database_to_s3", stdout=out)
        return JsonResponse({"status": "ok", "output": out.getvalue()})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
