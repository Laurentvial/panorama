# Railway Migration Fix

## Problem

Migrations were failing during Railway's `release` phase (build time) with:
```
could not translate host name "anorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com" to address: Name or service not known
```

## Root Cause

Railway's build environment may not have network access to external databases, or DNS resolution may fail during the Docker build phase. Migrations run during the `release` phase, which happens before the container starts.

## Solution

Migrations are now run **on startup** (in the `web` command) instead of during the `release` phase. This ensures:
1. The container has full network access
2. DNS resolution works properly
3. The database connection is available

## Changes Made

1. **Procfile**: Updated `release` to skip migrations, `web` command runs migrations before starting gunicorn
2. **railway.json**: Updated `startCommand` to include migrations before gunicorn

## Migration Behavior

- Migrations run automatically on every container startup
- If migrations fail, the container will not start (fail-fast approach)
- This ensures the database schema is always up-to-date

## Alternative: Check Database Hostname

If you're still seeing DNS resolution errors, verify your `DATABASE_URL`:

1. Check if the hostname is correct (notice "anorama" vs "panorama" in the error)
2. Ensure the database allows connections from Railway's IP ranges
3. Verify the database is accessible from external networks

## Testing

After deploying, check the logs for:
- ✅ `✓ All required environment variables are set`
- ✅ `Operations to perform: ... Running migrations...`
- ✅ `Starting gunicorn...`

If migrations fail on startup, you'll see the error in the logs and the container won't start (which is the desired behavior - better to fail early than serve with wrong schema).
