# Generated manually — match api.models product_storage (S3/MinIO)

import os

from django.conf import settings
from django.db import migrations, models

from api.storage import S3DeferredStorage, S3MediaStorage

# Same logic as Product.image / models.product_storage
s3_configured = getattr(settings, 'S3_CONFIGURED', False)
is_render = getattr(settings, 'IS_RENDER', os.environ.get('RENDER', '').lower() == 'true')
_product_storage = S3MediaStorage if s3_configured else S3DeferredStorage
if not s3_configured and not is_render:
    raise ValueError(
        'S3/MinIO credentials are REQUIRED. '
        'Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_STORAGE_BUCKET_NAME.'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0130_alter_clientsuccessor_identity_document'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='technical_sheet',
            field=models.FileField(
                blank=True,
                null=True,
                storage=_product_storage,
                upload_to='products/technical_sheets/',
            ),
        ),
    ]
