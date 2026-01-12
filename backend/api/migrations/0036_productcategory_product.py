# Generated manually

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0035_remove_transaction_visible_by_client'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductCategory',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('title', models.CharField(default='', max_length=200)),
                ('url', models.CharField(blank=True, default='', max_length=200)),
                ('subcategories', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='Product',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('name', models.CharField(default='', max_length=200)),
                ('reference', models.CharField(blank=True, default='', max_length=100)),
                ('price', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('profitability', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('duration', models.CharField(blank=True, default='', max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='products', to='api.productcategory')),
            ],
        ),
    ]
