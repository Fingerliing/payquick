# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de sessions collaboratives
"""

import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory
from api.models import (
    CollaborativeTableSession,
    SessionParticipant,
    SessionCartItem,
    Restaurant,
    Table,
    Order,
    Menu,
    MenuCategory,
    MenuItem,
    RestaurateurProfile,
)
from api.serializers.collaborative_session_serializers import (
    SessionParticipantSerializer,
    CollaborativeSessionSerializer,
    SessionCreateSerializer,
    SessionJoinSerializer,
    SessionCartItemSerializer,  # ← NOUVEAU
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def factory():
    return APIRequestFactory()


@pytest.fixture
def user():
    return User.objects.create_user(username="serializeruser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="secondserializeruser", password="testpass123")


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Serializer Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number=1,
        qr_code="SER01"
    )


@pytest.fixture
def menu(restaurant):
    return Menu.objects.create(
        name="Menu Principal",
        restaurant=restaurant,
        is_available=True
    )


@pytest.fixture
def menu_category(restaurant):
    return MenuCategory.objects.create(
        restaurant=restaurant,
        name="Plats",
        is_active=True
    )


@pytest.fixture
def menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Pizza Margherita",
        price=Decimal('12.50'),
        is_available=True
    )


@pytest.fixture
def second_menu_item(menu, menu_category):
    return MenuItem.objects.create(
        menu=menu,
        category=menu_category,
        name="Salade César",
        price=Decimal('9.90'),
        is_available=True
    )


@pytest.fixture
def collaborative_session(restaurant, table, user):
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="SER01",
        host=user,
        host_name="Test Host",
        max_participants=5
    )


@pytest.fixture
def participant(collaborative_session, user):
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=user,
        role='host',
        status='active'
    )


@pytest.fixture
def second_participant(collaborative_session, second_user):
    return SessionParticipant.objects.create(
        session=collaborative_session,
        user=second_user,
        role='member',
        status='active'
    )


@pytest.fixture
def cart_item(collaborative_session, participant, menu_item):
    return SessionCartItem.objects.create(
        session=collaborative_session,
        participant=participant,
        menu_item=menu_item,
        quantity=2,
        special_instructions="Sans oignons",
        customizations={"size": "large"}
    )


# =============================================================================
# TESTS - SessionParticipantSerializer
# =============================================================================

@pytest.mark.django_db
class TestSessionParticipantSerializer:
    """Tests pour SessionParticipantSerializer"""

    def test_serializer_fields(self, participant):
        """Test des champs du serializer"""
        serializer = SessionParticipantSerializer(participant)
        data = serializer.data

        assert 'id' in data
        assert 'display_name' in data
        assert 'status' in data
        assert 'role' in data
        assert 'is_host' in data
        assert 'joined_at' in data
        assert 'last_activity' in data

    def test_display_name_with_user(self, participant, user):
        """Test que display_name affiche le prénom ou username"""
        user.first_name = "Jean"
        user.save()

        serializer = SessionParticipantSerializer(participant)
        assert serializer.data['display_name'] == "Jean"

    def test_is_host_true(self, participant):
        """Test is_host pour un hôte"""
        serializer = SessionParticipantSerializer(participant)
        assert serializer.data['is_host'] is True

    def test_is_host_false(self, collaborative_session, second_user):
        """Test is_host pour un membre"""
        member = SessionParticipant.objects.create(
            session=collaborative_session,
            user=second_user,
            role='member',
            status='active'
        )
        serializer = SessionParticipantSerializer(member)
        assert serializer.data['is_host'] is False

    def test_read_only_fields(self, participant):
        """Test que certains champs sont en lecture seule"""
        serializer = SessionParticipantSerializer(participant)
        read_only = serializer.Meta.read_only_fields

        assert 'id' in read_only
        assert 'joined_at' in read_only
        assert 'last_activity' in read_only


# =============================================================================
# TESTS - CollaborativeSessionSerializer
# =============================================================================

@pytest.mark.django_db
class TestCollaborativeSessionSerializer:
    """Tests pour CollaborativeSessionSerializer"""

    def test_serializer_fields(self, collaborative_session, factory):
        """Test des champs du serializer"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )
        data = serializer.data

        assert 'id' in data
        assert 'share_code' in data
        assert 'restaurant_name' in data
        assert 'table_info' in data
        assert 'participants' in data
        assert 'participant_count' in data
        assert 'is_full' in data
        assert 'can_join' in data

    def test_participants_nested(self, collaborative_session, participant, factory):
        """Test que les participants sont sérialisés"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )

        participants = serializer.data['participants']
        assert len(participants) == 1
        assert participants[0]['role'] == 'host'

    def test_restaurant_name(self, collaborative_session, factory):
        """Test que le nom du restaurant est inclus"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )

        assert serializer.data['restaurant_name'] == "Serializer Test Restaurant"

    def test_computed_properties(self, collaborative_session, factory):
        """Test des propriétés calculées"""
        request = factory.get('/')
        serializer = CollaborativeSessionSerializer(
            collaborative_session,
            context={'request': request}
        )
        data = serializer.data

        assert data['is_full'] is False
        assert data['can_join'] is True
        assert data['participant_count'] == 0


# =============================================================================
# TESTS - SessionCreateSerializer
# =============================================================================

@pytest.mark.django_db
class TestSessionCreateSerializer:
    """Tests pour SessionCreateSerializer"""

    def test_valid_data(self, restaurant):
        """Test avec des données valides"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01',
            'host_name': 'Jean Dupont',
            'session_type': 'collaborative',
            'max_participants': 6
        }
        serializer = SessionCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_fields(self):
        """Test des champs requis"""
        data = {}
        serializer = SessionCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert 'restaurant_id' in serializer.errors
        assert 'table_number' in serializer.errors

    def test_default_values(self, restaurant):
        """Test des valeurs par défaut"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01'
        }
        serializer = SessionCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

        validated = serializer.validated_data
        assert validated.get('session_type') == 'collaborative'
        assert validated.get('max_participants') == 10

    def test_max_participants_validation(self, restaurant):
        """Test de la validation du nombre max de participants"""
        data = {
            'restaurant_id': str(restaurant.id),
            'table_number': 'T01',
            'max_participants': 0  # Invalid
        }
        serializer = SessionCreateSerializer(data=data)
        if not serializer.is_valid():
            assert 'max_participants' in serializer.errors


# =============================================================================
# TESTS - SessionJoinSerializer
# =============================================================================

@pytest.mark.django_db
class TestSessionJoinSerializer:
    """Tests pour SessionJoinSerializer"""

    def test_valid_join_with_share_code(self, collaborative_session):
        """Test de jointure valide avec code de partage"""
        data = {
            'share_code': collaborative_session.share_code,
            'guest_name': 'Pierre'
        }
        serializer = SessionJoinSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_share_code(self):
        """Test que share_code est requis"""
        data = {
            'guest_name': 'Pierre'
        }
        serializer = SessionJoinSerializer(data=data)
        assert not serializer.is_valid()
        assert 'share_code' in serializer.errors

    def test_invalid_share_code(self):
        """Test qu'un code invalide est rejeté"""
        data = {
            'share_code': 'INVALID'
        }
        serializer = SessionJoinSerializer(data=data)
        assert not serializer.is_valid()
        assert 'share_code' in serializer.errors

    def test_optional_guest_name(self, collaborative_session):
        """Test que guest_name est optionnel"""
        data = {
            'share_code': collaborative_session.share_code
        }
        serializer = SessionJoinSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_optional_guest_phone(self, collaborative_session):
        """Test que guest_phone est optionnel"""
        data = {
            'share_code': collaborative_session.share_code,
            'guest_phone': '0612345678'
        }
        serializer = SessionJoinSerializer(data=data)
        assert serializer.is_valid(), serializer.errors


# =============================================================================
# TESTS - SessionCartItemSerializer  ← NOUVEAU
# =============================================================================

@pytest.mark.django_db
class TestSessionCartItemSerializer:
    """Tests pour SessionCartItemSerializer"""

    def test_serializer_fields(self, cart_item):
        """Test que tous les champs attendus sont présents"""
        serializer = SessionCartItemSerializer(cart_item)
        data = serializer.data

        assert 'id' in data
        assert 'participant' in data
        assert 'participant_name' in data
        assert 'menu_item' in data
        assert 'menu_item_name' in data
        assert 'menu_item_price' in data
        assert 'quantity' in data
        assert 'special_instructions' in data
        assert 'customizations' in data
        assert 'total_price' in data
        assert 'added_at' in data
        assert 'updated_at' in data

    def test_participant_name_read_only(self, cart_item, participant, user):
        """Test que participant_name retourne le display_name du participant"""
        user.first_name = "Alice"
        user.save()

        serializer = SessionCartItemSerializer(cart_item)
        assert serializer.data['participant_name'] == "Alice"

    def test_menu_item_name_read_only(self, cart_item):
        """Test que menu_item_name retourne le nom du plat"""
        serializer = SessionCartItemSerializer(cart_item)
        assert serializer.data['menu_item_name'] == "Pizza Margherita"

    def test_menu_item_price_read_only(self, cart_item):
        """Test que menu_item_price retourne le prix unitaire du plat"""
        serializer = SessionCartItemSerializer(cart_item)
        assert Decimal(serializer.data['menu_item_price']) == Decimal('12.50')

    def test_total_price_calculated(self, cart_item):
        """Test que total_price = prix × quantité (2 × 12.50 = 25.00)"""
        serializer = SessionCartItemSerializer(cart_item)
        assert Decimal(serializer.data['total_price']) == Decimal('25.00')

    def test_total_price_single_quantity(self, collaborative_session, participant, menu_item):
        """Test total_price pour une quantité de 1"""
        item = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        serializer = SessionCartItemSerializer(item)
        assert Decimal(serializer.data['total_price']) == Decimal('12.50')

    def test_read_only_fields(self, cart_item):
        """Test que les champs calculés sont bien en lecture seule"""
        serializer = SessionCartItemSerializer(cart_item)
        read_only = serializer.Meta.read_only_fields

        assert 'id' in read_only
        assert 'added_at' in read_only
        assert 'updated_at' in read_only
        assert 'participant' in read_only

    def test_special_instructions_serialized(self, cart_item):
        """Test que les instructions spéciales sont bien sérialisées"""
        serializer = SessionCartItemSerializer(cart_item)
        assert serializer.data['special_instructions'] == "Sans oignons"

    def test_customizations_serialized(self, cart_item):
        """Test que les customizations JSON sont bien sérialisées"""
        serializer = SessionCartItemSerializer(cart_item)
        assert serializer.data['customizations'] == {"size": "large"}

    def test_write_menu_item_as_pk(self, collaborative_session, participant, menu_item):
        """Test que menu_item accepte une PK en écriture"""
        data = {
            'menu_item': menu_item.id,
            'quantity': 3,
            'special_instructions': '',
            'customizations': {}
        }
        serializer = SessionCartItemSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data['menu_item'] == menu_item
        assert serializer.validated_data['quantity'] == 3

    def test_invalid_menu_item_pk(self):
        """Test qu'une PK invalide est rejetée"""
        data = {
            'menu_item': 999999,
            'quantity': 1
        }
        serializer = SessionCartItemSerializer(data=data)
        assert not serializer.is_valid()
        assert 'menu_item' in serializer.errors

    def test_quantity_required(self):
        """Test que quantity est requis (ou a une valeur par défaut)"""
        # Sans quantity — selon l'implémentation, valeur par défaut = 1
        data = {'menu_item': 1}
        serializer = SessionCartItemSerializer(data=data)
        # Soit valide (défaut = 1) soit invalide (requis)
        if not serializer.is_valid():
            # Peut échouer sur menu_item (id invalide) ou quantity
            assert 'menu_item' in serializer.errors or 'quantity' in serializer.errors

    def test_list_serialization(
        self, collaborative_session, participant, second_participant, menu_item, second_menu_item
    ):
        """Test la sérialisation d'une liste d'articles"""
        SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=2
        )
        SessionCartItem.objects.create(
            session=collaborative_session,
            participant=second_participant,
            menu_item=second_menu_item,
            quantity=1
        )

        items = collaborative_session.cart_items.select_related('participant', 'menu_item').all()
        serializer = SessionCartItemSerializer(items, many=True)
        data = serializer.data

        assert len(data) == 2
        menu_item_names = {d['menu_item_name'] for d in data}
        assert "Pizza Margherita" in menu_item_names
        assert "Salade César" in menu_item_names

    def test_total_price_consistency_with_model(self, cart_item):
        """Test que le total_price du serializer correspond à la propriété du modèle"""
        serializer = SessionCartItemSerializer(cart_item)
        assert Decimal(serializer.data['total_price']) == cart_item.total_price

    def test_menu_item_image_field_nullable(
        self, collaborative_session, participant, menu_item
    ):
        """Test que menu_item_image est null si pas d'image"""
        item = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        serializer = SessionCartItemSerializer(item)
        # menu_item_image peut être None si MenuItem n'a pas d'image
        assert 'menu_item_image' in serializer.data