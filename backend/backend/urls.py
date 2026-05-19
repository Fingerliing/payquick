"""
backend/backend/urls.py — Configuration principale des URLs Django.

Modifié pour exposer les routes `.well-known/` qui rendent possibles
les Universal Links iOS et les App Links Android.

Routes ajoutées :
    GET /.well-known/apple-app-site-association
    GET /.well-known/assetlinks.json

Voir backend/api/views/well_known_views.py pour le détail.
"""

from django.contrib import admin
from django.urls import path, include, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from django.conf import settings
from django.conf.urls.static import static

from api.views.qr_redirect_views import qr_table_redirect
from api.views.well_known_views import (
    apple_app_site_association,
    android_assetlinks,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    # ────────────────────────────────────────────────────────────────────
    # QR codes de table — landing page publique au scan
    #
    # Atteinte par le navigateur natif (caméra iOS/Android) après scan d'un
    # QR code. Sert une page qui tente d'ouvrir l'app via deep link et
    # propose les stores en fallback. La même URL est interceptée par les
    # Universal Links / App Links quand l'app est installée.
    #
    # Format des codes : R<restaurant_id>T<table_number_padded> (ex: R12T005)
    # ────────────────────────────────────────────────────────────────────
    path('t/<str:table_code>/', qr_table_redirect, name='qr_table_redirect'),
    # Variante sans slash final pour les QR codes plus courts
    path('t/<str:table_code>', qr_table_redirect, name='qr_table_redirect_noslash'),

    # ────────────────────────────────────────────────────────────────────
    # Universal Links / App Links — fichiers de configuration
    #
    # Ces routes DOIVENT être servies en HTTPS, sans redirection, avec
    # Content-Type: application/json. Elles sont vérifiées par Apple
    # (apple-app-site-association) et Google (assetlinks.json) au moment
    # de l'installation de l'app pour confirmer que api.eatquicker.fr a
    # bien autorisé l'app à intercepter ses URLs.
    #
    # ⚠️ Note Nginx : si tu as une config Nginx devant Django, vérifier
    # qu'aucune règle `location /.well-known/` ne court-circuite Django
    # (cas typique : Let's Encrypt acme-challenge). Si oui, exclure
    # spécifiquement ces deux chemins de la règle Let's Encrypt.
    # ────────────────────────────────────────────────────────────────────
    path(
        '.well-known/apple-app-site-association',
        apple_app_site_association,
        name='apple_app_site_association',
    ),
    path(
        '.well-known/assetlinks.json',
        android_assetlinks,
        name='android_assetlinks',
    ),
]

if settings.DEBUG:
    # Option 1: Vue personnalisée pour les médias (à utiliser si la solution settings.py ne fonctionne pas)
    from api.views.media_views import serve_media
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve_media, name='serve_media'),
    ]

    # Static files
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)