import requests

def notify_order_updated(order_data):
    try:
        requests.post(
            'http://localhost:4000/emit-order',  # URL de ton serveur Node.js
            json=order_data,
            timeout=2
        )
    except requests.RequestException:
        pass  # Évite les crashs Django si le serveur WebSocket est down
