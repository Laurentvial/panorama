# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0038_add_product_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='is_variable_profitability',
            field=models.CharField(default='Non', max_length=10),
        ),
    ]
