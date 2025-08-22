from rest_framework.routers import DefaultRouter
from django.urls import path, include
from api.views.table_orders_views import TableOrdersViewSet

# Router pour les commandes de table (restaurateurs authentifiés uniquement)
router = DefaultRouter()
router.register(r'', TableOrdersViewSet, basename='table-orders')

# URLs combinées
urlpatterns = [
    path('', include(router.urls)),
]