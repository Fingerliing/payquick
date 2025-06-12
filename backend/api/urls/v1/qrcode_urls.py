from django.urls import path
from api.views.qrcode_views import QRCodeFactoryView

urlpatterns = [
    path('factory/<int:restaurant_id>/', QRCodeFactoryView.as_view(), name='qr_code_factory'),
]