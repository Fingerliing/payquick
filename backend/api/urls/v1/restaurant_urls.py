from rest_framework.routers import DefaultRouter
from api.views.restaurant_views import RestaurantViewSet

router = DefaultRouter()
router.register(r'', RestaurantViewSet, basename='restaurants')

urlpatterns = router.urls