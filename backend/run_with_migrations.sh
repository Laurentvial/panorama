#!/bin/bash
# Run migrations with graceful error handling, then start gunicorn
# This allows the app to start even if migrations fail (e.g., database not accessible)

set +e  # Don't exit on error - we want to continue even if migrations fail

echo "============================================================"
echo "Running database migrations..."
echo "============================================================"

# Try to run migrations, but don't fail if database is not accessible
python manage.py migrate --noinput 2>&1
MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo "✓ Migrations completed successfully"
else
    echo ""
    echo "⚠️  WARNING: Migrations failed with exit code $MIGRATION_EXIT_CODE"
    echo "   This may happen if:"
    echo "   - Database is not accessible from Railway's network"
    echo "   - DATABASE_URL is incorrect or hostname cannot be resolved"
    echo "   - Database server is temporarily unavailable"
    echo ""
    echo "   The application will start anyway, but database operations may fail."
    echo "   Check your DATABASE_URL and ensure the database is accessible."
    echo ""
    echo "   NOTE: If you see 'anorama' in the hostname, it should be 'panorama'"
    echo ""
fi

set -e  # Re-enable exit on error for gunicorn startup

echo "============================================================"
echo "Starting gunicorn..."
echo "============================================================"

# Ensure PORT is set (Railway should set this automatically)
if [ -z "$PORT" ]; then
    echo "⚠️  WARNING: PORT environment variable is not set. Using default 8080."
    export PORT=8080
fi

echo "Starting gunicorn on port $PORT..."

# Start gunicorn regardless of migration status
# Use exec to replace shell process with gunicorn
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
