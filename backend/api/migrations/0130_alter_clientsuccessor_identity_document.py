# Generated manually — allow PDF and other identity document formats

import os

from django.conf import settings
from django.db import migrations, models

from api.storage import S3DeferredStorage, S3MediaStorage

# Match api.models client_profile_storage. (Migrations must not use CloudinaryMediaStorage alone:
# in api.storage it aliases S3MediaStorage and ignores the S3DeferredStorage bootstrap path.)
s3_configured = getattr(settings, 'S3_CONFIGURED', False)
is_render = getattr(settings, 'IS_RENDER', os.environ.get('RENDER', '').lower() == 'true')
_client_profile_storage = S3MediaStorage if s3_configured else S3DeferredStorage
if not s3_configured and not is_render:
    raise ValueError(
        'S3/MinIO credentials are REQUIRED. '
        'Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_STORAGE_BUCKET_NAME.'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0129_client_imported_contract_preview_enabled'),
    ]

    operations = [
        migrations.AlterField(
            model_name='clientsuccessor',
            name='identity_document',
            field=models.FileField(
                blank=True,
                null=True,
                storage=_client_profile_storage,
                upload_to='successors/identity/',
            ),
        ),
    ]
