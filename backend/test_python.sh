#!/bin/bash
# Test script pour vérifier Python sur Heroku

if [ -f /app/.heroku/python/bin/python ]; then
    echo "Python found at /app/.heroku/python/bin/python"
    /app/.heroku/python/bin/python --version
    /app/.heroku/python/bin/python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
else
    echo "Python buildpack not active - checking alternatives..."
    # Vérifier si Python est disponible ailleurs
    find /usr -name python* -type f 2>/dev/null | head -5
    find /app -name python* -type f 2>/dev/null | head -5
fi
