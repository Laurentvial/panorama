#!/bin/bash
# Script wrapper pour Heroku Scheduler
# Utilise python3 au lieu de python pour éviter l'erreur "command not found"

python3 manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
