from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Restaurant, ClientProfile, Menu, MenuItem, RestaurateurProfile, Order, Table, OrderItem
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
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiParameter

stripe.api_key = settings.STRIPE_SECRET_KEY

class AdminRestaurateurViewSet(viewsets.ModelViewSet):
    queryset = RestaurateurProfile.objects.all().order_by('-created_at')
    serializer_class = RestaurateurProfileSerializer
    permission_classes = [IsAdmin]

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

    @action(detail=True, methods=["post"])
    def toggle_disponible(self, request, pk=None):
        from .models import Menu

        menu = self.get_object()
        restaurant = menu.restaurant

        # rendre tous les autres menus indisponibles
        Menu.objects.filter(restaurant=restaurant).update(disponible=False)

        # activer celui-ci
        menu.disponible = True
        menu.save()

        return Response({"id": menu.id, "disponible": menu.disponible})

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
        
    def get_queryset(self):
        queryset = MenuItem.objects.all()
        menu_id = self.request.query_params.get("menu_id")
        if menu_id:
            queryset = queryset.filter(menu__id=menu_id)
        return queryset

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
    search_fields = ['status', 'table__identifiant']

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.all()

        if hasattr(user, 'restaurateur_profile'):
            qs = qs.filter(restaurant__owner=user.restaurateur_profile)

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=["post"])
    def submit_order(self, request):
        data = request.data
        restaurant_id = data.get("restaurant")
        table_id = data.get("table_identifiant")
        items = data.get("items", [])

        if not restaurant_id or not table_id or not items:
            return Response({"error": "Champs requis manquants."}, status=400)

        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
            table = Table.objects.get(identifiant=table_id, restaurant=restaurant)
            restaurateur = RestaurateurProfile.objects.get(user=restaurant.owner)
        except Restaurant.DoesNotExist:
            return Response({"error": "Restaurant introuvable."}, status=404)
        except Table.DoesNotExist:
            return Response({"error": "Table introuvable pour ce restaurant."}, status=404)
        except RestaurateurProfile.DoesNotExist:
            return Response({"error": "Restaurateur introuvable pour ce restaurant."}, status=404)

        order = Order.objects.create(
            restaurant=restaurant,
            table=table,
            restaurateur=restaurateur,
            status="pending"
        )

        for item in items:
            OrderItem.objects.create(
                order=order,
                menu_item_id=item["menu_item"],
                quantity=item["quantity"]
            )

        return Response({"order_id": order.id}, status=201)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        order = self.get_object()
        order.is_paid = True
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"is_paid": True}, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=["post"])
    def mark_in_progress(self, request, pk=None):
        order = self.get_object()
        order.status = "in_progress"
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"status": "in_progress"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def mark_served(self, request, pk=None):
        order = self.get_object()
        order.status = "served"
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"status": "served"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def details(self, request, pk=None):
        order = self.get_object()
        items = OrderItem.objects.filter(order=order)
        contenu = [
            {
                "name": item.menu_item.name,
                "quantity": item.quantity,
                "price": float(item.menu_item.price)
            } for item in items
        ]
        return Response({
            "order": order.id,
            "table": order.table.identifiant,
            "status": order.status,
            "items": contenu
        })
    
    def get_permissions(self):
        if self.action == "menu_by_table":
            return []
        return super().get_permissions()
    
    from drf_spectacular.utils import extend_schema, OpenApiParameter

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="restaurant_id",
                description="ID du restaurant",
                required=True,
                type=int,
                location=OpenApiParameter.PATH,
            )
        ]
    )
    @action(detail=False, methods=["get"], url_path="by_restaurant/(?P<restaurant_id>[^/.]+)")
    def by_restaurant_path(self, request, restaurant_id=None):
        if not restaurant_id:
            return Response({"error": "restaurant_id manquant"}, status=400)

        orders = Order.objects.filter(restaurant__id=restaurant_id).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="menu/table/(?P<identifiant>[^/.]+)")
    def menu_by_table(self, request, identifiant=None):
        table = get_object_or_404(Table, identifiant=identifiant)

        menu = Menu.objects.filter(restaurant=table.restaurant, disponible=True).first()
        if not menu:
            return Response({"error": "Aucun menu disponible"}, status=404)

        items = MenuItem.objects.filter(menu=menu, is_available=True)

        data = [
            {
                "id": item.id,
                "nom": item.name,
                "description": item.description,
                "prix": str(item.price),
            }
            for item in items
        ]
        return Response({"menu": menu.name, "plats": data})
    
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
    permission_classes = []  # volontairement ouvert, à sécuriser via token à terme

    def post(self, request, order_id):
        from decimal import Decimal

        try:
            order = Order.objects.get(id=order_id)
            if order.is_paid:
                return Response({"error": "Order already paid."}, status=status.HTTP_400_BAD_REQUEST)

            # On reconstruit les items à partir des OrderItem
            line_items = []
            for item in order.order_items.all():
                line_items.append({
                    "price_data": {
                        "currency": "eur",
                        "product_data": {
                            "name": item.menu_item.name,
                        },
                        "unit_amount": int(Decimal(item.menu_item.price) * 100),
                    },
                    "quantity": item.quantity,
                })

            restaurateur = order.restaurateur
            if not restaurateur.stripe_account_id:
                return Response({"error": "The restaurateur has no Stripe account."}, status=400)
           
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=line_items,
                mode="payment",
                success_url=f"{settings.DOMAIN}/clients/order/confirmation?order={order_id}",
                cancel_url=f"{settings.DOMAIN}/clients/order/confirmation?order={order_id}",
                metadata={"order_id": str(order_id)},
                payment_intent_data={
                    "application_fee_amount": 0,  # commissions à activer plus tard
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
    import json

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
                if not order.is_paid:
                    order.is_paid = True
                    order.save()
                    print(f"[✓] Payment confirmed for order {order_id}")
            except Order.DoesNotExist:
                print(f"[✗] Order {order_id} not found")

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
    
class GenerateQRCodesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        qr_data = request.data.get("qrData", [])
        result = []

        restaurateur = request.user.restaurateur_profile
        restaurant_id = request.data.get("restaurant_id")
        try:
            restaurant = Restaurant.objects.get(owner=restaurateur, id=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response({"error": "Restaurant introuvable"}, status=404)

        for entry in qr_data:
            url = entry.get("url")
            table_id = entry.get("tableId")
            if not url or not table_id:
                print("[SKIP] entrée incomplète:", entry)
                continue

            Table.objects.get_or_create(
                restaurant=restaurant,
                identifiant=table_id
            )

            qr = qrcode.make(url)
            buffer = BytesIO()
            qr.save(buffer, format="PNG")
            img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
            qr_code_url = f"data:image/png;base64,{img_str}"

            result.append({
                "tableId": table_id,
                "qrCodeUrl": qr_code_url
            })
        print("[RESULT QR CODES]", result)
        return Response({"qrCodes": result}, status=status.HTTP_200_OK)
    
class CreateStripeAccountView(APIView):
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def post(self, request):
        user = request.user
        restaurateur = RestaurateurProfile.objects.get(user=user)

        # Si un compte Stripe existe déjà
        if restaurateur.stripe_account_id:
            return Response({"error": "Stripe account already exists."}, status=400)

        # Création du compte Stripe Connect
        account = stripe.Account.create(
            type="standard",
            email=user.email,
            business_type="individual",
        )

        # Sauvegarde du compte Stripe dans la base
        restaurateur.stripe_account_id = account.id
        restaurateur.save()

        # Générer un onboarding link
        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=f"{settings.DOMAIN}/onboarding/refresh",  # à prévoir dans ton frontend
            return_url=f"{settings.DOMAIN}/onboarding/success",
            type="account_onboarding",
        )

        return Response({"onboarding_url": account_link.url})
    
class StripeAccountStatusView(APIView):
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def get(self, request):
        user = request.user
        restaurateur = RestaurateurProfile.objects.get(user=user)

        if not restaurateur.stripe_account_id:
            return Response({"error": "No Stripe account."}, status=400)

        account = stripe.Account.retrieve(restaurateur.stripe_account_id)

        return Response({
            "charges_enabled": account.charges_enabled,
            "details_submitted": account.details_submitted,
            "payouts_enabled": account.payouts_enabled,
            "requirements": account.requirements
        })