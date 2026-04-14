# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0126_position_deletion_record'),
    ]

    operations = [
        migrations.AddField(
            model_name='rib',
            name='motif',
            field=models.CharField(blank=True, default='', max_length=512),
        ),
    ]
