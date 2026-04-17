# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0128_clientdocument_product'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='imported_contract_preview_enabled',
            field=models.BooleanField(default=False),
        ),
    ]
