from django.urls import path
from api.views.stripe_connect_views import create_stripe_account, get_stripe_account_status, create_onboarding_link, stripe_webhook

urlpatterns = [
    path('create-account/', create_stripe_account, name='create_stripe_account'),
    path('account-status/', get_stripe_account_status, name='stripe_account_status'),
    path('onboarding-link/', create_onboarding_link, name='create_onboarding_link'),
    path('webhook/', stripe_webhook, name='stripe_webhook'),
]