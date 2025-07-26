from django.contrib import admin
from django.urls import path, include, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
   path('admin/', admin.site.urls),
   path('api/', include('api.urls')),
   path("schema/", SpectacularAPIView.as_view(), name="schema"),
   path("swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
   path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    # Option 1: Vue personnalisée pour les médias (à utiliser si la solution settings.py ne fonctionne pas)
    from api.views.media_views import serve_media
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve_media, name='serve_media'),
    ]
    
    # Static files
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)