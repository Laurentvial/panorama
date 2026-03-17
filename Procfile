web: cd backend && gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT --log-file -
release: cd backend && python manage.py migrate
worker: cd backend && python manage.py refresh_external_asset_prices --scope product-assets --limit 50 --min-age-seconds 240
