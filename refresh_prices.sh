#!/bin/bash
# Script pour rafraîchir les prix des assets
# Ce script sera exécuté par Heroku Scheduler

# Aller dans le répertoire backend si il existe
if [ -d "backend" ]; then
    cd backend
fi

# Utiliser Python du buildpack
export PATH="/app/.heroku/python/bin:$PATH"

# Exécuter la commande
python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
