from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views.collaborative_session_views import (
    CollaborativeSessionViewSet,
    SessionParticipantViewSet
)

router = DefaultRouter()
router.register(r'sessions', CollaborativeSessionViewSet, basename='collaborative-sessions')
router.register(r'participants', SessionParticipantViewSet, basename='session-participants')

urlpatterns = [
    path('', include(router.urls)),
]