from django.urls import path
from .views import register, login, restaurant_list_create
from django_ratelimit.decorators import ratelimit

urlpatterns = [
    path('register', ratelimit(key='ip', rate='5/m', block=True)(register)),
    path('login', ratelimit(key='ip', rate='10/m', block=True)(login)),
    path('restaurants', ratelimit(key='ip', rate='20/m', block=True)(restaurant_list_create)),
]