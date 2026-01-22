from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0055_add_trading_view_symbol'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductAssetAllocation',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('proportion', models.DecimalField(decimal_places=2, default=0, help_text='Proportion en pourcentage (0 à 100)', max_digits=6, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='product_allocations', to='api.asset')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asset_allocations', to='api.product')),
            ],
            options={
                'unique_together': {('product', 'asset')},
            },
        ),
    ]

