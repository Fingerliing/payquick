from rest_framework.routers import DefaultRouter

from api.views.reservation_views import ReservationViewSet

router = DefaultRouter()
router.register(r'', ReservationViewSet, basename='reservations')

urlpatterns = router.urls