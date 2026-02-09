#!/usr/bin/env python
"""
Pre-startup check script to validate environment before starting gunicorn.
This helps catch configuration errors early.
"""
import os
import sys

def check_environment():
    """Check that all required environment variables are set."""
    errors = []
    warnings = []
    
    # Required variables (always required)
    required_vars = {
        'SECRET_KEY': 'Django secret key',
        'CLOUDINARY_CLOUD_NAME': 'Cloudinary cloud name',
        'CLOUDINARY_API_KEY': 'Cloudinary API key',
        'CLOUDINARY_API_SECRET': 'Cloudinary API secret',
    }
    
    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value:
            errors.append(f"Missing required environment variable: {var} ({description})")
        elif var == 'SECRET_KEY' and value.startswith('django-insecure-'):
            warnings.append(f"WARNING: {var} appears to be the default insecure key. Generate a new one for production.")
    
    # Database configuration - check for either DATABASE_URL or individual DB_* vars
    database_url = os.getenv('DATABASE_URL')
    db_name = os.getenv('DB_NAME')
    db_user = os.getenv('DB_USER')
    db_password = os.getenv('DB_PASSWORD')
    db_host = os.getenv('DB_HOST')
    db_port = os.getenv('DB_PORT')
    
    if not database_url:
        # Check if individual DB variables are set instead
        if not (db_name and db_user and db_password and db_host):
            errors.append("Missing database configuration: Either DATABASE_URL or all of DB_NAME, DB_USER, DB_PASSWORD, DB_HOST must be set")
        else:
            print("✓ Database configured via individual DB_* variables")
    else:
        print("✓ DATABASE_URL is set")
        # Check DATABASE_URL format
        if not database_url.startswith(('postgresql://', 'postgres://')):
            warnings.append(f"WARNING: DATABASE_URL doesn't look like a PostgreSQL URL: {database_url[:50]}...")
    
    # Optional but recommended
    debug = os.getenv('DEBUG', 'True').lower()
    if debug == 'true':
        warnings.append("WARNING: DEBUG is set to True. Should be False for production.")
    
    return errors, warnings

def check_django_imports():
    """Try to import Django and check settings."""
    try:
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
        import django
        django.setup()
        
        from django.conf import settings
        print(f"✓ Django version: {django.get_version()}")
        print(f"✓ Django settings module: {settings.SETTINGS_MODULE}")
        print(f"✓ DEBUG: {settings.DEBUG}")
        print(f"✓ ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
        
        # Check database connection
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            print("✓ Database connection: OK")
        except Exception as e:
            print(f"⚠️  Database connection check failed: {e}")
            print("  (This will be retried when handling requests)")
            # Don't fail here - let wsgi.py handle it
        
        # Check Cloudinary
        try:
            import cloudinary
            print(f"✓ Cloudinary configured")
        except Exception as e:
            print(f"⚠️  Cloudinary check failed: {e}")
            print("  (This will be caught by Django settings)")
            # Don't fail here - settings.py will raise ValueError if needed
        
        return True
    except Exception as e:
        print(f"⚠️  Django import/check failed: {e}")
        print("  (This error will be shown in wsgi.py startup)")
        import traceback
        traceback.print_exc()
        # Don't fail - let wsgi.py handle Django initialization errors
        return True  # Return True so startup continues and wsgi.py can show the real error

if __name__ == '__main__':
    print("=" * 60)
    print("Pre-startup Environment Check")
    print("=" * 60)
    
    errors, warnings = check_environment()
    
    if errors:
        print("\n❌ ERRORS FOUND:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    
    if warnings:
        print("\n⚠️  WARNINGS:")
        for warning in warnings:
            print(f"  - {warning}")
    
    print("\n✓ All required environment variables are set")
    print("\n" + "=" * 60)
    print("Testing Django imports and configuration...")
    print("=" * 60)
    
    check_django_imports()  # This will warn but not fail
    
    print("\n" + "=" * 60)
    print("✓ Environment check complete. Starting gunicorn...")
    print("=" * 60)
