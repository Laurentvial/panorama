#!/bin/bash
# Script pour rafraîchir les prix des assets (cron / Render / Coolify / etc.)

python3 manage.py refresh_external_asset_prices --scope product-assets --limit 50 --min-age-seconds 240
