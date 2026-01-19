# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0041_add_price_variation_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='AppSettings',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('logo', models.ImageField(blank=True, null=True, upload_to='app_settings/')),
                ('primary_color', models.CharField(default='#030213', max_length=7)),
                ('secondary_color', models.CharField(blank=True, default='', max_length=7)),
                ('accent_color', models.CharField(blank=True, default='', max_length=7)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'App Settings',
                'verbose_name_plural': 'App Settings',
            },
        ),
    ]
