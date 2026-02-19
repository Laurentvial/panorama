# Generated migration for AppNotification model

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0112_product_duration_months_to_days"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AppNotification",
            fields=[
                ("id", models.CharField(default="", max_length=12, primary_key=True, serialize=False, unique=True)),
                ("recipient_type", models.CharField(choices=[("crm_user", "CRM User"), ("client", "Client")], default="crm_user", max_length=20)),
                ("notification_type", models.CharField(default="", max_length=50)),
                ("read", models.BooleanField(default=False)),
                ("title", models.CharField(blank=True, default="", max_length=200)),
                ("message", models.TextField(blank=True, default="")),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("recipient_client", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="app_notifications", to="api.client")),
                ("recipient_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="app_notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
