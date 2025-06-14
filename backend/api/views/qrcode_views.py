from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from api.models import Restaurant, Table
from api.utils.qrcode_utils import generate_qr_for_table

class QRCodeFactoryView(APIView):
    permission_classes = [IsAuthenticated]

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
