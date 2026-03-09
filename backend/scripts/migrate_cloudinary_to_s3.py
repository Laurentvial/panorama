#!/usr/bin/env python
"""
Migrate all media from Cloudinary to S3/MinIO storage.

This script:
1. Iterates over all Django models with ImageField/FileField
2. For each file that has a Cloudinary URL or path, downloads it and uploads to S3
3. Updates Asset.logo_url if it points to Cloudinary

Prerequisites:
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (for optional API listing)
- AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME (S3/MinIO)
- Django environment (run with: python manage.py runscript migrate_cloudinary_to_s3)
  OR: python manage.py shell < scripts/migrate_cloudinary_to_s3.py

Usage:
  cd backend
  python manage.py shell -c "exec(open('scripts/migrate_cloudinary_to_s3.py').read())"

  Or run as Django management command:
  python manage.py migrate_cloudinary_to_s3 [--dry-run] [--verbose]
"""

import os
import sys
import argparse
import requests
from io import BytesIO
from urllib.parse import urlparse

# Setup Django
if __name__ == '__main__':
    # Allow running as standalone script
    import django
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()

from django.core.files.base import ContentFile
from django.db import models

# Models and fields that may contain Cloudinary media
# Format: (model_class, [(field_name, resource_type), ...])
# resource_type: 'image' for images, 'raw' for PDFs and other files
MEDIA_FIELDS = [
    ('api.Client', [
        ('profile_photo', 'image'),
        ('identity_document', 'image'),
        ('identity_document_verso', 'image'),
        ('proof_of_address', 'image'),
        ('selfie_photo', 'image'),
    ]),
    ('api.ClientSuccessor', [('identity_document', 'image')]),
    ('api.UserDetails', [('profile_photo', 'image')]),
    ('api.UsefulLink', [('image', 'image')]),
    ('api.Product', [('image', 'image')]),
    ('api.ClientDocument', [('file', 'raw')]),  # PDFs and other docs
    ('api.AppSettings', [
        ('logo', 'image'),
        ('favicon', 'image'),
        ('login_background_image', 'image'),
        ('platform_banner_image', 'image'),
    ]),
    ('api.NewsPost', [('image', 'image')]),
]


def get_cloudinary_url(path: str, cloud_name: str, resource_type: str = 'image') -> str:
    """Construct Cloudinary URL from stored path."""
    if not path or not cloud_name:
        return ''
    # Cloudinary URL format: https://res.cloudinary.com/{cloud}/image/upload/{path}
    # or https://res.cloudinary.com/{cloud}/raw/upload/{path}
    path = path.lstrip('/')
    if path.startswith('http'):
        return path  # Already full URL
    prefix = 'image' if resource_type == 'image' else 'raw'
    return f"https://res.cloudinary.com/{cloud_name}/{prefix}/upload/{path}"


def is_cloudinary_url(url: str) -> bool:
    return url and 'cloudinary.com' in str(url)


def is_cloudinary_path(path: str) -> bool:
    """Check if path looks like a Cloudinary path (not S3/minio)."""
    if not path:
        return False
    path_lower = path.lower()
    return not any(x in path_lower for x in ['s3.', 's3.amazonaws.com', 'minio'])


def download_file(url: str, timeout: int = 30) -> bytes:
    """Download file from URL and return bytes."""
    response = requests.get(url, timeout=timeout, stream=True)
    response.raise_for_status()
    return response.content


def get_extension_from_content_type(content_type: str, default: str = '.jpg') -> str:
    """Get file extension from Content-Type header."""
    if not content_type:
        return default
    ct = content_type.lower()
    if 'image/png' in ct:
        return '.png'
    if 'image/jpeg' in ct or 'image/jpg' in ct:
        return '.jpg'
    if 'image/gif' in ct:
        return '.gif'
    if 'image/webp' in ct:
        return '.webp'
    if 'image/svg' in ct:
        return '.svg'
    if 'application/pdf' in ct:
        return '.pdf'
    return default


def migrate_file_field(obj, field_name: str, resource_type: str, cloud_name: str,
                      dry_run: bool, verbose: bool) -> tuple[bool, str]:
    """
    Migrate a single file field from Cloudinary to S3.
    Returns (success, message).
    """
    from api.storage import S3MediaStorage

    file_field = getattr(obj, field_name)

    if not file_field:
        return False, 'no file'

    # Get stored path or URL (Cloudinary public_id, path, or full URL)
    stored_path = file_field.name
    if not stored_path:
        return False, 'empty path'

    # If it's already a full Cloudinary URL, use it directly
    if is_cloudinary_url(stored_path):
        cloudinary_url = stored_path
        # Extract path for S3 from URL (e.g. client_profiles/xyz from .../upload/v123/client_profiles/xyz)
        from urllib.parse import unquote
        parsed = urlparse(stored_path)
        path_parts = parsed.path.split('/upload/')
        raw_path = unquote(path_parts[-1]) if len(path_parts) > 1 else f"migrated/{hash(stored_path) % 10000}"
        # Strip Cloudinary version prefix (v1234567890/)
        if raw_path.startswith('v') and raw_path[1:2].isdigit():
            raw_path = raw_path.split('/', 1)[-1] if '/' in raw_path else raw_path
        stored_path = raw_path
    else:
        # Normalize path: strip Cloudinary version prefix if present (e.g. "v1234567890/")
        if '/upload/' in stored_path:
            stored_path = stored_path.split('/upload/', 1)[-1]
        stored_path = stored_path.lstrip('/')

        # Construct Cloudinary URL from path
        cloudinary_url = get_cloudinary_url(stored_path, cloud_name, resource_type)
    if not cloudinary_url:
        return False, 'could not construct URL'

    try:
        # Download from Cloudinary
        response = requests.get(cloudinary_url, timeout=30, stream=True)
        response.raise_for_status()
        content = response.content
        if not content:
            return False, 'empty download'

        # Ensure path has extension for S3
        ext = get_extension_from_content_type(response.headers.get('Content-Type', ''))
        if not os.path.splitext(stored_path)[1]:
            stored_path = stored_path.rsplit('.', 1)[0] + ext if '.' in stored_path else stored_path + ext
        elif not stored_path.lower().endswith(ext):
            stored_path = stored_path.rsplit('.', 1)[0] + ext

        # Check if already on S3 (skip re-migration)
        try:
            s3_storage = S3MediaStorage()
            if s3_storage.exists(stored_path):
                if verbose:
                    return False, f'already on S3: {stored_path}'
                return False, 'already on S3'
        except Exception:
            pass

        if dry_run:
            return True, f'[DRY-RUN] would migrate {len(content)} bytes: {stored_path}'

        # Upload to S3
        s3_storage = S3MediaStorage()
        content_file = ContentFile(content)
        content_file.name = stored_path

        saved_name = s3_storage.save(stored_path, content_file)
        new_url = s3_storage.url(saved_name)

        # Update model: set field to point to the new S3 path
        model = obj.__class__
        model.objects.filter(pk=obj.pk).update(**{field_name: saved_name})

        return True, f'migrated to {new_url[:80]}...' if len(new_url) > 80 else f'migrated to {new_url}'

    except requests.RequestException as e:
        return False, f'download failed: {e}'
    except Exception as e:
        return False, f'error: {e}'


def migrate_asset_logo_url(asset, cloud_name: str, dry_run: bool) -> tuple[bool, str]:
    """Migrate Asset.logo_url from Cloudinary to S3."""
    from api.views import download_logo_to_storage

    logo_url = asset.logo_url or ''
    if not is_cloudinary_url(logo_url):
        return False, 'not Cloudinary URL'

    try:
        if dry_run:
            return True, f'[DRY-RUN] would migrate logo: {logo_url[:60]}...'

        new_url = download_logo_to_storage(logo_url, asset.id)
        if new_url and new_url != logo_url:
            asset.logo_url = new_url
            asset.save(update_fields=['logo_url'])
            return True, f'migrated to {new_url[:80]}...'
        return False, 'download_logo_to_storage returned same URL'
    except Exception as e:
        return False, f'error: {e}'


def run_migration(dry_run: bool = False, verbose: bool = False):
    """Run the full migration."""
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME', '')
    if not cloud_name:
        print("ERROR: CLOUDINARY_CLOUD_NAME is required. Set it in .env or environment.")
        return 1

    # Check S3 config
    if not os.getenv('AWS_ACCESS_KEY_ID') or not os.getenv('AWS_STORAGE_BUCKET_NAME'):
        print("ERROR: S3 credentials required (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME)")
        return 1

    from django.apps import apps

    stats = {'migrated': 0, 'skipped': 0, 'failed': 0}

    print("=" * 60)
    print("Cloudinary to S3 Migration")
    print("=" * 60)
    if dry_run:
        print("*** DRY RUN - no changes will be made ***")
    print()

    # Migrate model file fields
    for model_label, fields in MEDIA_FIELDS:
        try:
            model = apps.get_model(model_label)
        except LookupError:
            if verbose:
                print(f"  Skip {model_label}: model not found")
            continue

        for field_name, resource_type in fields:
            if not hasattr(model, field_name):
                continue

            qs = model.objects.exclude(**{f'{field_name}': ''}).exclude(**{f'{field_name}__isnull': True})
            for obj in qs:
                file_field = getattr(obj, field_name)
                if not file_field or not file_field.name:
                    continue

                stored = file_field.name
                # Only migrate if it looks like Cloudinary (path format) or is Cloudinary URL
                if is_cloudinary_url(stored):
                    pass  # full URL - migrate_file_field will use get_cloudinary_url with path
                elif not is_cloudinary_path(stored):
                    stats['skipped'] += 1
                    if verbose:
                        print(f"  Skip {model_label}.{obj.pk} {field_name}: not Cloudinary path (already S3?)")
                    continue

                success, msg = migrate_file_field(
                    obj, field_name, resource_type, cloud_name, dry_run, verbose
                )
                if success:
                    stats['migrated'] += 1
                    print(f"  OK   {model_label}.{obj.pk} {field_name}: {msg}")
                else:
                    if 'already' in msg.lower():
                        stats['skipped'] += 1
                    else:
                        stats['failed'] += 1
                    if verbose or not success:
                        print(f"  {'SKIP' if 'already' in msg else 'FAIL'} {model_label}.{obj.pk} {field_name}: {msg}")

    # Migrate Asset.logo_url (URLField)
    from api.models import Asset
    for asset in Asset.objects.exclude(logo_url='').exclude(logo_url__isnull=True):
        if not is_cloudinary_url(asset.logo_url):
            continue
        success, msg = migrate_asset_logo_url(asset, cloud_name, dry_run)
        if success:
            stats['migrated'] += 1
            print(f"  OK   Asset.{asset.id} logo_url: {msg}")
        else:
            stats['failed'] += 1
            print(f"  FAIL Asset.{asset.id} logo_url: {msg}")

    print()
    print("=" * 60)
    print(f"Done. Migrated: {stats['migrated']}, Skipped: {stats['skipped']}, Failed: {stats['failed']}")
    print("=" * 60)
    return 0 if stats['failed'] == 0 else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migrate media from Cloudinary to S3')
    parser.add_argument('--dry-run', action='store_true', help='Preview without making changes')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    args = parser.parse_args()

    # When run via shell, argparse might not get sys.argv - handle both
    if '--dry-run' in sys.argv or '-n' in sys.argv:
        args.dry_run = True
    if '--verbose' in sys.argv or '-v' in sys.argv:
        args.verbose = True

    sys.exit(run_migration(dry_run=args.dry_run, verbose=args.verbose))
