from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0147_referral_enabled_db_default'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='show_term_gains',
            field=models.BooleanField(default=False),
        ),
    ]
