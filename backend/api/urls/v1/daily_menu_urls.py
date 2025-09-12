from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views.daily_menu_views import (
    DailyMenuViewSet, PublicDailyMenuViewSet, DailyMenuTemplateViewSet
)

router = DefaultRouter()
router.register(r'', DailyMenuViewSet, basename='daily-menus')
router.register(r'public', PublicDailyMenuViewSet, basename='public-daily-menus')
router.register(r'templates', DailyMenuTemplateViewSet, basename='daily-menu-templates')

urlpatterns = [
    path('', include(router.urls)),
]