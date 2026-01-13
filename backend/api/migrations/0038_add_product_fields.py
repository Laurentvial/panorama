# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0037_usefullink_button'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='subcategory',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='product',
            name='status',
            field=models.CharField(choices=[('Actif', 'Actif'), ('Brouillon', 'Brouillon'), ('Inactif', 'Inactif')], default='Brouillon', max_length=20),
        ),
        migrations.AddField(
            model_name='product',
            name='cgv',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='product',
            name='profitability',
            field=models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='no_profitability',
            field=models.CharField(default='Oui', max_length=10),
        ),
        migrations.AddField(
            model_name='product',
            name='variable_profitability',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='product',
            name='profitability_period',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='product',
            name='show_min_profitability',
            field=models.CharField(default='Non', max_length=10),
        ),
        migrations.AddField(
            model_name='product',
            name='interest_period',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='product',
            name='capitalisation_fonds',
            field=models.CharField(default='Non', max_length=10),
        ),
        migrations.AddField(
            model_name='product',
            name='show_on_launch',
            field=models.CharField(default='Non', max_length=10),
        ),
        migrations.AddField(
            model_name='product',
            name='availability_start',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='availability_end',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='is_savings',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='product',
            name='link_to_assets',
            field=models.CharField(default='Non', max_length=10),
        ),
        migrations.AddField(
            model_name='product',
            name='enable_price_variation',
            field=models.CharField(default='Non', max_length=10),
        ),
    ]
