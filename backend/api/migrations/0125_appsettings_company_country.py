from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0124_appsettings_legal_company_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='company_country',
            field=models.CharField(
                max_length=2,
                choices=[('FR', 'France'), ('BE', 'Belgique'), ('LU', 'Luxembourg'), ('CH', 'Suisse')],
                default='FR',
            ),
        ),
    ]
