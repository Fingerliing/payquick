from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import (
    RestaurantViewSet,
    ClientProfileViewSet,
    MenuViewSet,
    MenuItemViewSet,
    MeView,
    RestaurateurProfileViewSet,
    OrderViewSet,
    MenuByRestaurantView,
    CreateCheckoutSessionView,
    stripe_webhook,
    RegisterView,
    CommandeTableAPIView,
    GenerateQRCodesAPIView
)
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

schema_view = get_schema_view(
   openapi.Info(
      title="PayQuick API",
      default_version='v1',
      description="Documentation interactive de l'API",
      contact=openapi.Contact(email="contact@payquick.local"),
   ),
   public=True,
   permission_classes=(permissions.AllowAny,),
)

router = DefaultRouter()
router.register(r'restaurants', RestaurantViewSet)
router.register(r'clients', ClientProfileViewSet)
router.register(r'menus', MenuViewSet)
router.register(r'menu-items', MenuItemViewSet)
router.register(r"restaurateurs", RestaurateurProfileViewSet)
router.register(r'orders', OrderViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('me/', MeView.as_view(), name='me'),
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('stripe/webhook/', stripe_webhook, name='stripe_webhook'),
    path("menus/by_restaurant/<int:restaurant_id>/", MenuByRestaurantView.as_view(), name="menu-by-restaurant"),
    path("orders/<uuid:order_id>/create-checkout-session/", CreateCheckoutSessionView.as_view(), name="create-checkout-session"),
    path("register/", RegisterView.as_view(), name="register"),
    path('commande/table/<str:table_id>/', CommandeTableAPIView.as_view(), name='commande-par-table'),
    path('qr-codes/', GenerateQRCodesAPIView.as_view(), name='generate-qr-codes'),
]
