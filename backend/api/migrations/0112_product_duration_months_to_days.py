# Data migration: convert Product.duration from months to days.
# Values that look like months (integer <= 31) are converted to days (value * 30).
# Values > 31 are assumed already in days and left unchanged.

import re
from django.db import migrations

_DURATION_RE = re.compile(r"(\d+)")


def _parse_first_int(s: str | None) -> int | None:
    if not s:
        return None
    m = _DURATION_RE.search(str(s).strip())
    if not m:
        return None
    try:
        return int(m.group(1))
    except (ValueError, TypeError):
        return None


def forwards(apps, schema_editor):
    Product = apps.get_model("api", "Product")
    updated = 0
    for product in Product.objects.exclude(duration="").exclude(duration__isnull=True):
        raw = (product.duration or "").strip()
        if not raw:
            continue
        v = _parse_first_int(raw)
        if v is None:
            continue
        if v <= 31:
            product.duration = str(v * 30)
            product.save(update_fields=["duration"])
            updated += 1
    if updated:
        print(f"Product duration: converted {updated} product(s) from months to days.")


def backwards(apps, schema_editor):
    # Optional: convert back days to months (days / 30). Only reasonable for values that are multiples of 30.
    Product = apps.get_model("api", "Product")
    reverted = 0
    for product in Product.objects.exclude(duration="").exclude(duration__isnull=True):
        v = _parse_first_int(product.duration)
        if v is None or v <= 31:
            continue
        if v % 30 == 0:
            product.duration = str(v // 30)
            product.save(update_fields=["duration"])
            reverted += 1
    if reverted:
        print(f"Product duration: reverted {reverted} product(s) from days to months.")


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0111_appsettings_otp_auth_flags"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
