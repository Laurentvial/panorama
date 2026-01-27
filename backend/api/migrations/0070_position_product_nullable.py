from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0069_userdetails_profile_photo"),
    ]

    operations = [
        migrations.AlterField(
            model_name="position",
            name="product",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="positions",
                to="api.product",
            ),
        ),
    ]

