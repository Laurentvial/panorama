# Fix Frontend-Backend Connection Issue

## Problem

The frontend cannot login because it's not properly configured to connect to the Railway backend.

## Solution

### Step 1: Identify Your URLs

- **Backend URL**: `https://worker-production-fc0e.up.railway.app`
- **Frontend URL**: `https://web-production-f36f9.up.railway.app` (or your Vercel URL if deployed there)

### Step 2: Configure Frontend Environment Variable

The frontend needs `VITE_URL` set to your backend URL.

#### If Frontend is on Railway:

1. Railway Dashboard → Your Frontend Service → **Variables**
2. Add or update:
   - **Variable Name**: `VITE_URL`
   - **Value**: `https://worker-production-fc0e.up.railway.app`
   - **Environments**: Production, Preview, Development
3. Save - Railway will redeploy automatically

#### If Frontend is on Vercel:

1. Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add or update:
   - **Variable Name**: `VITE_URL`
   - **Value**: `https://worker-production-fc0e.up.railway.app`
   - **Environments**: Production, Preview, Development
3. Save and redeploy

### Step 3: Verify CORS Configuration

The backend should already be configured to allow all origins (`CORS_ALLOW_ALL_ORIGINS = True`), but verify:

1. Check `backend/backend/settings.py`:
   ```python
   CORS_ALLOW_ALL_ORIGINS = True
   ```

2. If you want to restrict to specific domains:
   ```python
   CORS_ALLOW_ALL_ORIGINS = False
   CORS_ALLOWED_ORIGINS = [
       "https://web-production-f36f9.up.railway.app",
       "https://your-frontend-domain.com",
   ]
   ```

### Step 4: Test the Connection

After updating `VITE_URL`:

1. **Redeploy the frontend** (if it doesn't auto-redeploy)
2. **Open browser console** (F12)
3. **Try to login**
4. **Check console logs** for:
   - API URL being used: Should show `https://worker-production-fc0e.up.railway.app/api/token/`
   - Any CORS errors
   - Network errors

### Step 5: Common Issues

#### CORS Errors

If you see CORS errors in the browser console:
- Verify `CORS_ALLOW_ALL_ORIGINS = True` in backend settings
- Check that `corsheaders` middleware is first in `MIDDLEWARE` list
- Ensure backend is responding (test `/health/` endpoint)

#### Network Errors

If you see network errors:
- Verify backend is running (check Railway logs)
- Test backend directly: `https://worker-production-fc0e.up.railway.app/health/`
- Check if `VITE_URL` is correctly set (should not be `http://127.0.0.1:8000`)

#### 401 Unauthorized

If login returns 401:
- Check backend logs for authentication errors
- Verify credentials are correct
- Check if JWT authentication is working

### Step 6: Verify Configuration

After setting `VITE_URL`, check:

1. **Frontend build logs** - Should show `VITE_URL` being used
2. **Browser console** - Login attempt should show:
   ```
   Attempting admin login for username: [username]
   API URL: https://worker-production-fc0e.up.railway.app/api/token/
   ```

3. **Network tab** - Login request should go to:
   ```
   POST https://worker-production-fc0e.up.railway.app/api/token/
   ```

## Quick Checklist

- [ ] `VITE_URL` is set to backend URL in frontend environment variables
- [ ] Frontend has been redeployed after setting `VITE_URL`
- [ ] Backend CORS allows frontend origin
- [ ] Backend is running and responding to `/health/`
- [ ] Browser console shows correct API URL when attempting login
- [ ] No CORS errors in browser console
- [ ] Network requests are reaching the backend

## Testing

1. Open frontend: `https://web-production-f36f9.up.railway.app`
2. Open browser console (F12)
3. Try to login
4. Check:
   - Console logs show correct API URL
   - Network tab shows request to backend
   - Response is successful (200) or shows clear error message

## Still Not Working?

1. **Check browser console** for specific error messages
2. **Check Network tab** to see what URL is being called
3. **Check backend logs** in Railway to see if requests are arriving
4. **Test backend directly**: `curl https://worker-production-fc0e.up.railway.app/health/`
