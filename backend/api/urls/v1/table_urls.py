from django.urls import path
from api.views.table_views import TableQRRouterView

urlpatterns = [
    path('<str:identifiant>/', TableQRRouterView.as_view(), name='table_qr_router'),
]