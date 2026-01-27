from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0066_client_employer_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="asset",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="asset",
            name="sector",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="asset",
            name="industry",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="asset",
            name="headquarters",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AddField(
            model_name="asset",
            name="ceo",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="asset",
            name="founded_year",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="asset",
            name="employees",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="asset",
            name="website",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="asset",
            name="market_cap",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="asset",
            name="market_cap_currency",
            field=models.CharField(blank=True, default="USD", max_length=10),
        ),
        migrations.AddField(
            model_name="asset",
            name="country",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]

