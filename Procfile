web: cd backend && gunicorn backend.wsgi:application --log-file -
release: cd backend && python manage.py migrate
worker: cd backend && python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
