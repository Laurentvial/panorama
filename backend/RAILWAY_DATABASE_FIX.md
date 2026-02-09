# Fixing Railway Database Connection Issue

## Current Error

```
could not translate host name "anorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com" to address: Name or service not known
```

## Issue Identified

The hostname shows `anorama-5502` but your project is called `panorama`. This suggests:
1. **Typo in DATABASE_URL** - The hostname might be missing the "p" at the beginning
2. **Wrong DATABASE_URL** - You might have copied the wrong connection string
3. **DNS Resolution** - Railway's network cannot resolve Scalingo's DNS (less likely)

## Steps to Fix

### 1. Verify Your DATABASE_URL in Railway

1. Go to Railway Dashboard → Your Service → **Variables**
2. Find `DATABASE_URL` and check its value
3. Look for the hostname - it should be something like:
   ```
   panorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com
   ```
   NOT:
   ```
   anorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com  ❌ Missing "p"
   ```

### 2. Get the Correct Connection String from Scalingo

1. Log into your Scalingo dashboard
2. Go to your database addon
3. Copy the **full connection string** from the database credentials
4. Make sure it starts with `postgresql://` or `postgres://`

### 3. Update DATABASE_URL in Railway

1. Railway Dashboard → Your Service → **Variables**
2. Click on `DATABASE_URL` to edit it
3. Paste the correct connection string from Scalingo
4. **Important**: Verify the hostname is correct (should start with "panorama" not "anorama")
5. Save the variable

### 4. Verify the Format

Your `DATABASE_URL` should look like:
```
postgresql://username:password@panorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com:5432/database_name
```

**Common issues:**
- ❌ Missing "p" in "panorama" → `anorama-5502...`
- ❌ Wrong port number
- ❌ Missing database name at the end
- ❌ Special characters in password not URL-encoded

### 5. Test the Connection String Locally

Before updating Railway, test the connection string locally:

```bash
# Install psql if needed
# Then test:
psql "postgresql://username:password@panorama-5502.postgresql.c.osc-fr1.scalingo-dbs.com:5432/database_name"
```

If this works locally but not on Railway, it's a network/firewall issue.

## Network/Firewall Issues

If the hostname is correct but Railway still can't connect:

### Check Scalingo Firewall Settings

1. Scalingo databases might restrict connections by IP
2. Railway uses dynamic IPs, so you may need to:
   - Allow connections from all IPs (0.0.0.0/0) in Scalingo firewall
   - Or use Scalingo's IP allowlist feature if available

### Check SSL Requirements

Scalingo databases often require SSL. Your `DATABASE_URL` should include SSL parameters:

```
postgresql://user:pass@host:port/dbname?sslmode=require
```

## After Fixing DATABASE_URL

1. Railway will automatically redeploy
2. Check logs - you should see:
   - ✅ `✓ DATABASE_URL is set`
   - ✅ `Running database migrations...`
   - ✅ `Operations to perform: ...`
   - ✅ `Starting gunicorn...`

3. If migrations still fail but gunicorn starts, that's OK - the app will start and you can run migrations manually later

## Manual Migration (if needed)

If migrations fail but the app starts, you can run them manually:

1. Railway Dashboard → Your Service → **Deployments** → **View Logs**
2. Or use Railway CLI:
   ```bash
   railway run python manage.py migrate
   ```

## Current Behavior

With the latest changes:
- ✅ App will start even if migrations fail (non-blocking)
- ✅ You'll see clear error messages about what went wrong
- ✅ Database operations will fail gracefully until connection is fixed

## Still Having Issues?

1. **Double-check the hostname** - Make sure it's `panorama-5502` not `anorama-5502`
2. **Verify Scalingo database is running** - Check Scalingo dashboard
3. **Test connection string locally** - Use `psql` to verify it works
4. **Check Scalingo firewall** - Ensure Railway's IPs are allowed
5. **Contact Scalingo support** - They can verify the correct connection string
