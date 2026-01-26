from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0064_client_preferences"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="trading_objective",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="client",
            name="planned_investment_12m",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="client",
            name="risk_reward_profile",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="client",
            name="compliance_family_flags",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="client",
            name="funds_sources",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="client",
            name="primary_profession",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="client",
            name="annual_net_income",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.AddField(
            model_name="client",
            name="total_liquidities",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
    ]

