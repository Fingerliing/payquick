# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de paiement divisé
"""

import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from api.models import (
    SplitPaymentSession,
    SplitPaymentPortion,
    Order,
    Restaurant,
    Table,
    RestaurateurProfile,
)
from api.serializers.split_payment_serializers import (
    SplitPaymentPortionSerializer,
    CreateSplitPaymentPortionSerializer,
    SplitPaymentSessionSerializer,
    CreateSplitPaymentSessionSerializer,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="splituser", password="testpass123")


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
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        identifiant="SPLIT01"
    )


@pytest.fixture
def order(restaurateur_profile, restaurant, table):
    return Order.objects.create(
        restaurateur=restaurateur_profile,
        restaurant=restaurant,
        table=table,
        total_amount=Decimal('100.00'),
        subtotal=Decimal('90.00'),
        tax_amount=Decimal('10.00')
    )


@pytest.fixture
def split_session(order, user):
    return SplitPaymentSession.objects.create(
        order=order,
        split_type='equal',
        total_amount=Decimal('100.00'),
        tip_amount=Decimal('10.00'),
        created_by=user
    )


@pytest.fixture
def payment_portion(split_session):
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Personne 1",
        amount=Decimal('55.00')
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

    def test_amount_serialization(self, payment_portion):
        """Test de la sérialisation du montant"""
        serializer = SplitPaymentPortionSerializer(payment_portion)
        # Le montant doit être une string représentant un Decimal
        assert serializer.data['amount'] == '55.00'

    def test_read_only_fields(self, payment_portion):
        """Test des champs en lecture seule"""
        serializer = SplitPaymentPortionSerializer(payment_portion)
        read_only = serializer.Meta.read_only_fields
        
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
            'amount': Decimal('10000.00')  # Trop élevé
        }
        serializer = SplitPaymentPortionSerializer(data=data)
        assert not serializer.is_valid()
        assert 'amount' in serializer.errors


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

    def test_name_optional(self):
        """Test que le nom est optionnel"""
        data = {
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

    def test_computed_properties(self, split_session, payment_portion):
        """Test des propriétés calculées"""
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert data['is_completed'] is False
        assert data['total_paid'] == 0
        # remaining_amount = total_amount + tip_amount - total_paid
        # = 100 + 10 - 0 = 110
        assert Decimal(data['remaining_amount']) == Decimal('110.00')
        assert data['remaining_portions_count'] == 1

    def test_with_paid_portion(self, split_session):
        """Test avec une portion payée"""
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Payé",
            amount=Decimal('50.00'),
            is_paid=True
        )
        
        serializer = SplitPaymentSessionSerializer(split_session)
        data = serializer.data
        
        assert data['total_paid'] == Decimal('50.00')
        assert Decimal(data['remaining_amount']) == Decimal('60.00')


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

    def test_required_split_type(self, order):
        """Test que split_type est requis"""
        data = {
            'portions': [
                {'amount': Decimal('100.00')}
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
