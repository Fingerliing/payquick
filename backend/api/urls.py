from django.urls import path
from .views import register, login, restaurant_list_create

urlpatterns = [
    path('register', register),
    path('login', login),
    path('restaurants', restaurant_list_create),
]
