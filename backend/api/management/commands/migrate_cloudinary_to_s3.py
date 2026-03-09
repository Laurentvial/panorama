"""
Django management command to migrate all media from Cloudinary to S3/MinIO.

Usage:
  python manage.py migrate_cloudinary_to_s3 [--dry-run] [--verbose]

Requires:
  - CLOUDINARY_CLOUD_NAME (to construct Cloudinary URLs from stored paths)
  - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME (S3/MinIO)
"""

from django.core.management.base import BaseCommand
import sys
import os
import importlib.util


class Command(BaseCommand):
    help = 'Migrate all media files from Cloudinary to S3/MinIO storage'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be migrated without making changes',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Verbose output (show skipped items)',
        )

    def handle(self, *args, **options):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        script_path = os.path.join(backend_dir, 'scripts', 'migrate_cloudinary_to_s3.py')

        spec = importlib.util.spec_from_file_location('migrate_cloudinary_to_s3', script_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        dry_run = options['dry_run']
        verbose = options['verbose']

        if dry_run:
            self.stdout.write(self.style.WARNING('*** DRY RUN - no changes will be made ***'))

        exit_code = module.run_migration(dry_run=dry_run, verbose=verbose)
        if exit_code != 0:
            sys.exit(exit_code)
