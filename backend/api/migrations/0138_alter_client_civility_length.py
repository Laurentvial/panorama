from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0137_client_kyc_documents_review'),
    ]

    operations = [
        migrations.AlterField(
            model_name='client',
            name='civility',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
    ]
