# Fix VITE_URL Configuration

## Problem

The frontend is calling the wrong API URL:
- ❌ Current: `https://web-production-f36f9.up.railway.app/api/client/login/`
- ✅ Should be: `https://worker-production-fc0e.up.railway.app/api/client/login/`

This means `VITE_URL` is either not set or set to the frontend URL instead of the backend URL.

## Solution

### Step 1: Set VITE_URL in Railway

1. **Go to Railway Dashboard**
2. **Select your Frontend Service** (`web-production-f36f9`)
3. **Go to Settings → Variables**
4. **Add or Update**:
   - **Variable Name**: `VITE_URL`
   - **Value**: `https://worker-production-fc0e.up.railway.app`
   - **Environments**: Production, Preview, Development
5. **Save** the variable

### Step 2: Redeploy Frontend

After setting `VITE_URL`, Railway should auto-redeploy. If not:

1. **Railway Dashboard** → Frontend Service
2. **Click "Redeploy"** or trigger a new deployment
3. **Wait for deployment to complete**

### Step 3: Verify Configuration

After redeployment:

1. **Open your frontend**: `https://web-production-f36f9.up.railway.app`
2. **Open browser console** (F12)
3. **Try to login**
4. **Check console logs** - Should now show:
   ```
   API URL: https://worker-production-fc0e.up.railway.app/api/client/login/
   ```
   NOT:
   ```
   API URL: https://web-production-f36f9.up.railway.app/api/client/login/
   ```

### Step 4: Test Login

After fixing `VITE_URL`:
- Login requests should go to the backend
- You should get proper authentication responses
- If credentials are correct, login should work

## Important Notes

### Environment Variables in Vite

- Vite environment variables must start with `VITE_`
- They are embedded at **build time**, not runtime
- You **must redeploy** after changing environment variables
- The variable name is `VITE_URL` (not `API_URL` or `BACKEND_URL`)

### Why This Happened

The frontend code uses:
```typescript
const apiUrl = getEnvVar('VITE_URL') || 'http://127.0.0.1:8000';
```

If `VITE_URL` is not set, it defaults to `http://127.0.0.1:8000`, but in production builds, this might be getting replaced or the frontend URL is being used instead.

## Verification Checklist

- [ ] `VITE_URL` is set to `https://worker-production-fc0e.up.railway.app`
- [ ] Frontend has been redeployed after setting `VITE_URL`
- [ ] Browser console shows correct API URL (`worker-production-fc0e`, not `web-production-f36f9`)
- [ ] Network requests go to backend URL
- [ ] No CORS errors (backend allows all origins)

## If Still Not Working

1. **Clear browser cache** - Old JavaScript might be cached
2. **Hard refresh** - Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. **Check build logs** - Verify `VITE_URL` was picked up during build
4. **Check Railway logs** - Look for any build-time errors

## Testing

After fixing:

1. Open frontend in **incognito/private window** (to avoid cache)
2. Try to login
3. Check Network tab - should see requests to `worker-production-fc0e.up.railway.app`
4. Check console - should show correct API URL
