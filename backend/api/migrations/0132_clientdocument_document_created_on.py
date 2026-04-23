# Date métier (saisie) distincte de created_at (ajout en base)

from django.db import migrations, models


def copy_legacy_document_dates(apps, schema_editor):
    ClientDocument = apps.get_model('api', 'ClientDocument')
    for row in ClientDocument.objects.all().only('id', 'document_created_on', 'created_at'):
        if row.created_at and row.document_created_on is None:
            row.document_created_on = row.created_at.date()
            row.save(update_fields=['document_created_on'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0131_product_technical_sheet'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientdocument',
            name='document_created_on',
            field=models.DateField(
                blank=True,
                null=True,
                verbose_name="Date de création du document",
            ),
        ),
        migrations.RunPython(copy_legacy_document_dates, migrations.RunPython.noop),
    ]
