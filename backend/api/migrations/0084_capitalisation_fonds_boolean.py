from django.db import migrations, models


def _to_bool(value) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    return s in {"oui", "true", "1", "yes"}


def forwards(apps, schema_editor):
    Product = apps.get_model("api", "Product")
    # Copy old string values into the new boolean field
    for p in Product.objects.all().only("id", "capitalisation_fonds", "capitalisation_fonds_tmp").iterator():
        try:
            p.capitalisation_fonds_tmp = _to_bool(getattr(p, "capitalisation_fonds", None))
            p.save(update_fields=["capitalisation_fonds_tmp"])
        except Exception:
            # Best-effort: default False if anything unexpected
            try:
                p.capitalisation_fonds_tmp = False
                p.save(update_fields=["capitalisation_fonds_tmp"])
            except Exception:
                pass


def backwards(apps, schema_editor):
    Product = apps.get_model("api", "Product")
    # Restore legacy 'Oui'/'Non' strings
    for p in Product.objects.all().only("id", "capitalisation_fonds", "capitalisation_fonds_tmp").iterator():
        v = bool(getattr(p, "capitalisation_fonds", False))
        # During reverse, 'capitalisation_fonds' will be the boolean (after rename)
        setattr(p, "capitalisation_fonds_tmp", "Oui" if v else "Non")
        try:
            p.save(update_fields=["capitalisation_fonds_tmp"])
        except Exception:
            pass


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0083_client_identity_document_verso"),
    ]

    operations = [
        # Add a new boolean field (temporary name), copy data, then swap.
        migrations.AddField(
            model_name="product",
            name="capitalisation_fonds_tmp",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name="product",
            name="capitalisation_fonds",
        ),
        migrations.RenameField(
            model_name="product",
            old_name="capitalisation_fonds_tmp",
            new_name="capitalisation_fonds",
        ),
    ]

