import requests
import qrcode
from io import BytesIO
from django.core.files.base import ContentFile
from django.conf import settings

def notify_order_updated(order_data):
    try:
        requests.post(
            'http://ws-server:4000/emit-order',
            json=order_data,
            timeout=2
        )
    except requests.RequestException:
        pass  # Évite les crashs Django si le serveur WebSocket est down

def generate_qr_for_table(table):
    url = f"{settings.DOMAIN}/table/{table.identifiant}"

    qr = qrcode.make(url)
    buffer = BytesIO()
    qr.save(buffer, format='PNG')
    filename = f"qr_{table.identifiant}.png"

    # Stockage du fichier dans le champ FileField
    table.qr_code_file.save(filename, ContentFile(buffer.getvalue()), save=True)