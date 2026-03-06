#!/usr/bin/env python
"""
Drop all tables EXCEPT api_appsettings and api_asset, then run migrate --fake-initial.
Keeps your AppSettings and Asset data.
Run: python preserve_and_migrate.py
"""
import os
import subprocess
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django
django.setup()

from django.db import connection

KEEP_TABLES = ['api_appsettings', 'api_asset']

with connection.cursor() as c:
    # Drop all tables except the ones we keep
    c.execute("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT IN %s
    """, [tuple(KEEP_TABLES)])
    to_drop = [row[0] for row in c.fetchall()]

    for tablename in to_drop:
        c.execute(f'DROP TABLE IF EXISTS "{tablename}" CASCADE')
        print(f"Dropped {tablename}")

    print(f"\nKept: {KEEP_TABLES}")
    print("Running migrate --fake-initial...")

# Run migrate
result = subprocess.run(
    [sys.executable, 'manage.py', 'migrate', '--fake-initial'],
    cwd=os.path.dirname(os.path.abspath(__file__))
)
sys.exit(result.returncode)
