# Sync Client from Local to Railway

Since login works locally but not on Railway, the client account needs to be synced to the Railway database.

## Quick Method

### Step 1: Export Client Data Locally

Run this locally (in your backend directory):

```bash
cd backend
python sync_client_to_railway.py
```

This will generate commands to copy/paste into Railway.

### Step 2: Import to Railway

1. Copy the generated commands from Step 1
2. Run Railway shell:
   ```bash
   railway run python manage.py shell
   ```
3. Paste the commands
4. The client will be created/updated in Railway database

## Manual Method

### Step 1: Get Client Data Locally

```bash
cd backend
python manage.py shell
```

```python
from api.models import Client

email = 'laurentvial778@proton.me'
client = Client.objects.get(email__iexact=email)

# Print key info
print(f"ID: {client.id}")
print(f"Email: {client.email}")
print(f"Password: {client.password}")
print(f"Active: {client.active}")
print(f"Platform Access: {client.platform_access}")
print(f"First Name: {client.fname}")
print(f"Last Name: {client.lname}")
```

Copy the values (especially password).

### Step 2: Create Client in Railway

```bash
railway run python manage.py shell
```

```python
from api.models import Client

# Create or update client
client, created = Client.objects.get_or_create(
    email__iexact='laurentvial778@proton.me',
    defaults={
        'id': 'CLI001',  # Use the ID from local, or generate new one
        'email': 'laurentvial778@proton.me',
        'password': 'your-password-from-local',  # Paste from Step 1
        'active': True,
        'platform_access': True,
        'fname': 'Laurent',  # From local
        'lname': 'Vial',     # From local
    }
)

# If client already exists, update it
if not created:
    client.password = 'your-password-from-local'  # Update password
    client.active = True
    client.platform_access = True
    client.save()

print(f"✅ Client ready: {client.id}")
print(f"Email: {client.email}")
print(f"Active: {client.active}")
print(f"Platform Access: {client.platform_access}")
```

## Verify

After syncing, test login:
1. Go to frontend: `https://web-production-f36f9.up.railway.app`
2. Try logging in with the same credentials that work locally
3. Check Railway logs for "Successful login" message

## Alternative: Database Migration

If you have many clients to sync, consider:

1. **Export from local**:
   ```bash
   python manage.py dumpdata api.Client --indent 2 > clients.json
   ```

2. **Import to Railway**:
   ```bash
   railway run python manage.py loaddata clients.json
   ```

⚠️ **Warning**: This will import ALL clients. Make sure this is what you want.

## Troubleshooting

### Still Not Working?

1. **Verify client exists in Railway**:
   ```python
   from api.models import Client
   client = Client.objects.filter(email__iexact='laurentvial778@proton.me').first()
   print(f"Found: {client.id if client else 'NOT FOUND'}")
   ```

2. **Check password matches exactly**:
   ```python
   print(f"Password: '{client.password}'")
   ```

3. **Check account settings**:
   ```python
   print(f"Active: {client.active}")
   print(f"Platform Access: {client.platform_access}")
   ```

4. **Check Railway logs** for specific error messages

## Next Steps

After syncing the client:
- ✅ Login should work on Railway
- ✅ Use the same credentials as local
- ✅ Check Railway logs to confirm successful login
