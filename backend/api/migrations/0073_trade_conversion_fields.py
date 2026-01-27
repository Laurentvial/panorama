from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0072_position_entry_price_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="fx_rate_eur_to_asset",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name="transaction",
            name="amount_in_asset_currency",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name="position",
            name="fx_rate_eur_to_asset",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name="position",
            name="invested_amount_asset_currency",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
    ]

