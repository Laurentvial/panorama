from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0139_clientplatformlog_origin'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientplatformlog',
            name='device',
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddField(
            model_name='clientplatformlog',
            name='os',
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
    ]
