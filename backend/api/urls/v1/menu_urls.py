from rest_framework.routers import DefaultRouter
from api.views.menu_views import MenuViewSet, MenuItemViewSet

router = DefaultRouter()
router.register(r'', MenuViewSet, basename='menus')
router.register(r'items', MenuItemViewSet, basename='menu-items')

urlpatterns = router.urls