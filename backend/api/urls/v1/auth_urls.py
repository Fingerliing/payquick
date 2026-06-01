from django.urls import path

from api.views.auth_views import (
    RegisterView,
    MeView,
    LoginView,
    InitiateRegistrationView,
    VerifyRegistrationView,
    ResendVerificationCodeView,
)
from api.views.google_auth_views import GoogleLoginView
from api.views.verification_views import (
    SendVerificationCodeView,
    VerifyEmailCodeView,
)
from api.views.password_reset_views import (
    InitiatePasswordResetView,
    ConfirmPasswordResetView,
    ResendPasswordResetCodeView,
)

urlpatterns = [
    # Inscription
    path('register/', RegisterView.as_view(), name='register'),
    path('register/initiate/', InitiateRegistrationView.as_view(), name='initiate-registration'),
    path('register/verify/', VerifyRegistrationView.as_view(), name='verify-registration'),
    path('register/resend/', ResendVerificationCodeView.as_view(), name='resend-verification'),

    # Login + profil
    path('login/', LoginView.as_view(), name='login'),
    path('me/', MeView.as_view(), name='me'),

    # Connexion sociale
    path('google/', GoogleLoginView.as_view(), name='google-login'),

    # Vérification d'email post-inscription
    # path('phone/send-code/', SendVerificationCodeView.as_view(), name='send-verification-code'),
    # path('phone/verify/', VerifyPhoneCodeView.as_view(), name='verify-phone-code'),  # Deprecated
    path('email/send-code/', SendVerificationCodeView.as_view(), name='send-verification-code'),
    path('email/verify/', VerifyEmailCodeView.as_view(), name='verify-email-code'),

    # Réinitialisation de mot de passe
    path('password/forgot/', InitiatePasswordResetView.as_view(), name='password-forgot'),
    path('password/confirm/', ConfirmPasswordResetView.as_view(), name='password-confirm'),
    path('password/resend/', ResendPasswordResetCodeView.as_view(), name='password-resend'),
]