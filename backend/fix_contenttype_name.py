#!/usr/bin/env python
"""
One-time fix for django_content_type NULL name issue after DB import.
Run: python fix_contenttype_name.py
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.db import connection

with connection.cursor() as c:
    # 1. Fix existing rows with NULL name
    c.execute("""
        UPDATE django_content_type 
        SET name = model 
        WHERE name IS NULL OR name = ''
    """)
    updated = c.rowcount
    print(f"Updated {updated} existing rows")

    # 2. Create trigger to fix future INSERTs (Django create_contenttypes may insert with null name)
    c.execute("""
        CREATE OR REPLACE FUNCTION fix_contenttype_name_on_insert()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.name IS NULL OR NEW.name = '' THEN
                NEW.name := NEW.model;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    print("Created trigger function")

    # Drop trigger if exists, then create (idempotent)
    c.execute("""
        DROP TRIGGER IF EXISTS fix_contenttype_name_trigger ON django_content_type;
    """)
    c.execute("""
        CREATE TRIGGER fix_contenttype_name_trigger
        BEFORE INSERT ON django_content_type
        FOR EACH ROW
        EXECUTE FUNCTION fix_contenttype_name_on_insert();
    """)
    print("Created trigger")

print("Done. Run: python manage.py migrate")
