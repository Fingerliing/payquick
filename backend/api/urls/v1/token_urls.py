from django.urls import path
from api.views.token_views import ObtainAuthTokenView

urlpatterns = [
    path('token/', ObtainAuthTokenView.as_view(), name='obtain-auth-token'),
]