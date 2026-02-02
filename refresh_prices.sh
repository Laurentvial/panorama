#!/bin/bash
# Script pour rafraîchir les prix des assets
# Ce script sera exécuté par Heroku Scheduler

# Aller dans le répertoire backend si il existe
if [ -d "backend" ]; then
    cd backend
fi

# Utiliser Python du buildpack - essayer plusieurs chemins possibles
if [ -f "/app/.heroku/python/bin/python" ]; then
    PYTHON="/app/.heroku/python/bin/python"
elif [ -f "$HOME/.heroku/python/bin/python" ]; then
    PYTHON="$HOME/.heroku/python/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON="python3"
elif command -v python &> /dev/null; then
    PYTHON="python"
else
    echo "Error: Python not found"
    exit 1
fi

# Exécuter la commande
$PYTHON manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
