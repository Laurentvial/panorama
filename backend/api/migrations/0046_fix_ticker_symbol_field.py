# Generated manually to fix ticker_symbol constraint issue

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_add_alpha_vantage_fields_to_asset'),
    ]

    operations = [
        # Make ticker_symbol nullable *if it exists*.
        # On fresh databases, this column might not exist (depending on the
        # historical migration sequence), so this must be a no-op instead of
        # failing the deploy.
        migrations.RunSQL(
            sql=[
                """
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'api_asset'
                      AND column_name = 'ticker_symbol'
                  ) THEN
                    ALTER TABLE api_asset ALTER COLUMN ticker_symbol DROP NOT NULL;
                  END IF;
                END
                $$;
                """,
            ],
            reverse_sql=[
                """
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'api_asset'
                      AND column_name = 'ticker_symbol'
                  ) THEN
                    ALTER TABLE api_asset ALTER COLUMN ticker_symbol SET NOT NULL;
                  END IF;
                END
                $$;
                """,
            ],
        ),
    ]
