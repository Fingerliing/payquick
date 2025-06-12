import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

def create_connect_account(user_email):
    return stripe.Account.create(
        type="standard",
        email=user_email,
        business_type="individual"
    )

def create_account_link(account_id, domain):
    return stripe.AccountLink.create(
        account=account_id,
        refresh_url=f"{domain}/onboarding/refresh",
        return_url=f"{domain}/onboarding/success",
        type="account_onboarding",
    )