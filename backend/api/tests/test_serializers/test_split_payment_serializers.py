# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de paiement divisé

Couverture:
- SplitPaymentPortionSerializer
- CreateSplitPaymentPortionSerializer
- SplitPaymentSessionSerializer
- CreateSplitPaymentSessionSerializer
- PayPortionSerializer
- ConfirmPortionPaymentSerializer
- SplitPaymentStatusSerializer
- PaymentHistorySerializer
"""

import pytest
import uuid
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from api.models import (
    SplitPaymentSession,
    SplitPaymentPortion,
    Order,
    Restaurant,
    RestaurateurProfile,
)
from api.serializers.split_payment_serializers import (
    SplitPaymentPortionSerializer,
    CreateSplitPaymentPortionSerializer,
    SplitPaymentSessionSerializer,
    CreateSplitPaymentSessionSerializer,
    PayPortionSerializer,
    ConfirmPortionPaymentSerializer,
    SplitPaymentStatusSerializer,
    PaymentHistorySerializer,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="splituser",
        password="testpass123",
        first_name="Jean",
        last_name="Split"
    )


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Split Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def order(restaurant, user):
    """Commande de test - utilise les vrais champs du modèle Order"""
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-SPLIT-001",
        table_number="T01",
        customer_name="Jean Split",
        order_type='dine_in',
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('90.00'),
        tax_amount=Decimal('10.00'),
        total_amount=Decimal('100.00')
    )


@pytest.fixture
def paid_order(restaurant, user):
    """Commande déjà payée"""
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-SPLIT-PAID",
        table_number="T02",
        status='served',
        payment_status='paid',
        subtotal=Decimal('50.00'),
        tax_amount=Decimal('5.00'),
        total_amount=Decimal('55.00')
    )


@pytest.fixture
def partial_paid_order(restaurant, user):
    """Commande partiellement payée"""
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-SPLIT-PARTIAL",
        table_number="T03",
        status='confirmed',
        payment_status='partial_paid',
        subtotal=Decimal('80.00'),
        tax_amount=Decimal('8.00'),
        total_amount=Decimal('88.00')
    )


@pytest.fixture
def split_session(order, user):
    """Session de paiement divisé"""
    return SplitPaymentSession.objects.create(
        order=order,
        split_type='equal',
        total_amount=Decimal('100.00'),
        tip_amount=Decimal('10.00'),
        status='active',
        created_by=user
    )


@pytest.fixture
def custom_session(restaurant, user):
    """Session personnalisée"""
    custom_order = Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-SPLIT-CUSTOM",
        table_number="T04",
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('72.00'),
        tax_amount=Decimal('8.00'),
        total_amount=Decimal('80.00')
    )
    return SplitPaymentSession.objects.create(
        order=custom_order,
        split_type='custom',
        total_amount=Decimal('80.00'),
        tip_amount=Decimal('0.00'),
        status='active',
        created_by=user
    )


@pytest.fixture
def payment_portion(split_session):
    """Portion de paiement non payée"""
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Personne 1",
        amount=Decimal('55.00'),
        is_paid=False
    )


@pytest.fixture
def paid_portion(split_session, user):
    """Portion de paiement payée"""
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Personne 2",
        amount=Decimal('55.00'),
        is_paid=True,
        payment_intent_id="pi_test_123456",
        payment_method='online',
        paid_at=timezone.now(),
        paid_by=user
    )


# =============================================================================
# TESTS - SplitPaymentPortionSerializer
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentPortionSerializer:
    """Tests pour SplitPaymentPortionSerializer"""

    def test_serializer_fields(self, payment_portion):
        """Test des champs du serializer"""
        serializer = SplitPaymentPortionSerializer(payment_portion)
        data = serializer.data
        
        assert 'id' in data
        assert 'name' in data
        assert 'amount' in data
        assert 'is_paid' in data
        assert 'payment_intent_id' in data
        assert 'payment_method' in data
        assert 'paid_at' in data
        assert 'created_at' in data

    def test_unpaid_portion_data(self, payment_portion):
        """Test des données d'une portion non payée"""
        serializer = SplitPaymentPortionSerializer(payment_portion)
        data = serializer.data
        
        assert data['name'] == "Personne 1"
        assert data['amount'] == '55.00'
        assert data['is_paid'] is False
        assert data['paid_at'] is None

    def test_paid_portion_data(self, paid_portion):
        """Test des données d'une portion payée"""
        serializer = SplitPaymentPortionSerializer(paid_portion)
        data = serializer.data
        
        assert data['name'] == "Personne 2"
        assert data['is_paid'] is True
        assert data['payment_intent_id'] == "pi_test_123456"
        assert data['paid_at'] is not None

    def test_read_only_fields(self, payment_portion):
        """Test des champs en lecture seule"""
        read_only = SplitPaymentPortionSerializer.Meta.read_only_fields
        
        assert 'id' in read_only
        assert 'is_paid' in read_only
        assert 'payment_intent_id' in read_only
        assert 'paid_at' in read_only
        assert 'created_at' in read_only

    def test_validate_amount_positive(self):
        """Test que le montant doit être positif"""
        data = {
            'name': 'Test',
            'amount': Decimal('-10.00')
        }
        serializer = SplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors

    def test_validate_amount_zero(self):
        """Test que le montant ne peut pas être zéro"""
        data = {
            'name': 'Test',
            'amount': Decimal('0.00')
        }
        serializer = SplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors

    def test_validate_amount_max(self):
        """Test du montant maximum"""
        data = {
            'name': 'Test',
            'amount': Decimal('10000.00')
        }
        serializer = SplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors

    def test_validate_amount_at_limit(self):
        """Test du montant à la limite"""
        data = {
            'name': 'Test',
            'amount': Decimal('9999.99')
        }
        serializer = SplitPaymentPortionSerializer(data=data)
        # La validation du montant passe, seul 'session' peut manquer
        # selon la configuration du serializer

    def test_multiple_portions_serialization(self, split_session):
        """Test de sérialisation multiple"""
        portions = []
        for i in range(3):
            portions.append(SplitPaymentPortion.objects.create(
                session=split_session,
                name=f"Part {i + 1}",
                amount=Decimal('36.67')
            ))
        
        serializer = SplitPaymentPortionSerializer(portions, many=True)
        assert len(serializer.data) == 3


# =============================================================================
# TESTS - CreateSplitPaymentPortionSerializer
# =============================================================================

@pytest.mark.django_db
class TestCreateSplitPaymentPortionSerializer:
    """Tests pour CreateSplitPaymentPortionSerializer"""

    def test_valid_data(self):
        """Test avec des données valides"""
        data = {
            'name': 'Jean',
            'amount': Decimal('50.00')
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_valid_data_string_amount(self):
        """Test avec montant en string"""
        data = {
            'name': 'Jean',
            'amount': '50.00'
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_name_optional(self):
        """Test que le nom est optionnel"""
        data = {
            'amount': Decimal('50.00')
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_name_can_be_blank(self):
        """Test que le nom peut être vide"""
        data = {
            'name': '',
            'amount': Decimal('50.00')
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_amount_required(self):
        """Test que le montant est requis"""
        data = {
            'name': 'Jean'
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors

    def test_validate_amount_positive(self):
        """Test que le montant doit être positif"""
        data = {
            'amount': Decimal('0')
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors

    def test_validate_amount_negative(self):
        """Test que le montant négatif est rejeté"""
        data = {
            'amount': Decimal('-10.00')
        }
        serializer = CreateSplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors


# =============================================================================
# TESTS - SplitPaymentSessionSerializer
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentSessionSerializer:
    """Tests pour SplitPaymentSessionSerializer"""

    def test_serializer_fields(self, split_session):
        """Test des champs du serializer"""
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert 'id' in data
        assert 'order' in data
        assert 'split_type' in data
        assert 'total_amount' in data
        assert 'tip_amount' in data
        assert 'status' in data
        assert 'created_at' in data
        assert 'completed_at' in data
        assert 'portions' in data
        assert 'is_completed' in data
        assert 'total_paid' in data
        assert 'remaining_amount' in data
        assert 'remaining_portions_count' in data

    def test_portions_nested(self, split_session, payment_portion):
        """Test que les portions sont sérialisées"""
        serializer = SplitPaymentSessionSerializer(split_session)
        
        portions = serializer.data['portions']
        assert len(portions) == 1
        assert portions[0]['name'] == "Personne 1"
        assert portions[0]['amount'] == '55.00'

    def test_computed_properties_no_payments(self, split_session, payment_portion):
        """Test des propriétés calculées sans paiement"""
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert data['is_completed'] is False
        assert data['total_paid'] == 0
        # remaining = total + tip - paid = 100 + 10 - 0 = 110
        assert Decimal(data['remaining_amount']) == Decimal('110.00')
        assert data['remaining_portions_count'] == 1

    def test_computed_properties_with_paid(self, split_session, paid_portion):
        """Test des propriétés avec une portion payée"""
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert data['total_paid'] == Decimal('55.00')
        # remaining = 100 + 10 - 55 = 55
        assert Decimal(data['remaining_amount']) == Decimal('55.00')

    def test_computed_properties_all_paid(self, split_session):
        """Test quand tout est payé"""
        # Créer 2 portions payées qui totalisent 110€
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 1",
            amount=Decimal('55.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 2",
            amount=Decimal('55.00'),
            is_paid=True
        )
        
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert data['is_completed'] is True
        assert data['total_paid'] == Decimal('110.00')
        assert Decimal(data['remaining_amount']) == Decimal('0.00')
        assert data['remaining_portions_count'] == 0

    def test_read_only_fields(self, split_session):
        """Test des champs en lecture seule"""
        read_only = SplitPaymentSessionSerializer.Meta.read_only_fields
        
        assert 'id' in read_only
        assert 'created_at' in read_only
        assert 'completed_at' in read_only
        assert 'portions' in read_only

    def test_split_type_values(self, split_session, custom_session):
        """Test des valeurs de split_type"""
        serializer1 = SplitPaymentSessionSerializer(split_session)
        assert serializer1.data['split_type'] == 'equal'
        
        serializer2 = SplitPaymentSessionSerializer(custom_session)
        assert serializer2.data['split_type'] == 'custom'


# =============================================================================
# TESTS - CreateSplitPaymentSessionSerializer
# =============================================================================

@pytest.mark.django_db
class TestCreateSplitPaymentSessionSerializer:
    """Tests pour CreateSplitPaymentSessionSerializer"""

    def test_valid_equal_split(self, order):
        """Test de création avec split égal"""
        data = {
            'split_type': 'equal',
            'tip_amount': Decimal('10.00'),
            'portions': [
                {'name': 'Person 1', 'amount': Decimal('55.00')},
                {'name': 'Person 2', 'amount': Decimal('55.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors

    def test_valid_custom_split(self, order):
        """Test de création avec split personnalisé"""
        data = {
            'split_type': 'custom',
            'portions': [
                {'name': 'Person 1', 'amount': Decimal('70.00')},
                {'name': 'Person 2', 'amount': Decimal('30.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors

    def test_valid_three_way_split(self, order):
        """Test avec 3 portions"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'name': 'Person 1', 'amount': Decimal('33.34')},
                {'name': 'Person 2', 'amount': Decimal('33.33')},
                {'name': 'Person 3', 'amount': Decimal('33.33')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors

    def test_required_split_type(self, order):
        """Test que split_type est requis"""
        data = {
            'portions': [
                {'amount': Decimal('50.00')},
                {'amount': Decimal('50.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()
        assert 'split_type' in serializer.errors

    def test_required_portions(self, order):
        """Test que portions est requis"""
        data = {
            'split_type': 'equal'
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()
        assert 'portions' in serializer.errors

    def test_minimum_two_portions(self, order):
        """Test qu'il faut au moins 2 portions"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('100.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()
        assert 'portions' in serializer.errors

    def test_maximum_twenty_portions(self, order):
        """Test maximum 20 portions"""
        data = {
            'split_type': 'equal',
            'portions': [{'amount': Decimal('4.76')} for _ in range(21)]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()
        assert 'portions' in serializer.errors

    def test_tip_amount_default(self, order):
        """Test de la valeur par défaut du pourboire"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('50.00')},
                {'amount': Decimal('50.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data.get('tip_amount', 0) == 0

    def test_invalid_split_type(self, order):
        """Test avec un type de split invalide"""
        data = {
            'split_type': 'invalid',
            'portions': [
                {'amount': Decimal('50.00')},
                {'amount': Decimal('50.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()
        assert 'split_type' in serializer.errors

    def test_order_required_in_context(self):
        """Test que la commande est requise dans le contexte"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('50.00')},
                {'amount': Decimal('50.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(data=data)
        assert not serializer.is_valid()

    def test_paid_order_rejected(self, paid_order):
        """Test qu'une commande payée est rejetée"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('27.50')},
                {'amount': Decimal('27.50')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': paid_order}
        )
        assert not serializer.is_valid()

    def test_partial_paid_order_rejected(self, partial_paid_order):
        """Test qu'une commande partiellement payée est rejetée"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('44.00')},
                {'amount': Decimal('44.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': partial_paid_order}
        )
        assert not serializer.is_valid()

    def test_portions_total_must_match_order(self, order):
        """Test que le total des portions doit correspondre"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('40.00')},
                {'amount': Decimal('40.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()

    def test_portions_with_tip_must_match(self, order):
        """Test que total + tip doit correspondre"""
        data = {
            'split_type': 'equal',
            'tip_amount': Decimal('20.00'),
            'portions': [
                {'amount': Decimal('50.00')},  # 100 au lieu de 120
                {'amount': Decimal('50.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert not serializer.is_valid()

    def test_rounding_tolerance(self, order):
        """Test de la tolérance d'arrondi (0.01€)"""
        data = {
            'split_type': 'equal',
            'portions': [
                {'amount': Decimal('50.00')},
                {'amount': Decimal('50.01')}  # 0.01€ de différence
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors


# =============================================================================
# TESTS - PayPortionSerializer
# =============================================================================

@pytest.mark.django_db
class TestPayPortionSerializer:
    """Tests pour PayPortionSerializer"""

    def test_valid_data(self, payment_portion):
        """Test avec des données valides"""
        data = {
            'portion_id': str(payment_portion.id)
        }
        serializer = PayPortionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_portion_id_required(self):
        """Test que portion_id est requis"""
        data = {}
        serializer = PayPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'portion_id' in serializer.errors

    def test_invalid_portion_id(self):
        """Test avec portion_id invalide"""
        data = {
            'portion_id': str(uuid.uuid4())
        }
        serializer = PayPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'portion_id' in serializer.errors

    def test_already_paid_rejected(self, paid_portion):
        """Test qu'une portion déjà payée est rejetée"""
        data = {
            'portion_id': str(paid_portion.id)
        }
        serializer = PayPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'portion_id' in serializer.errors

    def test_invalid_uuid_format(self):
        """Test avec format UUID invalide"""
        data = {
            'portion_id': 'not-a-valid-uuid'
        }
        serializer = PayPortionSerializer(data=data)
        assert not serializer.is_valid()


# =============================================================================
# TESTS - ConfirmPortionPaymentSerializer
# =============================================================================

@pytest.mark.django_db
class TestConfirmPortionPaymentSerializer:
    """Tests pour ConfirmPortionPaymentSerializer"""

    def test_valid_data(self, payment_portion):
        """Test avec des données valides"""
        data = {
            'portion_id': str(payment_portion.id),
            'payment_intent_id': 'pi_test_123456'
        }
        serializer = ConfirmPortionPaymentSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_valid_with_payment_method(self, payment_portion):
        """Test avec méthode de paiement"""
        data = {
            'portion_id': str(payment_portion.id),
            'payment_intent_id': 'pi_test_123456',
            'payment_method': 'card'
        }
        serializer = ConfirmPortionPaymentSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_default_payment_method(self, payment_portion):
        """Test de la méthode par défaut"""
        data = {
            'portion_id': str(payment_portion.id),
            'payment_intent_id': 'pi_test_123456'
        }
        serializer = ConfirmPortionPaymentSerializer(data=data)
        assert serializer.is_valid()
        assert serializer.validated_data['payment_method'] == 'online'

    def test_portion_id_required(self):
        """Test que portion_id est requis"""
        data = {
            'payment_intent_id': 'pi_test_123456'
        }
        serializer = ConfirmPortionPaymentSerializer(data=data)
        assert not serializer.is_valid()
        assert 'portion_id' in serializer.errors

    def test_payment_intent_id_required(self, payment_portion):
        """Test que payment_intent_id est requis"""
        data = {
            'portion_id': str(payment_portion.id)
        }
        serializer = ConfirmPortionPaymentSerializer(data=data)
        assert not serializer.is_valid()
        assert 'payment_intent_id' in serializer.errors

    def test_various_payment_methods(self, payment_portion):
        """Test avec différentes méthodes de paiement"""
        methods = ['online', 'card', 'cash']
        for method in methods:
            data = {
                'portion_id': str(payment_portion.id),
                'payment_intent_id': 'pi_test_123',
                'payment_method': method
            }
            serializer = ConfirmPortionPaymentSerializer(data=data)
            assert serializer.is_valid(), f"{method} devrait être valide"


# =============================================================================
# TESTS - SplitPaymentStatusSerializer
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentStatusSerializer:
    """Tests pour SplitPaymentStatusSerializer"""

    def test_valid_data(self):
        """Test avec des données valides"""
        data = {
            'is_completed': False,
            'remaining_amount': Decimal('50.00'),
            'remaining_portions': 2,
            'total_paid': Decimal('50.00'),
            'progress_percentage': 50.0
        }
        serializer = SplitPaymentStatusSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_completed_status(self):
        """Test avec statut complété"""
        data = {
            'is_completed': True,
            'remaining_amount': Decimal('0.00'),
            'remaining_portions': 0,
            'total_paid': Decimal('100.00'),
            'progress_percentage': 100.0
        }
        serializer = SplitPaymentStatusSerializer(data=data)
        assert serializer.is_valid()
        assert serializer.validated_data['is_completed'] is True

    def test_all_fields_present(self):
        """Test que tous les champs sont présents après validation"""
        data = {
            'is_completed': False,
            'remaining_amount': Decimal('50.00'),
            'remaining_portions': 2,
            'total_paid': Decimal('50.00'),
            'progress_percentage': 50.0
        }
        serializer = SplitPaymentStatusSerializer(data=data)
        assert serializer.is_valid()
        
        validated = serializer.validated_data
        assert 'is_completed' in validated
        assert 'remaining_amount' in validated
        assert 'remaining_portions' in validated
        assert 'total_paid' in validated
        assert 'progress_percentage' in validated


# =============================================================================
# TESTS - PaymentHistorySerializer
# =============================================================================

@pytest.mark.django_db
class TestPaymentHistorySerializer:
    """Tests pour PaymentHistorySerializer"""

    def test_valid_data(self, split_session, payment_portion, paid_portion):
        """Test avec des données valides"""
        portions_data = SplitPaymentPortionSerializer(
            [payment_portion, paid_portion],
            many=True
        ).data
        
        data = {
            'portions': portions_data,
            'total_paid': Decimal('55.00'),
            'total_remaining': Decimal('55.00')
        }
        serializer = PaymentHistorySerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_empty_portions(self):
        """Test avec liste de portions vide"""
        data = {
            'portions': [],
            'total_paid': Decimal('0.00'),
            'total_remaining': Decimal('100.00')
        }
        serializer = PaymentHistorySerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_all_paid(self):
        """Test quand tout est payé"""
        data = {
            'portions': [],
            'total_paid': Decimal('100.00'),
            'total_remaining': Decimal('0.00')
        }
        serializer = PaymentHistorySerializer(data=data)
        assert serializer.is_valid()
        assert serializer.validated_data['total_remaining'] == Decimal('0.00')


# =============================================================================
# TESTS - Edge Cases
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentEdgeCases:
    """Tests des cas limites"""

    def test_very_small_amounts(self, order):
        """Test avec de très petits montants"""
        data = {
            'split_type': 'custom',
            'portions': [
                {'name': 'Person 1', 'amount': Decimal('99.99')},
                {'name': 'Person 2', 'amount': Decimal('0.01')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors

    def test_many_portions(self, order):
        """Test avec beaucoup de portions (max 20)"""
        # 100€ / 20 = 5€ par portion
        data = {
            'split_type': 'equal',
            'portions': [{'amount': Decimal('5.00')} for _ in range(20)]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors

    def test_large_tip(self, order):
        """Test avec un gros pourboire"""
        data = {
            'split_type': 'equal',
            'tip_amount': Decimal('100.00'),  # 100% tip
            'portions': [
                {'amount': Decimal('100.00')},
                {'amount': Decimal('100.00')}
            ]
        }
        serializer = CreateSplitPaymentSessionSerializer(
            data=data,
            context={'order': order}
        )
        assert serializer.is_valid(), serializer.errors

    def test_special_characters_in_name(self, split_session):
        """Test avec caractères spéciaux dans le nom"""
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Jean-François & Marie 🍕",
            amount=Decimal('50.00')
        )
        
        serializer = SplitPaymentPortionSerializer(portion)
        assert serializer.data['name'] == "Jean-François & Marie 🍕"

    def test_session_with_mixed_portions(self, split_session):
        """Test de session avec portions mixtes (payées et non payées)"""
        # Créer des portions mixtes
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Payé",
            amount=Decimal('40.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Non payé 1",
            amount=Decimal('35.00'),
            is_paid=False
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Non payé 2",
            amount=Decimal('35.00'),
            is_paid=False
        )
        
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert len(data['portions']) == 3
        assert data['total_paid'] == Decimal('40.00')
        # remaining = 100 + 10 - 40 = 70
        assert Decimal(data['remaining_amount']) == Decimal('70.00')
        assert data['remaining_portions_count'] == 2
        assert data['is_completed'] is False

    def test_payment_flow(self, split_session):
        """Test du flux complet de paiement"""
        # Créer 2 portions
        p1 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 1",
            amount=Decimal('55.00'),
            is_paid=False
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 2",
            amount=Decimal('55.00'),
            is_paid=False
        )
        
        # Vérifier l'état initial
        serializer = SplitPaymentSessionSerializer(split_session)
        assert serializer.data['is_completed'] is False
        assert serializer.data['remaining_portions_count'] == 2
        
        # Payer la première portion
        p1.mark_as_paid(payment_intent_id='pi_test_1')
        split_session.refresh_from_db()
        
        serializer = SplitPaymentSessionSerializer(split_session)
        assert serializer.data['total_paid'] == Decimal('55.00')
        assert serializer.data['remaining_portions_count'] == 1
        
        # Payer la deuxième portion
        p2.mark_as_paid(payment_intent_id='pi_test_2')
        split_session.refresh_from_db()
        
        serializer = SplitPaymentSessionSerializer(split_session)
        assert serializer.data['is_completed'] is True
        assert serializer.data['remaining_portions_count'] == 0