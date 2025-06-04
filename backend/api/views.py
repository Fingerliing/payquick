from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Restaurant, ClientProfile, Menu, MenuItem, RestaurateurProfile, Order, Table, Plat, OrderItem
from .serializers import RestaurantSerializer, ClientProfileSerializer, MenuSerializer, MenuItemSerializer, RestaurateurProfileSerializer, OrderSerializer, RegisterSerializer
from rest_framework.permissions import IsAuthenticated
from .permissions import IsRestaurateur, IsClient, IsAdmin
from rest_framework import filters
from rest_framework.decorators import action
from rest_framework import status
import stripe
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.tokens import RefreshToken
import requests
from .utils import notify_order_updated
from io import BytesIO
import base64
import qrcode


class RestaurantViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.all()
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class ClientProfileViewSet(viewsets.ModelViewSet):
    queryset = ClientProfile.objects.all()
    serializer_class = ClientProfileSerializer
    permission_classes = [IsAuthenticated, IsClient]

class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.all()
    serializer_class = MenuSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.all()
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["post"], url_path="toggle")
    def toggle_availability(self, request, pk=None):
        try:
            item = self.get_object()
            item.is_available = not item.is_available
            item.save()
            return Response({"id": item.id, "is_available": item.is_available}, status=status.HTTP_200_OK)
        except MenuItem.DoesNotExist:
            return Response({"error": "MenuItem not found"}, status=status.HTTP_404_NOT_FOUND)

class MeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if ClientProfile.objects.filter(user=user).exists():
            role = "client"
        elif RestaurateurProfile.objects.filter(user=user).exists():
            role = "restaurateur"
        else:
            role = "unknown"

        return Response({
            "username": user.username,
            "email": user.email,
            "role": role,
        })
    
class RestaurateurProfileViewSet(viewsets.ModelViewSet):
    queryset = RestaurateurProfile.objects.all()
    serializer_class = RestaurateurProfileSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['status', 'table__identifiant', 'status']

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.all()
        if hasattr(user, 'restaurateur_profile'):
            qs = qs.filter(table__restaurant=user.restaurateur_profile.restaurant)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=["post"], url_path="create")
    def create_order(self, request):
        from .serializers import OrderCreateSerializer

        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        order = self.get_object()
        order.status = 'payee'
        order.save()
        return Response({"status": "payee"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def mark_served(self, request, pk=None):
        order = self.get_object()
        order.status = "served"
        order.save()
        return Response({"status": "served"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def details(self, request, pk=None):
        order = self.get_object()
        items = OrderItem.objects.filter(order=order)
        contenu = [
            {
                "plat": item.plat.nom,
                "quantite": item.quantite,
                "prix": float(item.plat.prix)
            } for item in items
        ]
        return Response({
            "commande": order.id,
            "table": order.table.identifiant,
            "status": order.status,
            "plats": contenu
        })
    
    def perform_update(self, serializer):
        order = serializer.save()
        notify_order_updated(OrderSerializer(order).data)

class MenuByRestaurantView(APIView):
    def get(self, request, restaurant_id):
        try:
            menu = Menu.objects.filter(restaurant__id=restaurant_id).prefetch_related("items").first()
            if not menu:
                return Response({"error": "Aucun menu trouvé."}, status=status.HTTP_404_NOT_FOUND)
            serializer = MenuSerializer(menu)
            return Response({"menu": serializer.data}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
class CreateCheckoutSessionView(APIView):
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            if order.is_paid:
                return Response({"error": "Déjà payé."}, status=status.HTTP_400_BAD_REQUEST)

            line_items = [
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {
                            "name": item["name"],
                        },
                        "unit_amount": int(item.get("price", 0) * 100),
                    },
                    "quantity": item["quantity"],
                }
                for item in order.items
            ]

            restaurateur = order.restaurateur
            if not restaurateur.stripe_account_id:
                return Response({"error": "Le restaurateur n'a pas de compte Stripe."}, status=400)
           
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=line_items,
                mode="payment",
                success_url=f"{settings.DOMAIN}/clients/order/confirmation?order={order_id}",
                cancel_url=f"{settings.DOMAIN}/clients/order/confirmation?order={order_id}",
                metadata={"order_id": str(order_id)},
                payment_intent_data={
                    "application_fee_amount": 0,  # ou un montant si tu prends une commission
                    "transfer_data": {
                        "destination": restaurateur.stripe_account_id,
                    }
                }
            )

            return Response({"checkout_url": session.url})

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        return HttpResponse(status=400)

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        order_id = session["metadata"].get("order_id")
        if order_id:
            try:
                order = Order.objects.get(id=order_id)
                order.is_paid = True
                order.save()
                print(f"[✓] Paiement confirmé pour commande {order_id}")
            except Order.DoesNotExist:
                print(f"[✗] Commande {order_id} introuvable")

    return HttpResponse(status=200)

class CreateStripeAccountView(APIView):
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def post(self, request):
        user = request.user
        restaurateur = RestaurateurProfile.objects.get(user=user)

        if restaurateur.stripe_account_id:
            return Response({"error": "Compte Stripe déjà créé."}, status=400)

        account = stripe.Account.create(
            type="standard",
            email=user.email,
        )

        restaurateur.stripe_account_id = account.id
        restaurateur.save()

        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=f"{settings.DOMAIN}/restaurants/onboarding/refresh",
            return_url=f"{settings.DOMAIN}/restaurants/dashboard",
            type="account_onboarding",
        )

        return Response({"onboarding_url": account_link.url})

class RegisterView(APIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class CommandeTableAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, table_id):
        try:
            table = Table.objects.get(identifiant=table_id)
        except Table.DoesNotExist:
            return Response({'error': 'Table non trouvée'}, status=status.HTTP_404_NOT_FOUND)

        menu = Menu.objects.filter(restaurant=table.restaurant, disponible=True).first()
        if not menu:
            return Response({'error': 'Aucun menu disponible'}, status=status.HTTP_404_NOT_FOUND)

        plats = Plat.objects.filter(menu=menu)
        data = [{'id': p.id, 'nom': p.nom, 'description': p.description, 'prix': str(p.prix)} for p in plats]
        return Response({'menu': menu.name, 'plats': data})

    def post(self, request, table_id):
        try:
            table = Table.objects.get(identifiant=table_id)
        except Table.DoesNotExist:
            return Response({'error': 'Table non trouvée'}, status=status.HTTP_404_NOT_FOUND)

        items = request.data.get('plats')  # Liste de { "id": plat_id, "quantite": x }
        if not isinstance(items, list) or not items:
            return Response({'error': 'Commande invalide'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.create(table=table, status='non_payee')
            for item in items:
                plat = Plat.objects.get(id=item['id'])
                order.plats.add(plat, through_defaults={'quantite': item.get('quantite', 1)})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'message': 'Commande reçue', 'order_id': order.id}, status=status.HTTP_201_CREATED)
    
    def notify_order_updated(order_data):
        try:
            requests.post(
                'http://localhost:4000/emit-order',  # Port du serveur Node
                json=order_data,
                timeout=2
            )
        except requests.RequestException:
            pass  # éviter les crashs en cas de souci réseau

class GenerateQRCodesAPIView(APIView):
    def post(self, request):
        qr_data = request.data.get("qrData", [])
        result = []

        for entry in qr_data:
            url = entry.get("url")
            table_id = entry.get("tableId")
            if not url or not table_id:
                print("[SKIP] entrée incomplète:", entry)
                continue

            qr = qrcode.make(url)
            buffer = BytesIO()
            qr.save(buffer, format="PNG")
            img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
            qr_code_url = f"data:image/png;base64,{img_str}"

            result.append({
                "tableId": table_id,
                "qrCodeUrl": qr_code_url
            })

        return Response({"qrCodes": result}, status=status.HTTP_200_OK)