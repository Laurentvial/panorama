from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0065_client_verification_questionnaire"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="employer_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]

