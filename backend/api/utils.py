import requests

def notify_order_updated(order_data):
    try:
        requests.post(
            'http://ws-server:4000/emit-order',
            json=order_data,
            timeout=2
        )
    except requests.RequestException:
        pass  # Évite les crashs Django si le serveur WebSocket est down
