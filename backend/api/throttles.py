from rest_framework.throttling import UserRateThrottle

class QRCodeThrottle(UserRateThrottle):
    rate = '5/min'  # max 5 requêtes par minute

class StripeCheckoutThrottle(UserRateThrottle):
    rate = '3/min'  # max 3 sessions Stripe par minute

class RegisterThrottle(UserRateThrottle):
    rate = '50/hour'  # max 50 inscriptions par heure
