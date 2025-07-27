from rest_framework.routers import DefaultRouter
from api.views.menu_views import MenuItemViewSet

router = DefaultRouter()
router.register(r'', MenuItemViewSet, basename='menu-items')

urlpatterns = router.urls