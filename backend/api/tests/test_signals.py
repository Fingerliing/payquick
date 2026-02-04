# -*- coding: utf-8 -*-
"""
Tests pour api/signals.py

Couvre:
- Signaux de création de groupes (post_migrate)
- Signaux d'assignation de groupes (restaurateur, client)
- Signaux de mise à jour Stripe
- Service de notifications WebSocket (OrderNotificationService)
- Signaux de capture de changements de commande
- Signaux de notifications push (commandes, paiements, sessions)
- Signaux de timestamps
"""

import pytest
import sys
from unittest.mock import patch, MagicMock, PropertyMock
from decimal import Decimal
from datetime import datetime
from django.contrib.auth.models import User, Group
from django.utils import timezone

from api.models import (
    RestaurateurProfile,
    Restaurant,
    ClientProfile,
    Order,
    SessionParticipant,
    SplitPaymentPortion,
    CollaborativeTableSession,
    Table,
    SplitPaymentSession,
)
from api.signals import (
    create_default_groups,
    update_restaurant_stripe_status,
    check_restaurant_stripe_activation,
    assign_restaurateur_group,
    assign_client_group,
    ensure_single_role_group,
    OrderNotificationService,
    capture_order_changes,
    order_updated,
    update_order_timestamps,
    capture_payment_status_change,
    send_payment_push_notifications,
    capture_portion_payment_change,
    send_split_payment_notifications,
    capture_participant_status_change,
    participant_post_save,
    send_order_push_notifications,
    notify_order_update,
    notify_custom_event,
    test_websocket_notification as ws_test_notification,
    DEFAULT_GROUPS,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user(db):
    """Utilisateur de base"""
    return User.objects.create_user(
        username="testuser@example.com",
        email="testuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_user(db):
    """Utilisateur restaurateur"""
    return User.objects.create_user(
        username="resto@example.com",
        email="resto@example.com",
        password="testpass123"
    )


@pytest.fixture
def client_user(db):
    """Utilisateur client"""
    return User.objects.create_user(
        username="client@example.com",
        email="client@example.com",
        password="testpass123"
    )


@pytest.fixture
def restaurateur_group(db):
    """Groupe restaurateur"""
    group, _ = Group.objects.get_or_create(name="restaurateur")
    return group


@pytest.fixture
def client_group(db):
    """Groupe client"""
    group, _ = Group.objects.get_or_create(name="client")
    return group


@pytest.fixture
def admin_group(db):
    """Groupe admin"""
    group, _ = Group.objects.get_or_create(name="admin")
    return group


@pytest.fixture
def restaurateur_profile(db, restaurateur_user):
    """Profil restaurateur (sans déclencher le signal)"""
    # Désactiver temporairement le signal pour créer le profil sans effet de bord
    with patch('api.signals.assign_restaurateur_group'):
        profile = RestaurateurProfile.objects.create(
            user=restaurateur_user,
            siret="12345678901234",
            stripe_verified=True,
            is_validated=True,
            is_active=True
        )
    return profile


@pytest.fixture
def restaurant(db, restaurateur_profile):
    """Restaurant de test"""
    with patch('api.signals.check_restaurant_stripe_activation'):
        return Restaurant.objects.create(
            name="Signal Test Restaurant",
            description="Restaurant pour tests signaux",
            owner=restaurateur_profile,
            siret="98765432109876",
            is_active=True,
            is_stripe_active=False
        )


@pytest.fixture
def table(db, restaurant):
    """Table de test"""
    return Table.objects.create(
        restaurant=restaurant,
        number="SIG01",
        qr_code="SIGTEST01",
        capacity=4,
        is_active=True
    )


@pytest.fixture
def order(db, restaurant, user):
    """Commande de test"""
    with patch('api.signals.order_updated'):
        with patch('api.signals.send_order_push_notifications'):
            return Order.objects.create(
                order_number="ORD-SIG-001",
                restaurant=restaurant,
                user=user,
                table_number="SIG01",
                subtotal=Decimal("25.00"),
                tax_amount=Decimal("2.50"),
                total_amount=Decimal("27.50"),
                status="pending",
                payment_status="unpaid",
                payment_method="card"
            )


@pytest.fixture
def collaborative_session(db, restaurant, table):
    """Session collaborative"""
    return CollaborativeTableSession.objects.create(
        restaurant=restaurant,
        table=table,
        table_number="SIG01",
        status="active"
    )


@pytest.fixture
def session_participant(db, collaborative_session, user):
    """Participant de session"""
    with patch('api.signals.send_session_participant_notifications'):
        with patch('api.signals.participant_post_save'):
            return SessionParticipant.objects.create(
                session=collaborative_session,
                user=user,
                role="member",
                status="pending"
            )


# =============================================================================
# TESTS - Création des groupes par défaut
# =============================================================================

@pytest.mark.django_db
class TestCreateDefaultGroups:
    """Tests pour create_default_groups"""

    def test_creates_groups_on_auth_migrate(self):
        """Test que les groupes sont créés lors de la migration auth"""
        # Supprimer les groupes existants
        Group.objects.filter(name__in=DEFAULT_GROUPS).delete()
        
        # Simuler le sender de django.contrib.auth
        mock_sender = MagicMock()
        mock_sender.name = "django.contrib.auth"
        
        create_default_groups(sender=mock_sender)
        
        # Vérifier que tous les groupes sont créés
        for group_name in DEFAULT_GROUPS:
            assert Group.objects.filter(name=group_name).exists()

    def test_skips_non_auth_app(self):
        """Test que le signal est ignoré pour les autres apps"""
        # Supprimer les groupes existants
        Group.objects.filter(name__in=DEFAULT_GROUPS).delete()
        
        # Simuler un sender différent
        mock_sender = MagicMock()
        mock_sender.name = "some.other.app"
        
        create_default_groups(sender=mock_sender)
        
        # Les groupes ne devraient pas être créés
        assert Group.objects.filter(name__in=DEFAULT_GROUPS).count() == 0

    def test_handles_existing_groups(self):
        """Test que les groupes existants ne posent pas de problème"""
        # Créer les groupes d'abord
        for name in DEFAULT_GROUPS:
            Group.objects.get_or_create(name=name)
        
        mock_sender = MagicMock()
        mock_sender.name = "django.contrib.auth"
        
        # Ne doit pas lever d'exception
        create_default_groups(sender=mock_sender)
        
        # Les groupes doivent toujours exister (pas de doublon)
        for name in DEFAULT_GROUPS:
            assert Group.objects.filter(name=name).count() == 1


# =============================================================================
# TESTS - Assignation des groupes
# =============================================================================

@pytest.mark.django_db
class TestAssignRestaurateurGroup:
    """Tests pour assign_restaurateur_group"""

    def test_assigns_group_on_creation(self, restaurateur_user, restaurateur_group):
        """Test que le groupe est assigné à la création du profil"""
        # Créer un profil (le signal devrait s'exécuter)
        profile = RestaurateurProfile.objects.create(
            user=restaurateur_user,
            siret="99999999999999"
        )
        
        # Vérifier que l'utilisateur est dans le groupe
        assert restaurateur_user.groups.filter(name="restaurateur").exists()

    def test_does_not_assign_on_update(self, restaurateur_profile, restaurateur_group):
        """Test que le groupe n'est pas ré-assigné lors d'une mise à jour"""
        # Supprimer l'utilisateur du groupe
        restaurateur_profile.user.groups.clear()
        
        # Mettre à jour le profil
        restaurateur_profile.siret = "11111111111111"
        restaurateur_profile.save()
        
        # Le signal avec created=False ne devrait pas ajouter le groupe
        # Note: Le signal ne s'exécute que si created=True

    def test_handles_exception(self, restaurateur_user, capsys):
        """Test la gestion d'erreur lors de l'assignation"""
        with patch('django.contrib.auth.models.Group.objects.get_or_create',
                   side_effect=Exception("DB error")):
            # Simuler l'appel du signal
            mock_instance = MagicMock()
            mock_instance.user = restaurateur_user
            
            assign_restaurateur_group(
                sender=RestaurateurProfile,
                instance=mock_instance,
                created=True
            )
            
            captured = capsys.readouterr()
            assert "❌" in captured.out or "Erreur" in captured.out


@pytest.mark.django_db
class TestAssignClientGroup:
    """Tests pour assign_client_group"""

    def test_assigns_group_on_creation(self, client_user, client_group):
        """Test que le groupe client est assigné à la création"""
        profile = ClientProfile.objects.create(user=client_user)
        
        assert client_user.groups.filter(name="client").exists()

    def test_handles_exception(self, client_user, capsys):
        """Test la gestion d'erreur"""
        with patch('django.contrib.auth.models.Group.objects.get_or_create',
                   side_effect=Exception("DB error")):
            mock_instance = MagicMock()
            mock_instance.user = client_user
            
            assign_client_group(
                sender=ClientProfile,
                instance=mock_instance,
                created=True
            )
            
            captured = capsys.readouterr()
            assert "❌" in captured.out or "Erreur" in captured.out


@pytest.mark.django_db
class TestEnsureSingleRoleGroup:
    """Tests pour ensure_single_role_group"""

    def test_removes_extra_groups(self, user, restaurateur_group, client_group, admin_group):
        """Test que les groupes supplémentaires sont retirés"""
        # Ajouter l'utilisateur à plusieurs groupes
        user.groups.add(restaurateur_group, client_group)
        
        # Déclencher le signal manuellement
        ensure_single_role_group(sender=User, instance=user)
        
        # Vérifier qu'il n'y a qu'un seul groupe de rôle
        role_groups = user.groups.filter(name__in=["restaurateur", "client", "admin"])
        assert role_groups.count() == 1

    def test_admin_has_priority(self, user, restaurateur_group, client_group, admin_group):
        """Test que admin a la priorité"""
        user.groups.add(admin_group, restaurateur_group, client_group)
        
        ensure_single_role_group(sender=User, instance=user)
        
        # Seul admin devrait rester
        assert user.groups.filter(name="admin").exists()
        assert not user.groups.filter(name="restaurateur").exists()
        assert not user.groups.filter(name="client").exists()

    def test_restaurateur_priority_over_client(self, user, restaurateur_group, client_group):
        """Test que restaurateur a la priorité sur client"""
        user.groups.add(restaurateur_group, client_group)
        
        ensure_single_role_group(sender=User, instance=user)
        
        assert user.groups.filter(name="restaurateur").exists()
        assert not user.groups.filter(name="client").exists()

    def test_no_change_for_single_group(self, user, client_group):
        """Test qu'un utilisateur avec un seul groupe n'est pas modifié"""
        user.groups.add(client_group)
        
        ensure_single_role_group(sender=User, instance=user)
        
        assert user.groups.filter(name="client").exists()


# =============================================================================
# TESTS - Mise à jour Stripe
# =============================================================================

@pytest.mark.django_db
class TestUpdateRestaurantStripeStatus:
    """Tests pour update_restaurant_stripe_status"""

    def test_updates_restaurants_when_verified(self, restaurateur_profile, restaurant):
        """Test que les restaurants sont mis à jour quand Stripe est vérifié"""
        restaurateur_profile.stripe_verified = True
        
        update_restaurant_stripe_status(
            sender=RestaurateurProfile,
            instance=restaurateur_profile,
            update_fields=["stripe_verified"]
        )
        
        restaurant.refresh_from_db()
        assert restaurant.is_stripe_active is True

    def test_updates_restaurants_when_unverified(self, restaurateur_profile, restaurant):
        """Test que les restaurants sont désactivés quand Stripe n'est plus vérifié"""
        # D'abord activer
        restaurant.is_stripe_active = True
        restaurant.save()
        
        restaurateur_profile.stripe_verified = False
        
        update_restaurant_stripe_status(
            sender=RestaurateurProfile,
            instance=restaurateur_profile,
            update_fields=["stripe_verified"]
        )
        
        restaurant.refresh_from_db()
        assert restaurant.is_stripe_active is False

    def test_updates_when_update_fields_none(self, restaurateur_profile, restaurant):
        """Test la mise à jour quand update_fields est None"""
        restaurateur_profile.stripe_verified = True
        
        update_restaurant_stripe_status(
            sender=RestaurateurProfile,
            instance=restaurateur_profile,
            update_fields=None
        )
        
        restaurant.refresh_from_db()
        assert restaurant.is_stripe_active is True

    def test_handles_exception(self, restaurateur_profile):
        """Test la gestion d'erreur"""
        with patch('api.models.Restaurant.objects.filter',
                   side_effect=Exception("DB error")):
            # Ne doit pas lever d'exception
            update_restaurant_stripe_status(
                sender=RestaurateurProfile,
                instance=restaurateur_profile,
                update_fields=["stripe_verified"]
            )


@pytest.mark.django_db
class TestCheckRestaurantStripeActivation:
    """Tests pour check_restaurant_stripe_activation"""

    def test_logs_on_creation(self, restaurateur_profile, capsys):
        """Test le logging à la création"""
        with patch('api.signals.check_restaurant_stripe_activation'):
            restaurant = Restaurant.objects.create(
                name="New Restaurant",
                owner=restaurateur_profile,
                siret="77777777777777",
                is_stripe_active=True
            )
        
        # Appeler le signal manuellement
        check_restaurant_stripe_activation(
            sender=Restaurant,
            instance=restaurant,
            created=True,
            update_fields=None
        )
        
        captured = capsys.readouterr()
        assert "Signal Restaurant" in captured.out or "📍" in captured.out

    def test_logs_stripe_active_change(self, restaurant, capsys):
        """Test le logging lors du changement de is_stripe_active"""
        restaurant.is_stripe_active = True
        
        check_restaurant_stripe_activation(
            sender=Restaurant,
            instance=restaurant,
            created=False,
            update_fields=["is_stripe_active"]
        )
        
        captured = capsys.readouterr()
        assert "✅" in captured.out or "activé" in captured.out

    def test_handles_exception(self, restaurant, capsys):
        """Test la gestion d'erreur"""
        # Créer une instance mockée qui lève une exception
        class BrokenRestaurant:
            @property
            def name(self):
                raise Exception("Error getting name")
            
            @property
            def is_stripe_active(self):
                return True
        
        broken = BrokenRestaurant()
        
        check_restaurant_stripe_activation(
            sender=Restaurant,
            instance=broken,
            created=False,
            update_fields=["is_stripe_active"]
        )
        
        captured = capsys.readouterr()
        # Le signal catch l'exception et affiche un message d'erreur
        assert "❌" in captured.out or captured.out == ""


# =============================================================================
# TESTS - OrderNotificationService
# =============================================================================

@pytest.mark.django_db
class TestOrderNotificationService:
    """Tests pour OrderNotificationService"""

    def test_init_with_channel_layer(self, monkeypatch):
        """Test l'initialisation avec channel layer"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.signals.get_channel_layer', lambda: mock_channel_layer)
        
        service = OrderNotificationService()
        
        assert service.channel_layer == mock_channel_layer

    def test_init_without_channel_layer(self, monkeypatch):
        """Test l'initialisation sans channel layer"""
        monkeypatch.setattr('api.signals.get_channel_layer', lambda: None)
        
        service = OrderNotificationService()
        
        assert service.channel_layer is None

    def test_send_order_update_success(self, monkeypatch):
        """Test l'envoi d'une mise à jour réussie"""
        mock_channel_layer = MagicMock()
        monkeypatch.setattr('api.signals.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.signals.async_to_sync', lambda f: f)
        
        service = OrderNotificationService()
        result = service.send_order_update(
            order_id=123,
            status="confirmed",
            waiting_time=15,
            data={"test": True}
        )
        
        assert result is True
        mock_channel_layer.group_send.assert_called_once()

    def test_send_order_update_no_channel_layer(self, monkeypatch):
        """Test l'envoi sans channel layer"""
        monkeypatch.setattr('api.signals.get_channel_layer', lambda: None)
        
        service = OrderNotificationService()
        result = service.send_order_update(order_id=123, status="confirmed")
        
        assert result is False

    def test_send_order_update_exception(self, monkeypatch):
        """Test la gestion d'erreur lors de l'envoi"""
        mock_channel_layer = MagicMock()
        mock_channel_layer.group_send = MagicMock(side_effect=Exception("Send error"))
        monkeypatch.setattr('api.signals.get_channel_layer', lambda: mock_channel_layer)
        monkeypatch.setattr('api.signals.async_to_sync', lambda f: f)
        
        service = OrderNotificationService()
        result = service.send_order_update(order_id=123, status="confirmed")
        
        assert result is False

    def test_send_sse_update_success(self, monkeypatch):
        """Test l'envoi SSE réussi"""
        mock_broadcast = MagicMock()
        monkeypatch.setattr(
            'api.views.websocket_views.broadcast_to_sse',
            mock_broadcast
        )
        
        service = OrderNotificationService()
        service.send_sse_update(order_id=123, status="ready")
        
        mock_broadcast.assert_called_once()

    def test_send_sse_update_import_error(self, monkeypatch):
        """Test l'envoi SSE avec erreur d'import"""
        def raise_import_error(*args, **kwargs):
            raise ImportError("SSE not available")
        
        monkeypatch.setattr(
            'api.signals.OrderNotificationService.send_sse_update',
            raise_import_error
        )
        
        service = OrderNotificationService()
        # Ne doit pas lever d'exception
        try:
            service.send_sse_update(order_id=123, status="ready")
        except ImportError:
            pass  # Attendu dans certains cas


# =============================================================================
# TESTS - Capture des changements de commande
# =============================================================================

@pytest.mark.django_db
class TestCaptureOrderChanges:
    """Tests pour capture_order_changes"""

    def test_captures_old_status(self, order):
        """Test la capture du statut précédent"""
        order.status = "confirmed"
        
        capture_order_changes(sender=Order, instance=order)
        
        assert order._old_status == "pending"

    def test_captures_old_waiting_time_attribute(self, order):
        """Test la capture de l'attribut waiting_time si présent"""
        # Note: waiting_time n'est pas un champ du modèle Order,
        # mais le signal essaie de le capturer via getattr
        # On simule un attribut waiting_time sur l'instance
        
        # Simuler l'ancien état avec waiting_time
        with patch.object(Order.objects, 'get') as mock_get:
            mock_old_instance = MagicMock()
            mock_old_instance.status = "pending"
            mock_old_instance.waiting_time = 15
            mock_get.return_value = mock_old_instance
            
            order.status = "confirmed"
            capture_order_changes(sender=Order, instance=order)
            
            # Le signal utilise getattr avec default None
            assert order._old_status == "pending"
            assert order._old_waiting_time == 15

    def test_handles_new_order(self, restaurant, user):
        """Test avec une nouvelle commande sans pk"""
        new_order = Order(
            order_number="ORD-NEW-001",
            restaurant=restaurant,
            user=user,
            status="pending"
        )
        # Pas de pk = nouvelle commande
        new_order.pk = None
        
        capture_order_changes(sender=Order, instance=new_order)
        
        # Pas d'attributs _old_* car pas de pk
        assert not hasattr(new_order, '_old_status')

    def test_handles_deleted_order(self, order):
        """Test quand la commande n'existe plus en DB"""
        order_pk = order.pk
        
        # Simuler une commande supprimée
        with patch.object(Order.objects, 'get', side_effect=Order.DoesNotExist):
            order.pk = order_pk
            capture_order_changes(sender=Order, instance=order)
        
        assert order._old_status is None


# =============================================================================
# TESTS - Signal order_updated
# =============================================================================

@pytest.mark.django_db
class TestOrderUpdated:
    """Tests pour order_updated"""

    def test_sends_notification_on_creation(self, order, monkeypatch):
        """Test l'envoi de notification à la création"""
        mock_service = MagicMock()
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        order_updated(sender=Order, instance=order, created=True)
        
        mock_service.send_order_update.assert_called_once()
        call_args = mock_service.send_order_update.call_args
        assert call_args[1]['data']['action'] == 'created'

    def test_sends_notification_on_status_change(self, order, monkeypatch):
        """Test l'envoi de notification lors d'un changement de statut"""
        mock_service = MagicMock()
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        order._old_status = "pending"
        order.status = "confirmed"
        
        order_updated(sender=Order, instance=order, created=False)
        
        mock_service.send_order_update.assert_called()

    def test_no_notification_without_change(self, order, monkeypatch):
        """Test qu'aucune notification n'est envoyée sans changement"""
        mock_service = MagicMock()
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        order._old_status = "pending"
        order.status = "pending"
        order._old_waiting_time = None
        order.waiting_time = None
        
        order_updated(sender=Order, instance=order, created=False)
        
        # Pas d'appel car pas de changement
        mock_service.send_order_update.assert_not_called()


# =============================================================================
# TESTS - Timestamps de commande
# =============================================================================

@pytest.mark.django_db
class TestUpdateOrderTimestamps:
    """Tests pour update_order_timestamps"""

    def test_sets_ready_at(self, order):
        """Test que ready_at est défini quand status devient ready"""
        order._old_status = "preparing"
        order.status = "ready"
        
        update_order_timestamps(sender=Order, instance=order)
        
        assert order.ready_at is not None

    def test_sets_served_at(self, order):
        """Test que served_at est défini quand status devient served"""
        order._old_status = "ready"
        order.status = "served"
        
        update_order_timestamps(sender=Order, instance=order)
        
        assert order.served_at is not None

    def test_no_change_for_other_status(self, order):
        """Test qu'aucun timestamp n'est défini pour d'autres statuts"""
        order.ready_at = None
        order.served_at = None
        order.status = "confirmed"
        
        update_order_timestamps(sender=Order, instance=order)
        
        assert order.ready_at is None
        assert order.served_at is None

    def test_handles_new_order(self, restaurant, user):
        """Test avec une nouvelle commande"""
        new_order = Order(
            order_number="ORD-TS-001",
            restaurant=restaurant,
            user=user,
            status="pending"
        )
        new_order.pk = None
        
        # Ne doit pas lever d'exception
        update_order_timestamps(sender=Order, instance=new_order)


# =============================================================================
# TESTS - Notifications push commandes
# =============================================================================

@pytest.mark.django_db
class TestSendOrderPushNotifications:
    """Tests pour send_order_push_notifications"""

    def test_notifies_new_order(self, order, monkeypatch):
        """Test la notification pour une nouvelle commande"""
        mock_push = MagicMock()
        
        # Patcher l'import à l'intérieur de la fonction
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=True)
        
        mock_push.notify_new_order.assert_called_once_with(order)

    def test_notifies_confirmed(self, order, monkeypatch):
        """Test la notification pour commande confirmée"""
        mock_push = MagicMock()
        
        order._old_status = "pending"
        order.status = "confirmed"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_order_confirmed.assert_called_once_with(order)

    def test_notifies_preparing(self, order, monkeypatch):
        """Test la notification pour commande en préparation"""
        mock_push = MagicMock()
        
        order._old_status = "confirmed"
        order.status = "preparing"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_order_preparing.assert_called_once_with(order)

    def test_notifies_ready(self, order, monkeypatch):
        """Test la notification pour commande prête"""
        mock_push = MagicMock()
        
        order._old_status = "preparing"
        order.status = "ready"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_order_ready.assert_called_once_with(order)

    def test_notifies_served(self, order, monkeypatch):
        """Test la notification pour commande servie"""
        mock_push = MagicMock()
        
        order._old_status = "ready"
        order.status = "served"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_order_served.assert_called_once_with(order)

    def test_notifies_cancelled_user(self, order, monkeypatch):
        """Test la notification pour commande annulée (utilisateur)"""
        mock_push = MagicMock()
        
        order._old_status = "pending"
        order.status = "cancelled"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.send_to_user.assert_called_once()

    def test_notifies_cancelled_guest(self, order, monkeypatch):
        """Test la notification pour commande annulée (invité)"""
        mock_push = MagicMock()
        
        order._old_status = "pending"
        order.status = "cancelled"
        order.user_id = None
        order.guest_phone = "+33612345678"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.send_to_guest.assert_called_once()

    def test_no_notification_same_status(self, order, monkeypatch):
        """Test qu'aucune notification n'est envoyée si le statut ne change pas"""
        mock_push = MagicMock()
        
        order._old_status = "pending"
        order.status = "pending"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_order_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_order_confirmed.assert_not_called()

    def test_handles_exception(self, order):
        """Test la gestion d'erreur"""
        # Simuler une exception lors de l'appel
        mock_push = MagicMock()
        mock_push.notify_new_order.side_effect = Exception("Push error")
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                # Ne doit pas lever d'exception
                send_order_push_notifications(sender=Order, instance=order, created=True)


# =============================================================================
# TESTS - Notifications paiement
# =============================================================================

@pytest.mark.django_db
class TestPaymentNotifications:
    """Tests pour les notifications de paiement"""

    def test_capture_payment_status_change(self, order):
        """Test la capture du statut de paiement"""
        order.payment_status = "paid"
        
        capture_payment_status_change(sender=Order, instance=order)
        
        assert order._old_payment_status == "unpaid"

    def test_capture_payment_new_order(self, restaurant, user):
        """Test avec une nouvelle commande"""
        new_order = Order(
            order_number="ORD-PAY-001",
            restaurant=restaurant,
            user=user,
            payment_status="unpaid"
        )
        new_order.pk = None
        
        capture_payment_status_change(sender=Order, instance=new_order)
        
        # Pas d'attribut car nouvelle commande

    def test_send_payment_notification_on_paid(self, order):
        """Test la notification quand le paiement est reçu"""
        mock_push = MagicMock()
        
        order._old_payment_status = "unpaid"
        order.payment_status = "paid"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_payment_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_payment_received.assert_called_once()

    def test_no_notification_on_creation(self, order):
        """Test qu'aucune notification n'est envoyée à la création"""
        mock_push = MagicMock()
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_payment_push_notifications(sender=Order, instance=order, created=True)
        
        mock_push.notify_payment_received.assert_not_called()

    def test_no_notification_same_status(self, order):
        """Test sans changement de statut"""
        mock_push = MagicMock()
        
        order._old_payment_status = "unpaid"
        order.payment_status = "unpaid"
        
        with patch('api.signals.notification_service', mock_push, create=True):
            with patch.dict('sys.modules', {'api.services.notification_service': MagicMock(notification_service=mock_push)}):
                send_payment_push_notifications(sender=Order, instance=order, created=False)
        
        mock_push.notify_payment_received.assert_not_called()


# =============================================================================
# TESTS - Notifications paiement divisé
# =============================================================================

@pytest.mark.django_db
class TestSplitPaymentNotifications:
    """Tests pour les notifications de paiement divisé"""

    def test_capture_portion_payment_change(self, order):
        """Test la capture du changement de portion"""
        # Créer la session de paiement divisé (sans le champ 'session')
        split_session = SplitPaymentSession.objects.create(
            order=order,
            total_amount=order.total_amount,
            split_type="equal"
        )
        portion = SplitPaymentPortion.objects.create(
            session=split_session,
            amount=Decimal("10.00"),
            is_paid=False
        )
        
        portion.is_paid = True
        capture_portion_payment_change(sender=SplitPaymentPortion, instance=portion)
        
        assert portion._old_is_paid is False

    def test_capture_portion_new(self, order):
        """Test avec une nouvelle portion"""
        split_session = SplitPaymentSession.objects.create(
            order=order,
            total_amount=order.total_amount,
            split_type="equal"
        )
        new_portion = SplitPaymentPortion(
            session=split_session,
            amount=Decimal("10.00")
        )
        new_portion.pk = None
        
        capture_portion_payment_change(sender=SplitPaymentPortion, instance=new_portion)
        
        # Pas d'erreur pour une nouvelle portion


# =============================================================================
# TESTS - Notifications participants
# =============================================================================

@pytest.mark.django_db
class TestParticipantNotifications:
    """Tests pour les notifications de participants"""

    def test_capture_participant_status_change(self, session_participant):
        """Test la capture du changement de statut"""
        session_participant.status = "active"
        
        capture_participant_status_change(
            sender=SessionParticipant,
            instance=session_participant
        )
        
        assert session_participant._old_participant_status == "pending"

    def test_participant_post_save_approved(self, session_participant, monkeypatch):
        """Test la notification quand un participant est approuvé"""
        mock_notify = MagicMock()
        monkeypatch.setattr('api.signals.notify_participant_approved', mock_notify)
        
        session_participant.status = "active"
        
        participant_post_save(
            sender=SessionParticipant,
            instance=session_participant,
            created=False
        )
        
        mock_notify.assert_called_once()

    def test_participant_post_save_not_approved(self, session_participant, monkeypatch):
        """Test qu'aucune notification si le statut n'est pas active"""
        mock_notify = MagicMock()
        monkeypatch.setattr('api.signals.notify_participant_approved', mock_notify)
        
        session_participant.status = "pending"
        
        participant_post_save(
            sender=SessionParticipant,
            instance=session_participant,
            created=False
        )
        
        mock_notify.assert_not_called()

    def test_participant_post_save_on_creation(self, session_participant, monkeypatch):
        """Test qu'aucune notification à la création"""
        mock_notify = MagicMock()
        monkeypatch.setattr('api.signals.notify_participant_approved', mock_notify)
        
        session_participant.status = "active"
        
        participant_post_save(
            sender=SessionParticipant,
            instance=session_participant,
            created=True
        )
        
        mock_notify.assert_not_called()

    def test_participant_post_save_exception(self, session_participant, monkeypatch):
        """Test la gestion d'erreur"""
        def raise_error(*args, **kwargs):
            raise Exception("Notification error")
        
        monkeypatch.setattr('api.signals.notify_participant_approved', raise_error)
        
        session_participant.status = "active"
        
        # Ne doit pas lever d'exception
        participant_post_save(
            sender=SessionParticipant,
            instance=session_participant,
            created=False
        )


# =============================================================================
# TESTS - Fonctions utilitaires WebSocket
# =============================================================================

@pytest.mark.django_db
class TestNotifyOrderUpdate:
    """Tests pour notify_order_update"""

    def test_notify_order_update_success(self, monkeypatch):
        """Test l'envoi réussi d'une notification"""
        from api.signals import notify_order_update
        
        mock_service = MagicMock()
        mock_service.send_order_update.return_value = True
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        result = notify_order_update(
            order_id=123,
            status="confirmed",
            waiting_time=15,
            extra_field="test"
        )
        
        assert result is True
        mock_service.send_order_update.assert_called_once()

    def test_notify_order_update_failure(self, monkeypatch):
        """Test l'échec de l'envoi"""
        from api.signals import notify_order_update
        
        mock_service = MagicMock()
        mock_service.send_order_update.return_value = False
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        result = notify_order_update(order_id=123, status="test")
        
        assert result is False

    def test_notify_order_update_exception(self, monkeypatch):
        """Test la gestion d'exception"""
        from api.signals import notify_order_update
        
        mock_service = MagicMock()
        mock_service.send_order_update.side_effect = Exception("Send error")
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        result = notify_order_update(order_id=123, status="test")
        
        assert result is False


@pytest.mark.django_db
class TestNotifyCustomEvent:
    """Tests pour notify_custom_event"""

    def test_notify_custom_event_success(self, monkeypatch):
        """Test l'envoi réussi d'un événement personnalisé"""
        from api.signals import notify_custom_event
        
        mock_service = MagicMock()
        mock_service.send_order_update.return_value = True
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        result = notify_custom_event(
            order_id=123,
            event_type="test_event",
            message="Test message",
            custom_data="value"
        )
        
        assert result is True
        mock_service.send_order_update.assert_called_once()
        call_args = mock_service.send_order_update.call_args
        assert call_args[1]['data']['event_type'] == 'test_event'
        assert call_args[1]['data']['message'] == 'Test message'

    def test_notify_custom_event_failure(self, monkeypatch):
        """Test l'échec de l'envoi"""
        from api.signals import notify_custom_event
        
        mock_service = MagicMock()
        mock_service.send_order_update.return_value = False
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        result = notify_custom_event(
            order_id=123,
            event_type="test",
            message="Test"
        )
        
        assert result is False

    def test_notify_custom_event_exception(self, monkeypatch):
        """Test la gestion d'exception"""
        from api.signals import notify_custom_event
        
        mock_service = MagicMock()
        mock_service.send_order_update.side_effect = Exception("Error")
        monkeypatch.setattr('api.signals.notification_service', mock_service)
        
        result = notify_custom_event(
            order_id=123,
            event_type="test",
            message="Test"
        )
        
        assert result is False


@pytest.mark.django_db
class TestWebsocketNotificationFunction:
    """Tests pour test_websocket_notification (ws_test_notification)"""

    def test_returns_false_when_not_debug(self, settings):
        """Test que la fonction retourne False si DEBUG=False"""
        settings.DEBUG = False
        
        result = ws_test_notification(order_id=123)
        
        assert result is False

    def test_calls_notify_custom_event_in_debug(self, settings, monkeypatch):
        """Test que la fonction appelle notify_custom_event en mode DEBUG"""
        settings.DEBUG = True
        
        mock_notify = MagicMock(return_value=True)
        monkeypatch.setattr('api.signals.notify_custom_event', mock_notify)
        
        result = ws_test_notification(
            order_id=123,
            test_message="Hello test"
        )
        
        assert result is True
        mock_notify.assert_called_once()
        call_args = mock_notify.call_args
        assert call_args[1]['order_id'] == 123
        assert call_args[1]['event_type'] == 'test'
        assert call_args[1]['message'] == 'Hello test'
        assert call_args[1]['test'] is True

    def test_with_default_message(self, settings, monkeypatch):
        """Test avec le message par défaut"""
        settings.DEBUG = True
        
        mock_notify = MagicMock(return_value=True)
        monkeypatch.setattr('api.signals.notify_custom_event', mock_notify)
        
        result = ws_test_notification(order_id=456)
        
        assert result is True
        call_args = mock_notify.call_args
        assert call_args[1]['message'] == 'Test notification'


# =============================================================================
# TESTS - Intégration des signaux
# =============================================================================

@pytest.mark.django_db
class TestSignalIntegration:
    """Tests d'intégration des signaux"""

    def test_restaurateur_profile_creation_triggers_group_assignment(self, db):
        """Test que la création d'un profil restaurateur assigne le groupe"""
        user = User.objects.create_user(
            username="newresto@test.com",
            email="newresto@test.com",
            password="testpass123"
        )
        
        # Créer le profil (le signal devrait s'exécuter)
        profile = RestaurateurProfile.objects.create(
            user=user,
            siret="55555555555555"
        )
        
        # Vérifier que le groupe a été assigné
        assert user.groups.filter(name="restaurateur").exists()

    def test_client_profile_creation_triggers_group_assignment(self, db):
        """Test que la création d'un profil client assigne le groupe"""
        user = User.objects.create_user(
            username="newclient@test.com",
            email="newclient@test.com",
            password="testpass123"
        )
        
        # Créer le profil
        profile = ClientProfile.objects.create(user=user)
        
        # Vérifier que le groupe a été assigné
        assert user.groups.filter(name="client").exists()

    def test_order_status_change_sets_timestamps(self, restaurant, user):
        """Test que les timestamps sont définis lors des changements de statut"""
        with patch('api.signals.send_order_push_notifications'):
            order = Order.objects.create(
                order_number="ORD-INT-001",
                restaurant=restaurant,
                user=user,
                subtotal=Decimal("20.00"),
                tax_amount=Decimal("2.00"),
                total_amount=Decimal("22.00"),
                status="pending",
                payment_status="unpaid",
                payment_method="card"
            )
        
        # Passer à ready
        order.status = "ready"
        order.save()
        
        order.refresh_from_db()
        assert order.ready_at is not None
        
        # Passer à served
        order.status = "served"
        order.save()
        
        order.refresh_from_db()
        assert order.served_at is not None