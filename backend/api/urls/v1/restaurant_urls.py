from rest_framework.routers import DefaultRouter
from django.urls import path, include
from api.views.restaurant_views import RestaurantViewSet, PublicRestaurantViewSet

# Router pour les APIs privées (restaurateurs authentifiés)
private_router = DefaultRouter()
private_router.register(r'', RestaurantViewSet, basename='restaurants')

# Router pour les APIs publiques (clients/navigation)
public_router = DefaultRouter()
public_router.register(r'', PublicRestaurantViewSet, basename='public-restaurants')

# URLs combinées
urlpatterns = [
    # APIs publiques : /api/v1/restaurants/public/
    path('public/', include(public_router.urls)),

    # APIs privées : /api/v1/restaurants/
    path('', include(private_router.urls)),
]