from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0123_asset_last_price_update_attempt'),
    ]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='consumer_mediator',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='dpo_contact',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='hosting_provider',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='legal_form',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='publication_director',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='rcs',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='regulatory_mentions',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='share_capital',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='siren',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='siret',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='vat_number',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
    ]
