# Fix Client Login Issue

## Current Status

✅ Frontend → Backend connection: Working  
❌ Authentication: Failing with "Email ou mot de passe incorrect"

## Step 1: Check Railway Backend Logs

In Railway Dashboard → Backend Service → Logs, look for:
```
Client login attempt for email: laurentvial778@proton.me
```

Then look for one of these messages:
- `Login attempt with non-existent email: ...` → Email doesn't exist
- `Login attempt for client X without platform access` → Platform access disabled  
- `Login attempt for inactive client X` → Account inactive
- `Login attempt for client X with incorrect password` → Password mismatch

## Step 2: Check Client Account in Database

### Option A: Using Railway CLI

```bash
# Connect to Railway shell
railway run python manage.py shell
```

Then in the Django shell:
```python
from api.models import Client

email = 'laurentvial778@proton.me'
client = Client.objects.filter(email__iexact=email).first()

if client:
    print(f"Client found: {client.id}")
    print(f"Email: {client.email}")
    print(f"Active: {client.active}")
    print(f"Platform Access: {client.platform_access}")
    print(f"Password set: {bool(client.password)}")
else:
    print("Client not found - need to create")
```

### Option B: Using the Check Script

```bash
railway run python manage.py shell < check_client.py
```

## Step 3: Fix Common Issues

### Issue 1: Client Doesn't Exist

Create the client account:

```python
from api.models import Client
import uuid

client = Client.objects.create(
    id=f'CLI{uuid.uuid4().hex[:8].upper()}',  # Generate unique ID
    email='laurentvial778@proton.me',
    password='your-password-here',  # Set the password
    active=True,
    platform_access=True,
    fname='Laurent',
    lname='Vial',
)
print(f"Created client: {client.id}")
```

### Issue 2: Account is Inactive

```python
client = Client.objects.get(email__iexact='laurentvial778@proton.me')
client.active = True
client.save()
print("Account activated")
```

### Issue 3: Platform Access Disabled

```python
client = Client.objects.get(email__iexact='laurentvial778@proton.me')
client.platform_access = True
client.save()
print("Platform access enabled")
```

### Issue 4: Password is Wrong/Empty

```python
client = Client.objects.get(email__iexact='laurentvial778@proton.me')
client.password = 'your-new-password'  # Set correct password
client.save()
print("Password updated")
```

### Issue 5: Fix All Issues at Once

```python
from api.models import Client

client = Client.objects.get(email__iexact='laurentvial778@proton.me')
client.active = True
client.platform_access = True
client.password = 'your-password-here'  # Set correct password
client.save()
print("All issues fixed")
```

## Step 4: Verify Password

The backend does **exact string comparison**:
- Passwords are **case-sensitive**
- Leading/trailing spaces are stripped
- Must match exactly

To check what password is stored:
```python
client = Client.objects.get(email__iexact='laurentvial778@proton.me')
print(f"Stored password: '{client.password}'")
print(f"Password length: {len(client.password)}")
```

## Step 5: Test Login Again

After fixing the account:
1. Try logging in from the frontend
2. Use the exact password you set in the database
3. Check Railway logs for "Successful login" message

## Quick Fix: Create Test Client

To test if login works at all:

```python
from api.models import Client
import uuid

# Create test client
test_client = Client.objects.create(
    id=f'TEST{uuid.uuid4().hex[:6].upper()}',
    email='test@example.com',
    password='test123',
    active=True,
    platform_access=True,
    fname='Test',
    lname='User',
)
print(f"Created test client: {test_client.email}")
print(f"Password: test123")
```

Then try logging in with:
- Email: `test@example.com`
- Password: `test123`

## Troubleshooting

### Still Getting 401?

1. **Check Railway logs** - Look for the specific error message
2. **Verify password** - Make sure it matches exactly (case-sensitive)
3. **Check account status** - Ensure `active=True` and `platform_access=True`
4. **Clear browser cache** - Old tokens might be cached

### Password Not Working?

- Passwords are **case-sensitive**: `Password123` ≠ `password123`
- No extra spaces allowed
- Check what's stored: `print(f"'{client.password}'")`

### Account Settings Look Correct?

- Check Railway logs for the exact error
- Verify email matches exactly (case-insensitive lookup)
- Try creating a test client to verify login flow works

## Next Steps

1. Check Railway backend logs for specific error
2. Verify client exists with correct settings
3. Fix any issues found
4. Test login again

The Railway logs will tell you exactly what's wrong!
