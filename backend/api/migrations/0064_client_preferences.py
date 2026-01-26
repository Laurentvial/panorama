from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0063_client_identity_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="preferences",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

