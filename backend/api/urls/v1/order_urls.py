from rest_framework.routers import DefaultRouter
from django.urls import path
from api.views.order_views import OrderViewSet
from api.views.websocket_views import (
    order_status_stream, 
    websocket_status, 
    test_notification
)

router = DefaultRouter()
router.register(r'', OrderViewSet, basename='orders')

urlpatterns = [
  path('orders/status-stream/', order_status_stream, name='order_status_stream'),
  path('realtime/status/', websocket_status, name='websocket_status'),
  path('realtime/test/', test_notification, name='test_notification'),
]

urlpatterns += router.urls