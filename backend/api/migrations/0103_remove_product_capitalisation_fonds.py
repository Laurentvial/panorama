from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0102_alter_transaction_status"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="product",
            name="capitalisation_fonds",
        ),
    ]
