#!/usr/bin/env python
"""
Drop api_asset and api_clientasset. Keep only api_appsettings.
Revert api migrations to 0025, then run migrate (api_asset recreated empty).
"""
import os
import subprocess
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()

from django.db import connection

# 1. Drop asset tables (CASCADE removes FKs from api_position, api_transaction, etc.)
with connection.cursor() as c:
    c.execute("DROP TABLE IF EXISTS api_productassetallocation CASCADE")
    c.execute("DROP TABLE IF EXISTS api_clientasset CASCADE")
    c.execute("DROP TABLE IF EXISTS api_asset CASCADE")
    print("Dropped api_asset, api_clientasset, api_productassetallocation")

# 2. Fake-revert api to 0025 (so migrate will re-run 0026+ and create fresh api_asset)
print("Reverting api migration state to 0025...")
subprocess.run(
    [sys.executable, "manage.py", "migrate", "api", "0025_log", "--fake"],
    cwd=os.path.dirname(os.path.abspath(__file__)),
    check=True,
)

# 3. Run migrate
print("Running migrate...")
result = subprocess.run(
    [sys.executable, "manage.py", "migrate"],
    cwd=os.path.dirname(os.path.abspath(__file__)),
)
sys.exit(result.returncode)
