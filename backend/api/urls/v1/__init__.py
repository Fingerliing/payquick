from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path('schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    path('auth/', include('api.urls.v1.auth_urls')),
    path('restaurants/', include('api.urls.v1.restaurant_urls')),
    path('menus/', include('api.urls.v1.menu_urls')),
    path('menu-items/', include('api.urls.v1.menu_item_urls')),
    path('orders/', include('api.urls.v1.order_urls')),
    path('payments/', include('api.urls.v1.payment_urls')),
    path('admin/', include('api.urls.v1.admin_urls')),
    path('qrcode/', include('api.urls.v1.qrcode_urls')),
    path('table/', include('api.urls.v1.table_urls')),
    path('token/', include('api.urls.v1.token_urls')),
    path('stripe/', include('api.urls.v1.stripe_urls')),
    path('guest/', include('api.urls.v1.guest_urls'))
]