"""
Django management command to download external asset logos to S3/MinIO storage.

External APIs (Clearbit, CoinGecko, etc.) may block or rate-limit server requests,
causing logos to fail when loaded via proxy. This command downloads them to our storage.

Usage:
  python manage.py migrate_external_asset_logos [--dry-run] [--limit N]
"""

from django.core.management.base import BaseCommand
from api.models import Asset
from api.views import download_logo_to_storage


class Command(BaseCommand):
    help = 'Download external asset logos to S3/MinIO storage'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be migrated without making changes',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Max number of assets to process (0 = all)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']

        # Find assets with external logo URLs (not our S3/MinIO)
        assets = Asset.objects.exclude(logo_url='').exclude(logo_url__isnull=True)
        external = [
            a for a in assets
            if a.logo_url and a.logo_url.startswith('http')
            and 's3.' not in a.logo_url.lower() and 'minio' not in a.logo_url.lower()
        ]

        if limit:
            external = external[:limit]

        total = len(external)
        self.stdout.write(f'Found {total} assets with external logo URLs')

        if dry_run:
            self.stdout.write(self.style.WARNING('*** DRY RUN - no changes will be made ***'))
            for a in external[:10]:
                self.stdout.write(f'  Would migrate: {a.name} ({a.id}) - {a.logo_url[:60]}...')
            if total > 10:
                self.stdout.write(f'  ... and {total - 10} more')
            return

        migrated = 0
        failed = 0
        for asset in external:
            try:
                new_url = download_logo_to_storage(asset.logo_url, asset.id)
                if new_url != asset.logo_url:
                    asset.logo_url = new_url
                    asset.save(update_fields=['logo_url'])
                    migrated += 1
                    self.stdout.write(self.style.SUCCESS(f'  OK: {asset.name} ({asset.id})'))
                else:
                    self.stdout.write(self.style.WARNING(f'  Skip (download failed): {asset.name}'))
                    failed += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  Error {asset.name}: {e}'))
                failed += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Migrated: {migrated}'))
        if failed:
            self.stdout.write(self.style.WARNING(f'Failed/skipped: {failed}'))
