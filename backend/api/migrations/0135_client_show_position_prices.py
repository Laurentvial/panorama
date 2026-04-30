from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0134_alter_asset_last_price_update_attempt'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='show_position_prices',
            field=models.BooleanField(default=False),
        ),
    ]
