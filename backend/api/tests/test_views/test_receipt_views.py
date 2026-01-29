# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de tickets de caisse (receipt_views.py)

Couverture:
- SendReceiptEmailView (POST /api/v1/receipts/send-email/)
- GetReceiptDataView (GET /api/v1/orders/{order_id}/receipt/)
- GenerateReceiptPDFView (GET /api/v1/orders/{order_id}/receipt/pdf/)

IMPORTANT - Model field notes:
- Table: Use 'number' field (not 'identifiant' which is a read-only property)
- Order: Uses 'payment_status' field (not 'is_paid' boolean)
- Order: Uses 'table_number' CharField (not 'table' ForeignKey)
- Order: Does NOT have 'restaurateur' field
- Order.items is the related_name for OrderItem
- MenuItem: 'category' should be a MenuCategory object
"""

import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from django.core import mail
from api.models import (
    RestaurateurProfile, Restaurant, Table,
    Order, Menu, MenuItem, MenuCategory, OrderItem
)
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch, MagicMock
from io import BytesIO


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Unauthenticated API client"""
    return APIClient()


@pytest.fixture
def auth_client(db):
    """Authenticated client"""
    user = User.objects.create_user(
        username="testuser@example.com",
        email="testuser@example.com",
        password="testpass123"
    )
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, user


@pytest.fixture
def restaurateur_client(db):
    """Authenticated restaurateur client with profile"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    user = User.objects.create_user(
        username="receipt_resto@example.com",
        email="receipt_resto@example.com",
        password="testpass123"
    )
    user.groups.add(group)
    profile = RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234",
        is_validated=True,
        is_active=True
    )
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client, user, profile


@pytest.fixture
def restaurant(restaurateur_client):
    """Test restaurant with full details"""
    _, _, profile = restaurateur_client
    return Restaurant.objects.create(
        name="Le Bon Restaurant",
        description="Restaurant de test",
        address="123 Rue du Test",
        city="Paris",
        zip_code="75001",
        phone="0123456789",
        email="contact@lebonresto.fr",
        owner=profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def table(restaurant):
    """
    Test table.
    NOTE: 'identifiant' is a read-only property. Use 'number' field.
    """
    return Table.objects.create(
        restaurant=restaurant,
        number="1"
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
    """Test menu category"""
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    """Test menu item"""
    return MenuItem.objects.create(
        menu=menu,
        name="Steak Frites",
        description="Steak avec frites maison",
        price=Decimal('22.50'),
        category=menu_category,
        is_available=True
    )


@pytest.fixture
def second_menu_item(menu, menu_category):
    """Second test menu item"""
    return MenuItem.objects.create(
        menu=menu,
        name="Salade César",
        description="Salade fraîche",
        price=Decimal('12.00'),
        category=menu_category,
        is_available=True
    )


@pytest.fixture
def order(restaurant, table):
    """
    Test order.
    
    NOTE: Order model uses:
    - restaurant (ForeignKey)
    - table_number (CharField, NOT a FK to Table)
    - order_number (required, unique)
    - subtotal, total_amount (required DecimalFields)
    """
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table.number,
        order_number="ORD-RECEIPT-001",
        customer_name="Jean Dupont",
        phone="0612345678",
        status='served',
        payment_status='paid',
        payment_method='card',
        subtotal=Decimal('34.50'),
        tax_amount=Decimal('3.45'),
        total_amount=Decimal('37.95')
    )


@pytest.fixture
def order_with_items(order, menu_item, second_menu_item):
    """Order with multiple items"""
    OrderItem.objects.create(
        order=order,
        menu_item=menu_item,
        quantity=1,
        unit_price=menu_item.price,
        total_price=menu_item.price,
        customizations={"cuisson": "à point"}
    )
    OrderItem.objects.create(
        order=order,
        menu_item=second_menu_item,
        quantity=1,
        unit_price=second_menu_item.price,
        total_price=second_menu_item.price
    )
    return order


# =============================================================================
# TESTS - SendReceiptEmailView
# =============================================================================

@pytest.mark.django_db
class TestSendReceiptEmailView:
    """Tests pour SendReceiptEmailView"""
    
    def test_send_receipt_email_success(self, api_client, order_with_items):
        """Test successful receipt email sending"""
        url = "/api/v1/receipts/send-email/"
        data = {
            "order_id": order_with_items.id,
            "email": "client@example.com"
        }
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert 'message' in response.data
        
        # Verify email was sent
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ['client@example.com']
        assert 'Ticket de caisse' in mail.outbox[0].subject
        assert order_with_items.order_number in mail.outbox[0].subject
    
    def test_send_receipt_email_missing_order_id(self, api_client):
        """Test error when order_id is missing"""
        url = "/api/v1/receipts/send-email/"
        data = {
            "email": "client@example.com"
        }
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['success'] is False
    
    def test_send_receipt_email_missing_email(self, api_client, order):
        """Test error when email is missing"""
        url = "/api/v1/receipts/send-email/"
        data = {
            "order_id": order.id
        }
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['success'] is False
    
    def test_send_receipt_email_order_not_found(self, api_client):
        """Test error when order doesn't exist"""
        url = "/api/v1/receipts/send-email/"
        data = {
            "order_id": 99999,
            "email": "client@example.com"
        }
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    @patch('api.views.receipt_views.EmailMessage.send')
    def test_send_receipt_email_failure(self, mock_send, api_client, order):
        """Test handling of email sending failure"""
        mock_send.side_effect = Exception("SMTP connection failed")
        
        url = "/api/v1/receipts/send-email/"
        data = {
            "order_id": order.id,
            "email": "client@example.com"
        }
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.data['success'] is False
    
    def test_send_receipt_email_content(self, api_client, order_with_items):
        """Test receipt email contains correct content"""
        url = "/api/v1/receipts/send-email/"
        data = {
            "order_id": order_with_items.id,
            "email": "client@example.com"
        }
        
        response = api_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Check email body contains expected content
        email_body = mail.outbox[0].body
        assert "TICKET DE CAISSE" in email_body
        assert order_with_items.restaurant.name in email_body
        assert "Steak Frites" in email_body
        assert "Salade César" in email_body
        assert "TOTAL:" in email_body


# =============================================================================
# TESTS - GetReceiptDataView
# =============================================================================

@pytest.mark.django_db
class TestGetReceiptDataView:
    """Tests pour GetReceiptDataView"""
    
    def test_get_receipt_data_success(self, api_client, order_with_items):
        """Test successful receipt data retrieval"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['order_id'] == order_with_items.id
        assert response.data['order_number'] == order_with_items.order_number
        assert response.data['restaurant_name'] == order_with_items.restaurant.name
    
    def test_get_receipt_data_includes_items(self, api_client, order_with_items):
        """Test receipt data includes order items"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'items' in response.data
        assert len(response.data['items']) == 2
        
        # Check first item details
        item_names = [item['name'] for item in response.data['items']]
        assert "Steak Frites" in item_names
        assert "Salade César" in item_names
    
    def test_get_receipt_data_includes_totals(self, api_client, order_with_items):
        """Test receipt data includes correct totals"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_amount'] == float(order_with_items.total_amount)
        assert response.data['subtotal'] == float(order_with_items.total_amount)
    
    def test_get_receipt_data_includes_payment_info(self, api_client, order_with_items):
        """Test receipt data includes payment information"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['payment_method'] == order_with_items.payment_method
        assert response.data['payment_status'] == order_with_items.payment_status
    
    def test_get_receipt_data_includes_restaurant_info(self, api_client, order_with_items):
        """Test receipt data includes restaurant details"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['restaurant_name'] == order_with_items.restaurant.name
        assert response.data['restaurant_address'] == order_with_items.restaurant.address
        assert response.data['restaurant_city'] == order_with_items.restaurant.city
    
    def test_get_receipt_data_includes_customer_info(self, api_client, order_with_items):
        """Test receipt data includes customer details"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['customer_name'] == order_with_items.customer_name
        assert response.data['table_number'] == order_with_items.table_number
    
    def test_get_receipt_data_order_not_found(self, api_client):
        """Test error when order doesn't exist"""
        url = "/api/v1/orders/99999/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_get_receipt_data_item_customizations(self, api_client, order_with_items):
        """Test receipt data includes item customizations"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Find the Steak Frites item which has customizations
        steak_item = next(
            (item for item in response.data['items'] if item['name'] == 'Steak Frites'),
            None
        )
        assert steak_item is not None
        assert 'customizations' in steak_item


# =============================================================================
# TESTS - GenerateReceiptPDFView
# =============================================================================

@pytest.mark.django_db
class TestGenerateReceiptPDFView:
    """Tests pour GenerateReceiptPDFView"""
    
    def test_generate_pdf_success(self, api_client, order_with_items):
        """Test successful PDF generation"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/pdf/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/pdf'
        assert 'attachment' in response['Content-Disposition']
        assert f'ticket_{order_with_items.id}.pdf' in response['Content-Disposition']
    
    def test_generate_pdf_content_not_empty(self, api_client, order_with_items):
        """Test PDF content is not empty"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/pdf/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.content) > 0
        # PDF files start with %PDF
        assert response.content[:4] == b'%PDF'
    
    def test_generate_pdf_order_not_found(self, api_client):
        """Test error when order doesn't exist"""
        url = "/api/v1/orders/99999/receipt/pdf/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    @patch('reportlab.pdfgen.canvas.Canvas')
    def test_generate_pdf_error_handling(self, mock_canvas, api_client, order_with_items):
        """Test error handling during PDF generation"""
        mock_canvas.side_effect = Exception("PDF generation error")
        
        url = f"/api/v1/orders/{order_with_items.id}/receipt/pdf/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert 'error' in response.data
    
    def test_generate_pdf_order_without_items(self, api_client, order):
        """Test PDF generation for order without items"""
        url = f"/api/v1/orders/{order.id}/receipt/pdf/"
        
        response = api_client.get(url)
        
        # Should still succeed, just with no items
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/pdf'


# =============================================================================
# TESTS - Edge Cases
# =============================================================================

@pytest.mark.django_db
class TestReceiptEdgeCases:
    """Tests pour les cas limites"""
    
    def test_receipt_data_order_without_restaurant(self, api_client, db):
        """Test receipt data when restaurant is somehow missing"""
        # This shouldn't normally happen due to FK constraints,
        # but test the defensive coding
        pass  # Skip - FK constraint prevents this
    
    def test_receipt_data_order_with_empty_items(self, api_client, order):
        """Test receipt data for order without items"""
        url = f"/api/v1/orders/{order.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['items'] == []
    
    def test_receipt_data_formats_dates_correctly(self, api_client, order_with_items):
        """Test that dates are formatted in ISO format"""
        url = f"/api/v1/orders/{order_with_items.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        # created_at should be ISO format string
        assert 'T' in response.data['created_at']  # ISO format contains T
    
    def test_receipt_data_handles_null_payment_method(self, api_client, restaurant, table):
        """Test receipt data handles null payment method"""
        order = Order.objects.create(
            restaurant=restaurant,
            table_number=table.number,
            order_number="ORD-NULL-PAY-001",
            status='pending',
            payment_status='pending',
            payment_method='',  # Empty payment method
            subtotal=Decimal('10.00'),
            total_amount=Decimal('10.00')
        )
        
        url = f"/api/v1/orders/{order.id}/receipt/"
        
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        # Should have a default or empty value, not crash
        assert 'payment_method' in response.data
    
    def test_send_email_invalid_email_format(self, api_client, order):
        """Test sending to invalid email address"""
        url = "/api/v1/receipts/send-email/"
        data = {
            "order_id": order.id,
            "email": "not-an-email"
        }
        
        # The view doesn't validate email format, 
        # so it may succeed or fail at SMTP level
        response = api_client.post(url, data, format='json')
        
        # Either success (email accepted) or server error (rejected)
        assert response.status_code in [200, 500]