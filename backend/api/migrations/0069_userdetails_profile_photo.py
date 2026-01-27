from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0068_client_conversation_threads"),
    ]

    operations = [
        migrations.AddField(
            model_name="userdetails",
            name="profile_photo",
            field=models.ImageField(blank=True, null=True, upload_to="user_profiles/"),
        ),
    ]

