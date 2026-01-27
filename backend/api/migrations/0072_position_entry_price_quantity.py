from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0071_transaction_asset_field"),
    ]

    operations = [
        migrations.AddField(
            model_name="position",
            name="entry_price",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name="position",
            name="quantity",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
    ]

