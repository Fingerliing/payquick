# -*- coding: utf-8 -*-
"""
Tests unitaires pour les serializers de notification
"""

import pytest
from datetime import time
from django.contrib.auth.models import User
from api.models import (
    PushNotificationToken,
    NotificationPreferences,
    Notification
)
from api.serializers.notification_serializers import (
    PushTokenSerializer,
    NotificationPreferencesSerializer,
    NotificationSerializer,
    NotificationListSerializer,
    RegisterTokenSerializer,
    UnreadCountSerializer,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def user():
    return User.objects.create_user(username="notifseruser", password="testpass123")


@pytest.fixture
def push_token(user):
    return PushNotificationToken.objects.create(
        user=user,
        expo_token="ExponentPushToken[serializer_test]",
        device_id="device_ser_123",
        device_name="iPhone Test",
        device_platform="ios"
    )


@pytest.fixture
def notification_preferences(user):
    return NotificationPreferences.objects.create(
        user=user,
        order_updates=True,
        promotions=False
    )


@pytest.fixture
def notification(user):
    return Notification.objects.create(
        user=user,
        notification_type='order_ready',
        title="Commande prête",
        body="Votre commande est prête à être récupérée",
        data={'order_id': 123}
    )


# =============================================================================
# TESTS - PushTokenSerializer
# =============================================================================

@pytest.mark.django_db
class TestPushTokenSerializer:
    """Tests pour PushTokenSerializer"""

    def test_serializer_fields(self, push_token):
        """Test des champs du serializer"""
        serializer = PushTokenSerializer(push_token)
        data = serializer.data
        
        assert 'id' in data
        assert 'expo_token' in data
        assert 'device_id' in data
        assert 'device_name' in data
        assert 'device_platform' in data
        assert 'is_active' in data

    def test_expo_token_serialization(self, push_token):
        """Test de la sérialisation du token Expo"""
        serializer = PushTokenSerializer(push_token)
        assert serializer.data['expo_token'] == "ExponentPushToken[serializer_test]"

    def test_device_platform_value(self, push_token):
        """Test de la valeur de la plateforme"""
        serializer = PushTokenSerializer(push_token)
        assert serializer.data['device_platform'] == 'ios'


# =============================================================================
# TESTS - RegisterTokenSerializer
# =============================================================================

@pytest.mark.django_db
class TestRegisterTokenSerializer:
    """Tests pour RegisterTokenSerializer"""

    def test_valid_data(self):
        """Test avec des données valides"""
        data = {
            'expo_token': 'ExponentPushToken[valid_token]',
            'device_platform': 'android'
        }
        serializer = RegisterTokenSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_required_expo_token(self):
        """Test que expo_token est requis"""
        data = {
            'device_platform': 'ios'
        }
        serializer = RegisterTokenSerializer(data=data)
        assert not serializer.is_valid()
        assert 'expo_token' in serializer.errors

    def test_optional_device_id(self):
        """Test que device_id est optionnel"""
        data = {
            'expo_token': 'ExponentPushToken[test]',
            'device_platform': 'ios'
        }
        serializer = RegisterTokenSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_optional_device_name(self):
        """Test que device_name est optionnel"""
        data = {
            'expo_token': 'ExponentPushToken[test]',
            'device_platform': 'ios',
            'device_name': 'Mon iPhone'
        }
        serializer = RegisterTokenSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_guest_phone_for_guests(self):
        """Test du numéro de téléphone pour les invités"""
        data = {
            'expo_token': 'ExponentPushToken[guest]',
            'device_platform': 'android',
            'guest_phone': '0612345678'
        }
        serializer = RegisterTokenSerializer(data=data)
        assert serializer.is_valid(), serializer.errors


# =============================================================================
# TESTS - NotificationPreferencesSerializer
# =============================================================================

@pytest.mark.django_db
class TestNotificationPreferencesSerializer:
    """Tests pour NotificationPreferencesSerializer"""

    def test_serializer_fields(self, notification_preferences):
        """Test des champs du serializer"""
        serializer = NotificationPreferencesSerializer(notification_preferences)
        data = serializer.data
        
        assert 'order_updates' in data
        assert 'order_ready' in data
        assert 'payment_received' in data
        assert 'new_orders' in data
        assert 'promotions' in data
        assert 'quiet_hours_enabled' in data
        assert 'sound_enabled' in data
        assert 'vibration_enabled' in data

    def test_boolean_fields(self, notification_preferences):
        """Test des champs booléens"""
        serializer = NotificationPreferencesSerializer(notification_preferences)
        
        assert serializer.data['order_updates'] is True
        assert serializer.data['promotions'] is False

    def test_quiet_hours_fields(self, notification_preferences):
        """Test des champs d'heures silencieuses"""
        notification_preferences.quiet_hours_enabled = True
        notification_preferences.quiet_hours_start = time(22, 0)
        notification_preferences.quiet_hours_end = time(8, 0)
        notification_preferences.save()
        
        serializer = NotificationPreferencesSerializer(notification_preferences)
        
        assert serializer.data['quiet_hours_enabled'] is True

    def test_update_preferences(self, notification_preferences):
        """Test de la mise à jour des préférences"""
        serializer = NotificationPreferencesSerializer(
            notification_preferences,
            data={'promotions': True},
            partial=True
        )
        
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.promotions is True


# =============================================================================
# TESTS - NotificationSerializer
# =============================================================================

@pytest.mark.django_db
class TestNotificationSerializer:
    """Tests pour NotificationSerializer"""

    def test_serializer_fields(self, notification):
        """Test des champs du serializer"""
        serializer = NotificationSerializer(notification)
        data = serializer.data
        
        assert 'id' in data
        assert 'notification_type' in data
        assert 'title' in data
        assert 'body' in data
        assert 'data' in data
        assert 'is_read' in data
        assert 'created_at' in data
        assert 'priority' in data

    def test_notification_type(self, notification):
        """Test du type de notification"""
        serializer = NotificationSerializer(notification)
        assert serializer.data['notification_type'] == 'order_ready'

    def test_data_json_field(self, notification):
        """Test du champ JSON data"""
        serializer = NotificationSerializer(notification)
        assert serializer.data['data']['order_id'] == 123

    def test_is_read_default(self, notification):
        """Test de la valeur par défaut is_read"""
        serializer = NotificationSerializer(notification)
        assert serializer.data['is_read'] is False


# =============================================================================
# TESTS - NotificationListSerializer
# =============================================================================

@pytest.mark.django_db
class TestNotificationListSerializer:
    """Tests pour NotificationListSerializer"""

    def test_serializer_fields(self, notification):
        """Test des champs du serializer liste"""
        # NotificationListSerializer expects a paginated response dict
        paginated_data = {
            'results': [notification],
            'count': 1,
            'page': 1,
            'page_size': 10,
            'total_pages': 1
        }
        serializer = NotificationListSerializer(paginated_data)
        data = serializer.data
        
        assert 'results' in data
        assert 'count' in data
        assert 'page' in data
        assert 'page_size' in data
        assert 'total_pages' in data
        
        # Check that the notification inside results has expected fields
        assert len(data['results']) == 1
        assert 'id' in data['results'][0]
        assert 'notification_type' in data['results'][0]
        assert 'title' in data['results'][0]

    def test_multiple_notifications(self, user):
        """Test avec plusieurs notifications"""
        notifications = []
        for i in range(3):
            notif = Notification.objects.create(
                user=user,
                notification_type='system',
                title=f"Notification {i}",
                body=f"Body {i}"
            )
            notifications.append(notif)
        
        # NotificationListSerializer expects a paginated response dict
        paginated_data = {
            'results': notifications,
            'count': 3,
            'page': 1,
            'page_size': 10,
            'total_pages': 1
        }
        serializer = NotificationListSerializer(paginated_data)
        assert len(serializer.data['results']) == 3


# =============================================================================
# TESTS - UnreadCountSerializer
# =============================================================================

@pytest.mark.django_db
class TestUnreadCountSerializer:
    """Tests pour UnreadCountSerializer"""

    def test_serializer_fields(self):
        """Test des champs du serializer"""
        data = {'unread_count': 5}
        serializer = UnreadCountSerializer(data=data)
        assert serializer.is_valid()
        assert serializer.validated_data['unread_count'] == 5

    def test_unread_count_integer(self):
        """Test que unread_count est un entier"""
        data = {'unread_count': 'invalid'}
        serializer = UnreadCountSerializer(data=data)
        assert not serializer.is_valid()

    def test_unread_count_zero(self):
        """Test avec zéro notifications non lues"""
        data = {'unread_count': 0}
        serializer = UnreadCountSerializer(data=data)
        assert serializer.is_valid()
        assert serializer.validated_data['unread_count'] == 0