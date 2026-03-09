from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class QRCodeThrottle(UserRateThrottle):
    scope = 'qrcode'
    rate = '5/min'


class StripeCheckoutThrottle(UserRateThrottle):
    scope = 'stripe_checkout'
    rate = '3/min'


class RegisterThrottle(AnonRateThrottle):
    scope = 'register'
    rate = '10/hour'


class LoginThrottle(AnonRateThrottle):
    """
    Limite les tentatives de connexion par IP.
    5/min pour ralentir le brute-force, 20/hour pour bloquer les attaques lentes.
    DRF applique le throttle le plus restrictif parmi ceux déclarés.
    """
    scope = 'login'
    rate = '5/min'


class LoginHourThrottle(AnonRateThrottle):
    scope = 'login_hour'
    rate = '20/hour'