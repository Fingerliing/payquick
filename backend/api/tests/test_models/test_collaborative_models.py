# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles collaboratifs
- CollaborativeTableSession
- SessionParticipant
- ActiveSessionManager
- SessionCartItem  ← NOUVEAU
"""

import pytest
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
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


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="seconduser", password="testpass123")


@pytest.fixture
def restaurateur_profile(user):
    return RestaurateurProfile.objects.create(
        user=user,
        siret="12345678901234"
    )


@pytest.fixture
def restaurant(restaurateur_profile):
    return Restaurant.objects.create(
        name="Test Restaurant",
        description="Restaurant de test",
        owner=restaurateur_profile,
        siret="98765432109876"
    )


@pytest.fixture
def table(restaurant):
    return Table.objects.create(
        restaurant=restaurant,
        number="T01"
    )


@pytest.fixture
def collaborative_session(restaurant, table, user):
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="T01",
        host=user,
        host_name="Test Host",
        max_participants=5,
        require_approval=False
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
# HELPER FUNCTION FOR ORDER CREATION
# =============================================================================

def create_test_order(restaurant, table_number, collaborative_session=None, participant=None, order_suffix="001"):
    """
    Helper to create Order with all required fields.

    Order model requires:
    - restaurant (ForeignKey to Restaurant)
    - table_number (CharField, NOT a ForeignKey to Table)
    - order_number (CharField, unique)
    - subtotal (DecimalField)
    - total_amount (DecimalField)
    """
    return Order.objects.create(
        restaurant=restaurant,
        table_number=table_number,
        order_number=f"ORD-TEST-{order_suffix}",
        subtotal=Decimal('50.00'),
        total_amount=Decimal('55.00'),
        collaborative_session=collaborative_session,
        participant=participant
    )


# =============================================================================
# TESTS - CollaborativeTableSession
# =============================================================================

@pytest.mark.django_db
class TestCollaborativeTableSession:
    """Tests pour le modèle CollaborativeTableSession"""

    def test_session_creation(self, collaborative_session):
        """Test de la création d'une session collaborative"""
        assert collaborative_session.id is not None
        assert collaborative_session.share_code is not None
        assert len(collaborative_session.share_code) == 6
        assert collaborative_session.status == 'active'
        assert collaborative_session.session_type == 'collaborative'
        assert collaborative_session.is_archived is False

    def test_share_code_generation(self, restaurant, table):
        """Test de la génération automatique du code de partage"""
        session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T02"
        )
        assert len(session.share_code) == 6
        assert session.share_code[:3].isalpha()
        assert session.share_code[:3].isupper()
        assert session.share_code[3:].isdigit()

    def test_share_code_uniqueness(self, restaurant, table):
        """Test que les codes de partage sont uniques"""
        codes = set()
        for i in range(10):
            session = CollaborativeTableSession.objects.create(
                restaurant=restaurant,
                table=table,
                table_number=f"T{i:02d}"
            )
            codes.add(session.share_code)
        assert len(codes) == 10

    def test_session_str_method(self, collaborative_session):
        """Test de la méthode __str__"""
        expected = f"Session {collaborative_session.share_code} - Table {collaborative_session.table_number} - Active"
        assert str(collaborative_session) == expected

    def test_session_str_with_archived(self, collaborative_session):
        """Test de la méthode __str__ avec session archivée"""
        collaborative_session.is_archived = True
        collaborative_session.save()
        assert "[ARCHIVÉE]" in str(collaborative_session)

    def test_participant_count_property(self, collaborative_session, user, second_user):
        """Test de la propriété participant_count"""
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=user,
            role='host',
            status='active'
        )
        assert collaborative_session.participant_count == 1

        SessionParticipant.objects.create(
            session=collaborative_session,
            user=second_user,
            role='member',
            status='active'
        )
        assert collaborative_session.participant_count == 2

    def test_is_full_property(self, collaborative_session):
        """Test de la propriété is_full"""
        collaborative_session.max_participants = 2
        collaborative_session.save()

        assert collaborative_session.is_full is False

        for i in range(2):
            user = User.objects.create_user(username=f"user{i}", password="pass")
            SessionParticipant.objects.create(
                session=collaborative_session,
                user=user,
                status='active'
            )

        assert collaborative_session.is_full is True

    def test_can_join_property(self, collaborative_session):
        """Test de la propriété can_join"""
        assert collaborative_session.can_join is True

        collaborative_session.status = 'completed'
        collaborative_session.save()
        assert collaborative_session.can_join is False

        collaborative_session.status = 'cancelled'
        collaborative_session.save()
        assert collaborative_session.can_join is False

        collaborative_session.status = 'locked'
        collaborative_session.allow_join_after_lock = False
        collaborative_session.save()

    def test_total_orders_count(self, collaborative_session, restaurant, table):
        """Test de la propriété total_orders_count"""
        assert collaborative_session.total_orders_count == 0

        create_test_order(
            restaurant=restaurant,
            table_number=table.number,
            collaborative_session=collaborative_session,
            order_suffix="001"
        )
        create_test_order(
            restaurant=restaurant,
            table_number=table.number,
            collaborative_session=collaborative_session,
            order_suffix="002"
        )

        assert collaborative_session.total_orders_count == 2

    def test_pending_participants(self, collaborative_session, second_user):
        """Test de la propriété pending_participants"""
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=second_user,
            role='member',
            status='pending'
        )
        assert collaborative_session.pending_participants.count() == 1

    def test_archive_session(self, collaborative_session):
        """Test de l'archivage d'une session"""
        collaborative_session.status = 'completed'
        collaborative_session.save()

        collaborative_session.archive(reason="Test d'archivage")

        assert collaborative_session.is_archived is True
        assert collaborative_session.archived_at is not None
        assert "Test d'archivage" in collaborative_session.session_notes

    def test_unarchive_session(self, collaborative_session):
        """Test de la méthode unarchive"""
        collaborative_session.archive()
        assert collaborative_session.is_archived is True

        collaborative_session.unarchive()

        assert collaborative_session.is_archived is False
        assert collaborative_session.archived_at is None

    def test_can_be_archived_property(self, collaborative_session):
        """Test de la propriété can_be_archived"""
        collaborative_session.status = 'active'
        assert collaborative_session.can_be_archived is False

        collaborative_session.status = 'completed'
        assert collaborative_session.can_be_archived is True

        collaborative_session.status = 'cancelled'
        assert collaborative_session.can_be_archived is True


# =============================================================================
# TESTS - SessionParticipant
# =============================================================================

@pytest.mark.django_db
class TestSessionParticipant:
    """Tests pour le modèle SessionParticipant"""

    def test_participant_creation(self, participant):
        """Test de la création d'un participant"""
        assert participant.id is not None
        assert participant.status == 'active'
        assert participant.role == 'host'
        assert participant.joined_at is not None

    def test_participant_str_method(self, participant):
        """Test de la méthode __str__"""
        result = str(participant)
        assert "Actif" in result

    def test_display_name_with_user(self, participant, user):
        """Test de display_name avec un utilisateur authentifié"""
        user.first_name = "Jean"
        user.save()
        assert participant.display_name == "Jean"

    def test_display_name_with_username(self, participant, user):
        """Test de display_name avec username si pas de first_name"""
        user.first_name = ""
        user.save()
        assert participant.display_name == user.username

    def test_display_name_guest(self, collaborative_session):
        """Test de display_name pour un invité"""
        participant = SessionParticipant.objects.create(
            session=collaborative_session,
            guest_name="Pierre Invité",
            status='active'
        )
        assert participant.display_name == "Pierre Invité"

    def test_display_name_anonymous_guest(self, collaborative_session):
        """Test de display_name pour un invité anonyme"""
        participant = SessionParticipant.objects.create(
            session=collaborative_session,
            status='active'
        )
        assert participant.display_name == "Invité"

    def test_is_host_property(self, participant):
        """Test de la propriété is_host"""
        assert participant.is_host is True

        participant.role = 'member'
        assert participant.is_host is False

    def test_leave_session(self, participant):
        """Test de la méthode leave_session"""
        assert participant.status == 'active'
        assert participant.left_at is None

        participant.leave_session()

        assert participant.status == 'left'
        assert participant.left_at is not None

    def test_unique_user_per_session(self, collaborative_session, user):
        """Test qu'un utilisateur ne peut rejoindre une session qu'une fois"""
        SessionParticipant.objects.create(
            session=collaborative_session,
            user=user,
            status='active'
        )

        with pytest.raises(Exception):
            SessionParticipant.objects.create(
                session=collaborative_session,
                user=user,
                status='active'
            )

    def test_orders_count_property(self, participant, collaborative_session, restaurant, table):
        """Test de la propriété orders_count"""
        assert participant.orders_count == 0

        create_test_order(
            restaurant=restaurant,
            table_number=table.number,
            collaborative_session=collaborative_session,
            participant=participant,
            order_suffix="003"
        )

        assert participant.orders_count == 1


# =============================================================================
# TESTS - SessionCartItem  ← NOUVEAU
# =============================================================================

@pytest.mark.django_db
class TestSessionCartItem:
    """Tests pour le modèle SessionCartItem"""

    def test_cart_item_creation(self, cart_item, collaborative_session, participant, menu_item):
        """Test de la création d'un article dans le panier partagé"""
        assert cart_item.id is not None
        assert cart_item.session == collaborative_session
        assert cart_item.participant == participant
        assert cart_item.menu_item == menu_item
        assert cart_item.quantity == 2
        assert cart_item.special_instructions == "Sans oignons"
        assert cart_item.customizations == {"size": "large"}
        assert cart_item.added_at is not None
        assert cart_item.updated_at is not None

    def test_cart_item_str_method(self, cart_item):
        """Test de la méthode __str__"""
        result = str(cart_item)
        assert "Pizza Margherita" in result
        assert "x2" in result

    def test_total_price_property(self, cart_item, menu_item):
        """Test de la propriété total_price = prix * quantité"""
        expected = menu_item.price * cart_item.quantity
        assert cart_item.total_price == expected
        assert cart_item.total_price == Decimal('25.00')

    def test_total_price_single_item(self, collaborative_session, participant, menu_item):
        """Test total_price pour quantité = 1"""
        item = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        assert item.total_price == Decimal('12.50')

    def test_cart_item_default_values(self, collaborative_session, participant, menu_item):
        """Test des valeurs par défaut du panier"""
        item = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item
        )
        assert item.quantity == 1
        assert item.special_instructions == ""
        assert item.customizations == {}

    def test_multiple_items_same_participant(
        self, collaborative_session, participant, menu_item, second_menu_item
    ):
        """Test qu'un participant peut avoir plusieurs articles différents"""
        item1 = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        item2 = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=second_menu_item,
            quantity=2
        )

        items = collaborative_session.cart_items.filter(participant=participant)
        assert items.count() == 2
        assert item1 in items
        assert item2 in items

    def test_multiple_participants_same_item(
        self, collaborative_session, participant, second_participant, menu_item
    ):
        """Test que deux participants peuvent avoir le même article"""
        item1 = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        item2 = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=second_participant,
            menu_item=menu_item,
            quantity=3
        )

        all_items = collaborative_session.cart_items.all()
        assert all_items.count() == 2
        assert item1 in all_items
        assert item2 in all_items

    def test_session_cart_total(
        self, collaborative_session, participant, second_participant, menu_item, second_menu_item
    ):
        """Test du calcul du total du panier de la session"""
        SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,    # 12.50 × 2 = 25.00
            quantity=2
        )
        SessionCartItem.objects.create(
            session=collaborative_session,
            participant=second_participant,
            menu_item=second_menu_item,  # 9.90 × 1 = 9.90
            quantity=1
        )

        items = collaborative_session.cart_items.select_related('menu_item').all()
        total = sum(item.total_price for item in items)
        assert total == Decimal('34.90')

    def test_cart_item_cascade_delete_on_session(self, collaborative_session, participant, menu_item):
        """Test que les articles sont supprimés avec la session"""
        SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        assert SessionCartItem.objects.filter(session=collaborative_session).count() == 1

        session_id = collaborative_session.id
        collaborative_session.delete()

        assert SessionCartItem.objects.filter(session_id=session_id).count() == 0

    def test_cart_item_cascade_delete_on_participant(
        self, collaborative_session, participant, menu_item
    ):
        """Test que les articles sont supprimés avec le participant"""
        item = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        item_id = item.id

        participant.delete()

        assert not SessionCartItem.objects.filter(id=item_id).exists()

    def test_cart_items_ordering(self, collaborative_session, participant, menu_item, second_menu_item):
        """Test que les articles sont triés par date d'ajout"""
        item1 = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1
        )
        item2 = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=second_menu_item,
            quantity=1
        )

        items = list(collaborative_session.cart_items.all())
        assert items[0] == item1
        assert items[1] == item2

    def test_cart_item_update_quantity(self, cart_item):
        """Test de la mise à jour de la quantité"""
        cart_item.quantity = 5
        cart_item.save()
        cart_item.refresh_from_db()

        assert cart_item.quantity == 5
        assert cart_item.total_price == Decimal('62.50')

    def test_cart_item_customizations_json(self, collaborative_session, participant, menu_item):
        """Test que les customizations sont stockées en JSON"""
        customizations = {
            "sauce": "ketchup",
            "extras": ["bacon", "egg"],
            "no_salt": True
        }
        item = SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=1,
            customizations=customizations
        )
        item.refresh_from_db()
        assert item.customizations == customizations
        assert item.customizations["sauce"] == "ketchup"
        assert "bacon" in item.customizations["extras"]

    def test_cart_item_index_on_session_participant(
        self, collaborative_session, participant, menu_item
    ):
        """Test que l'index session+participant fonctionne pour les requêtes"""
        SessionCartItem.objects.create(
            session=collaborative_session,
            participant=participant,
            menu_item=menu_item,
            quantity=3
        )

        # Requête ciblée avec l'index
        result = SessionCartItem.objects.filter(
            session=collaborative_session,
            participant=participant
        )
        assert result.count() == 1
        assert result.first().quantity == 3


# =============================================================================
# TESTS - ActiveSessionManager
# =============================================================================

@pytest.mark.django_db
class TestActiveSessionManager:
    """Tests pour le manager ActiveSessionManager"""

    def test_manager_excludes_archived(self, restaurant, table):
        """Test que le manager par défaut exclut les sessions archivées"""
        active_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T01"
        )

        archived_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T02",
            is_archived=True
        )

        sessions = CollaborativeTableSession.objects.all()
        assert active_session in sessions
        assert archived_session not in sessions

    def test_all_objects_includes_archived(self, restaurant, table):
        """Test que all_objects inclut les sessions archivées"""
        active_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T01"
        )

        archived_session = CollaborativeTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            table_number="T02",
            is_archived=True
        )

        all_sessions = CollaborativeTableSession.all_objects.all()
        assert active_session in all_sessions
        assert archived_session in all_sessions


# =============================================================================
# TESTS SUPPLÉMENTAIRES - Couverture complète
# =============================================================================

@pytest.mark.django_db
class TestCollaborativeTableSessionAdditional:
    """Tests supplémentaires pour couverture complète"""

    def test_archive_with_existing_notes(self, collaborative_session):
        """Test archive() avec reason quand session_notes existe déjà"""
        collaborative_session.session_notes = "Notes existantes"
        collaborative_session.save()

        collaborative_session.archive(reason="Nouvelle raison")

        assert "Notes existantes" in collaborative_session.session_notes
        assert "Nouvelle raison" in collaborative_session.session_notes
        assert "\n" in collaborative_session.session_notes

    def test_auto_archive_eligible_not_archivable(self, collaborative_session):
        """Test auto_archive_eligible quand can_be_archived est False"""
        collaborative_session.status = 'active'
        collaborative_session.save()

        assert collaborative_session.can_be_archived is False
        assert collaborative_session.auto_archive_eligible is False

    def test_auto_archive_eligible_already_archived(self, collaborative_session):
        """Test auto_archive_eligible quand déjà archivée"""
        collaborative_session.status = 'completed'
        collaborative_session.is_archived = True
        collaborative_session.save()

        assert collaborative_session.auto_archive_eligible is False

    def test_auto_archive_eligible_completed_recent(self, collaborative_session):
        """Test auto_archive_eligible quand completed récemment (< 5 min)"""
        collaborative_session.status = 'completed'
        collaborative_session.completed_at = timezone.now()
        collaborative_session.is_archived = False
        collaborative_session.save()

        assert collaborative_session.auto_archive_eligible is False

    def test_auto_archive_eligible_completed_old(self, collaborative_session):
        """Test auto_archive_eligible quand completed depuis > 5 min"""
        collaborative_session.status = 'completed'
        collaborative_session.completed_at = timezone.now() - timedelta(minutes=10)
        collaborative_session.is_archived = False
        collaborative_session.save()

        assert collaborative_session.auto_archive_eligible is True

    def test_auto_archive_eligible_cancelled_no_completed_at(self, collaborative_session):
        """Test auto_archive_eligible pour session annulée sans completed_at"""
        collaborative_session.status = 'cancelled'
        collaborative_session.completed_at = None
        collaborative_session.is_archived = False
        collaborative_session.save()

        assert collaborative_session.auto_archive_eligible is False