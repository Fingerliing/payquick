from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_add_latitude_longitude'),
    ]

    operations = [
        migrations.AlterField(
            model_name='restaurant',
            name='latitude',
            field=models.FloatField(),
        ),
        migrations.AlterField(
            model_name='restaurant',
            name='longitude',
            field=models.FloatField(),
        ),
    ] 