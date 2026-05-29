"""
Routage de la fonctionnalite d'import de menu par IA.

Endpoints exposes :
    /api/v1/menu-ai/jobs/                  (import par photo)
    /api/v1/menu-ai/jobs/{id}/
    /api/v1/menu-ai/jobs/{id}/draft/
    /api/v1/menu-ai/jobs/{id}/apply/
    /api/v1/menu-ai/jobs/{id}/retry/
    /api/v1/menu-ai/jobs/{id}/start/
    /api/v1/menu-ai/jobs/{id}/add-image/
    /api/v1/menu-ai/translations/          (traduction du menu existant)
    /api/v1/menu-ai/translations/{id}/
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.views.menu_ai_views import MenuScanJobViewSet
from api.views.menu_translation_views import MenuTranslationJobViewSet

router = DefaultRouter()
router.register(r'jobs', MenuScanJobViewSet, basename='menu-scan-jobs')
router.register(r'translations', MenuTranslationJobViewSet, basename='menu-translation-jobs')

urlpatterns = [
    path('', include(router.urls)),
]