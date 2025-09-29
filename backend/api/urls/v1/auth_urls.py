from django.urls import path
from api.views.auth_views import RegisterView, MeView, LoginView, InitiateRegistrationView, VerifyRegistrationView, ResendVerificationCodeView
from api.views.verification_views import SendVerificationCodeView, VerifyPhoneCodeView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('register/initiate/', InitiateRegistrationView.as_view(), name='initiate-registration'),
    path('register/verify/', VerifyRegistrationView.as_view(), name='verify-registration'),
    path('register/resend/', ResendVerificationCodeView.as_view(), name='resend-verification'),
    path('login/', LoginView.as_view(), name='login'),
    path('me/', MeView.as_view(), name='me'),
    path('phone/send-code/', SendVerificationCodeView.as_view(), name='send-verification-code'),
    path('phone/verify/', VerifyPhoneCodeView.as_view(), name='verify-phone-code'),
]