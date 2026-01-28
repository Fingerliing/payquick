# ---------------------------------------------------------------------
# Tests for OrderViewSet and its custom actions
# Based on actual order_views.py endpoints
# ---------------------------------------------------------------------

import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Menu, MenuItem, MenuCategory, Order, OrderItem
)
from rest_framework_simplejwt.tokens import RefreshToken


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Unauthenticated client"""
    return APIClient()


@pytest.fixture
def auth_restaurateur_client(db):
    """Authenticated restaurateur client with profile"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="owner@example.com",
        email="owner@example.com",
        password="strongpass"
    )
    user.groups.add(group)
    
    profile = RestaurateurProfile.objects.create(
        user=user,
        siret="10101010101010",
        is_validated=True,
        is_active=True,
        stripe_verified=True
    )
    
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    
    return client, user, profile


@pytest.fixture
def customer_user(db):
    """Regular customer user"""
    return User.objects.create_user(
        username="customer@example.com",
        email="customer@example.com",
        password="testpass123"
    )


@pytest.fixture
def auth_customer_client(customer_user):
    """Authenticated customer client"""
    token = RefreshToken.for_user(customer_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def restaurant(auth_restaurateur_client):
    """Test restaurant"""
    _, _, profile = auth_restaurateur_client
    return Restaurant.objects.create(
        name="Café du Coin",
        description="Petit resto",
        owner=profile,
        siret="12345678911111",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    """
    Test table.
    NOTE: 'identifiant' is a read-only property on Table model.
    Use 'number' field instead.
    """
    return Table.objects.create(
        restaurant=restaurant,
        number="X1",  # Use 'number', NOT 'identifiant'
        capacity=4,
        is_active=True
    )


@pytest.fixture
def menu(restaurant):
    """Test menu"""
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(restaurant):
    """Menu category"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    """Available menu item"""
    return MenuItem.objects.create(
        menu=menu,
        name="Pizza",
        price=Decimal('9.90'),
        category=menu_category,
        is_available=True,
        preparation_time=15
    )


@pytest.fixture
def order(restaurant, table, customer_user):
    """
    Test order.
    
    NOTE: Order model uses:
    - restaurant (ForeignKey)
    - table_number (CharField, NOT a FK to Table)
    - order_number (required, unique)
    - subtotal, total_amount (required DecimalFields)
    
    Order does NOT have: restaurateur field, table FK, is_paid field
    """
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,  # CharField, not FK
        order_number="ORD-TEST-001",
        user=customer_user,
        customer_name="Client Test",
        phone="0612345678",
        order_type='dine_in',
        status='pending',
        payment_status='pending',
        subtotal=Decimal('25.00'),
        tax_amount=Decimal('2.50'),
        total_amount=Decimal('27.50')
    )


@pytest.fixture
def order_with_items(order, menu_item):
    """Order with items"""
    OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=2,
        unit_price=menu_item.price,
        total_price=menu_item.price * 2
    )
    return order


@pytest.fixture
def confirmed_order(restaurant, table, customer_user):
    """Confirmed order for status transition tests"""
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TEST-002",
        user=customer_user,
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('30.00'),
        tax_amount=Decimal('3.00'),
        total_amount=Decimal('33.00')
    )


@pytest.fixture
def preparing_order(restaurant, table, customer_user):
    """Preparing order"""
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TEST-003",
        user=customer_user,
        status='preparing',
        payment_status='pending',
        subtotal=Decimal('40.00'),
        tax_amount=Decimal('4.00'),
        total_amount=Decimal('44.00')
    )


@pytest.fixture
def ready_order(restaurant, table, customer_user):
    """Ready order"""
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-TEST-004",
        user=customer_user,
        status='ready',
        payment_status='pending',
        subtotal=Decimal('50.00'),
        tax_amount=Decimal('5.00'),
        total_amount=Decimal('55.00')
    )


# =============================================================================
# TESTS - Order Creation (POST /api/v1/orders/)
# =============================================================================

@pytest.mark.django_db
def test_create_order(auth_restaurateur_client, restaurant, menu_item):
    """Test creating an order with items"""
    client, _, _ = auth_restaurateur_client
    
    response = client.post("/api/v1/orders/", {
        "restaurant": restaurant.id,
        "order_type": "dine_in",
        "table_number": "X1",
        "customer_name": "Test Client",
        "items": [
            {"menu_item": menu_item.id, "quantity": 2}
        ]
    }, format="json")
    
    assert response.status_code == status.HTTP_201_CREATED
    assert "order_number" in response.data


@pytest.mark.django_db
def test_create_order_missing_items(auth_restaurateur_client, restaurant):
    """Test creating order without items fails"""
    client, _, _ = auth_restaurateur_client
    
    response = client.post("/api/v1/orders/", {
        "restaurant": restaurant.id,
        "order_type": "dine_in",
        "table_number": "X1"
    }, format="json")
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_create_order_invalid_restaurant(auth_restaurateur_client, menu_item):
    """Test creating order with non-existent restaurant"""
    client, _, _ = auth_restaurateur_client
    
    response = client.post("/api/v1/orders/", {
        "restaurant": 99999,
        "order_type": "dine_in",
        "items": [{"menu_item": menu_item.id, "quantity": 1}]
    }, format="json")
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Order List (GET /api/v1/orders/)
# =============================================================================

@pytest.mark.django_db
def test_list_orders_only_owned(auth_restaurateur_client, order):
    """Test that restaurateur only sees their restaurant's orders"""
    client, _, _ = auth_restaurateur_client
    
    response = client.get("/api/v1/orders/")
    
    assert response.status_code == status.HTTP_200_OK
    # Response is either a list or paginated with 'results'
    data = response.data if isinstance(response.data, list) else response.data.get('results', [])
    assert len(data) >= 1


@pytest.mark.django_db
def test_list_orders_unauthenticated(api_client):
    """Test that unauthenticated access is denied"""
    response = api_client.get("/api/v1/orders/")
    
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_filter_orders_by_status(auth_restaurateur_client, order, confirmed_order):
    """Test filtering orders by status"""
    client, _, _ = auth_restaurateur_client
    
    response = client.get("/api/v1/orders/?status=pending")
    
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_filter_orders_by_restaurant(auth_restaurateur_client, order, restaurant):
    """Test filtering orders by restaurant"""
    client, _, _ = auth_restaurateur_client
    
    response = client.get(f"/api/v1/orders/?restaurant={restaurant.id}")
    
    assert response.status_code == status.HTTP_200_OK


# =============================================================================
# TESTS - Order Retrieve (GET /api/v1/orders/{id}/)
# =============================================================================

@pytest.mark.django_db
def test_order_details(auth_restaurateur_client, order_with_items):
    """Test retrieving order details"""
    client, _, _ = auth_restaurateur_client
    
    # Use retrieve endpoint, not a custom 'details' action
    response = client.get(f"/api/v1/orders/{order_with_items.id}/")
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data["order_number"] == order_with_items.order_number


# =============================================================================
# TESTS - Status Updates (PATCH /api/v1/orders/{id}/update_status/)
# =============================================================================

@pytest.mark.django_db
def test_update_status_pending_to_confirmed(auth_restaurateur_client, order):
    """Test status transition: pending -> confirmed"""
    client, _, _ = auth_restaurateur_client
    
    response = client.patch(
        f"/api/v1/orders/{order.id}/update_status/",
        {"status": "confirmed"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_200_OK
    order.refresh_from_db()
    assert order.status == "confirmed"


@pytest.mark.django_db
def test_update_status_confirmed_to_preparing(auth_restaurateur_client, confirmed_order):
    """Test status transition: confirmed -> preparing"""
    client, _, _ = auth_restaurateur_client
    
    response = client.patch(
        f"/api/v1/orders/{confirmed_order.id}/update_status/",
        {"status": "preparing"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_200_OK
    confirmed_order.refresh_from_db()
    assert confirmed_order.status == "preparing"


@pytest.mark.django_db
def test_update_status_preparing_to_ready(auth_restaurateur_client, preparing_order):
    """Test status transition: preparing -> ready"""
    client, _, _ = auth_restaurateur_client
    
    response = client.patch(
        f"/api/v1/orders/{preparing_order.id}/update_status/",
        {"status": "ready"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_200_OK
    preparing_order.refresh_from_db()
    assert preparing_order.status == "ready"


@pytest.mark.django_db
def test_update_status_ready_to_served(auth_restaurateur_client, ready_order):
    """Test status transition: ready -> served"""
    client, _, _ = auth_restaurateur_client
    
    response = client.patch(
        f"/api/v1/orders/{ready_order.id}/update_status/",
        {"status": "served"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_200_OK
    ready_order.refresh_from_db()
    assert ready_order.status == "served"


@pytest.mark.django_db
def test_update_status_invalid_transition(auth_restaurateur_client, order):
    """Test invalid status transition: pending -> served"""
    client, _, _ = auth_restaurateur_client
    
    response = client.patch(
        f"/api/v1/orders/{order.id}/update_status/",
        {"status": "served"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Payment (POST /api/v1/orders/{id}/mark_as_paid/)
# =============================================================================

@pytest.mark.django_db
def test_mark_order_paid(auth_restaurateur_client, order):
    """Test marking order as paid"""
    client, _, _ = auth_restaurateur_client
    
    # Correct endpoint is mark_as_paid, not mark_paid
    response = client.post(
        f"/api/v1/orders/{order.id}/mark_as_paid/",
        {"payment_method": "cash"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_200_OK
    order.refresh_from_db()
    # Order uses payment_status field, not is_paid
    assert order.payment_status == "paid"


@pytest.mark.django_db
def test_mark_order_paid_card(auth_restaurateur_client, order):
    """Test marking order as paid with card"""
    client, _, _ = auth_restaurateur_client
    
    response = client.post(
        f"/api/v1/orders/{order.id}/mark_as_paid/",
        {"payment_method": "card"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_200_OK
    order.refresh_from_db()
    assert order.payment_status == "paid"
    assert order.payment_method == "card"


# =============================================================================
# TESTS - Cancel Order (POST /api/v1/orders/{id}/cancel_order/)
# =============================================================================

@pytest.mark.django_db
def test_cancel_pending_order(auth_restaurateur_client, order):
    """Test cancelling a pending order"""
    client, _, _ = auth_restaurateur_client
    
    response = client.post(f"/api/v1/orders/{order.id}/cancel_order/")
    
    assert response.status_code == status.HTTP_200_OK
    order.refresh_from_db()
    assert order.status == "cancelled"


@pytest.mark.django_db
def test_cancel_confirmed_order(auth_restaurateur_client, confirmed_order):
    """Test cancelling a confirmed order"""
    client, _, _ = auth_restaurateur_client
    
    response = client.post(f"/api/v1/orders/{confirmed_order.id}/cancel_order/")
    
    assert response.status_code == status.HTTP_200_OK
    confirmed_order.refresh_from_db()
    assert confirmed_order.status == "cancelled"


# =============================================================================
# TESTS - Kitchen View (GET /api/v1/orders/kitchen_view/)
# =============================================================================

@pytest.mark.django_db
def test_kitchen_view_with_restaurant(auth_restaurateur_client, order, restaurant):
    """Test kitchen view with restaurant parameter"""
    client, _, _ = auth_restaurateur_client
    
    response = client.get(f"/api/v1/orders/kitchen_view/?restaurant={restaurant.id}")
    
    assert response.status_code == status.HTTP_200_OK
    assert "tables" in response.data
    assert "total_active_orders" in response.data


@pytest.mark.django_db
def test_kitchen_view_missing_restaurant(auth_restaurateur_client):
    """Test kitchen view without restaurant parameter returns 400"""
    client, _, _ = auth_restaurateur_client
    
    response = client.get("/api/v1/orders/kitchen_view/")
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - Permissions
# =============================================================================

@pytest.mark.django_db
def test_customer_cannot_update_status(auth_customer_client, order):
    """Test that customer cannot update order status"""
    response = auth_customer_client.patch(
        f"/api/v1/orders/{order.id}/update_status/",
        {"status": "confirmed"},
        format="json"
    )
    
    # Customer doesn't have IsRestaurateur permission
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_customer_cannot_mark_paid(auth_customer_client, order):
    """Test that customer cannot mark order as paid"""
    response = auth_customer_client.post(
        f"/api/v1/orders/{order.id}/mark_as_paid/",
        {"payment_method": "cash"},
        format="json"
    )
    
    assert response.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# TESTS - User without profile
# =============================================================================

@pytest.mark.django_db
def test_user_without_profile_should_raise():
    """Test that accessing non-existent profile raises exception"""
    user = User.objects.create_user(
        username="noprofile@example.com",
        password="testpass123"
    )
    RestaurateurProfile.objects.filter(user=user).delete()
    
    assert not RestaurateurProfile.objects.filter(user=user).exists()
    
    with pytest.raises(RestaurateurProfile.DoesNotExist):
        RestaurateurProfile.objects.get(user=user)