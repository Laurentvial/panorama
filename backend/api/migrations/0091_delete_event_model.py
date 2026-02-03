# Generated manually

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0090_add_valeur_cumulee_interets_to_product'),
    ]

    operations = [
        migrations.DeleteModel(
            name='Event',
        ),
    ]
