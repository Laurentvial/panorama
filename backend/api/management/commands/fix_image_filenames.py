"""
Management command to fix image filename mismatches between database and storage.

This command checks for products where the image filename in the database doesn't match
what's actually stored in the cloud storage, and fixes the database records accordingly.
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from api.models import Product
from api.storage import ImpossibleCloudStorage


class Command(BaseCommand):
    help = 'Fix image filename mismatches between database and cloud storage'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without actually changing anything',
        )
        parser.add_argument(
            '--product-id',
            type=str,
            help='Fix filename for a specific product ID only',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        product_id = options.get('product_id')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        # Get products to check
        if product_id:
            try:
                products = [Product.objects.get(id=product_id)]
                self.stdout.write(f'Checking product {product_id}...')
            except Product.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Product {product_id} not found'))
                return
        else:
            products = Product.objects.exclude(image='').filter(image__isnull=False)
            self.stdout.write(f'Checking {products.count()} products with images...')

        fixed_count = 0
        error_count = 0

        for product in products:
            try:
                if self._fix_product_image_filename(product, dry_run):
                    fixed_count += 1
            except Exception as e:
                error_count += 1
                self.stdout.write(
                    self.style.ERROR(f'Error processing product {product.id}: {str(e)}')
                )

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'DRY RUN: Would fix {fixed_count} products, {error_count} errors')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f'Fixed {fixed_count} products, {error_count} errors')
            )

    def _fix_product_image_filename(self, product, dry_run=False):
        """Fix filename mismatch for a single product. Returns True if fixed."""
        if not product.image:
            return False

        # Check if using cloud storage
        storage = product.image.storage
        if not isinstance(storage, ImpossibleCloudStorage):
            return False

        try:
            # Get the stored filename
            stored_name = product.image.name
            normalized_name = storage._normalize_name(stored_name)

            # Try to check if the file exists with the stored name
            s3_client = storage.connection.meta.client
            try:
                s3_client.head_object(Bucket=storage.bucket_name, Key=normalized_name)
                # File exists with stored name - no fix needed
                return False
            except Exception as head_error:
                # File doesn't exist with stored name, check for alternatives
                error_code = ''
                if hasattr(head_error, 'response') and head_error.response:
                    error_code = head_error.response.get('Error', {}).get('Code', '')

                if error_code == '404' or 'NoSuchKey' in str(head_error):
                    # Try alternative extensions
                    base_name = stored_name.rsplit('.', 1)[0] if '.' in stored_name else stored_name
                    extensions_to_try = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

                    for ext in extensions_to_try:
                        try:
                            alt_name = f"{base_name}{ext}"
                            normalized_alt = storage._normalize_name(alt_name)
                            s3_client.head_object(Bucket=storage.bucket_name, Key=normalized_alt)

                            # Found file with different extension
                            if dry_run:
                                self.stdout.write(
                                    f'WOULD FIX: Product {product.id} - DB: {stored_name} -> S3: {alt_name}'
                                )
                            else:
                                old_name = product.image.name
                                product.image.name = alt_name
                                product.save(update_fields=['image'])
                                self.stdout.write(
                                    self.style.SUCCESS(
                                        f'FIXED: Product {product.id} - {old_name} -> {alt_name}'
                                    )
                                )
                            return True
                        except:
                            continue

                    # No alternative found
                    self.stdout.write(
                        self.style.WARNING(f'No file found for product {product.id}: {stored_name}')
                    )
                    return False
                else:
                    # Different error - log but don't try to fix
                    self.stdout.write(
                        self.style.WARNING(f'Error checking product {product.id}: {str(head_error)}')
                    )
                    return False

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Unexpected error checking product {product.id}: {str(e)}')
            )
            return False