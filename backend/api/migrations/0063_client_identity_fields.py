from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0062_newspost_article_url_newspost_source_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="middle_name",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.AddField(
            model_name="client",
            name="legal_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="client",
            name="sex",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="client",
            name="account_verified",
            field=models.BooleanField(default=False),
        ),
    ]

