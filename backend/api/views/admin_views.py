from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from api.models import RestaurateurProfile
from api.serializers import RestaurateurProfileSerializer
import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

class AdminRestaurateurViewSet(viewsets.ModelViewSet):
    """
    Accès réservé aux administrateurs.
    Permet de valider, activer ou interroger les comptes Stripe des restaurateurs.
    """
    queryset = RestaurateurProfile.objects.all().order_by('-created_at')
    serializer_class = RestaurateurProfileSerializer
    permission_classes = [IsAdminUser]

    @action(detail=True, methods=['post'])
    def validate_documents(self, request, pk=None):
        restaurateur = self.get_object()
        restaurateur.is_validated = True
        restaurateur.save()
        return Response({'validated': True})

    @action(detail=True, methods=['post'])
    def activate_account(self, request, pk=None):
        restaurateur = self.get_object()
        restaurateur.is_active = True
        restaurateur.save()
        return Response({'active': True})

    @action(detail=True, methods=['get'])
    def stripe_status(self, request, pk=None):
        restaurateur = self.get_object()
        if not restaurateur.stripe_account_id:
            return Response({'error': 'No Stripe account'}, status=400)

        account = stripe.Account.retrieve(restaurateur.stripe_account_id)
        restaurateur.stripe_verified = account.charges_enabled
        restaurateur.save()

        return Response({
            'charges_enabled': account.charges_enabled,
            'payouts_enabled': account.payouts_enabled,
            'requirements': account.requirements
        })
