from django.urls import path
from rest_framework.routers import DefaultRouter
from api.views.menu_views import MenuViewSet

router = DefaultRouter()
router.register(r'', MenuViewSet, basename='menus')

# Vue basée sur l'action du ViewSet
public_menus_view = MenuViewSet.as_view({'get': 'public_by_restaurant'})

urlpatterns = [
    # Chemin EXACT attendu par le front :
    # /api/v1/restaurants/public/<restaurant_id>/menus/
    path('restaurants/public/<int:restaurant_id>/menus/', public_menus_view, name='public-restaurant-menus'),
]

# Conserver aussi les routes du router (CRUD privé restaurateur)
urlpatterns += router.urls