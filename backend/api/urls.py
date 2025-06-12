from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import (
    AdminRestaurateurViewSet,
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
    QRCodeFactoryView,
    CreateStripeAccountView,
    StripeAccountStatusView,
    TableQRRouterView
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

admin_router = DefaultRouter()
admin_router.register(r'admin/restaurateurs', AdminRestaurateurViewSet, basename='admin-restaurateurs')
router = DefaultRouter()
router.register(r'restaurants', RestaurantViewSet)
router.register(r'clients', ClientProfileViewSet)
router.register(r'menus', MenuViewSet)
router.register(r'menu-items', MenuItemViewSet)
router.register(r"restaurateurs", RestaurateurProfileViewSet)
router.register(r'orders', OrderViewSet)

urlpatterns = [
    path('', include(admin_router.urls)),
    path('', include(router.urls)),
    path('me/', MeView.as_view(), name='me'),
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path("menus/by_restaurant/<int:restaurant_id>/", MenuByRestaurantView.as_view(), name="menu-by-restaurant"),
    path("register/", RegisterView.as_view(), name="register"),
    path('qrcode/factory/<int:restaurant_id>/', QRCodeFactoryView.as_view(), name='qr_code_factory'),
    path('payment/webhook/', stripe_webhook, name='stripe_webhook'),
    path('payment/create_checkout_session/<int:order_id>/', CreateCheckoutSessionView.as_view(), name='create_checkout_session'),
    path('stripe/create_account/', CreateStripeAccountView.as_view(), name='create_stripe_account'),
    path('stripe/account_status/', StripeAccountStatusView.as_view(), name='stripe_account_status'),
    path('table/<str:identifiant>/', TableQRRouterView.as_view(), name='table_qr_router'),
]
