# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles et serializers de paiement

Couverture:
- SplitPaymentSession (modèle)
- SplitPaymentPortion (modèle)
- Propriétés calculées
- Méthodes de marquage de paiement
- Flux de paiement complets
- Cas limites et edge cases

Note: Ce fichier teste principalement les modèles de payment_models.py
car payment_serializers.py est actuellement un placeholder pour des
modèles Payment indépendants futurs.
"""

import pytest
import uuid
from decimal import Decimal
from datetime import timedelta
from django.contrib.auth.models import User
from django.utils import timezone
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from api.models import (
    SplitPaymentSession,
    SplitPaymentPortion,
    Order,
    Restaurant,
    RestaurateurProfile,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    """Utilisateur de test"""
    return User.objects.create_user(
        username="paymentuser",
        email="payment@test.com",
        password="testpass123",
        first_name="Payment",
        last_name="User"
    )


@pytest.fixture
def second_user():
    """Second utilisateur pour tests multi-utilisateurs"""
    return User.objects.create_user(
        username="seconduser",
        email="second@test.com",
        password="testpass123",
        first_name="Second",
        last_name="User"
    )


@pytest.fixture
def restaurateur_profile(user):
    """Profil restaurateur de test"""
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    """Restaurant de test"""
    return Restaurant.objects.create(
        name="Payment Test Restaurant",
        description="Restaurant pour tests de paiement",
        owner=restaurateur_profile,
        siret="98765432109876",
        is_active=True
    )


@pytest.fixture
def order(restaurant, user):
    """Commande de test standard"""
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-PAY-001",
        table_number="T01",
        customer_name="Payment Test",
        order_type='dine_in',
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('90.00'),
        tax_amount=Decimal('10.00'),
        total_amount=Decimal('100.00')
    )


@pytest.fixture
def order_small(restaurant, user):
    """Petite commande de test"""
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-PAY-SMALL",
        table_number="T02",
        customer_name="Small Order",
        order_type='dine_in',
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('9.00'),
        tax_amount=Decimal('1.00'),
        total_amount=Decimal('10.00')
    )


@pytest.fixture
def order_large(restaurant, user):
    """Grande commande de test"""
    return Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-PAY-LARGE",
        table_number="T03",
        customer_name="Large Order",
        order_type='dine_in',
        status='confirmed',
        payment_status='pending',
        subtotal=Decimal('900.00'),
        tax_amount=Decimal('100.00'),
        total_amount=Decimal('1000.00')
    )


@pytest.fixture
def split_session(order, user):
    """Session de paiement divisé de base"""
    return SplitPaymentSession.objects.create(
        order=order,
        split_type='equal',
        total_amount=Decimal('100.00'),
        tip_amount=Decimal('10.00'),
        status='active',
        created_by=user
    )


@pytest.fixture
def custom_split_session(order_large, user):
    """Session de paiement personnalisé"""
    return SplitPaymentSession.objects.create(
        order=order_large,
        split_type='custom',
        total_amount=Decimal('1000.00'),
        tip_amount=Decimal('50.00'),
        status='active',
        created_by=user
    )


@pytest.fixture
def completed_session(restaurant, user):
    """Session de paiement complétée"""
    completed_order = Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-PAY-COMP",
        table_number="T04",
        status='served',
        payment_status='paid',
        subtotal=Decimal('45.00'),
        tax_amount=Decimal('5.00'),
        total_amount=Decimal('50.00')
    )
    session = SplitPaymentSession.objects.create(
        order=completed_order,
        split_type='equal',
        total_amount=Decimal('50.00'),
        tip_amount=Decimal('0.00'),
        status='completed',
        created_by=user,
        completed_at=timezone.now()
    )
    return session


@pytest.fixture
def cancelled_session(restaurant, user):
    """Session de paiement annulée"""
    cancelled_order = Order.objects.create(
        restaurant=restaurant,
        user=user,
        order_number="ORD-PAY-CANCEL",
        table_number="T05",
        status='cancelled',
        payment_status='pending',
        subtotal=Decimal('30.00'),
        tax_amount=Decimal('3.00'),
        total_amount=Decimal('33.00')
    )
    session = SplitPaymentSession.objects.create(
        order=cancelled_order,
        split_type='equal',
        total_amount=Decimal('33.00'),
        tip_amount=Decimal('0.00'),
        status='cancelled',
        created_by=user,
        cancelled_at=timezone.now()
    )
    return session


@pytest.fixture
def payment_portion(split_session):
    """Portion de paiement non payée"""
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Portion 1",
        amount=Decimal('55.00'),
        is_paid=False
    )


@pytest.fixture
def second_portion(split_session):
    """Seconde portion non payée"""
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Portion 2",
        amount=Decimal('55.00'),
        is_paid=False
    )


@pytest.fixture
def paid_portion(split_session, user):
    """Portion de paiement payée"""
    return SplitPaymentPortion.objects.create(
        session=split_session,
        name="Portion Payée",
        amount=Decimal('55.00'),
        is_paid=True,
        payment_intent_id="pi_test_paid_123",
        payment_method='online',
        paid_at=timezone.now(),
        paid_by=user
    )


# =============================================================================
# TESTS - SplitPaymentSession Model
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentSessionModel:
    """Tests pour le modèle SplitPaymentSession"""

    def test_create_session(self, order, user):
        """Test de création d'une session"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            tip_amount=Decimal('5.00'),
            created_by=user
        )
        
        assert session.id is not None
        assert session.order == order
        assert session.split_type == 'equal'
        assert session.total_amount == Decimal('100.00')
        assert session.tip_amount == Decimal('5.00')
        assert session.status == 'active'
        assert session.created_by == user

    def test_session_uuid_primary_key(self, split_session):
        """Test que l'ID est un UUID"""
        assert isinstance(split_session.id, uuid.UUID)

    def test_session_default_status(self, order):
        """Test du statut par défaut"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00')
        )
        assert session.status == 'active'

    def test_session_default_tip(self, order):
        """Test du pourboire par défaut"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00')
        )
        assert session.tip_amount == Decimal('0.00')

    def test_session_str_representation(self, split_session):
        """Test de la représentation string"""
        expected = f"Split Payment #{split_session.order.id} - equal"
        assert str(split_session) == expected

    def test_session_created_at_auto(self, order):
        """Test que created_at est automatique"""
        before = timezone.now()
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00')
        )
        after = timezone.now()
        
        assert session.created_at is not None
        assert before <= session.created_at <= after

    def test_split_type_choices(self, order):
        """Test des choix de split_type"""
        # Equal
        session_equal = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00')
        )
        assert session_equal.split_type == 'equal'

    def test_status_choices(self, split_session):
        """Test des choix de status"""
        valid_statuses = ['active', 'completed', 'cancelled']
        
        for status in valid_statuses:
            split_session.status = status
            split_session.save()
            split_session.refresh_from_db()
            assert split_session.status == status

    def test_one_to_one_order_relationship(self, order, user):
        """Test de la relation OneToOne avec Order"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            created_by=user
        )
        
        # Vérifier qu'on peut accéder à la session depuis la commande
        assert order.split_payment_session == session
        
        # Vérifier qu'on ne peut pas créer une deuxième session pour la même commande
        with pytest.raises(IntegrityError):
            SplitPaymentSession.objects.create(
                order=order,
                split_type='custom',
                total_amount=Decimal('100.00')
            )

    def test_session_without_user(self, order):
        """Test de création sans utilisateur"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            created_by=None
        )
        assert session.created_by is None


# =============================================================================
# TESTS - SplitPaymentSession Properties
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentSessionProperties:
    """Tests pour les propriétés calculées de SplitPaymentSession"""

    def test_is_completed_no_portions(self, split_session):
        """Test is_completed sans portions"""
        assert split_session.is_completed is False

    def test_is_completed_with_unpaid_portions(self, split_session, payment_portion):
        """Test is_completed avec portions non payées"""
        assert split_session.is_completed is False

    def test_is_completed_all_paid(self, split_session, user):
        """Test is_completed quand tout est payé"""
        # Créer et payer toutes les portions
        p1 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 1",
            amount=Decimal('55.00'),
            is_paid=True
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 2",
            amount=Decimal('55.00'),
            is_paid=True
        )
        
        assert split_session.is_completed is True

    def test_is_completed_status_completed(self, completed_session):
        """Test is_completed avec status = completed"""
        assert completed_session.is_completed is True

    def test_is_completed_mixed_portions(self, split_session, payment_portion, paid_portion):
        """Test is_completed avec portions mixtes"""
        assert split_session.is_completed is False

    def test_total_paid_no_portions(self, split_session):
        """Test total_paid sans portions"""
        assert split_session.total_paid == 0

    def test_total_paid_no_payments(self, split_session, payment_portion, second_portion):
        """Test total_paid sans paiements"""
        assert split_session.total_paid == 0

    def test_total_paid_with_payments(self, split_session, paid_portion):
        """Test total_paid avec paiements"""
        assert split_session.total_paid == Decimal('55.00')

    def test_total_paid_multiple_payments(self, split_session, user):
        """Test total_paid avec plusieurs paiements"""
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 1",
            amount=Decimal('40.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 2",
            amount=Decimal('35.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 3",
            amount=Decimal('35.00'),
            is_paid=False
        )
        
        assert split_session.total_paid == Decimal('75.00')

    def test_remaining_amount_no_payments(self, split_session, payment_portion):
        """Test remaining_amount sans paiements"""
        # total = 100, tip = 10, paid = 0 => remaining = 110
        assert split_session.remaining_amount == Decimal('110.00')

    def test_remaining_amount_partial_payment(self, split_session, paid_portion, payment_portion):
        """Test remaining_amount avec paiement partiel"""
        # total = 100, tip = 10, paid = 55 => remaining = 55
        assert split_session.remaining_amount == Decimal('55.00')

    def test_remaining_amount_all_paid(self, split_session, user):
        """Test remaining_amount quand tout est payé"""
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
        
        assert split_session.remaining_amount == Decimal('0.00')

    def test_remaining_amount_no_tip(self, order_small, user):
        """Test remaining_amount sans pourboire"""
        session = SplitPaymentSession.objects.create(
            order=order_small,
            split_type='equal',
            total_amount=Decimal('10.00'),
            tip_amount=Decimal('0.00'),
            created_by=user
        )
        SplitPaymentPortion.objects.create(
            session=session,
            name="Part 1",
            amount=Decimal('5.00'),
            is_paid=True
        )
        
        assert session.remaining_amount == Decimal('5.00')

    def test_remaining_portions_count_no_portions(self, split_session):
        """Test remaining_portions_count sans portions"""
        assert split_session.remaining_portions_count == 0

    def test_remaining_portions_count_all_unpaid(self, split_session, payment_portion, second_portion):
        """Test remaining_portions_count toutes non payées"""
        assert split_session.remaining_portions_count == 2

    def test_remaining_portions_count_mixed(self, split_session, paid_portion, payment_portion):
        """Test remaining_portions_count mixte"""
        assert split_session.remaining_portions_count == 1

    def test_remaining_portions_count_all_paid(self, split_session):
        """Test remaining_portions_count toutes payées"""
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
        
        assert split_session.remaining_portions_count == 0


# =============================================================================
# TESTS - SplitPaymentSession Methods
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentSessionMethods:
    """Tests pour les méthodes de SplitPaymentSession"""

    def test_mark_as_completed(self, split_session):
        """Test de mark_as_completed"""
        before = timezone.now()
        split_session.mark_as_completed()
        after = timezone.now()
        
        split_session.refresh_from_db()
        
        assert split_session.status == 'completed'
        assert split_session.completed_at is not None
        assert before <= split_session.completed_at <= after

    def test_mark_as_completed_updates_order(self, split_session):
        """Test que mark_as_completed met à jour la commande"""
        split_session.mark_as_completed()
        
        split_session.order.refresh_from_db()
        assert split_session.order.payment_status == 'paid'

    def test_mark_as_completed_idempotent(self, split_session):
        """Test que mark_as_completed est idempotent"""
        split_session.mark_as_completed()
        first_completed_at = split_session.completed_at
        
        split_session.mark_as_completed()
        
        # completed_at devrait être mis à jour
        assert split_session.completed_at >= first_completed_at


# =============================================================================
# TESTS - SplitPaymentPortion Model
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentPortionModel:
    """Tests pour le modèle SplitPaymentPortion"""

    def test_create_portion(self, split_session):
        """Test de création d'une portion"""
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Test Portion",
            amount=Decimal('50.00')
        )
        
        assert portion.id is not None
        assert portion.session == split_session
        assert portion.name == "Test Portion"
        assert portion.amount == Decimal('50.00')
        assert portion.is_paid is False

    def test_portion_uuid_primary_key(self, payment_portion):
        """Test que l'ID est un UUID"""
        assert isinstance(payment_portion.id, uuid.UUID)

    def test_portion_default_values(self, split_session):
        """Test des valeurs par défaut"""
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            amount=Decimal('50.00')
        )
        
        assert portion.name == ''
        assert portion.is_paid is False
        assert portion.payment_intent_id is None
        assert portion.payment_method == 'online'
        assert portion.paid_at is None
        assert portion.paid_by is None

    def test_portion_str_representation_unpaid(self, payment_portion):
        """Test de la représentation string non payée"""
        expected = "Portion 1 - 55.00€ (En attente)"
        assert str(payment_portion) == expected

    def test_portion_str_representation_paid(self, paid_portion):
        """Test de la représentation string payée"""
        expected = "Portion Payée - 55.00€ (Payé)"
        assert str(paid_portion) == expected

    def test_portion_str_anonymous(self, split_session):
        """Test de la représentation string anonyme"""
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            name="",
            amount=Decimal('25.00')
        )
        expected = "Anonyme - 25.00€ (En attente)"
        assert str(portion) == expected

    def test_portion_timestamps(self, split_session):
        """Test des timestamps automatiques"""
        before = timezone.now()
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            amount=Decimal('50.00')
        )
        after = timezone.now()
        
        assert portion.created_at is not None
        assert portion.updated_at is not None
        assert before <= portion.created_at <= after

    def test_portion_updated_at_changes(self, payment_portion):
        """Test que updated_at change lors d'une mise à jour"""
        old_updated = payment_portion.updated_at
        
        # Attendre un instant pour garantir une différence de temps
        import time
        time.sleep(0.01)
        
        payment_portion.name = "Updated Name"
        payment_portion.save()
        
        assert payment_portion.updated_at > old_updated

    def test_portion_ordering(self, split_session):
        """Test de l'ordre des portions"""
        import time
        
        p1 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="First",
            amount=Decimal('30.00')
        )
        time.sleep(0.01)
        p2 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Second",
            amount=Decimal('30.00')
        )
        time.sleep(0.01)
        p3 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Third",
            amount=Decimal('30.00')
        )
        
        portions = list(split_session.portions.all())
        assert portions[0].name == "First"
        assert portions[1].name == "Second"
        assert portions[2].name == "Third"


# =============================================================================
# TESTS - SplitPaymentPortion Methods
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentPortionMethods:
    """Tests pour les méthodes de SplitPaymentPortion"""

    def test_mark_as_paid_basic(self, payment_portion):
        """Test de mark_as_paid basique"""
        before = timezone.now()
        payment_portion.mark_as_paid(payment_intent_id='pi_test_123')
        after = timezone.now()
        
        payment_portion.refresh_from_db()
        
        assert payment_portion.is_paid is True
        assert payment_portion.payment_intent_id == 'pi_test_123'
        assert payment_portion.paid_at is not None
        assert before <= payment_portion.paid_at <= after

    def test_mark_as_paid_with_user(self, payment_portion, user):
        """Test de mark_as_paid avec utilisateur"""
        payment_portion.mark_as_paid(
            payment_intent_id='pi_test_123',
            user=user
        )
        
        payment_portion.refresh_from_db()
        assert payment_portion.paid_by == user

    def test_mark_as_paid_with_payment_method(self, payment_portion):
        """Test de mark_as_paid avec méthode de paiement"""
        payment_portion.mark_as_paid(
            payment_intent_id='pi_test_123',
            payment_method='card'
        )
        
        payment_portion.refresh_from_db()
        assert payment_portion.payment_method == 'card'

    def test_mark_as_paid_default_payment_method(self, payment_portion):
        """Test de la méthode de paiement par défaut"""
        payment_portion.mark_as_paid(payment_intent_id='pi_test_123')
        
        payment_portion.refresh_from_db()
        assert payment_portion.payment_method == 'online'

    def test_mark_as_paid_without_payment_intent(self, payment_portion):
        """Test de mark_as_paid sans payment_intent"""
        payment_portion.mark_as_paid()
        
        payment_portion.refresh_from_db()
        assert payment_portion.is_paid is True
        assert payment_portion.payment_intent_id is None

    def test_mark_as_paid_completes_session(self, split_session, user):
        """Test que le dernier paiement complète la session"""
        # Créer deux portions
        p1 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 1",
            amount=Decimal('55.00'),
            is_paid=True  # Déjà payée
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 2",
            amount=Decimal('55.00'),
            is_paid=False
        )
        
        # Vérifier que la session n'est pas complète
        assert split_session.is_completed is False
        
        # Payer la dernière portion
        p2.mark_as_paid(payment_intent_id='pi_test_final')
        
        split_session.refresh_from_db()
        assert split_session.status == 'completed'
        assert split_session.completed_at is not None

    def test_mark_as_paid_does_not_complete_early(self, split_session):
        """Test que la session ne se complète pas prématurément"""
        # Créer trois portions
        p1 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 1",
            amount=Decimal('36.67')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 2",
            amount=Decimal('36.67')
        )
        p3 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Part 3",
            amount=Decimal('36.66')
        )
        
        # Payer la première portion
        p1.mark_as_paid(payment_intent_id='pi_test_1')
        
        split_session.refresh_from_db()
        assert split_session.status == 'active'
        
        # Payer la deuxième portion
        p2.mark_as_paid(payment_intent_id='pi_test_2')
        
        split_session.refresh_from_db()
        assert split_session.status == 'active'
        
        # Payer la troisième portion
        p3.mark_as_paid(payment_intent_id='pi_test_3')
        
        split_session.refresh_from_db()
        assert split_session.status == 'completed'


# =============================================================================
# TESTS - Payment Flow Integration
# =============================================================================

@pytest.mark.django_db
class TestPaymentFlowIntegration:
    """Tests d'intégration du flux de paiement"""

    def test_complete_equal_split_flow(self, order, user, second_user):
        """Test du flux complet de split égal"""
        # 1. Créer la session
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            tip_amount=Decimal('10.00'),
            created_by=user
        )
        
        # 2. Créer les portions (2 personnes, 55€ chacune)
        p1 = SplitPaymentPortion.objects.create(
            session=session,
            name="User 1",
            amount=Decimal('55.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=session,
            name="User 2",
            amount=Decimal('55.00')
        )
        
        # 3. Vérifier l'état initial
        assert session.is_completed is False
        assert session.total_paid == 0
        assert session.remaining_amount == Decimal('110.00')
        assert session.remaining_portions_count == 2
        
        # 4. Premier paiement
        p1.mark_as_paid(payment_intent_id='pi_user1', user=user)
        
        session.refresh_from_db()
        assert session.total_paid == Decimal('55.00')
        assert session.remaining_amount == Decimal('55.00')
        assert session.remaining_portions_count == 1
        assert session.status == 'active'
        
        # 5. Deuxième paiement
        p2.mark_as_paid(payment_intent_id='pi_user2', user=second_user)
        
        session.refresh_from_db()
        order.refresh_from_db()
        
        assert session.is_completed is True
        assert session.total_paid == Decimal('110.00')
        assert session.remaining_amount == Decimal('0.00')
        assert session.remaining_portions_count == 0
        assert session.status == 'completed'
        assert order.payment_status == 'paid'

    def test_custom_split_flow(self, order, user):
        """Test du flux de split personnalisé"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='custom',
            total_amount=Decimal('100.00'),
            tip_amount=Decimal('0.00'),
            created_by=user
        )
        
        # Portions inégales
        p1 = SplitPaymentPortion.objects.create(
            session=session,
            name="Heavy Eater",
            amount=Decimal('70.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=session,
            name="Light Eater",
            amount=Decimal('30.00')
        )
        
        # Payer les deux
        p1.mark_as_paid(payment_intent_id='pi_heavy')
        p2.mark_as_paid(payment_intent_id='pi_light')
        
        session.refresh_from_db()
        assert session.is_completed is True
        assert session.total_paid == Decimal('100.00')

    def test_three_way_split_with_rounding(self, order, user):
        """Test du split à 3 avec arrondis"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            tip_amount=Decimal('0.00'),
            created_by=user
        )
        
        # 100€ / 3 = 33.33€ avec arrondi
        p1 = SplitPaymentPortion.objects.create(
            session=session, name="P1", amount=Decimal('33.34')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=session, name="P2", amount=Decimal('33.33')
        )
        p3 = SplitPaymentPortion.objects.create(
            session=session, name="P3", amount=Decimal('33.33')
        )
        
        # Vérifier le total
        total_portions = p1.amount + p2.amount + p3.amount
        assert total_portions == Decimal('100.00')
        
        # Payer toutes les portions
        for p in [p1, p2, p3]:
            p.mark_as_paid()
        
        session.refresh_from_db()
        assert session.is_completed is True

    def test_large_group_split(self, order_large, user):
        """Test du split pour un grand groupe"""
        session = SplitPaymentSession.objects.create(
            order=order_large,
            split_type='equal',
            total_amount=Decimal('1000.00'),
            tip_amount=Decimal('100.00'),
            created_by=user
        )
        
        # 10 personnes, 110€ chacune
        portions = []
        for i in range(10):
            p = SplitPaymentPortion.objects.create(
                session=session,
                name=f"Person {i + 1}",
                amount=Decimal('110.00')
            )
            portions.append(p)
        
        # Vérifier l'état initial
        assert session.remaining_portions_count == 10
        assert session.remaining_amount == Decimal('1100.00')
        
        # Payer toutes les portions
        for i, p in enumerate(portions):
            p.mark_as_paid(payment_intent_id=f'pi_person_{i}')
            session.refresh_from_db()
            
            if i < 9:
                assert session.status == 'active'
            else:
                assert session.status == 'completed'

    def test_anonymous_portions(self, split_session):
        """Test avec des portions anonymes"""
        p1 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="",  # Anonyme
            amount=Decimal('55.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_session,
            name="",  # Anonyme
            amount=Decimal('55.00')
        )
        
        # Les portions anonymes fonctionnent normalement
        p1.mark_as_paid(payment_intent_id='pi_anon_1')
        p2.mark_as_paid(payment_intent_id='pi_anon_2')
        
        split_session.refresh_from_db()
        assert split_session.is_completed is True


# =============================================================================
# TESTS - Edge Cases
# =============================================================================

@pytest.mark.django_db
class TestPaymentEdgeCases:
    """Tests des cas limites"""

    def test_very_small_amounts(self, order_small, user):
        """Test avec de très petits montants"""
        session = SplitPaymentSession.objects.create(
            order=order_small,
            split_type='custom',
            total_amount=Decimal('10.00'),
            tip_amount=Decimal('0.00'),
            created_by=user
        )
        
        # Split avec 1 centime
        p1 = SplitPaymentPortion.objects.create(
            session=session,
            name="Big spender",
            amount=Decimal('9.99')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=session,
            name="Cheapskate",
            amount=Decimal('0.01')
        )
        
        p1.mark_as_paid()
        assert session.remaining_amount == Decimal('0.01')
        
        p2.mark_as_paid()
        session.refresh_from_db()
        assert session.remaining_amount == Decimal('0.00')
        assert session.is_completed is True

    def test_large_tip_amount(self, order, user):
        """Test avec un très gros pourboire"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            tip_amount=Decimal('100.00'),  # 100% tip
            created_by=user
        )
        
        # Total = 200€ divisé en 2
        p1 = SplitPaymentPortion.objects.create(
            session=session, amount=Decimal('100.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=session, amount=Decimal('100.00')
        )
        
        assert session.remaining_amount == Decimal('200.00')
        
        p1.mark_as_paid()
        p2.mark_as_paid()
        
        session.refresh_from_db()
        assert session.total_paid == Decimal('200.00')

    def test_special_characters_in_name(self, split_session):
        """Test avec caractères spéciaux dans le nom"""
        special_names = [
            "Jean-François",
            "Marie & Pierre",
            "名前",  # Japonais
            "Émilie 🍕",
            "<script>alert('xss')</script>",
            "O'Reilly"
        ]
        
        for name in special_names:
            portion = SplitPaymentPortion.objects.create(
                session=split_session,
                name=name,
                amount=Decimal('10.00')
            )
            portion.refresh_from_db()
            assert portion.name == name

    def test_decimal_precision(self, split_session):
        """Test de la précision décimale"""
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Precise",
            amount=Decimal('33.33')
        )
        
        portion.refresh_from_db()
        assert portion.amount == Decimal('33.33')
        assert str(portion.amount) == '33.33'

    def test_multiple_payment_methods(self, split_session, user):
        """Test avec différentes méthodes de paiement"""
        p1 = SplitPaymentPortion.objects.create(
            session=split_session, amount=Decimal('37.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=split_session, amount=Decimal('37.00')
        )
        p3 = SplitPaymentPortion.objects.create(
            session=split_session, amount=Decimal('36.00')
        )
        
        p1.mark_as_paid(payment_intent_id='pi_1', payment_method='online')
        p2.mark_as_paid(payment_intent_id='pi_2', payment_method='card')
        p3.mark_as_paid(payment_intent_id='pi_3', payment_method='cash')
        
        assert p1.payment_method == 'online'
        assert p2.payment_method == 'card'
        assert p3.payment_method == 'cash'

    def test_session_with_no_tip(self, order, user):
        """Test de session sans pourboire"""
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('100.00'),
            tip_amount=Decimal('0.00'),
            created_by=user
        )
        
        p1 = SplitPaymentPortion.objects.create(
            session=session, amount=Decimal('50.00')
        )
        p2 = SplitPaymentPortion.objects.create(
            session=session, amount=Decimal('50.00')
        )
        
        # Sans pourboire, le total à payer = 100€
        assert session.remaining_amount == Decimal('100.00')

    def test_cancelled_session_properties(self, cancelled_session):
        """Test des propriétés d'une session annulée"""
        assert cancelled_session.status == 'cancelled'
        assert cancelled_session.cancelled_at is not None
        # is_completed dépend uniquement des portions ou du status 'completed'
        assert cancelled_session.is_completed is False

    def test_completed_session_properties(self, completed_session):
        """Test des propriétés d'une session complétée"""
        assert completed_session.status == 'completed'
        assert completed_session.completed_at is not None
        assert completed_session.is_completed is True


# =============================================================================
# TESTS - Cascade Delete
# =============================================================================

@pytest.mark.django_db
class TestCascadeDelete:
    """Tests de la suppression en cascade"""

    def test_delete_session_deletes_portions(self, split_session, payment_portion, second_portion):
        """Test que supprimer une session supprime ses portions"""
        session_id = split_session.id
        portion_ids = [payment_portion.id, second_portion.id]
        
        split_session.delete()
        
        assert not SplitPaymentSession.objects.filter(id=session_id).exists()
        for pid in portion_ids:
            assert not SplitPaymentPortion.objects.filter(id=pid).exists()

    def test_delete_order_deletes_session(self, split_session, payment_portion):
        """Test que supprimer une commande supprime la session"""
        order = split_session.order
        session_id = split_session.id
        
        order.delete()
        
        assert not SplitPaymentSession.objects.filter(id=session_id).exists()

    def test_delete_user_sets_null_on_paid_by(self, split_session, second_user):
        """Test que supprimer un utilisateur met à null paid_by"""
        # Créer une portion payée par second_user (pas le propriétaire de la commande)
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            name="Test Portion",
            amount=Decimal('50.00'),
            is_paid=True,
            paid_by=second_user
        )
        
        second_user.delete()
        
        portion.refresh_from_db()
        assert portion.paid_by is None

    def test_delete_user_sets_null_on_created_by(self, restaurant, second_user):
        """Test que supprimer un utilisateur met à null created_by"""
        # Créer une commande avec un autre user pour éviter la cascade
        order = Order.objects.create(
            restaurant=restaurant,
            order_number="ORD-CASCADE-TEST",
            table_number="T99",
            status='confirmed',
            payment_status='pending',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('5.00'),
            total_amount=Decimal('55.00')
        )
        
        session = SplitPaymentSession.objects.create(
            order=order,
            split_type='equal',
            total_amount=Decimal('55.00'),
            created_by=second_user
        )
        
        second_user.delete()
        
        session.refresh_from_db()
        assert session.created_by is None


# =============================================================================
# TESTS - Querying and Filtering
# =============================================================================

@pytest.mark.django_db
class TestQueryingAndFiltering:
    """Tests des requêtes et filtres"""

    def test_filter_portions_by_payment_status(self, split_session, payment_portion, paid_portion):
        """Test du filtrage des portions par statut de paiement"""
        unpaid = split_session.portions.filter(is_paid=False)
        paid = split_session.portions.filter(is_paid=True)
        
        assert unpaid.count() == 1
        assert paid.count() == 1
        assert payment_portion in unpaid
        assert paid_portion in paid

    def test_filter_sessions_by_status(self, split_session, completed_session, cancelled_session):
        """Test du filtrage des sessions par statut"""
        active = SplitPaymentSession.objects.filter(status='active')
        completed = SplitPaymentSession.objects.filter(status='completed')
        cancelled = SplitPaymentSession.objects.filter(status='cancelled')
        
        assert split_session in active
        assert completed_session in completed
        assert cancelled_session in cancelled

    def test_filter_sessions_by_split_type(self, split_session, custom_split_session):
        """Test du filtrage par type de split"""
        equal = SplitPaymentSession.objects.filter(split_type='equal')
        custom = SplitPaymentSession.objects.filter(split_type='custom')
        
        assert split_session in equal
        assert custom_split_session in custom

    def test_aggregate_total_paid(self, split_session):
        """Test de l'agrégation du total payé"""
        from django.db.models import Sum
        
        SplitPaymentPortion.objects.create(
            session=split_session,
            amount=Decimal('40.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            amount=Decimal('30.00'),
            is_paid=True
        )
        SplitPaymentPortion.objects.create(
            session=split_session,
            amount=Decimal('40.00'),
            is_paid=False
        )
        
        total = split_session.portions.filter(is_paid=True).aggregate(
            total=Sum('amount')
        )['total']
        
        assert total == Decimal('70.00')

    def test_order_portions_by_amount(self, split_session):
        """Test du tri des portions par montant"""
        SplitPaymentPortion.objects.create(
            session=split_session, name="Medium", amount=Decimal('50.00')
        )
        SplitPaymentPortion.objects.create(
            session=split_session, name="Small", amount=Decimal('20.00')
        )
        SplitPaymentPortion.objects.create(
            session=split_session, name="Large", amount=Decimal('80.00')
        )
        
        ordered = split_session.portions.order_by('amount')
        amounts = [p.amount for p in ordered]
        
        assert amounts == [Decimal('20.00'), Decimal('50.00'), Decimal('80.00')]