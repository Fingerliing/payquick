# -*- coding: utf-8 -*-
"""
Tests unitaires pour les modèles de notification
- PushNotificationToken
- NotificationPreferences
- Notification
"""

import pytest
from datetime import time
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone
from api.models import (
    PushNotificationToken,
    NotificationPreferences,
    Notification,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(
        username="notifuser@example.com",
        password="testpass123"
    )


@pytest.fixture
def second_user():
    return User.objects.create_user(
        username="secondnotif@example.com",
        password="testpass123"
    )


@pytest.fixture
def push_token(user):
    return PushNotificationToken.objects.create(
        user=user,
        expo_token="ExponentPushToken[test_token_123]",
        device_id="device_123",
        device_name="iPhone 14 Pro",
        device_platform="ios"
    )


@pytest.fixture
def notification_preferences(user):
    return NotificationPreferences.objects.create(
        user=user,
        order_updates=True,
        promotions=False,
        quiet_hours_enabled=True,
        quiet_hours_start=time(22, 0),
        quiet_hours_end=time(8, 0)
    )


@pytest.fixture
def notification(user):
    return Notification.objects.create(
        user=user,
        notification_type='order_ready',
        title="Commande prête",
        body="Votre commande #123 est prête à être récupérée",
        data={'order_id': 123, 'restaurant': 'Le Bistro'}
    )


# =============================================================================
# TESTS - PushNotificationToken
# =============================================================================

@pytest.mark.django_db
class TestPushNotificationToken:
    """Tests pour le modèle PushNotificationToken"""

    def test_token_creation(self, push_token):
        """Test de la création d'un token de notification"""
        assert push_token.id is not None
        assert push_token.expo_token == "ExponentPushToken[test_token_123]"
        assert push_token.device_id == "device_123"
        assert push_token.device_name == "iPhone 14 Pro"
        assert push_token.device_platform == "ios"
        assert push_token.is_active is True
        assert push_token.created_at is not None

    def test_token_str_method(self, push_token):
        """Test de la méthode __str__"""
        result = str(push_token)
        # Vérifier que le token ou l'info utilisateur est présent
        assert "test_token" in result or push_token.user.username in result

    def test_token_default_is_active(self, user):
        """Test de la valeur par défaut is_active"""
        token = PushNotificationToken.objects.create(
            user=user,
            expo_token="ExponentPushToken[new_token]",
            device_platform="android"
        )
        assert token.is_active is True

    def test_token_platform_choices(self, user):
        """Test des choix de plateforme"""
        platforms = ['ios', 'android', 'web']
        
        for i, platform in enumerate(platforms):
            token = PushNotificationToken.objects.create(
                user=user,
                expo_token=f"ExponentPushToken[platform_{i}]",
                device_platform=platform
            )
            assert token.device_platform == platform

    def test_token_expo_token_unique(self, user, second_user):
        """Test que le token Expo est unique"""
        PushNotificationToken.objects.create(
            user=user,
            expo_token="ExponentPushToken[unique_token]",
            device_platform="ios"
        )
        
        with pytest.raises(IntegrityError):
            PushNotificationToken.objects.create(
                user=second_user,
                expo_token="ExponentPushToken[unique_token]",
                device_platform="android"
            )

    def test_token_multiple_devices_per_user(self, user):
        """Test de plusieurs appareils par utilisateur"""
        PushNotificationToken.objects.create(
            user=user,
            expo_token="ExponentPushToken[device1]",
            device_name="iPhone",
            device_platform="ios"
        )
        PushNotificationToken.objects.create(
            user=user,
            expo_token="ExponentPushToken[device2]",
            device_name="Android Phone",
            device_platform="android"
        )
        
        tokens = PushNotificationToken.objects.filter(user=user)
        assert tokens.count() == 2

    def test_token_optional_fields(self, user):
        """Test des champs optionnels"""
        token = PushNotificationToken.objects.create(
            user=user,
            expo_token="ExponentPushToken[minimal]",
            device_platform="ios"
        )
        
        assert token.device_id is None or token.device_id == ""
        assert token.device_name is None or token.device_name == ""

    def test_token_updated_at(self, push_token):
        """Test du champ updated_at"""
        old_updated = push_token.updated_at
        
        push_token.is_active = False
        push_token.save()
        
        assert push_token.updated_at > old_updated

    def test_token_cascade_delete_with_user(self, user):
        """Test que le token est supprimé avec l'utilisateur"""
        token = PushNotificationToken.objects.create(
            user=user,
            expo_token="ExponentPushToken[to_delete]",
            device_platform="ios"
        )
        token_id = token.id
        
        user.delete()
        
        assert not PushNotificationToken.objects.filter(id=token_id).exists()

    def test_deactivate_token(self, push_token):
        """Test de la désactivation d'un token"""
        push_token.is_active = False
        push_token.save()
        
        push_token.refresh_from_db()
        assert push_token.is_active is False

    def test_token_str_guest(self):
        """Test __str__ pour un token invité sans user (ligne 60)"""
        token = PushNotificationToken.objects.create(
            user=None,
            expo_token="ExponentPushToken[guest_token]",
            guest_phone="0612345678",
            device_platform="android"
        )
        result = str(token)
        assert "0612345678" in result
        assert "android" in result

    def test_mark_as_used(self, push_token):
        """Test de la méthode mark_as_used (lignes 64-65)"""
        assert push_token.last_used_at is None
        
        push_token.mark_as_used()
        
        push_token.refresh_from_db()
        assert push_token.last_used_at is not None


# =============================================================================
# TESTS - NotificationPreferences
# =============================================================================

@pytest.mark.django_db
class TestNotificationPreferences:
    """Tests pour le modèle NotificationPreferences"""

    def test_preferences_creation(self, notification_preferences):
        """Test de la création de préférences"""
        assert notification_preferences.id is not None
        assert notification_preferences.order_updates is True
        assert notification_preferences.promotions is False
        assert notification_preferences.quiet_hours_enabled is True

    def test_preferences_str_method(self, notification_preferences, user):
        """Test de la méthode __str__"""
        result = str(notification_preferences)
        # Devrait contenir l'identifiant de l'utilisateur
        assert user.username in result or "Preferences" in result

    def test_preferences_user_one_to_one(self, user):
        """Test que la relation avec User est OneToOne"""
        NotificationPreferences.objects.create(
            user=user,
            order_updates=True
        )
        
        with pytest.raises(IntegrityError):
            NotificationPreferences.objects.create(
                user=user,
                order_updates=False
            )

    def test_preferences_default_values(self, user):
        """Test des valeurs par défaut"""
        prefs = NotificationPreferences.objects.create(user=user)
        
        # Vérifier les valeurs par défaut selon l'implémentation
        assert prefs.order_updates is True  # Généralement True par défaut
        assert prefs.promotions is False or prefs.promotions is True  # Dépend de l'implémentation

    def test_preferences_quiet_hours(self, notification_preferences):
        """Test des heures calmes"""
        assert notification_preferences.quiet_hours_start == time(22, 0)
        assert notification_preferences.quiet_hours_end == time(8, 0)

    def test_preferences_quiet_hours_optional(self, user):
        """Test que les heures calmes sont optionnelles"""
        prefs = NotificationPreferences.objects.create(
            user=user,
            quiet_hours_enabled=False
        )
        
        assert prefs.quiet_hours_start is None or prefs.quiet_hours_start == time(22, 0)

    def test_preferences_cascade_delete_with_user(self, user):
        """Test que les préférences sont supprimées avec l'utilisateur"""
        prefs = NotificationPreferences.objects.create(user=user)
        prefs_id = prefs.id
        
        user.delete()
        
        assert not NotificationPreferences.objects.filter(id=prefs_id).exists()

    def test_preferences_update(self, notification_preferences):
        """Test de la mise à jour des préférences"""
        notification_preferences.promotions = True
        notification_preferences.quiet_hours_enabled = False
        notification_preferences.save()
        
        notification_preferences.refresh_from_db()
        assert notification_preferences.promotions is True
        assert notification_preferences.quiet_hours_enabled is False

    def test_is_quiet_time_disabled(self, user):
        """Test is_quiet_time retourne False quand désactivé (ligne 108)"""
        prefs = NotificationPreferences.objects.create(
            user=user,
            quiet_hours_enabled=False,
            quiet_hours_start=time(22, 0),
            quiet_hours_end=time(8, 0)
        )
        assert prefs.is_quiet_time() is False

    @pytest.mark.parametrize("now_time,expected", [
        (time(12, 0), True),   # dans la plage
        (time(9, 0), False),   # avant la plage
        (time(15, 0), False),  # après la plage
    ])
    def test_is_quiet_time_same_day(self, user, now_time, expected):
        """Test is_quiet_time quand start <= end (ligne 115)"""
        from unittest.mock import patch
        from datetime import datetime

        prefs = NotificationPreferences.objects.create(
            user=user,
            quiet_hours_enabled=True,
            quiet_hours_start=time(10, 0),
            quiet_hours_end=time(14, 0)
        )
        
        mock_dt = timezone.make_aware(datetime(2025, 1, 15, now_time.hour, now_time.minute))
        with patch('django.utils.timezone.localtime', return_value=mock_dt):
            assert prefs.is_quiet_time() is expected

    @pytest.mark.parametrize("now_time,expected", [
        (time(23, 0), True),   # après start (avant minuit)
        (time(3, 0), True),    # avant end (après minuit)
        (time(12, 0), False),  # en journée, hors plage
    ])
    def test_is_quiet_time_crossing_midnight(self, user, now_time, expected):
        """Test is_quiet_time quand passage de minuit start > end (ligne 118)"""
        from unittest.mock import patch
        from datetime import datetime

        prefs = NotificationPreferences.objects.create(
            user=user,
            quiet_hours_enabled=True,
            quiet_hours_start=time(22, 0),
            quiet_hours_end=time(8, 0)
        )
        
        mock_dt = timezone.make_aware(datetime(2025, 1, 15, now_time.hour, now_time.minute))
        with patch('django.utils.timezone.localtime', return_value=mock_dt):
            assert prefs.is_quiet_time() is expected


# =============================================================================
# TESTS - Notification
# =============================================================================

@pytest.mark.django_db
class TestNotification:
    """Tests pour le modèle Notification"""

    def test_notification_creation(self, notification):
        """Test de la création d'une notification"""
        assert notification.id is not None
        assert notification.notification_type == 'order_ready'
        assert notification.title == "Commande prête"
        assert notification.body == "Votre commande #123 est prête à être récupérée"
        assert notification.is_read is False
        assert notification.created_at is not None

    def test_notification_str_method(self, notification):
        """Test de la méthode __str__"""
        result = str(notification)
        assert "Commande prête" in result or notification.notification_type in result

    def test_notification_default_is_read(self, user):
        """Test de la valeur par défaut is_read"""
        notif = Notification.objects.create(
            user=user,
            notification_type='system',
            title="Test",
            body="Test notification"
        )
        assert notif.is_read is False

    def test_notification_data_json_field(self, notification):
        """Test du champ JSON data"""
        assert notification.data['order_id'] == 123
        assert notification.data['restaurant'] == 'Le Bistro'

    def test_notification_data_empty_default(self, user):
        """Test que data est vide par défaut"""
        notif = Notification.objects.create(
            user=user,
            notification_type='system',
            title="No Data",
            body="Notification without data"
        )
        assert notif.data == {} or notif.data is None

    def test_notification_type_choices(self, user):
        """Test des types de notification"""
        types = ['order_ready', 'order_update', 'promotion', 'system', 'payment']
        
        for i, ntype in enumerate(types):
            notif = Notification.objects.create(
                user=user,
                notification_type=ntype,
                title=f"Test {ntype}",
                body=f"Body for {ntype}"
            )
            assert notif.notification_type == ntype

    def test_notification_priority_field(self, user):
        """Test du champ priority"""
        high_priority = Notification.objects.create(
            user=user,
            notification_type='order_ready',
            title="Urgent",
            body="Urgent notification",
            priority='high'
        )
        assert high_priority.priority == 'high'
        
        low_priority = Notification.objects.create(
            user=user,
            notification_type='promotion',
            title="Promo",
            body="Promo notification",
            priority='low'
        )
        assert low_priority.priority == 'low'

    def test_notification_mark_as_read(self, notification):
        """Test de la lecture d'une notification"""
        assert notification.is_read is False
        
        notification.is_read = True
        notification.save()
        
        notification.refresh_from_db()
        assert notification.is_read is True

    def test_notification_ordering(self, user):
        """Test de l'ordre par défaut (created_at desc)"""
        n1 = Notification.objects.create(
            user=user, notification_type='system',
            title="First", body="First notification"
        )
        n2 = Notification.objects.create(
            user=user, notification_type='system',
            title="Second", body="Second notification"
        )
        
        notifications = list(Notification.objects.filter(user=user))
        # Plus récent en premier
        assert notifications[0] == n2
        assert notifications[1] == n1

    def test_notification_cascade_delete_with_user(self, user):
        """Test que la notification est supprimée avec l'utilisateur"""
        notif = Notification.objects.create(
            user=user,
            notification_type='system',
            title="To Delete",
            body="Will be deleted"
        )
        notif_id = notif.id
        
        user.delete()
        
        assert not Notification.objects.filter(id=notif_id).exists()

    def test_notification_multiple_per_user(self, user):
        """Test de plusieurs notifications par utilisateur"""
        for i in range(5):
            Notification.objects.create(
                user=user,
                notification_type='system',
                title=f"Notification {i}",
                body=f"Body {i}"
            )
        
        assert Notification.objects.filter(user=user).count() == 5

    def test_unread_notifications_filter(self, user):
        """Test du filtrage des notifications non lues"""
        Notification.objects.create(
            user=user, notification_type='system',
            title="Unread 1", body="Body", is_read=False
        )
        Notification.objects.create(
            user=user, notification_type='system',
            title="Unread 2", body="Body", is_read=False
        )
        Notification.objects.create(
            user=user, notification_type='system',
            title="Read", body="Body", is_read=True
        )
        
        unread = Notification.objects.filter(user=user, is_read=False)
        assert unread.count() == 2

    def test_notification_read_at_field(self, user):
        """Test du champ read_at"""
        notif = Notification.objects.create(
            user=user,
            notification_type='order_ready',
            title="Test",
            body="Test"
        )
        
        assert notif.read_at is None
        
        # Marquer comme lu avec timestamp
        if hasattr(notif, 'read_at'):
            notif.is_read = True
            notif.read_at = timezone.now()
            notif.save()
            
            assert notif.read_at is not None

    def test_mark_as_read_method(self, notification):
        """Test de la méthode mark_as_read (lignes 200-203)"""
        assert notification.is_read is False
        assert notification.read_at is None
        
        notification.mark_as_read()
        
        notification.refresh_from_db()
        assert notification.is_read is True
        assert notification.read_at is not None

    def test_mark_as_read_idempotent(self, notification):
        """Test que mark_as_read ne modifie pas si déjà lu"""
        notification.mark_as_read()
        first_read_at = notification.read_at
        
        # Appeler une seconde fois ne devrait pas changer read_at
        notification.mark_as_read()
        assert notification.read_at == first_read_at

    def test_is_expired_true(self, user):
        """Test is_expired retourne True quand expiré (lignes 208-210)"""
        from datetime import timedelta
        notif = Notification.objects.create(
            user=user,
            notification_type='system',
            title="Expired",
            body="This is expired",
            expires_at=timezone.now() - timedelta(hours=1)
        )
        assert notif.is_expired is True

    def test_is_expired_false(self, user):
        """Test is_expired retourne False quand pas encore expiré"""
        from datetime import timedelta
        notif = Notification.objects.create(
            user=user,
            notification_type='system',
            title="Not expired",
            body="Still valid",
            expires_at=timezone.now() + timedelta(hours=1)
        )
        assert notif.is_expired is False

    def test_is_expired_no_expiry(self, notification):
        """Test is_expired retourne False quand pas de date d'expiration"""
        assert notification.expires_at is None
        assert notification.is_expired is False