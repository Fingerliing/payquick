from rest_framework.routers import DefaultRouter

from api.views.floor_plan_views import FloorPlanViewSet

router = DefaultRouter()
router.register(r'', FloorPlanViewSet, basename='floor-plan')

urlpatterns = router.urls
