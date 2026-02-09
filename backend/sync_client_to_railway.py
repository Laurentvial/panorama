#!/usr/bin/env python
"""
Script to sync a client from local database to Railway.
Run locally: python sync_client_to_railway.py
Then run the output commands in Railway shell.
"""
import os
import django
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Client

email = 'laurentvial778@proton.me'

print("=" * 60)
print("Exporting client data for Railway import")
print("=" * 60)

client = Client.objects.filter(email__iexact=email).first()

if not client:
    print(f"\n❌ Client not found locally: {email}")
    print("Make sure you're running this from your local environment.")
    exit(1)

print(f"\n✅ Found client: {client.id}")
print(f"Email: {client.email}")

# Get all client fields
client_data = {
    'id': client.id,
    'email': client.email,
    'password': client.password,
    'active': client.active,
    'platform_access': client.platform_access,
    'fname': client.fname,
    'middle_name': client.middle_name,
    'lname': client.lname,
    'civility': client.civility,
    'legal_name': client.legal_name,
    'sex': client.sex,
    'phone': client.phone,
    'mobile': client.mobile,
    'birth_date': str(client.birth_date) if client.birth_date else None,
    'birth_place': client.birth_place,
    'address': client.address,
    'postal_code': client.postal_code,
    'city': client.city,
    'nationality': client.nationality,
    'account_verified': client.account_verified,
    'template': client.template,
    'support': client.support,
}

print("\n" + "=" * 60)
print("Copy and run this in Railway shell:")
print("=" * 60)
print("\nrailway run python manage.py shell")
print("\nThen paste:")
print("-" * 60)

print(f"""
from api.models import Client

# Check if client already exists
existing = Client.objects.filter(email__iexact='{email}').first()
if existing:
    print(f"Updating existing client: {{existing.id}}")
    client = existing
else:
    print("Creating new client")
    client = Client()

# Set all fields
client.id = '{client_data['id']}'
client.email = '{client_data['email']}'
client.password = '{client_data['password']}'
client.active = {client_data['active']}
client.platform_access = {client_data['platform_access']}
client.fname = '{client_data['fname']}'
client.middle_name = '{client_data['middle_name']}'
client.lname = '{client_data['lname']}'
client.civility = '{client_data['civility']}'
client.legal_name = '{client_data['legal_name']}'
client.sex = '{client_data['sex']}'
client.phone = '{client_data['phone']}'
client.mobile = '{client_data['mobile']}'
client.birth_place = '{client_data['birth_place']}'
client.address = '{client_data['address']}'
client.postal_code = '{client_data['postal_code']}'
client.city = '{client_data['city']}'
client.nationality = '{client_data['nationality']}'
client.account_verified = {client_data['account_verified']}
client.template = '{client_data['template']}'
client.support = '{client_data['support']}'

if client_data['birth_date']:
    from django.utils.dateparse import parse_date
    client.birth_date = parse_date('{client_data['birth_date']}')

client.save()
print(f"✅ Client synced: {{client.id}}")
print(f"Email: {{client.email}}")
print(f"Active: {{client.active}}")
print(f"Platform Access: {{client.platform_access}}")
""")

print("-" * 60)
print("\nOr use the simplified version:")
print("-" * 60)

print(f"""
from api.models import Client

client, created = Client.objects.get_or_create(
    email__iexact='{email}',
    defaults={{
        'id': '{client_data['id']}',
        'email': '{email}',
        'password': '{client_data['password']}',
        'active': True,
        'platform_access': True,
        'fname': '{client_data['fname']}',
        'lname': '{client_data['lname']}',
    }}
)

if not created:
    # Update existing client
    client.password = '{client_data['password']}'
    client.active = True
    client.platform_access = True
    client.save()

print(f"✅ Client ready: {{client.id}}")
print(f"Email: {{client.email}}")
print(f"Active: {{client.active}}")
print(f"Platform Access: {{client.platform_access}}")
""")

print("\n" + "=" * 60)
