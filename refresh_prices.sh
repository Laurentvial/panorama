#!/bin/bash
# Script pour rafraîchir les prix des assets (cron / Render / Coolify / etc.)

if [ -d "backend" ]; then
    cd backend
fi

PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then
    echo "Error: Python not found"
    exit 1
fi

$PYTHON manage.py refresh_external_asset_prices --scope product-assets --limit 50 --min-age-seconds 240
