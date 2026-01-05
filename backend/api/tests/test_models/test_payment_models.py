# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de paiement
- SplitPaymentSession
- SplitPaymentPortion
"""

import pytest
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth.models import User
from api.models import (
    SplitPaymentSession,
    SplitPaymentPortion,
    Order,
    Restaurant,
    Table,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="paymentuser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="secondpaymentuser", password="testpass123")


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Payment Test Restaurant",
        description="Restaurant de test paiement",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        identifiant="PAY01"
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
def split_payment_session(order, user):
    return SplitPaymentSession.objects.create(
        order=order,
        split_type='equal',
        total_amount=Decimal('100.00'),
        tip_amount=Decimal('10.00'),
        created_by=user
    )


@pytest.fixture
def payment_portion(split_payment_session):
    return SplitPaymentPortion.objects.create(
        session=split_payment_session,
        name="Personne 1",
        amount=Decimal('55.00')
    )


# =============================================================================
# TESTS - SplitPaymentSession
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentSession:
    """Tests pour le modèle SplitPaymentSession"""

    def test_session_creation(self, split_payment_session):
        """Test de la création d'une session de paiement divisé"""
        assert split_payment_session.id is not None
        assert split_payment_session.split_type == 'equal'
        assert split_payment_session.total_amount == Decimal('100.00')
        assert split_payment_session.tip_amount == Decimal('10.00')
        assert split_payment_session.status == 'active'
        assert split_payment_session.created_at is not None

    def test_session_str_method(self, split_payment_session, order):
        """Test de la méthode __str__"""
        expected = f"Split Payment #{order.id} - equal"
        assert str(split_payment_session) == expected

    def test_split_type_choices(self, order, user):
        """Test des choix de type de split"""
        # Equal
        session_equal = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            created_by=user
        )
        assert session_equal.split_type == 'equal'

    def test_is_completed_property_no_portions(self, split_payment_session):
        """Test is_completed quand il n'y a pas de portions"""
        assert split_payment_session.is_completed is False

    def test_is_completed_property_with_unpaid_portions(self, split_payment_session):
        """Test is_completed avec des portions non payées"""
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Test",
            amount=Decimal('50.00'),
            is_paid=False
        )
        assert split_payment_session.is_completed is False

    def test_is_completed_property_all_paid(self, split_payment_session):
        """Test is_completed quand toutes les portions sont payées"""
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Test 1",
            amount=Decimal('55.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Test 2",
            amount=Decimal('55.00'),
            is_paid=True
        )
        assert split_payment_session.is_completed is True

    def test_is_completed_with_status_completed(self, split_payment_session):
        """Test is_completed quand le status est 'completed'"""
        split_payment_session.status = 'completed'
        split_payment_session.save()
        assert split_payment_session.is_completed is True

    def test_total_paid_property(self, split_payment_session):
        """Test de la propriété total_paid"""
        assert split_payment_session.total_paid == 0
        
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Paid",
            amount=Decimal('30.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Unpaid",
            amount=Decimal('25.00'),
            is_paid=False
        )
        
        assert split_payment_session.total_paid == Decimal('30.00')

    def test_remaining_amount_property(self, split_payment_session):
        """Test de la propriété remaining_amount"""
        # Total: 100 + tip: 10 = 110
        assert split_payment_session.remaining_amount == Decimal('110.00')
        
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Paid",
            amount=Decimal('60.00'),
            is_paid=True
        )
        
        assert split_payment_session.remaining_amount == Decimal('50.00')

    def test_remaining_portions_count_property(self, split_payment_session):
        """Test de la propriété remaining_portions_count"""
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Paid",
            amount=Decimal('30.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Unpaid 1",
            amount=Decimal('40.00'),
            is_paid=False
        )
        SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Unpaid 2",
            amount=Decimal('40.00'),
            is_paid=False
        )
        
        assert split_payment_session.remaining_portions_count == 2

    def test_mark_as_completed(self, split_payment_session, order):
        """Test de la méthode mark_as_completed"""
        assert split_payment_session.status == 'active'
        assert split_payment_session.completed_at is None
        
        split_payment_session.mark_as_completed()
        
        assert split_payment_session.status == 'completed'
        assert split_payment_session.completed_at is not None
        
        # Vérifier que la commande est marquée comme payée
        order.refresh_from_db()
        assert order.payment_status == 'paid'

    def test_one_to_one_with_order(self, order, user):
        """Test que la relation avec Order est OneToOne"""
        SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            created_by=user
        )
        
        with pytest.raises(Exception):  # IntegrityError
            SplitPaymentSession.objects.create(
                order=order,
                split_type='custom',
                total_amount=Decimal('100.00'),
                created_by=user
            )


# =============================================================================
# TESTS - SplitPaymentPortion
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentPortion:
    """Tests pour le modèle SplitPaymentPortion"""

    def test_portion_creation(self, payment_portion):
        """Test de la création d'une portion de paiement"""
        assert payment_portion.id is not None
        assert payment_portion.name == "Personne 1"
        assert payment_portion.amount == Decimal('55.00')
        assert payment_portion.is_paid is False
        assert payment_portion.created_at is not None

    def test_portion_str_unpaid(self, payment_portion):
        """Test de __str__ pour une portion non payée"""
        result = str(payment_portion)
        assert "Personne 1" in result
        assert "55.00€" in result
        assert "En attente" in result

    def test_portion_str_paid(self, payment_portion):
        """Test de __str__ pour une portion payée"""
        payment_portion.is_paid = True
        payment_portion.save()
        
        result = str(payment_portion)
        assert "Payé" in result

    def test_portion_str_anonymous(self, split_payment_session):
        """Test de __str__ pour une portion anonyme"""
        portion = SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="",
            amount=Decimal('25.00')
        )
        assert "Anonyme" in str(portion)

    def test_mark_as_paid(self, payment_portion, user):
        """Test de la méthode mark_as_paid"""
        assert payment_portion.is_paid is False
        assert payment_portion.paid_at is None
        
        payment_portion.mark_as_paid(
            payment_intent_id="pi_test_123",
            user=user,
            payment_method='card'
        )
        
        assert payment_portion.is_paid is True
        assert payment_portion.paid_at is not None
        assert payment_portion.payment_intent_id == "pi_test_123"
        assert payment_portion.paid_by == user
        assert payment_portion.payment_method == 'card'

    def test_mark_as_paid_completes_session(self, split_payment_session):
        """Test que mark_as_paid complète la session si toutes les portions sont payées"""
        portion1 = SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="P1",
            amount=Decimal('55.00'),
            is_paid=True
        )
        portion2 = SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="P2",
            amount=Decimal('55.00')
        )
        
        assert split_payment_session.status == 'active'
        
        portion2.mark_as_paid(payment_intent_id="pi_test")
        
        split_payment_session.refresh_from_db()
        assert split_payment_session.status == 'completed'

    def test_default_payment_method(self, payment_portion):
        """Test de la méthode de paiement par défaut"""
        payment_portion.mark_as_paid(payment_intent_id="pi_test")
        assert payment_portion.payment_method == 'online'

    def test_multiple_portions_per_session(self, split_payment_session):
        """Test de plusieurs portions par session"""
        portions = []
        for i in range(4):
            portion = SplitPaymentPortion.objects.create(
                session=split_payment_session,
                name=f"Personne {i+1}",
                amount=Decimal('27.50')
            )
            portions.append(portion)
        
        assert split_payment_session.portions.count() == 4
        total = sum(p.amount for p in portions)
        assert total == Decimal('110.00')

    def test_portion_ordering(self, split_payment_session):
        """Test que les portions sont ordonnées par date de création"""
        p1 = SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="First",
            amount=Decimal('30.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_payment_session,
            name="Second",
            amount=Decimal('30.00')
        )
        
        portions = list(split_payment_session.portions.all())
        assert portions[0].name == "First"
        assert portions[1].name == "Second"
