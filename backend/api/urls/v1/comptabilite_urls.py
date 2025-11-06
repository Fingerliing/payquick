from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views.comptabilite_views import ComptabiliteViewSet

router = DefaultRouter()
router.register(r'', ComptabiliteViewSet, basename='comptabilite')

urlpatterns = [
    path('', include(router.urls)),
]