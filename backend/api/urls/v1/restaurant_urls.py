from rest_framework.routers import DefaultRouter
from django.urls import path, include
from api.views.restaurant_views import RestaurantViewSet, PublicRestaurantViewSet
from api.views.restaurant_session_management_views import RestaurantSessionManagementViewSet
from api.views.directory_views import (
    nearby_restaurants,
    SiretEnrichmentView,
    RestaurantReviewViewSet,
)

# Router pour les APIs privées (restaurateurs authentifiés)
private_router = DefaultRouter()
private_router.register(r'', RestaurantViewSet, basename='restaurants')

# Router pour les APIs publiques (clients/navigation)
public_router = DefaultRouter()
public_router.register(r'', PublicRestaurantViewSet, basename='public-restaurants')

# Router pour la gestion des sessions par les restaurateurs
session_management_router = DefaultRouter()
session_management_router.register(r'sessions', RestaurantSessionManagementViewSet, basename='restaurant-sessions')

# Router pour les avis restaurants (lecture publique / écriture client)
reviews_router = DefaultRouter()
reviews_router.register(r'reviews', RestaurantReviewViewSet, basename='restaurant-reviews')

# URLs combinées
urlpatterns = [
    # Répertoire "partenaires autour de moi".
    # ⚠️ DOIT être déclaré AVANT le public_router : sinon 'public/nearby/' est
    # capté par la route détail 'public/<pk>/' du router (pk='nearby' → 404).
    path('public/nearby/', nearby_restaurants, name='public-restaurants-nearby'),

    # Enrichissement SIRET (onboarding restaurateur) : /api/v1/restaurants/enrich-siret/
    path('enrich-siret/', SiretEnrichmentView.as_view(), name='restaurant-enrich-siret'),

    # Avis : /api/v1/restaurants/reviews/
    path('', include(reviews_router.urls)),

    # APIs publiques : /api/v1/restaurants/public/
    path('public/', include(public_router.urls)),

    # APIs de gestion des sessions : /api/v1/restaurants/sessions/
    path('sessions/', include(session_management_router.urls)),

    # APIs privées : /api/v1/restaurants/
    path('', include(private_router.urls)),
]