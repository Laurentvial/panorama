#!/bin/bash
# Coolify/Docker entrypoint: run migrations, collectstatic, then gunicorn

set +e
echo "Running migrations..."
python manage.py migrate --noinput 2>&1 || true
echo "Collecting static files..."
python manage.py collectstatic --noinput 2>&1 || true
set -e

PORT=${PORT:-8000}
echo "Starting gunicorn on port $PORT"
exec gunicorn backend.wsgi:application \
    --bind "0.0.0.0:${PORT}" \
    --workers 2 \
    --threads 2 \
    --timeout 120 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    --preload
