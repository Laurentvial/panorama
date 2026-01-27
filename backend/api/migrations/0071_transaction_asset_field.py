from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0070_position_product_nullable"),
    ]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="asset",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="transactions",
                to="api.asset",
            ),
        ),
    ]

