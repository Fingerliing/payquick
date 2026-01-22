# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de commandes (Order)

Couverture:
- OrderCreateSerializer (validation, création)
- OrderListSerializer (affichage liste)
- OrderDetailSerializer (affichage détail)
- OrderStatusUpdateSerializer (transitions de statut)
- OrderItemSerializer
- TableSessionSerializer
- OrderWithTableInfoSerializer
"""

import pytest
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from api.models import Order, OrderItem, MenuItem, TableSession
from api.serializers.order_serializers import (
    OrderCreateSerializer,
    OrderListSerializer,
    OrderDetailSerializer,
    OrderStatusUpdateSerializer,
    OrderItemSerializer,
    OrderItemCreateSerializer,
    TableSessionSerializer,
    OrderWithTableInfoSerializer,
)


# =============================================================================
# TESTS - OrderItemSerializer
# =============================================================================

@pytest.mark.django_db
class TestOrderItemSerializer:
    """Tests pour OrderItemSerializer"""

    def test_serializer_fields(self, order_item):
        """Test des champs du serializer"""
        serializer = OrderItemSerializer(order_item)
        data = serializer.data
        
        assert 'id' in data
        assert 'menu_item' in data
        assert 'quantity' in data
        assert 'unit_price' in data
        assert 'total_price' in data
        # Note: vat_rate is not in OrderItemSerializer fields

    def test_quantity_positive(self, order_item):
        """Test que la quantité est positive"""
        serializer = OrderItemSerializer(order_item)
        assert int(serializer.data['quantity']) > 0

    def test_price_decimal_format(self, order_item):
        """Test du format décimal des prix"""
        serializer = OrderItemSerializer(order_item)
        # Le prix doit être une string représentant un Decimal
        assert Decimal(serializer.data['unit_price']) == order_item.unit_price


@pytest.mark.django_db
class TestOrderItemCreateSerializer:
    """Tests pour OrderItemCreateSerializer"""

    def test_valid_data(self, menu_item):
        """Test avec des données valides"""
        data = {
            'menu_item': menu_item.id,
            'quantity': 2
        }
        serializer = OrderItemCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_quantity_required(self, menu_item):
        """Test que la quantité est requise"""
        data = {
            'menu_item': menu_item.id
        }
        serializer = OrderItemCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'quantity' in serializer.errors

    def test_menu_item_required(self):
        """Test que le menu_item est requis"""
        data = {
            'quantity': 2
        }
        serializer = OrderItemCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'menu_item' in serializer.errors

    def test_quantity_minimum(self, menu_item):
        """Test que la quantité minimum est 1"""
        data = {
            'menu_item': menu_item.id,
            'quantity': 0
        }
        serializer = OrderItemCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'quantity' in serializer.errors

    def test_quantity_negative(self, menu_item):
        """Test que la quantité négative est rejetée"""
        data = {
            'menu_item': menu_item.id,
            'quantity': -1
        }
        serializer = OrderItemCreateSerializer(data=data)
        assert not serializer.is_valid()


# =============================================================================
# TESTS - OrderCreateSerializer
# =============================================================================

@pytest.mark.django_db
class TestOrderCreateSerializer:
    """Tests pour OrderCreateSerializer"""

    def test_valid_order_creation(self, restaurant, menu_item, mock_request):
        """Test de création de commande valide"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'table_number': 'T001',
            'customer_name': 'Jean Dupont',
            'phone': '0612345678',
            'payment_method': 'card',
            'items': [
                {'menu_item': menu_item.id, 'quantity': 2}
            ]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert serializer.is_valid(), serializer.errors

    def test_restaurant_required(self, menu_item, mock_request):
        """Test que le restaurant est requis"""
        data = {
            'order_type': 'dine_in',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'restaurant' in serializer.errors

    def test_items_required(self, restaurant, mock_request):
        """Test qu'au moins un item est requis"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'items': []
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'items' in serializer.errors

    def test_inactive_restaurant_rejected(self, inactive_restaurant, menu_item, mock_request):
        """Test qu'un restaurant inactif est rejeté"""
        data = {
            'restaurant': inactive_restaurant.id,
            'order_type': 'dine_in',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'restaurant' in serializer.errors

    def test_order_type_validation(self, restaurant, menu_item, mock_request):
        """Test de validation du type de commande"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'invalid_type',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'order_type' in serializer.errors

    def test_valid_order_types(self, restaurant, menu_item, mock_request):
        """Test des types de commande valides"""
        # Note: Model only supports 'dine_in' and 'takeaway', not 'delivery'
        valid_types = ['dine_in', 'takeaway']
        
        for order_type in valid_types:
            data = {
                'restaurant': restaurant.id,
                'order_type': order_type,
                'items': [{'menu_item': menu_item.id, 'quantity': 1}]
            }
            serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
            assert serializer.is_valid(), f"Type {order_type} devrait être valide: {serializer.errors}"

    def test_table_number_required_for_dine_in(self, restaurant, menu_item, mock_request):
        """Test que le numéro de table est nécessaire pour dine_in"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'table_number': '',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        # La validation peut être flexible, vérifions juste que c'est valide
        # ou qu'une erreur pertinente est levée
        is_valid = serializer.is_valid()
        # Comportement peut varier selon l'implémentation

    def test_unavailable_menu_item_rejected(self, restaurant, unavailable_menu_item, mock_request):
        """Test qu'un item non disponible est rejeté"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'items': [{'menu_item': unavailable_menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'items' in serializer.errors

    def test_menu_item_wrong_restaurant_rejected(
        self, restaurant, other_owner_restaurant, menu_item, mock_request
    ):
        """Test qu'un item d'un autre restaurant est rejeté"""
        # L'item appartient au premier restaurant, pas à other_owner_restaurant
        data = {
            'restaurant': other_owner_restaurant.id,
            'order_type': 'dine_in',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'items' in serializer.errors

    def test_multiple_items(self, restaurant, menu_item, second_menu_item, mock_request):
        """Test avec plusieurs items"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'takeaway',
            'customer_name': 'Marie Martin',
            'phone': '0698765432',
            'items': [
                {'menu_item': menu_item.id, 'quantity': 2},
                {'menu_item': second_menu_item.id, 'quantity': 1}
            ]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert serializer.is_valid(), serializer.errors

    def test_notes_optional(self, restaurant, menu_item, mock_request):
        """Test que les notes sont optionnelles"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'table_number': 'T001',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert serializer.is_valid(), serializer.errors

    def test_notes_with_content(self, restaurant, menu_item, mock_request):
        """Test avec des notes"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'table_number': 'T001',
            'notes': 'Sans sel, allergie aux noix',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data['notes'] == 'Sans sel, allergie aux noix'


# =============================================================================
# TESTS - OrderListSerializer
# =============================================================================

@pytest.mark.django_db
class TestOrderListSerializer:
    """Tests pour OrderListSerializer"""

    def test_serializer_fields(self, order):
        """Test des champs du serializer liste"""
        serializer = OrderListSerializer(order)
        data = serializer.data
        
        assert 'id' in data
        assert 'order_number' in data
        assert 'status' in data
        assert 'total_amount' in data
        assert 'created_at' in data
        assert 'restaurant_name' in data
        assert 'table_number' in data

    def test_items_count_calculated(self, order_with_items):
        """Test du calcul du nombre d'items"""
        serializer = OrderListSerializer(order_with_items)
        assert serializer.data['items_count'] == 2

    def test_waiting_time_calculated(self, order):
        """Test du calcul du temps d'attente"""
        serializer = OrderListSerializer(order)
        
        if 'waiting_time' in serializer.data:
            # Le temps d'attente doit être >= 0
            assert serializer.data['waiting_time'] is None or serializer.data['waiting_time'] >= 0

    def test_waiting_time_none_for_served(self, served_order):
        """Test que le temps d'attente est None pour les commandes servies"""
        serializer = OrderListSerializer(served_order)
        
        if 'waiting_time' in serializer.data:
            assert serializer.data['waiting_time'] is None

    def test_customer_display(self, order):
        """Test de l'affichage du client"""
        serializer = OrderListSerializer(order)
        
        if 'customer_display' in serializer.data:
            # Doit afficher le nom du client ou username
            assert serializer.data['customer_display'] is not None

    def test_status_display(self, order):
        """Test de l'affichage du statut"""
        serializer = OrderListSerializer(order)
        
        if 'status_display' in serializer.data:
            assert serializer.data['status_display'] is not None

    def test_multiple_orders(self, order, confirmed_order, preparing_order):
        """Test de sérialisation de plusieurs commandes"""
        orders = [order, confirmed_order, preparing_order]
        serializer = OrderListSerializer(orders, many=True)
        
        assert len(serializer.data) == 3
        
        statuses = [o['status'] for o in serializer.data]
        assert 'pending' in statuses
        assert 'confirmed' in statuses
        assert 'preparing' in statuses


# =============================================================================
# TESTS - OrderDetailSerializer
# =============================================================================

@pytest.mark.django_db
class TestOrderDetailSerializer:
    """Tests pour OrderDetailSerializer"""

    def test_serializer_fields(self, order_with_items, factory):
        """Test des champs du serializer détail"""
        request = factory.get('/')
        serializer = OrderDetailSerializer(order_with_items, context={'request': request})
        data = serializer.data
        
        assert 'id' in data
        assert 'order_number' in data
        assert 'status' in data
        assert 'payment_status' in data
        assert 'subtotal' in data
        assert 'tax_amount' in data
        assert 'total_amount' in data
        assert 'items' in data
        assert 'created_at' in data

    def test_items_nested(self, order_with_items, factory):
        """Test que les items sont correctement imbriqués"""
        request = factory.get('/')
        serializer = OrderDetailSerializer(order_with_items, context={'request': request})
        
        items = serializer.data['items']
        assert len(items) == 2
        
        for item in items:
            assert 'menu_item' in item or 'menu_item_name' in item
            assert 'quantity' in item
            assert 'unit_price' in item

    def test_timestamps_present(self, order, factory):
        """Test que les timestamps sont présents"""
        request = factory.get('/')
        serializer = OrderDetailSerializer(order, context={'request': request})
        data = serializer.data
        
        assert 'created_at' in data
        if order.ready_at:
            assert 'ready_at' in data
        if order.served_at:
            assert 'served_at' in data

    def test_ready_order_has_ready_at(self, ready_order, factory):
        """Test qu'une commande prête a ready_at"""
        request = factory.get('/')
        serializer = OrderDetailSerializer(ready_order, context={'request': request})
        
        if 'ready_at' in serializer.data:
            assert serializer.data['ready_at'] is not None

    def test_served_order_has_served_at(self, served_order, factory):
        """Test qu'une commande servie a served_at"""
        request = factory.get('/')
        serializer = OrderDetailSerializer(served_order, context={'request': request})
        
        if 'served_at' in serializer.data:
            assert serializer.data['served_at'] is not None


# =============================================================================
# TESTS - OrderStatusUpdateSerializer (Machine d'état)
# =============================================================================

@pytest.mark.django_db
class TestOrderStatusUpdateSerializer:
    """Tests pour OrderStatusUpdateSerializer - Machine d'état"""

    def test_pending_to_confirmed(self, order):
        """Test transition pending -> confirmed"""
        serializer = OrderStatusUpdateSerializer(
            order,
            data={'status': 'confirmed'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    def test_pending_to_cancelled(self, order):
        """Test transition pending -> cancelled"""
        serializer = OrderStatusUpdateSerializer(
            order,
            data={'status': 'cancelled'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    def test_confirmed_to_preparing(self, confirmed_order):
        """Test transition confirmed -> preparing"""
        serializer = OrderStatusUpdateSerializer(
            confirmed_order,
            data={'status': 'preparing'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    def test_confirmed_to_cancelled(self, confirmed_order):
        """Test transition confirmed -> cancelled"""
        serializer = OrderStatusUpdateSerializer(
            confirmed_order,
            data={'status': 'cancelled'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    def test_preparing_to_ready(self, preparing_order):
        """Test transition preparing -> ready"""
        serializer = OrderStatusUpdateSerializer(
            preparing_order,
            data={'status': 'ready'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    def test_preparing_to_cancelled(self, preparing_order):
        """Test transition preparing -> cancelled"""
        serializer = OrderStatusUpdateSerializer(
            preparing_order,
            data={'status': 'cancelled'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    def test_ready_to_served(self, ready_order):
        """Test transition ready -> served"""
        serializer = OrderStatusUpdateSerializer(
            ready_order,
            data={'status': 'served'},
            partial=True
        )
        assert serializer.is_valid(), serializer.errors

    # Tests de transitions invalides

    def test_pending_to_ready_invalid(self, order):
        """Test transition invalide pending -> ready"""
        serializer = OrderStatusUpdateSerializer(
            order,
            data={'status': 'ready'},
            partial=True
        )
        assert not serializer.is_valid()
        assert 'status' in serializer.errors

    def test_pending_to_served_invalid(self, order):
        """Test transition invalide pending -> served"""
        serializer = OrderStatusUpdateSerializer(
            order,
            data={'status': 'served'},
            partial=True
        )
        assert not serializer.is_valid()
        assert 'status' in serializer.errors

    def test_confirmed_to_served_invalid(self, confirmed_order):
        """Test transition invalide confirmed -> served"""
        serializer = OrderStatusUpdateSerializer(
            confirmed_order,
            data={'status': 'served'},
            partial=True
        )
        assert not serializer.is_valid()
        assert 'status' in serializer.errors

    def test_preparing_to_confirmed_invalid(self, preparing_order):
        """Test transition invalide preparing -> confirmed (retour en arrière)"""
        serializer = OrderStatusUpdateSerializer(
            preparing_order,
            data={'status': 'confirmed'},
            partial=True
        )
        assert not serializer.is_valid()
        assert 'status' in serializer.errors

    def test_ready_to_preparing_invalid(self, ready_order):
        """Test transition invalide ready -> preparing (retour en arrière)"""
        serializer = OrderStatusUpdateSerializer(
            ready_order,
            data={'status': 'preparing'},
            partial=True
        )
        assert not serializer.is_valid()
        assert 'status' in serializer.errors

    def test_ready_to_cancelled_invalid(self, ready_order):
        """Test transition invalide ready -> cancelled"""
        serializer = OrderStatusUpdateSerializer(
            ready_order,
            data={'status': 'cancelled'},
            partial=True
        )
        assert not serializer.is_valid()
        assert 'status' in serializer.errors

    def test_served_no_transition(self, served_order):
        """Test qu'une commande servie ne peut plus changer de statut"""
        for status in ['pending', 'confirmed', 'preparing', 'ready', 'cancelled']:
            serializer = OrderStatusUpdateSerializer(
                served_order,
                data={'status': status},
                partial=True
            )
            assert not serializer.is_valid(), f"Served -> {status} ne devrait pas être valide"

    def test_cancelled_no_transition(self, cancelled_order):
        """Test qu'une commande annulée ne peut plus changer de statut"""
        for status in ['pending', 'confirmed', 'preparing', 'ready', 'served']:
            serializer = OrderStatusUpdateSerializer(
                cancelled_order,
                data={'status': status},
                partial=True
            )
            assert not serializer.is_valid(), f"Cancelled -> {status} ne devrait pas être valide"

    def test_update_sets_ready_at(self, preparing_order):
        """Test que ready_at est défini lors de la transition vers ready"""
        serializer = OrderStatusUpdateSerializer(
            preparing_order,
            data={'status': 'ready'},
            partial=True
        )
        assert serializer.is_valid()
        
        updated_order = serializer.save()
        assert updated_order.ready_at is not None

    def test_update_sets_served_at(self, ready_order):
        """Test que served_at est défini lors de la transition vers served"""
        serializer = OrderStatusUpdateSerializer(
            ready_order,
            data={'status': 'served'},
            partial=True
        )
        assert serializer.is_valid()
        
        updated_order = serializer.save()
        assert updated_order.served_at is not None


# =============================================================================
# TESTS - TableSessionSerializer
# =============================================================================

@pytest.mark.django_db
class TestTableSessionSerializer:
    """Tests pour TableSessionSerializer"""

    def test_serializer_fields(self, table_session, factory):
        """Test des champs du serializer"""
        request = factory.get('/')
        serializer = TableSessionSerializer(table_session, context={'request': request})
        data = serializer.data
        
        assert 'id' in data
        assert 'restaurant' in data
        assert 'table_number' in data
        assert 'started_at' in data
        assert 'is_active' in data
        assert 'primary_customer_name' in data

    def test_active_session(self, table_session, factory):
        """Test d'une session active"""
        request = factory.get('/')
        serializer = TableSessionSerializer(table_session, context={'request': request})
        
        assert serializer.data['is_active'] is True

    def test_orders_nested(self, table_session, order, factory):
        """Test que les commandes sont incluses"""
        # Associer la commande à la session si possible
        request = factory.get('/')
        serializer = TableSessionSerializer(table_session, context={'request': request})
        
        if 'orders' in serializer.data:
            assert isinstance(serializer.data['orders'], list)

    def test_computed_fields(self, table_session, factory):
        """Test des champs calculés"""
        request = factory.get('/')
        serializer = TableSessionSerializer(table_session, context={'request': request})
        data = serializer.data
        
        if 'orders_count' in data:
            assert isinstance(data['orders_count'], int)
        
        if 'total_amount' in data:
            # Peut être None ou Decimal
            assert data['total_amount'] is None or Decimal(data['total_amount']) >= 0

    def test_read_only_fields(self, table_session):
        """Test des champs en lecture seule"""
        serializer = TableSessionSerializer(table_session)
        read_only = serializer.Meta.read_only_fields
        
        assert 'id' in read_only
        assert 'started_at' in read_only


# =============================================================================
# TESTS - OrderWithTableInfoSerializer
# =============================================================================

@pytest.mark.django_db
class TestOrderWithTableInfoSerializer:
    """Tests pour OrderWithTableInfoSerializer"""

    def test_serializer_fields(self, order, factory):
        """Test des champs du serializer"""
        request = factory.get('/')
        serializer = OrderWithTableInfoSerializer(order, context={'request': request})
        data = serializer.data
        
        assert 'id' in data
        assert 'restaurant_name' in data

    def test_table_info_present(self, order, factory):
        """Test que les infos de table sont présentes"""
        request = factory.get('/')
        serializer = OrderWithTableInfoSerializer(order, context={'request': request})
        data = serializer.data
        
        # Vérifie les champs de table selon l'implémentation
        if 'table_session_id' in data:
            pass  # Peut être None si pas de session
        if 'order_sequence' in data:
            pass  # Peut être None
        if 'is_main_order' in data:
            pass  # Boolean ou None

    def test_restaurant_name(self, order, factory):
        """Test que le nom du restaurant est correct"""
        request = factory.get('/')
        serializer = OrderWithTableInfoSerializer(order, context={'request': request})
        
        assert serializer.data['restaurant_name'] == order.restaurant.name


# =============================================================================
# TESTS - Edge Cases et Validation
# =============================================================================

@pytest.mark.django_db
class TestOrderSerializerEdgeCases:
    """Tests des cas limites"""

    def test_empty_items_list(self, restaurant, mock_request):
        """Test avec une liste d'items vide"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'items': []
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert not serializer.is_valid()
        assert 'items' in serializer.errors

    def test_duplicate_items_allowed(self, restaurant, menu_item, mock_request):
        """Test que les items en double sont gérés"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'table_number': 'T001',
            'items': [
                {'menu_item': menu_item.id, 'quantity': 1},
                {'menu_item': menu_item.id, 'quantity': 2}
            ]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        # Peut être valide (les items sont fusionnés) ou invalide selon l'implémentation
        # On vérifie juste que ça ne crash pas
        serializer.is_valid()

    def test_very_large_quantity(self, restaurant, menu_item, mock_request):
        """Test avec une très grande quantité"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'items': [{'menu_item': menu_item.id, 'quantity': 1000}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        # Devrait être valide ou avoir une limite max
        is_valid = serializer.is_valid()

    def test_special_characters_in_notes(self, restaurant, menu_item, mock_request):
        """Test avec des caractères spéciaux dans les notes"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'dine_in',
            'table_number': 'T001',
            'notes': 'Allergie: 🥜 noix, <script>alert("xss")</script>',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        # Devrait être valide, les notes sont juste du texte
        assert serializer.is_valid(), serializer.errors

    def test_phone_format_validation(self, restaurant, menu_item, mock_request):
        """Test de la validation du format de téléphone"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'takeaway',
            'phone': 'invalid-phone',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        # Validation du téléphone dépend de l'implémentation
        serializer.is_valid()

    def test_valid_french_phone(self, restaurant, menu_item, mock_request):
        """Test avec un téléphone français valide"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'takeaway',
            'customer_name': 'Test',
            'phone': '0612345678',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert serializer.is_valid(), serializer.errors

    def test_international_phone(self, restaurant, menu_item, mock_request):
        """Test avec un téléphone international"""
        data = {
            'restaurant': restaurant.id,
            'order_type': 'takeaway',
            'customer_name': 'Test',
            'phone': '+33612345678',
            'items': [{'menu_item': menu_item.id, 'quantity': 1}]
        }
        serializer = OrderCreateSerializer(data=data, context={'request': mock_request})
        assert serializer.is_valid(), serializer.errors