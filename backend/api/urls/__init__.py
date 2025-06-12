from django.urls import path, include

urlpatterns = [
    path('v1/', include('api.urls.v1')),
]