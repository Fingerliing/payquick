from rest_framework.routers import DefaultRouter
from api.views.admin_views import AdminRestaurateurViewSet

router = DefaultRouter()
router.register(r'restaurateurs', AdminRestaurateurViewSet, basename='admin-restaurateurs')

urlpatterns = router.urls