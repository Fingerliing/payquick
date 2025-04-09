from django.urls import path
from .views import register, login, restaurant_list_create, client_register, client_login, restaurateur_register, restaurateur_login
from django_ratelimit.decorators import ratelimit
from django.conf import settings

# Fonction pour appliquer le rate limiting uniquement en production
def apply_rate_limit(view_func):
    if getattr(settings, 'TESTING', False):
        return view_func
    return ratelimit(key='ip', rate='5/m', block=True)(view_func)

urlpatterns = [
    path('register', apply_rate_limit(register)),
    path('login', apply_rate_limit(login)),
    path('restaurants', apply_rate_limit(restaurant_list_create)),
    path('client/register', apply_rate_limit(client_register)),
    path('client/login', apply_rate_limit(client_login)),
    path('restaurateur/register', apply_rate_limit(restaurateur_register)),
    path('restaurateur/login', apply_rate_limit(restaurateur_login)),
]