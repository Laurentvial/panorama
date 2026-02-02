from django.db import migrations, models


def backfill_validated_at(apps, schema_editor):
    Transaction = apps.get_model("api", "Transaction")
    # Best-effort backfill for already-validated transactions:
    # use updated_at (likely when status became termine), fallback to datetime.
    for t in Transaction.objects.filter(status="termine", validated_at__isnull=True).only(
        "id", "datetime", "updated_at"
    ).iterator():
        try:
            t.validated_at = t.updated_at or t.datetime
            t.save(update_fields=["validated_at"])
        except Exception:
            pass


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0084_capitalisation_fonds_boolean"),
    ]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="validated_at",
            field=models.DateTimeField(blank=True, default=None, null=True),
        ),
        migrations.RunPython(backfill_validated_at, migrations.RunPython.noop),
    ]

