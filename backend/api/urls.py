from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RestaurantViewSet, ClientProfileViewSet, MenuViewSet, MenuItemViewSet

router = DefaultRouter()
router.register(r'restaurants', RestaurantViewSet)
router.register(r'clients', ClientProfileViewSet)
router.register(r'menus', MenuViewSet)
router.register(r'menu-items', MenuItemViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
