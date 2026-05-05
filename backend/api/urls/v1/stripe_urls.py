from django.urls import path
from api.views.stripe_connect_views import (
    create_stripe_account,
    get_stripe_account_status,
    create_onboarding_link,
    stripe_connect_webhook,
    stripe_redirect_success,
    stripe_redirect_refresh,
)

urlpatterns = [
    path('create-account/', create_stripe_account, name='create_stripe_account'),
    path('account-status/', get_stripe_account_status, name='stripe_account_status'),
    path('onboarding-link/', create_onboarding_link, name='create_onboarding_link'),

    # Webhook Connect (events sur comptes restaurateurs : account.updated, etc.)
    # Secret : STRIPE_CONNECT_WEBHOOK_SECRET
    path('connect/webhook/', stripe_connect_webhook, name='stripe_connect_webhook'),

    # Redirections Stripe → deep link app
    path('redirect/success/', stripe_redirect_success, name='stripe_redirect_success'),
    path('redirect/refresh/', stripe_redirect_refresh, name='stripe_redirect_refresh'),
]