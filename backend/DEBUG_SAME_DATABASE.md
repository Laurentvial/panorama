# Debugging Login Issue with Same Database

Since local and Railway use the same database, the client account exists. The issue is likely:

1. **Request data modification** - Email/password being changed during transmission
2. **Encoding issues** - Special characters or whitespace
3. **Request not reaching backend** - CORS or routing issue
4. **Middleware interference** - Something modifying the request

## Step 1: Check Railway Backend Logs

In Railway Dashboard → Backend Service → Logs, look for:

```
Client login attempt for email: laurentvial778@proton.me
```

Then check what happens next:
- Does it find the client?
- What error message appears?

## Step 2: Add Detailed Logging

The backend already logs login attempts. Check Railway logs for:

1. **Email received**: Should match exactly
2. **Password length**: Check if password is being truncated
3. **Client lookup**: Does it find the client?
4. **Password comparison**: Is it failing?

## Step 3: Compare Request Data

### Check What Frontend Sends

Open browser console (F12) → Network tab → Find the login request → Check:
- **Request Payload**: What email/password is being sent?
- **Request Headers**: Any encoding issues?

### Check What Backend Receives

Add temporary logging to see what backend receives:

```python
# In backend/api/views.py client_login function
logger.info(f"Raw email received: {repr(request.data.get('email', ''))}")
logger.info(f"Raw password received: {repr(request.data.get('password', ''))}")
logger.info(f"Email after strip/lower: {repr(email)}")
logger.info(f"Password after strip: {repr(password)}")
```

## Step 4: Test Direct API Call

Test the backend directly to bypass frontend:

```bash
curl -X POST https://worker-production-6060.up.railway.app/api/client/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"laurentvial778@proton.me","password":"your-password"}'
```

Replace `your-password` with the actual password.

## Step 5: Common Issues

### Issue 1: Password Encoding

If password has special characters, they might be encoded differently:
- Frontend might URL-encode
- Backend might decode differently
- Check Railway logs for exact password received

### Issue 2: Whitespace

Even though code does `.strip()`, check:
- Is there hidden whitespace?
- Are there non-breaking spaces?
- Check Railway logs for exact values

### Issue 3: Case Sensitivity

Email is converted to lowercase, but password is case-sensitive:
- Make sure password matches exactly
- Check for any automatic case conversion

### Issue 4: Request Body Parsing

Check if request body is being parsed correctly:
- Is Content-Type header correct?
- Is JSON being parsed properly?
- Check Railway logs for request.data contents

## Step 6: Enhanced Logging

Add this to `client_login` function temporarily:

```python
@api_view(['POST'])
@permission_classes([AllowAny])
def client_login(request):
    import logging
    logger = logging.getLogger(__name__)
    
    # Log raw request data
    logger.info(f"Raw request.data: {request.data}")
    logger.info(f"Request Content-Type: {request.content_type}")
    
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '').strip()
    
    logger.info(f"Processed email: {repr(email)}")
    logger.info(f"Processed password length: {len(password)}")
    logger.info(f"Processed password (first 3 chars): {repr(password[:3])}")
    
    # ... rest of function
```

Then check Railway logs to see exactly what's being received.

## Step 7: Verify Database Connection

Since they use the same database, verify Railway can actually read it:

```bash
railway run python manage.py shell
```

```python
from api.models import Client

client = Client.objects.filter(email__iexact='laurentvial778@proton.me').first()
if client:
    print(f"✅ Found in Railway DB: {client.id}")
    print(f"Password stored: '{client.password}'")
    print(f"Password length: {len(client.password)}")
else:
    print("❌ NOT found in Railway DB")
```

## Most Likely Causes

1. **Password mismatch** - Check Railway logs for exact password received
2. **Email format** - Check if email is being modified (extra spaces, case)
3. **Request parsing** - Check if JSON is being parsed correctly
4. **Database read issue** - Verify Railway can read the database

## Next Steps

1. **Check Railway logs** - Look for the exact error message
2. **Add enhanced logging** - See what backend receives
3. **Test direct API call** - Bypass frontend to isolate issue
4. **Compare logs** - Local vs Railway to see differences

The Railway logs will show exactly what's happening!
