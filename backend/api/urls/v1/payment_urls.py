from django.urls import path
from api.views.payment_views import CreateCheckoutSessionView, StripeWebhookView, CreateStripeAccountView, StripeAccountStatusView

urlpatterns = [
    path('create_checkout_session/<int:order_id>/', CreateCheckoutSessionView.as_view()),
    path('webhook/', StripeWebhookView.as_view()),
    path('create_stripe_account/', CreateStripeAccountView.as_view()),
    path('account_status/', StripeAccountStatusView.as_view()),
]