from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='latitude',
            field=models.FloatField(default=0),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='restaurant',
            name='longitude',
            field=models.FloatField(default=0),
            preserve_default=False,
        ),
    ] 