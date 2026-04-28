from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0132_clientdocument_document_created_on"),
    ]

    operations = [
        migrations.AddField(
            model_name="clientproduct",
            name="overrides",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
