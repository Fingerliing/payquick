from django.urls import path, include

urlpatterns = [
    path('auth/', include('api.urls.auth_urls')),
    path('restaurants/', include('api.urls.restaurant_urls')),
    path('menus/', include('api.urls.menu_urls')),
    path('orders/', include('api.urls.order_urls')),
    path('payments/', include('api.urls.payment_urls')),
    path('admin/', include('api.urls.admin_urls')),
    path('qrcode/', include('api.urls.qrcode_urls')),
    path('table/', include('api.urls.table_urls')),
]