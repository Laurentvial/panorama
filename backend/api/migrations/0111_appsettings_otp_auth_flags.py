# Generated manually for auth method management

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0110_asset_source_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='otp_email_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='otp_sms_enabled',
            field=models.BooleanField(default=True),
        ),
    ]
