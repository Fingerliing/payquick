from django.urls import path, include

urlpatterns = [
    path('auth/', include('api.urls.v1.auth_urls')),
    path('restaurants/', include('api.urls.v1.restaurant_urls')),
    path('menus/', include('api.urls.v1.menu_urls')),
    path('orders/', include('api.urls.v1.order_urls')),
    path('payments/', include('api.urls.v1.payment_urls')),
    path('admin/', include('api.urls.v1.admin_urls')),
    path('qrcode/', include('api.urls.v1.qrcode_urls')),
    path('table/', include('api.urls.v1.table_urls')),
]