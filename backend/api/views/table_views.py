from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from api.models import Table, Menu, MenuItem
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

@extend_schema(
    tags=["Tables • Public"],
    summary="Accès public par QR Code",
    description=(
        "Endpoint public sans authentification. "
        "Permet de récupérer le menu actif d'une table scannée via QR code."
    ),
    parameters=[
        OpenApiParameter(
            name="identifiant",
            type=str,
            location=OpenApiParameter.PATH,
            required=True,
            description="Identifiant unique de la table (ex: ABC123)"
        )
    ],
    responses={
        200: OpenApiResponse(description="Menu actif et ses items"),
        404: OpenApiResponse(description="Aucun menu actif trouvé")
    }
)
class TableQRRouterView(APIView):
    """
    Endpoint public : accessible via un QR code sans authentification.
    Permet de récupérer le menu actif associé à une table.
    """
    permission_classes = []

    def get(self, request, identifiant):
        table = get_object_or_404(Table, identifiant=identifiant)
        restaurant = table.restaurant
        menu = Menu.objects.filter(restaurant=restaurant, disponible=True).first()

        if not menu:
            return Response({"error": "No active menu"}, status=404)

        items = MenuItem.objects.filter(menu=menu, is_available=True)

        data = {
            "restaurant_name": restaurant.name,
            "table_id": table.identifiant,
            "menu": {
                "menu_name": menu.name,
                "items": [
                    {
                        "id": item.id,
                        "name": item.name,
                        "description": item.description,
                        "price": str(item.price),
                        "category": item.category
                    } for item in items
                ]
            }
        }
        return Response(data, status=200)
