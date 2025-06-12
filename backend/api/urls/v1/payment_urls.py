from django.urls import path
from api.views.payment_views import CreateCheckoutSessionView, stripe_webhook, CreateStripeAccountView, StripeAccountStatusView

urlpatterns = [
    path('create_checkout_session/<int:order_id>/', CreateCheckoutSessionView.as_view()),
    path('webhook/', stripe_webhook),
    path('create_stripe_account/', CreateStripeAccountView.as_view()),
    path('account_status/', StripeAccountStatusView.as_view()),
]