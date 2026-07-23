from django.urls import path
from api.views.payment_views import CreateCheckoutSessionView, StripeWebhookView, CreateStripeAccountView, StripeAccountStatusView, StripeIdentitySessionView, CreatePaymentIntentView, UpdatePaymentStatusView
from api.views.terminal_views import (
    TerminalConnectionTokenView,
    TerminalLocationView,
    TerminalPaymentIntentView,
    TerminalConfirmView,
)

urlpatterns = [
    path('create_checkout_session/<int:order_id>/', CreateCheckoutSessionView.as_view(), name='create-checkout-session'),
    path('checkout-session/<int:order_id>/', CreateCheckoutSessionView.as_view(), name='checkout-session'),
    path('webhook/', StripeWebhookView.as_view(), name='webhook'),
    path('create_stripe_account/', CreateStripeAccountView.as_view()),
    path('account_status/', StripeAccountStatusView.as_view()),
    path('stripe/identity/', StripeIdentitySessionView.as_view(), name='stripe-identity'),
    path('account/', CreateStripeAccountView.as_view(), name='create_stripe_account_alias'),
    path('account/status/', StripeAccountStatusView.as_view(), name='stripe_account_status_alias'),
    path('identity/session/', StripeIdentitySessionView.as_view(), name='stripe_identity_session_alias'),
    path('create-payment-intent/', CreatePaymentIntentView.as_view(), name='create-payment-intent'),
    path('update-status/<int:order_id>/', UpdatePaymentStatusView.as_view(), name='update-payment-status'),

    # ── Tap to Pay (Stripe Terminal) ────────────────────────────────────────
    path('terminal/connection-token/', TerminalConnectionTokenView.as_view(), name='terminal-connection-token'),
    path('terminal/location/', TerminalLocationView.as_view(), name='terminal-location'),
    path('terminal/payment-intent/', TerminalPaymentIntentView.as_view(), name='terminal-payment-intent'),
    path('terminal/confirm/', TerminalConfirmView.as_view(), name='terminal-confirm'),
]