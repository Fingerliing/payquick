from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from api.models import Restaurant, Table
from api.throttles import QRCodeThrottle
from api.utils.qrcode_utils import generate_qr_for_table
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

@extend_schema(
    tags=["QR Code"],
    summary="Générer les QR codes des tables",
    description="Génère et retourne les QR codes de toutes les tables d’un restaurant appartenant au restaurateur connecté.",
    parameters=[
        OpenApiParameter(
            name="restaurant_id",
            type=int,
            location=OpenApiParameter.PATH,
            required=True,
            description="ID du restaurant pour lequel générer les QR codes"
        )
    ],
    responses={
        200: OpenApiResponse(description="QR codes générés avec succès"),
        403: OpenApiResponse(description="Non autorisé ou restaurant introuvable")
    }
)
class QRCodeFactoryView(APIView):
    """
    Génère les QR codes de toutes les tables d'un restaurant appartenant au restaurateur connecté.
    Nécessite une authentification. Renvoie les URL des QR codes générés.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [QRCodeThrottle]

    def post(self, request, restaurant_id):
        restaurant = Restaurant.objects.filter(id=restaurant_id, owner=request.user.restaurateur_profile).first()
        if not restaurant:
            return Response({"error": "Unauthorized or not found"}, status=403)

        tables = Table.objects.filter(restaurant=restaurant)
        result = []
        for table in tables:
            generate_qr_for_table(table)
            result.append({
                "table_id": table.identifiant,
                "qr_code_url": table.qr_code_file.url
            })

        return Response({"generated": result}, status=status.HTTP_200_OK)
