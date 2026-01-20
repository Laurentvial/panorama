# Generated manually to fix ticker_symbol constraint issue

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_add_alpha_vantage_fields_to_asset'),
    ]

    operations = [
        # First, check if ticker_symbol exists and make it nullable
        migrations.RunSQL(
            sql=[
                "ALTER TABLE api_asset ALTER COLUMN ticker_symbol DROP NOT NULL;",
            ],
            reverse_sql=[
                "ALTER TABLE api_asset ALTER COLUMN ticker_symbol SET NOT NULL;",
            ],
        ),
    ]
