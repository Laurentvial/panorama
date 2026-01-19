# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0044_alter_product_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='alpha_vantage_symbol',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='asset',
            name='exchange',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='asset',
            name='currency',
            field=models.CharField(blank=True, default='USD', max_length=10),
        ),
        migrations.AddField(
            model_name='asset',
            name='region',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='asset',
            name='last_price',
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=15, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='last_price_update',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='price_change',
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=15, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='price_change_percent',
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=10, null=True),
        ),
    ]
