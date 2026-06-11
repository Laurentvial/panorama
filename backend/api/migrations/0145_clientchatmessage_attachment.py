import api.storage
from django.conf import settings
from django.db import migrations, models

CHAT_ATTACHMENT_STORAGE = (
    api.storage.S3MediaStorage()
    if getattr(settings, 'S3_CONFIGURED', False)
    else api.storage.S3DeferredStorage()
)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0144_wallet_clientwallet'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientchatmessage',
            name='attachment',
            field=models.FileField(
                blank=True,
                null=True,
                storage=CHAT_ATTACHMENT_STORAGE,
                upload_to='chat_attachments/',
            ),
        ),
    ]
