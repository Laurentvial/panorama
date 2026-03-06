#!/usr/bin/env python
"""Create api_clientasset table (was skipped when we faked migration 0026)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()

from django.db import connection

with connection.cursor() as c:
    c.execute("""
        CREATE TABLE IF NOT EXISTS api_clientasset (
            id VARCHAR(12) NOT NULL PRIMARY KEY,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            asset_id VARCHAR(12) NOT NULL REFERENCES api_asset(id) ON DELETE CASCADE,
            client_id VARCHAR(12) NOT NULL REFERENCES api_client(id) ON DELETE CASCADE,
            featured BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE (client_id, asset_id)
        )
    """)
    print("Created api_clientasset")
