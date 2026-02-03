# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0089_add_position_generation_history'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='valeur_cumulee_interets',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True),
        ),
    ]
