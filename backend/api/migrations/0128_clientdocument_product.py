# Generated manually for product-linked client documents

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0127_rib_motif'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientdocument',
            name='product',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='client_documents',
                to='api.product',
            ),
        ),
    ]
