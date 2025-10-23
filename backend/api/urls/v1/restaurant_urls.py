from rest_framework.routers import DefaultRouter
from django.urls import path, include
from api.views.restaurant_views import RestaurantViewSet, PublicRestaurantViewSet
from api.views.restaurant_session_management_views import RestaurantSessionManagementViewSet

# Router pour les APIs privées (restaurateurs authentifiés)
private_router = DefaultRouter()
private_router.register(r'', RestaurantViewSet, basename='restaurants')

# Router pour les APIs publiques (clients/navigation)
public_router = DefaultRouter()
public_router.register(r'', PublicRestaurantViewSet, basename='public-restaurants')

# Router pour la gestion des sessions par les restaurateurs
session_management_router = DefaultRouter()
session_management_router.register(r'sessions', RestaurantSessionManagementViewSet, basename='restaurant-sessions')

# URLs combinées
urlpatterns = [
    # APIs publiques : /api/v1/restaurants/public/
    path('public/', include(public_router.urls)),

    # APIs privées : /api/v1/restaurants/
    path('', include(private_router.urls)),

    # APIs de gestion des sessions : /api/v1/restaurants/sessions/
    path('sessions/', include(session_management_router.urls)),
]