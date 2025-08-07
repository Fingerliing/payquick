from django.urls import path
from rest_framework.routers import DefaultRouter
from api.views.table_views import TableViewSet, RestaurantTableManagementViewSet, TableQRRouterView

router = DefaultRouter()
router.register(r'', TableViewSet, basename='table')
router.register(r'restaurants', RestaurantTableManagementViewSet, basename='restaurant-tables')

urlpatterns = [
    path('<str:identifiant>/', TableQRRouterView.as_view(), name='table_qr_router'),
]