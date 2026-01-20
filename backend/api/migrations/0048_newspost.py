# Generated manually

import api.storage
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_alter_appsettings_logo_alter_client_profile_photo_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='NewsPost',
            fields=[
                ('id', models.CharField(default='', max_length=12, primary_key=True, serialize=False, unique=True)),
                ('title', models.CharField(default='', max_length=200)),
                ('content', models.TextField(default='')),
                ('image', models.ImageField(blank=True, null=True, storage=api.storage.CloudinaryMediaStorage, upload_to='news/')),
                ('published', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='news_posts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'News Post',
                'verbose_name_plural': 'News Posts',
                'ordering': ['-created_at'],
            },
        ),
    ]
