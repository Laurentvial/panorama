from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0138_alter_client_civility_length'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientplatformlog',
            name='origin',
            field=models.CharField(db_index=True, default='unknown', max_length=50),
        ),
    ]
