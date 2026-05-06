from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0126_position_deletion_record'),
    ]

    operations = [
        migrations.AlterField(
            model_name='appsettings',
            name='company_country',
            field=models.CharField(
                max_length=2,
                choices=[('FR', 'France'), ('BE', 'Belgique'), ('LU', 'Luxembourg'), ('CH', 'Suisse'), ('GR', 'Grèce')],
                default='FR',
            ),
        ),
    ]
