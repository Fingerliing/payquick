from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path('schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # Authentification
    path('auth/', include('api.urls.v1.auth_urls')),
    
    # Gestion des restaurants
    path('restaurants/', include('api.urls.v1.restaurant_urls')),
    
    # Gestion des menus et plats
    path('menus/', include('api.urls.v1.menu_urls')),
    path('menu-items/', include('api.urls.v1.menu_item_urls')),
    
    # Gestion des catégories de menu
    path('menu/', include('api.urls.v1.category_urls')),

    # Gestion des menus du jour
    path('daily-menus/', include('api.urls.v1.daily_menu_urls')),
    
    # Commandes et paiements
    path('orders/', include('api.urls.v1.order_urls')),
    path('payments/', include('api.urls.v1.payment_urls')),
    path('split-payments/', include('api.urls.v1.split_payment_urls')),
    path('receipts/', include('api.urls.v1.receipt_urls')),

    # Sessions collaboratives
    path('collaborative-sessions/', include('api.urls.v1.collaborative_session_urls')),
    
    # Tables et QR codes
    path('qrcode/', include('api.urls.v1.qrcode_urls')),
    path('table/', include('api.urls.v1.table_urls')),
    path('table-orders/', include('api.urls.v1.table_order_urls')),
    
    # Invités et tokens
    path('token/', include('api.urls.v1.token_urls')),
    path('guest/', include('api.urls.v1.guest_urls')),
    
    # Administration et Stripe
    path('admin/', include('api.urls.v1.admin_urls')),
    path('stripe/', include('api.urls.v1.stripe_urls')),

    # Mentions légales
    path('legal/', include('api.urls.v1.legal_urls')),
]