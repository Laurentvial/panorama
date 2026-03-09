# Cloudinary to S3 Migration

This script migrates all media files from Cloudinary to your new S3/MinIO storage.

## Prerequisites

1. **Cloudinary credentials** (to construct URLs from stored paths):
   - `CLOUDINARY_CLOUD_NAME` – Your Cloudinary cloud name

2. **S3/MinIO credentials** (already configured for the app):
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_STORAGE_BUCKET_NAME`
   - `AWS_S3_ENDPOINT_URL` (for MinIO, e.g. `http://localhost:9000`)

## What Gets Migrated

- **Client**: profile_photo, identity_document, identity_document_verso, proof_of_address, selfie_photo
- **ClientSuccessor**: identity_document
- **UserDetails**: profile_photo
- **UsefulLink**: image
- **Product**: image
- **ClientDocument**: file (PDFs and other documents)
- **AppSettings**: logo, favicon, login_background_image, platform_banner_image
- **NewsPost**: image
- **Asset**: logo_url (URLField – if it points to Cloudinary)

## Usage

### Option 1: Django management command (recommended)

```bash
cd backend

# Preview what would be migrated (no changes)
python manage.py migrate_cloudinary_to_s3 --dry-run

# Run the migration
python manage.py migrate_cloudinary_to_s3

# Verbose output (show skipped items)
python manage.py migrate_cloudinary_to_s3 --verbose
```

### Option 2: Run script directly

```bash
cd backend
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from scripts.migrate_cloudinary_to_s3 import run_migration
run_migration(dry_run=False, verbose=True)
"
```

### Option 3: Django shell

```bash
cd backend
python manage.py shell
>>> from scripts.migrate_cloudinary_to_s3 import run_migration
>>> run_migration(dry_run=True)   # Preview first
>>> run_migration(dry_run=False)  # Execute
```

## Notes

- **Dry run first**: Always run with `--dry-run` to preview before making changes.
- **Idempotent**: The script skips files that already exist on S3, so it's safe to re-run.
- **Database updates**: File paths in the database are updated to point to the new S3 locations.
- **Asset logos**: `Asset.logo_url` entries pointing to Cloudinary are downloaded and re-uploaded to S3, then the URL is updated.
