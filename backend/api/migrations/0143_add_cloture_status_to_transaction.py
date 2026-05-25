from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0142_merge_20260511_1018'),
    ]

    operations = [
        migrations.AlterField(
            model_name='transaction',
            name='status',
            field=models.CharField(
                choices=[
                    ('en_attente_paiement', 'En attente de paiement'),
                    ('en_cours', 'En cours'),
                    ('en_verification', 'En vérification'),
                    ('valide', 'Validé'),
                    ('cloture', 'Clôturé'),
                    ('conteste', 'Contesté'),
                    ('annule', 'Annulé'),
                ],
                default='en_cours',
                max_length=50,
            ),
        ),
    ]
