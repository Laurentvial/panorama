from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0143_add_cloture_status_to_transaction'),
    ]

    operations = [
        migrations.CreateModel(
            name='Wallet',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('name', models.CharField(default='', max_length=200)),
                ('asset_symbol', models.CharField(default='', max_length=30)),
                ('network', models.CharField(default='', max_length=120)),
                ('wallet_address', models.CharField(default='', max_length=255)),
                ('memo_or_tag', models.CharField(blank=True, default='', max_length=120)),
                ('default', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='ClientWallet',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='client_wallets', to='api.client')),
                ('wallet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='client_wallets', to='api.wallet')),
            ],
            options={
                'unique_together': {('client', 'wallet')},
            },
        ),
    ]
