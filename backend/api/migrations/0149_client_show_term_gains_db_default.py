from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0148_client_show_term_gains"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE api_client
                ALTER COLUMN show_term_gains SET DEFAULT FALSE;

                UPDATE api_client
                SET show_term_gains = FALSE
                WHERE show_term_gains IS NULL;

                ALTER TABLE api_client
                ALTER COLUMN show_term_gains SET NOT NULL;
            """,
            reverse_sql="""
                ALTER TABLE api_client
                ALTER COLUMN show_term_gains DROP DEFAULT;
            """,
        ),
    ]
