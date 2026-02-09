# Debugging Client Login 401 Error

## Current Status

✅ **Frontend → Backend Connection**: Working correctly
- Frontend is calling: `https://worker-production-6060.up.railway.app/api/client/login/`
- Backend is responding with 401

❌ **Authentication**: Failing
- Error: "Email ou mot de passe incorrect"

## Possible Causes

The backend returns this error when:

1. **Email doesn't exist** in the database
2. **Password doesn't match** (case-sensitive comparison)
3. **Client account is inactive** (`active = False`)
4. **Platform access is disabled** (`platform_access = False`)

## Debugging Steps

### Step 1: Check Backend Logs

In Railway Dashboard → Backend Service → Logs, look for:
```
Client login attempt for email: laurentvial778@proton.me
```

You should see one of these messages:
- `Login attempt with non-existent email: ...` → Email doesn't exist
- `Login attempt for client X without platform access` → Platform access disabled
- `Login attempt for inactive client X` → Account inactive
- `Successful login for client X` → Login succeeded

### Step 2: Verify Client Exists in Database

Use Railway CLI or Django shell to check:

```bash
# Via Railway CLI
railway run python manage.py shell

# Then in Django shell:
from api.models import Client
client = Client.objects.filter(email__iexact='laurentvial778@proton.me').first()
if client:
    print(f"Client found: {client.id}")
    print(f"Email: {client.email}")
    print(f"Active: {client.active}")
    print(f"Platform Access: {client.platform_access}")
    print(f"Password set: {bool(client.password)}")
else:
    print("Client not found")
```

### Step 3: Check Client Settings

The client must have:
- ✅ `active = True`
- ✅ `platform_access = True`
- ✅ `password` field set (not empty)

### Step 4: Verify Password

The backend does a **simple string comparison**:
```python
stored_password = (client.password or '').strip()
if stored_password != password:
    return Response({'error': 'Email ou mot de passe incorrect'}, ...)
```

**Important**: 
- Passwords are **case-sensitive**
- Leading/trailing whitespace is stripped
- The comparison is exact match

### Step 5: Create/Update Client Account

If the client doesn't exist or has wrong settings:

```python
# In Django shell (railway run python manage.py shell)
from api.models import Client

# Find or create client
client, created = Client.objects.get_or_create(
    email='laurentvial778@proton.me',
    defaults={
        'password': 'your-password-here',  # Set the password
        'active': True,
        'platform_access': True,
        # Add other required fields...
    }
)

# Or update existing client
if not created:
    client.password = 'your-password-here'
    client.active = True
    client.platform_access = True
    client.save()
```

## Common Issues

### Issue 1: Email Case Sensitivity

The backend uses `email__iexact` (case-insensitive lookup), but make sure:
- Email in database: `laurentvial778@proton.me`
- Email being sent: `laurentvial778@proton.me` (frontend converts to lowercase)

### Issue 2: Password Mismatch

- Check for extra spaces
- Verify exact password match
- Check if password field is empty in database

### Issue 3: Account Disabled

- `active = False` → Account is disabled
- `platform_access = False` → Platform access is disabled

## Quick Fix: Create Test Client

To test login, create a test client:

```python
# Railway CLI: railway run python manage.py shell
from api.models import Client

client = Client.objects.create(
    email='test@example.com',
    password='testpassword123',
    active=True,
    platform_access=True,
    # Add other required fields as needed
)
print(f"Created client: {client.id}")
```

Then try logging in with:
- Email: `test@example.com`
- Password: `testpassword123`

## Next Steps

1. **Check Railway backend logs** for the specific error message
2. **Verify client exists** in database with correct settings
3. **Check password** matches exactly
4. **Create test client** if needed to verify login flow works

## Backend Log Messages

Look for these in Railway logs:

- ✅ `Client login attempt for email: ...` - Request received
- ❌ `Login attempt with non-existent email: ...` - Email not found
- ❌ `Login attempt for client X without platform access` - Platform access disabled
- ❌ `Login attempt for inactive client X` - Account inactive
- ✅ `Successful login for client X` - Login succeeded

The log message will tell you exactly what's wrong!
