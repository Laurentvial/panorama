# Railway Health Check and Port Configuration

## Issue: Application Failed to Respond

Even though gunicorn starts successfully, Railway reports "Application failed to respond". This can happen due to:

1. **Worker crashing after startup** - Django initialization error
2. **Port mismatch** - Railway expects a different port
3. **Health check failing** - Railway can't verify the app is healthy
4. **Startup timing** - App takes too long to become ready

## Solutions

### 1. Verify Railway Service Settings

In Railway Dashboard → Your Service → Settings:

- **Root Directory**: Must be `backend`
- **Start Command**: Should be empty (uses Procfile or railway.json)
- **Health Check Path**: Set to `/health/` (optional but recommended)
- **Health Check Timeout**: Increase to 60 seconds if needed

### 2. Check for Worker Crashes

Look in Railway logs for errors AFTER the worker boots:
- Look for tracebacks or exceptions after `[INFO] Booting worker with pid: X`
- Check if the worker process exits immediately after starting

### 3. Verify PORT Variable

Railway automatically sets `PORT`. Check logs to see what port gunicorn is using:
- Should see: `Listening at: http://0.0.0.0:XXXX`
- This port should match Railway's expected port

### 4. Add Health Check Endpoint

Railway can use `/health/` to verify the app is running. Make sure:
- The endpoint responds quickly (< 1 second)
- It doesn't require database access (or handles errors gracefully)
- Returns HTTP 200 status

### 5. Check Railway Service Type

Ensure your service is configured as a **Web Service** (not a Worker):
- Railway Dashboard → Service → Settings → Service Type
- Should be "Web Service" to receive HTTP traffic

### 6. Verify Networking

Check Railway Dashboard → Service → Settings → Networking:
- **Public Networking**: Should be enabled
- **Generate Domain**: Should be enabled (creates the `.up.railway.app` URL)

## Debugging Steps

1. **Check full logs** - Look for any errors after worker startup
2. **Test health endpoint locally** - Verify `/health/` works
3. **Check Railway metrics** - See if requests are reaching the service
4. **Verify service is active** - Check Railway dashboard shows service as "Active"

## Common Causes

### Worker Crashes After Startup
- Django settings error
- Import error in views/models
- Database connection issue during first request
- Missing environment variable accessed at import time

### Port Issues
- PORT variable not set (should be automatic)
- Wrong port binding format
- Railway routing to different port

### Health Check Failing
- Health endpoint requires database (should be lightweight)
- Health endpoint takes too long to respond
- Health endpoint returns non-200 status

## Next Steps

1. Check Railway logs for errors after worker startup
2. Verify Railway service settings (Root Directory, Service Type)
3. Test `/health/` endpoint directly
4. Check Railway metrics to see if traffic is reaching the service
