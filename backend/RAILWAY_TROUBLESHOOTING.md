# Railway Deployment Troubleshooting Guide

## Common Issues and Solutions

### Issue: "Application failed to respond"

This error typically means the application crashed during startup or isn't binding to the correct port.

#### 1. Check Railway Service Configuration

In Railway dashboard → Your Service → Settings:

- **Root Directory**: Must be set to `backend` (if deploying from repo root)
- **Start Command**: Should be `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT`
- **Build Command**: Should be `pip install -r requirements.txt` (or auto-detected)

#### 2. Verify Environment Variables

Check Railway dashboard → Your Service → Variables. All of these MUST be set:

**Required Variables:**
- ✅ `SECRET_KEY` - Django secret key (generate with: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`)
- ✅ `DEBUG` - Set to `False` for production
- ✅ `DATABASE_URL` - Automatically set if you added PostgreSQL service
- ✅ `AWS_ACCESS_KEY_ID` - S3/MinIO access key
- ✅ `AWS_SECRET_ACCESS_KEY` - S3/MinIO secret key
- ✅ `AWS_STORAGE_BUCKET_NAME` - S3/MinIO bucket name

**Optional Variables:**
- `GEMINI_API_KEY` - Only if using Gemini AI features
- `DB_CONN_MAX_AGE` - Default is `0` (connections close immediately)

#### 3. Check Deployment Logs

In Railway dashboard → Your Service → Deployments → Click on latest deployment → View Logs

Look for:
- ❌ `ValueError: S3/MinIO not configured` → Missing AWS_* env vars
- ❌ `django.core.exceptions.ImproperlyConfigured` → Missing SECRET_KEY or DATABASE_URL
- ❌ `OperationalError: could not connect to server` → Database connection issue
- ❌ `Address already in use` → Port binding issue (shouldn't happen with $PORT)
- ❌ `ModuleNotFoundError` → Missing dependency in requirements.txt

#### 4. Verify Port Binding

The start command MUST include `--bind 0.0.0.0:$PORT`:

✅ **Correct:**
```bash
gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT
```

❌ **Wrong:**
```bash
gunicorn backend.wsgi:application  # Missing PORT binding
gunicorn backend.wsgi:application --bind 0.0.0.0:8000  # Hardcoded port
```

#### 5. Check Database Connection

If you see database errors:
1. Verify PostgreSQL service is running (Railway dashboard → Services)
2. Check that `DATABASE_URL` is set correctly
3. Ensure migrations ran successfully (check logs for `release` command)

#### 6. Verify File Structure

If Root Directory is set to `backend`, Railway expects:
```
backend/
  ├── backend/
  │   ├── wsgi.py
  │   └── settings.py
  ├── manage.py
  ├── requirements.txt
  ├── Procfile (optional, railway.json takes precedence)
  └── railway.json (optional)
```

#### 7. Test Locally First

Before deploying, test the start command locally:

```bash
cd backend
export PORT=8000
export SECRET_KEY="test-key"
export DEBUG=False
export DATABASE_URL="postgresql://..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_STORAGE_BUCKET_NAME="..."
gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT
```

If this fails locally, it will fail on Railway too.

## Quick Fixes

### Fix 1: Missing PORT Binding
Update your Procfile or railway.json start command to include `--bind 0.0.0.0:$PORT`

### Fix 2: Missing Environment Variables
Add all required variables in Railway dashboard → Service → Variables

### Fix 3: Wrong Root Directory
Set Root Directory to `backend` in Railway dashboard → Service → Settings

### Fix 4: Database Not Connected
1. Add PostgreSQL service in Railway
2. Ensure DATABASE_URL is automatically linked
3. Check that migrations ran (look for `release` command in logs)

## Railway Configuration Checklist

- [ ] Root Directory set to `backend`
- [ ] Start Command includes `--bind 0.0.0.0:$PORT`
- [ ] SECRET_KEY is set (not the default insecure key)
- [ ] DEBUG is set to `False`
- [ ] DATABASE_URL is set (from PostgreSQL service)
- [ ] AWS_ACCESS_KEY_ID is set
- [ ] AWS_SECRET_ACCESS_KEY is set
- [ ] AWS_STORAGE_BUCKET_NAME is set
- [ ] PostgreSQL service is running
- [ ] Migrations completed successfully (check logs)
- [ ] Build completed without errors (check logs)

## Getting Help

If the issue persists:
1. Check Railway logs thoroughly (look for Python tracebacks)
2. Verify all environment variables are set correctly
3. Test the start command locally with the same environment variables
4. Check Railway status page: https://status.railway.app
5. Review Railway docs: https://docs.railway.app

## Common Error Messages

| Error | Solution |
|-------|----------|
| `Application failed to respond` | Check logs, verify PORT binding, check env vars |
| `S3/MinIO not configured` | Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME |
| `SECRET_KEY` not set | Add SECRET_KEY env var |
| `could not connect to server` | Check DATABASE_URL, ensure PostgreSQL is running |
| `ModuleNotFoundError: No module named 'X'` | Add missing package to requirements.txt |
| `Address already in use` | Use `$PORT` variable, don't hardcode port |
