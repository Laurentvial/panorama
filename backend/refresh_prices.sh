#!/bin/bash
# Script pour rafraîchir les prix des assets (cron / Render / Coolify / etc.)

python3 manage.py refresh_external_asset_prices --scope all --min-age-seconds 240
