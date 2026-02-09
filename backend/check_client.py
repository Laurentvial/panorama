#!/usr/bin/env python
"""
Script to check and fix client login issues.
Run with: python manage.py shell < check_client.py
Or: railway run python manage.py shell < check_client.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Client

email = 'laurentvial778@proton.me'

print("=" * 60)
print(f"Checking client account for: {email}")
print("=" * 60)

# Check if client exists
client = Client.objects.filter(email__iexact=email).first()

if not client:
    print(f"\n❌ Client NOT FOUND in database")
    print(f"\nTo create the client, run:")
    print(f"  python manage.py shell")
    print(f"  Then:")
    print(f"  from api.models import Client")
    print(f"  client = Client.objects.create(")
    print(f"      id='CLI001',  # Use appropriate ID")
    print(f"      email='{email}',")
    print(f"      password='your-password-here',")
    print(f"      active=True,")
    print(f"      platform_access=True,")
    print(f"      fname='Laurent',")
    print(f"      lname='Vial',")
    print(f"  )")
else:
    print(f"\n✅ Client FOUND:")
    print(f"  ID: {client.id}")
    print(f"  Email: {client.email}")
    print(f"  Active: {client.active}")
    print(f"  Platform Access: {client.platform_access}")
    print(f"  Password set: {bool(client.password)}")
    print(f"  Password length: {len(client.password) if client.password else 0}")
    
    # Check issues
    issues = []
    if not client.active:
        issues.append("❌ Account is INACTIVE (active=False)")
    if not client.platform_access:
        issues.append("❌ Platform access is DISABLED (platform_access=False)")
    if not client.password or client.password.strip() == '':
        issues.append("❌ Password is EMPTY")
    
    if issues:
        print(f"\n⚠️  ISSUES FOUND:")
        for issue in issues:
            print(f"  {issue}")
        print(f"\nTo fix, run:")
        print(f"  client = Client.objects.get(email__iexact='{email}')")
        if not client.active:
            print(f"  client.active = True")
        if not client.platform_access:
            print(f"  client.platform_access = True")
        if not client.password or client.password.strip() == '':
            print(f"  client.password = 'your-password-here'")
        print(f"  client.save()")
    else:
        print(f"\n✅ Account settings look correct!")
        print(f"\nIf login still fails, check:")
        print(f"  1. Password matches exactly (case-sensitive)")
        print(f"  2. No extra spaces in password")
        print(f"  3. Check Railway backend logs for specific error")

print("\n" + "=" * 60)
