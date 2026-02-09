# Setting Up External Database on Railway

Since your database is deployed elsewhere (not as a Railway PostgreSQL service), you need to manually configure the `DATABASE_URL` environment variable in Railway.

## Steps to Configure DATABASE_URL

### 1. Get Your Database Connection String

Your external database should provide a connection string in one of these formats:

**PostgreSQL:**
```
postgresql://username:password@host:port/database_name
```

**Example:**
```
postgresql://myuser:mypassword@db.example.com:5432/mydb
```

### 2. Add DATABASE_URL to Railway

1. Go to Railway Dashboard → Your Service → **Variables**
2. Click **"+ New Variable"**
3. Set:
   - **Variable Name**: `DATABASE_URL`
   - **Value**: Your full database connection string (e.g., `postgresql://user:pass@host:port/dbname`)
4. Click **"Add"**

### 3. Verify the Variable is Set

After adding the variable:
- Railway will automatically redeploy your service
- Check the deployment logs to confirm `DATABASE_URL` is now detected
- The startup check should pass

## Alternative: Using Individual DB Variables

If you prefer not to use `DATABASE_URL`, you can set individual variables instead:

- `DB_NAME` - Database name
- `DB_USER` - Database username  
- `DB_PASSWORD` - Database password
- `DB_HOST` - Database hostname
- `DB_PORT` - Database port (default: 5432)

**Note:** The application prefers `DATABASE_URL` if both are set.

## Security Best Practices

1. **Never commit database credentials to Git**
2. **Use Railway's encrypted environment variables** (they're encrypted at rest)
3. **Rotate database passwords regularly**
4. **Use SSL connections** - Your `DATABASE_URL` should include SSL parameters if your database supports it:
   ```
   postgresql://user:pass@host:port/dbname?sslmode=require
   ```

## Testing the Connection

After setting `DATABASE_URL`, Railway will:
1. Run the startup check (which validates the variable is set)
2. Start gunicorn
3. Django will attempt to connect to the database during the first request

Check the logs for:
- ✅ `✓ DATABASE_URL is set` (from startup check)
- ✅ `✓ Database connection: OK` (from Django startup)
- ❌ Any database connection errors

## Troubleshooting

### "Missing required environment variable: DATABASE_URL"

**Solution:** Add `DATABASE_URL` in Railway → Service → Variables

### "could not connect to server"

**Possible causes:**
1. Database host is not accessible from Railway's network
2. Database firewall is blocking Railway's IP addresses
3. Incorrect credentials in `DATABASE_URL`
4. Database server is down

**Solutions:**
- Verify your database allows connections from Railway's IP ranges
- Check that the hostname, port, username, password, and database name are correct
- Test the connection string locally first
- Ensure your database provider allows external connections

### "SSL connection required"

**Solution:** Add `?sslmode=require` to your `DATABASE_URL`:
```
postgresql://user:pass@host:port/dbname?sslmode=require
```

## Example DATABASE_URL Formats

**Standard PostgreSQL:**
```
postgresql://myuser:mypassword@db.example.com:5432/mydatabase
```

**With SSL:**
```
postgresql://myuser:mypassword@db.example.com:5432/mydatabase?sslmode=require
```

**With special characters in password:**
If your password contains special characters, URL-encode them:
- `@` becomes `%40`
- `:` becomes `%3A`
- `/` becomes `%2F`
- etc.

Example: Password `p@ss:w/rd` becomes `p%40ss%3Aw%2Frd`
```
postgresql://myuser:p%40ss%3Aw%2Frd@db.example.com:5432/mydatabase
```

## Next Steps

After setting `DATABASE_URL`:
1. Railway will redeploy automatically
2. Check deployment logs to verify the variable is detected
3. Test the `/health/` endpoint: `https://your-app.up.railway.app/health/`
4. Run migrations if needed (they should run automatically via the `release` command in Procfile)
