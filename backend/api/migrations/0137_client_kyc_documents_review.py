from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0136_clientproduct_show_rates'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='kyc_documents_review',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
