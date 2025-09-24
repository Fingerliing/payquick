from django.urls import path
from api.views.receipt_views import (
    SendReceiptEmailView,
    GenerateReceiptPDFView,
    GetReceiptDataView
)

urlpatterns = [
    path('send-email/', SendReceiptEmailView.as_view(), name='send-receipt-email'),
]