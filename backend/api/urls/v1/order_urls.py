from rest_framework.routers import DefaultRouter
from api.views.order_views import OrderViewSet

router = DefaultRouter()
router.register(r'', OrderViewSet, basename='orders')

urlpatterns = router.urls