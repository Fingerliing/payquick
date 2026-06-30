"""
Routage CRUD restaurateur des formules.
"""
from rest_framework.routers import DefaultRouter

from api.views.formule_views import FormuleViewSet

router = DefaultRouter()
router.register(r'', FormuleViewSet, basename='formules')

urlpatterns = router.urls
