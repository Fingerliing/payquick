from django.urls import path
from api.views.payment_views import CreateCheckoutSessionView, StripeWebhookView, CreateStripeAccountView, StripeAccountStatusView, StripeIdentitySessionView

urlpatterns = [
    path('create_checkout_session/<int:order_id>/', CreateCheckoutSessionView.as_view(), name='create-checkout-session'),
    path('webhook/', StripeWebhookView.as_view(), name='webhook'),
    path('create_stripe_account/', CreateStripeAccountView.as_view()),
    path('account_status/', StripeAccountStatusView.as_view()),
    path('stripe/identity/', StripeIdentitySessionView.as_view(), name='stripe-identity'),
]