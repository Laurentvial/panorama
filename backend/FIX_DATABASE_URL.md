# CRITICAL: Fix DATABASE_URL Typo

## The Problem

Your `DATABASE_URL` has a typo in the hostname. The error shows:

```
could not translate host name "anorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com"
```

Notice: **`anorama`** - it's missing the "p" at the beginning!

## The Fix

### Step 1: Go to Railway Dashboard

1. Railway Dashboard → Your Service → **Variables**
2. Find `DATABASE_URL`
3. Click to edit it

### Step 2: Fix the Hostname

Look for this in your `DATABASE_URL`:
```
anorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com
```

Change it to:
```
panorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com
```

**Full example:**
```
postgresql://username:password@panorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com:5432/database_name
```

### Step 3: Verify

After updating:
1. Railway will automatically redeploy
2. Check logs - you should see `✓ Database connection: OK`
3. Migrations should complete successfully
4. The app should start and respond to requests

## How to Get the Correct Connection String

If you're not sure what the correct `DATABASE_URL` should be:

1. **Log into Scalingo Dashboard**
2. Go to your database addon
3. Copy the **full connection string** from the credentials
4. Make sure it starts with `postgresql://` or `postgres://`
5. Verify the hostname starts with `panorama` not `anorama`

## After Fixing

Once you fix the typo:
- ✅ Database connection will work
- ✅ Migrations will run successfully  
- ✅ Application will start and respond to requests
- ✅ Health endpoint will work: `/health` or `/health/`

## Why This Matters

Without the correct database hostname:
- ❌ Migrations fail
- ❌ Database operations fail
- ❌ Application may not start properly
- ❌ Health checks fail

Fix this typo and everything should work!
