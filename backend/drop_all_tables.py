#!/usr/bin/env python
"""Drop all tables in the public schema. Database will be empty."""
import os
import subprocess
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()

from django.db import connection

with connection.cursor() as c:
    c.execute("""
        DO $$ DECLARE r RECORD;
        BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
        END $$;
    """)
    print("All tables dropped. Database is empty.")

print("Running migrate...")
result = subprocess.run(
    [sys.executable, "manage.py", "migrate"],
    cwd=os.path.dirname(os.path.abspath(__file__)),
)
sys.exit(result.returncode)
