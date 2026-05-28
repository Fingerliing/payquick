"""
Vue API — Charte graphique publique d'un restaurant.

Emplacement : backend/api/views/branding_views.py

Expose la charte graphique (`RestaurantBranding`) en lecture seule pour
l'ecran menu client. Endpoint public : le menu est consultable sans
authentification (acces par QR code a table).

Route (cf. menu_urls.py modifie) :
    GET /api/v1/restaurants/<restaurant_id>/branding/
"""
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import RestaurantBranding


class RestaurantBrandingView(APIView):
    """Retourne la charte graphique d'un restaurant, ou 404 s'il n'en a pas.

    Lecture seule et publique : pas d'authentification requise (le client
    scanne un QR code et consulte le menu sans compte).
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, restaurant_id):
        try:
            branding = RestaurantBranding.objects.select_related('restaurant').get(
                restaurant_id=restaurant_id,
            )
        except RestaurantBranding.DoesNotExist:
            # Pas de charte personnalisee : le client retombe sur le theme
            # par defaut (cf. buildMenuTheme cote frontend).
            return Response(
                {'detail': "Aucune charte graphique pour ce restaurant."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                'primary_color': branding.primary_color,
                'secondary_color': branding.secondary_color,
                'accent_color': branding.accent_color,
                'background_color': branding.background_color,
                'text_color': branding.text_color,
                'style_descriptor': branding.style_descriptor,
                'is_ai_generated': branding.is_ai_generated,
            },
            status=status.HTTP_200_OK,
        )
