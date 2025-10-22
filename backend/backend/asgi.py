import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
from django.urls import path, re_path
import django

# Configurer Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Import après setup Django
from api.consumers import OrderConsumer, SessionConsumer

# Routes WebSocket
websocket_urlpatterns = [
    path('ws/orders/', OrderConsumer.as_asgi()),
    re_path(r'ws/session/(?P<session_id>[^/]+)/$', SessionConsumer.as_asgi()),
]

# Configuration ASGI complète
application = ProtocolTypeRouter({
    # HTTP (Django classique)
    "http": get_asgi_application(),
    
    # WebSocket
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        )
    ),
})