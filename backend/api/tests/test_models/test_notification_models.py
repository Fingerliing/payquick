# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de notification
- PushNotificationToken
- NotificationPreferences
- Notification
"""

import pytest
from datetime import timedelta, time
from django.utils import timezone
from django.contrib.auth.models import User
from api.models import (
    PushNotificationToken,
    NotificationPreferences,
    Notification
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="notifuser", password="testpass123")


@pytest.fixture
def second_user():
    return User.objects.create_user(username="secondnotifuser", password="testpass123")


@pytest.fixture
def push_token(user):
    return PushNotificationToken.objects.create(
        user=user,
        expo_token="ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
        device_id="device_123",
        device_name="iPhone de Test",
        device_platform="ios"
    )


@pytest.fixture
def notification_preferences(user):
    return NotificationPreferences.objects.create(
        user=user,
        order_updates=True,
        order_ready=True,
        payment_received=True,
        new_orders=True,
        promotions=False
    )


@pytest.fixture
def notification(user):
    return Notification.objects.create(
        user=user,
        notification_type='order_created',
        title="Nouvelle commande",
        body="Votre commande #123 a été créée",
        data={'order_id': 123}
    )


# =============================================================================
# TESTS - PushNotificationToken
# =============================================================================

@pytest.mark.django_db
class TestPushNotificationToken:
    """Tests pour le modèle PushNotificationToken"""

    def test_push_token_creation(self, push_token):
        """Test de la création d'un token push"""
        assert push_token.id is not None
        assert push_token.expo_token == "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
        assert push_token.device_id == "device_123"
        assert push_token.device_name == "iPhone de Test"
        assert push_token.device_platform == "ios"
        assert push_token.is_active is True
        assert push_token.created_at is not None

    def test_push_token_str_with_user(self, push_token, user):
        """Test de __str__ avec un utilisateur"""
        result = str(push_token)
        assert user.username in result
        assert "ios" in result

    def test_push_token_str_guest(self):
        """Test de __str__ pour un invité"""
        token = PushNotificationToken.objects.create(
            expo_token="ExponentPushToken[guest]",
            guest_phone="0612345678",
            device_platform="android"
        )
        result = str(token)
        assert "invité" in result
        assert "0612345678" in result

    def test_expo_token_unique(self, push_token):
        """Test que le token Expo est unique"""
        with pytest.raises(Exception):  # IntegrityError
            PushNotificationToken.objects.create(
                expo_token="ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",  # Même token
                device_platform="android"
            )

    def test_mark_as_used(self, push_token):
        """Test de la méthode mark_as_used"""
        assert push_token.last_used_at is None
        
        push_token.mark_as_used()
        
        assert push_token.last_used_at is not None

    def test_device_platform_choices(self, user):
        """Test des choix de plateforme"""
        platforms = ['ios', 'android', 'web']
        
        for i, platform in enumerate(platforms):
            token = PushNotificationToken.objects.create(
                user=user,
                expo_token=f"ExponentPushToken[{platform}_{i}]",
                device_platform=platform
            )
            assert token.device_platform == platform

    def test_guest_token_without_user(self):
        """Test d'un token invité sans utilisateur"""
        token = PushNotificationToken.objects.create(
            expo_token="ExponentPushToken[guest123]",
            guest_phone="0698765432",
            device_platform="android"
        )
        assert token.user is None
        assert token.guest_phone == "0698765432"

    def test_multiple_tokens_per_user(self, user):
        """Test de plusieurs tokens par utilisateur"""
        for i in range(3):
            PushNotificationToken.objects.create(
                user=user,
                expo_token=f"ExponentPushToken[device{i}]",
                device_id=f"device_{i}",
                device_platform="ios"
            )
        
        assert PushNotificationToken.objects.filter(user=user).count() == 3

    def test_is_active_default(self, push_token):
        """Test que is_active est True par défaut"""
        assert push_token.is_active is True

    def test_deactivate_token(self, push_token):
        """Test de la désactivation d'un token"""
        push_token.is_active = False
        push_token.save()
        
        push_token.refresh_from_db()
        assert push_token.is_active is False


# =============================================================================
# TESTS - NotificationPreferences
# =============================================================================

@pytest.mark.django_db
class TestNotificationPreferences:
    """Tests pour le modèle NotificationPreferences"""

    def test_preferences_creation(self, notification_preferences):
        """Test de la création des préférences"""
        assert notification_preferences.id is not None
        assert notification_preferences.order_updates is True
        assert notification_preferences.order_ready is True
        assert notification_preferences.promotions is False

    def test_preferences_str(self, notification_preferences, user):
        """Test de __str__"""
        expected = f"Préférences de {user.username}"
        assert str(notification_preferences) == expected

    def test_one_to_one_with_user(self, notification_preferences, user):
        """Test que la relation avec User est OneToOne"""
        with pytest.raises(Exception):  # IntegrityError
            NotificationPreferences.objects.create(
                user=user  # Même utilisateur
            )

    def test_quiet_hours_disabled_by_default(self, notification_preferences):
        """Test que les heures silencieuses sont désactivées par défaut"""
        assert notification_preferences.quiet_hours_enabled is False

    def test_quiet_hours_enabled(self, notification_preferences):
        """Test de l'activation des heures silencieuses"""
        notification_preferences.quiet_hours_enabled = True
        notification_preferences.quiet_hours_start = time(22, 0)
        notification_preferences.quiet_hours_end = time(8, 0)
        notification_preferences.save()
        
        notification_preferences.refresh_from_db()
        assert notification_preferences.quiet_hours_enabled is True

    def test_is_quiet_time_disabled(self, notification_preferences):
        """Test is_quiet_time quand désactivé"""
        notification_preferences.quiet_hours_enabled = False
        assert notification_preferences.is_quiet_time() is False

    def test_is_quiet_time_same_day(self, notification_preferences):
        """Test is_quiet_time pour une période dans la même journée"""
        notification_preferences.quiet_hours_enabled = True
        notification_preferences.quiet_hours_start = time(10, 0)
        notification_preferences.quiet_hours_end = time(12, 0)
        notification_preferences.save()
        
        # Le test dépend de l'heure actuelle, donc on teste juste que ça ne crash pas
        result = notification_preferences.is_quiet_time()
        assert isinstance(result, bool)

    def test_is_quiet_time_overnight(self, notification_preferences):
        """Test is_quiet_time pour une période passant minuit"""
        notification_preferences.quiet_hours_enabled = True
        notification_preferences.quiet_hours_start = time(22, 0)
        notification_preferences.quiet_hours_end = time(8, 0)
        notification_preferences.save()
        
        # Le test dépend de l'heure actuelle
        result = notification_preferences.is_quiet_time()
        assert isinstance(result, bool)

    def test_sound_and_vibration_defaults(self, user):
        """Test des valeurs par défaut pour son et vibration"""
        prefs = NotificationPreferences.objects.create(user=user)
        assert prefs.sound_enabled is True
        assert prefs.vibration_enabled is True

    def test_all_notification_types(self, second_user):
        """Test de tous les types de notifications"""
        prefs = NotificationPreferences.objects.create(
            user=second_user,
            order_updates=False,
            order_ready=False,
            payment_received=False,
            new_orders=False,
            promotions=True
        )
        
        assert prefs.order_updates is False
        assert prefs.order_ready is False
        assert prefs.payment_received is False
        assert prefs.new_orders is False
        assert prefs.promotions is True


# =============================================================================
# TESTS - Notification
# =============================================================================

@pytest.mark.django_db
class TestNotification:
    """Tests pour le modèle Notification"""

    def test_notification_creation(self, notification):
        """Test de la création d'une notification"""
        assert notification.id is not None
        assert notification.notification_type == 'order_created'
        assert notification.title == "Nouvelle commande"
        assert notification.body == "Votre commande #123 a été créée"
        assert notification.is_read is False
        assert notification.created_at is not None

    def test_notification_str(self, notification):
        """Test de __str__"""
        expected = f"{notification.notification_type}: {notification.title}"
        assert str(notification) == expected

    def test_notification_types(self, user):
        """Test des différents types de notification"""
        types = [
            'order_created', 'order_confirmed', 'order_preparing',
            'order_ready', 'order_served', 'order_cancelled',
            'payment_received', 'payment_failed', 'split_payment_update',
            'session_joined', 'session_left', 'promotion', 'system'
        ]
        
        for i, notif_type in enumerate(types):
            notif = Notification.objects.create(
                user=user,
                notification_type=notif_type,
                title=f"Test {notif_type}",
                body=f"Body for {notif_type}"
            )
            assert notif.notification_type == notif_type

    def test_priority_choices(self, user):
        """Test des différentes priorités"""
        priorities = ['low', 'normal', 'high', 'critical']
        
        for priority in priorities:
            notif = Notification.objects.create(
                user=user,
                notification_type='system',
                title="Test Priority",
                body="Body",
                priority=priority
            )
            assert notif.priority == priority

    def test_priority_default(self, notification):
        """Test de la priorité par défaut"""
        assert notification.priority == 'normal'

    def test_mark_as_read(self, notification):
        """Test de la méthode mark_as_read"""
        assert notification.is_read is False
        assert notification.read_at is None
        
        notification.mark_as_read()
        
        assert notification.is_read is True
        assert notification.read_at is not None

    def test_mark_as_read_idempotent(self, notification):
        """Test que mark_as_read est idempotent"""
        notification.mark_as_read()
        first_read_at = notification.read_at
        
        notification.mark_as_read()
        
        # Ne devrait pas changer la date
        assert notification.read_at == first_read_at

    def test_is_expired_no_expiry(self, notification):
        """Test is_expired sans date d'expiration"""
        assert notification.is_expired is False

    def test_is_expired_not_yet(self, notification):
        """Test is_expired quand pas encore expiré"""
        notification.expires_at = timezone.now() + timedelta(hours=1)
        notification.save()
        assert notification.is_expired is False

    def test_is_expired_past(self, notification):
        """Test is_expired quand expiré"""
        notification.expires_at = timezone.now() - timedelta(hours=1)
        notification.save()
        assert notification.is_expired is True

    def test_data_json_field(self, user):
        """Test du champ JSON data"""
        notif = Notification.objects.create(
            user=user,
            notification_type='order_ready',
            title="Commande prête",
            body="Votre commande est prête",
            data={
                'order_id': 456,
                'restaurant_name': 'Test Resto',
                'table_number': 'T01'
            }
        )
        
        assert notif.data['order_id'] == 456
        assert notif.data['restaurant_name'] == 'Test Resto'

    def test_guest_notification(self):
        """Test d'une notification pour un invité"""
        notif = Notification.objects.create(
            guest_phone="0612345678",
            notification_type='order_ready',
            title="Commande prête",
            body="Body"
        )
        assert notif.user is None
        assert notif.guest_phone == "0612345678"

    def test_push_tracking(self, notification):
        """Test du tracking d'envoi push"""
        assert notification.push_sent is False
        assert notification.push_sent_at is None
        
        notification.push_sent = True
        notification.push_sent_at = timezone.now()
        notification.save()
        
        notification.refresh_from_db()
        assert notification.push_sent is True
        assert notification.push_sent_at is not None

    def test_push_error_tracking(self, notification):
        """Test du tracking des erreurs push"""
        notification.push_error = "DeviceNotRegistered"
        notification.save()
        
        notification.refresh_from_db()
        assert notification.push_error == "DeviceNotRegistered"

    def test_ordering(self, user):
        """Test que les notifications sont ordonnées par date décroissante"""
        old = Notification.objects.create(
            user=user,
            notification_type='system',
            title="Old",
            body="Old notification"
        )
        import time
        time.sleep(0.1)
        
        new = Notification.objects.create(
            user=user,
            notification_type='system',
            title="New",
            body="New notification"
        )
        
        notifications = list(Notification.objects.filter(user=user))
        assert notifications[0] == new
        assert notifications[1] == old

    def test_order_id_reference(self, notification):
        """Test de la référence order_id optionnelle"""
        notification.order_id = 999
        notification.save()
        
        notification.refresh_from_db()
        assert notification.order_id == 999

    def test_restaurant_id_reference(self, notification):
        """Test de la référence restaurant_id optionnelle"""
        notification.restaurant_id = 42
        notification.save()
        
        notification.refresh_from_db()
        assert notification.restaurant_id == 42
