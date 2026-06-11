from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0146_client_referral_enabled_client_referral_offer_text_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE api_client
                ALTER COLUMN referral_enabled SET DEFAULT TRUE;

                UPDATE api_client
                SET referral_enabled = TRUE
                WHERE referral_enabled IS NULL;

                ALTER TABLE api_client
                ALTER COLUMN referral_enabled SET NOT NULL;
            """,
            reverse_sql="""
                ALTER TABLE api_client
                ALTER COLUMN referral_enabled DROP DEFAULT;
            """,
        ),
    ]
