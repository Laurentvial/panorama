from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0135_client_show_position_prices'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientproduct',
            name='show_rates',
            field=models.BooleanField(default=True),
        ),
    ]
