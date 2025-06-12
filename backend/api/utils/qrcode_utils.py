import qrcode
from io import BytesIO
from django.core.files.base import ContentFile
from django.conf import settings

def generate_qr_for_table(table):
    url = f"{settings.DOMAIN}/table/{table.identifiant}"
    qr = qrcode.make(url)
    buffer = BytesIO()
    qr.save(buffer, format='PNG')
    filename = f"qr_{table.identifiant}.png"
    table.qr_code_file.save(filename, ContentFile(buffer.getvalue()), save=True)