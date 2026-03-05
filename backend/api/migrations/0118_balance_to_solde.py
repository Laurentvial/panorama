# Migration: Replace 'balance' with 'solde' in Transaction transfer_from and transfer_to

from django.db import migrations


def balance_to_solde(apps, schema_editor):
    Transaction = apps.get_model('api', 'Transaction')
    Transaction.objects.filter(transfer_from='balance').update(transfer_from='solde')
    Transaction.objects.filter(transfer_to='balance').update(transfer_to='solde')


def solde_to_balance(apps, schema_editor):
    Transaction = apps.get_model('api', 'Transaction')
    Transaction.objects.filter(transfer_from='solde').update(transfer_from='balance')
    Transaction.objects.filter(transfer_to='solde').update(transfer_to='balance')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0117_add_client_successor'),
    ]

    operations = [
        migrations.RunPython(balance_to_solde, solde_to_balance),
    ]
