from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views.table_views import TableViewSet, RestaurantTableManagementViewSet, TableQRRouterView

# Router pour les endpoints privés (gestion des tables par le restaurateur)
private_router = DefaultRouter()
private_router.register(r'', TableViewSet, basename='table')
private_router.register(r'restaurants', RestaurantTableManagementViewSet, basename='restaurant-tables')

# URLs combinées :
# - Endpoint public accessible via /api/v1/table/public/<identifiant>/
# - Endpoints privés via le router (liste/CRUD des tables)
urlpatterns = [
    # Endpoint public : accès au menu via un code QR ou manuel
    path('public/<str:identifiant>/', TableQRRouterView.as_view(), name='table_qr_router'),

    # Routes privées pour la gestion des tables
    path('', include(private_router.urls)),
]