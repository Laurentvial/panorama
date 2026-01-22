from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0056_product_asset_allocation'),
    ]

    operations = [
        migrations.CreateModel(
            name='Position',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('period_index', models.PositiveIntegerField(default=0)),
                ('period_date', models.DateField()),
                ('invested_amount', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('expected_profit', models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True)),
                ('expected_total', models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True)),
                ('status', models.CharField(choices=[('pending', 'En attente'), ('done', 'Terminé'), ('cancelled', 'Annulé')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='positions', to='api.client')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='positions', to='api.product')),
                ('transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='positions', to='api.transaction')),
            ],
            options={
                'ordering': ['period_date', 'created_at'],
                'unique_together': {('transaction', 'period_index')},
            },
        ),
    ]

