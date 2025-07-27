from rest_framework.routers import DefaultRouter
from api.views.menu_views import MenuViewSet

router = DefaultRouter()
router.register(r'', MenuViewSet, basename='menus')

urlpatterns = router.urls