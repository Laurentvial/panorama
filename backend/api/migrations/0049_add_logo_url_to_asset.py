# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0048_newspost'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='logo_url',
            field=models.URLField(blank=True, default='', max_length=500),
        ),
    ]
