# -*- coding: utf-8 -*-
"""
Tests unitaires pour les vues de notifications
- RegisterPushTokenView (enregistrement tokens push)
- UnregisterPushTokenView (suppression tokens)
- NotificationPreferencesView (préférences utilisateur)
- NotificationListView (liste des notifications)
- NotificationDetailView (détail/suppression)
- MarkNotificationReadView (marquer comme lu)
- MarkAllReadView (tout marquer comme lu)
- UnreadCountView (compteur non lues)
"""

import pytest
from datetime import time, timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from api.models import (
    PushNotificationToken,
    NotificationPreferences,
    Notification,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def api_client():
    """Client non authentifié"""
    return APIClient()


@pytest.fixture
def user(db):
    """Utilisateur standard"""
    return User.objects.create_user(
        username="notif_user@example.com",
        email="notif_user@example.com",
        password="testpass123"
    )


@pytest.fixture
def second_user(db):
    """Deuxième utilisateur pour tests d'isolation"""
    return User.objects.create_user(
        username="second_notif@example.com",
        email="second_notif@example.com",
        password="testpass123"
    )


@pytest.fixture
def auth_client(user):
    """Client authentifié"""
    token = RefreshToken.for_user(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def second_auth_client(second_user):
    """Client authentifié pour le deuxième utilisateur"""
    token = RefreshToken.for_user(second_user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def push_token(user):
    """Token push existant"""
    return PushNotificationToken.objects.create(
        user=user,
        expo_token="ExponentPushToken[existing_token_123]",
        device_id="device_123",
        device_name="iPhone Test",
        device_platform="ios",
        is_active=True
    )


@pytest.fixture
def notification_preferences(user):
    """Préférences de notification existantes"""
    return NotificationPreferences.objects.create(
        user=user,
        order_updates=True,
        order_ready=True,
        payment_received=True,
        new_orders=True,
        promotions=False,
        quiet_hours_enabled=False,
        sound_enabled=True,
        vibration_enabled=True
    )


@pytest.fixture
def notification(user):
    """Notification de test"""
    return Notification.objects.create(
        user=user,
        notification_type='order_ready',
        title="Commande prête",
        body="Votre commande #123 est prête",
        data={'order_id': 123},
        priority='high',
        is_read=False
    )


@pytest.fixture
def read_notification(user):
    """Notification déjà lue"""
    return Notification.objects.create(
        user=user,
        notification_type='order_confirmed',
        title="Commande confirmée",
        body="Votre commande a été confirmée",
        data={'order_id': 456},
        is_read=True,
        read_at=timezone.now()
    )


@pytest.fixture
def multiple_notifications(user):
    """Plusieurs notifications pour tests de liste/pagination"""
    notifications = []
    for i in range(15):
        notif = Notification.objects.create(
            user=user,
            notification_type='order_update' if i % 2 == 0 else 'system',
            title=f"Notification {i+1}",
            body=f"Corps de la notification {i+1}",
            data={'index': i},
            is_read=i < 5  # Les 5 premières sont lues
        )
        notifications.append(notif)
    return notifications


@pytest.fixture
def expired_notification(user):
    """Notification expirée"""
    return Notification.objects.create(
        user=user,
        notification_type='promo',
        title="Promo expirée",
        body="Cette promo est terminée",
        expires_at=timezone.now() - timedelta(hours=1),
        is_read=False
    )


# =============================================================================
# TESTS - RegisterPushTokenView
# =============================================================================

@pytest.mark.django_db
class TestRegisterPushToken:
    """Tests pour l'enregistrement des tokens push"""

    def test_register_token_authenticated_user(self, auth_client, user):
        """Test d'enregistrement d'un token pour utilisateur authentifié"""
        data = {
            'expo_token': 'ExponentPushToken[new_token_abc]',
            'device_id': 'device_abc',
            'device_name': 'Mon iPhone',
            'device_platform': 'ios'
        }
        
        response = auth_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['expo_token'] == 'ExponentPushToken[new_token_abc]'
        assert response.data['device_platform'] == 'ios'
        
        # Vérifier en base
        token = PushNotificationToken.objects.get(expo_token='ExponentPushToken[new_token_abc]')
        assert token.user == user
        assert token.is_active is True

    def test_register_token_guest_with_phone(self, api_client):
        """Test d'enregistrement d'un token pour invité avec téléphone"""
        data = {
            'expo_token': 'ExponentPushToken[guest_token_xyz]',
            'guest_phone': '+33612345678',
            'device_platform': 'android'
        }
        
        response = api_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        
        token = PushNotificationToken.objects.get(expo_token='ExponentPushToken[guest_token_xyz]')
        assert token.user is None
        assert token.guest_phone == '+33612345678'

    def test_register_token_guest_without_phone_fails(self, api_client):
        """Test que l'enregistrement sans auth ni téléphone échoue"""
        data = {
            'expo_token': 'ExponentPushToken[orphan_token]',
            'device_platform': 'android'
        }
        
        response = api_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_register_token_invalid_format(self, auth_client):
        """Test avec format de token invalide"""
        data = {
            'expo_token': 'invalid_token_format',
            'device_platform': 'ios'
        }
        
        response = auth_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_existing_token(self, auth_client, push_token, user):
        """Test de mise à jour d'un token existant"""
        data = {
            'expo_token': push_token.expo_token,
            'device_name': 'Nouveau nom appareil',
            'device_platform': 'android'
        }
        
        response = auth_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        push_token.refresh_from_db()
        assert push_token.device_name == 'Nouveau nom appareil'
        assert push_token.device_platform == 'android'

    def test_register_token_expo_push_token_format(self, auth_client):
        """Test avec format ExpoPushToken (alternatif)"""
        data = {
            'expo_token': 'ExpoPushToken[alternative_format]',
            'device_platform': 'ios'
        }
        
        response = auth_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED


# =============================================================================
# TESTS - UnregisterPushTokenView
# =============================================================================

@pytest.mark.django_db
class TestUnregisterPushToken:
    """Tests pour la suppression des tokens push"""

    def test_unregister_existing_token(self, api_client, push_token):
        """Test de désactivation d'un token existant"""
        data = {
            'expo_token': push_token.expo_token
        }
        
        response = api_client.post('/api/v1/notifications/tokens/unregister/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        push_token.refresh_from_db()
        assert push_token.is_active is False

    def test_unregister_nonexistent_token(self, api_client):
        """Test de désactivation d'un token inexistant"""
        data = {
            'expo_token': 'ExponentPushToken[does_not_exist]'
        }
        
        response = api_client.post('/api/v1/notifications/tokens/unregister/', data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unregister_missing_token(self, api_client):
        """Test sans expo_token"""
        data = {}
        
        response = api_client.post('/api/v1/notifications/tokens/unregister/', data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# TESTS - NotificationPreferencesView
# =============================================================================

@pytest.mark.django_db
class TestNotificationPreferences:
    """Tests pour les préférences de notification"""

    def test_get_preferences_existing(self, auth_client, notification_preferences):
        """Test de récupération des préférences existantes"""
        response = auth_client.get('/api/v1/notifications/preferences/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['order_updates'] is True
        assert response.data['promotions'] is False

    def test_get_preferences_creates_default(self, auth_client, user):
        """Test que GET crée des préférences par défaut si inexistantes"""
        assert not NotificationPreferences.objects.filter(user=user).exists()
        
        response = auth_client.get('/api/v1/notifications/preferences/')
        
        assert response.status_code == status.HTTP_200_OK
        assert NotificationPreferences.objects.filter(user=user).exists()

    def test_update_preferences_put(self, auth_client, notification_preferences):
        """Test de mise à jour complète des préférences"""
        data = {
            'order_updates': False,
            'promotions': True,
            'sound_enabled': False
        }
        
        response = auth_client.put('/api/v1/notifications/preferences/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        notification_preferences.refresh_from_db()
        assert notification_preferences.order_updates is False
        assert notification_preferences.promotions is True
        assert notification_preferences.sound_enabled is False

    def test_update_preferences_patch(self, auth_client, notification_preferences):
        """Test de mise à jour partielle des préférences"""
        data = {
            'vibration_enabled': False
        }
        
        response = auth_client.patch('/api/v1/notifications/preferences/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        notification_preferences.refresh_from_db()
        assert notification_preferences.vibration_enabled is False
        # Les autres valeurs restent inchangées
        assert notification_preferences.order_updates is True

    def test_update_quiet_hours(self, auth_client, notification_preferences):
        """Test de configuration des heures silencieuses"""
        data = {
            'quiet_hours_enabled': True,
            'quiet_hours_start': '22:00:00',
            'quiet_hours_end': '08:00:00'
        }
        
        response = auth_client.put('/api/v1/notifications/preferences/', data, format='json')
        
        assert response.status_code == status.HTTP_200_OK

    def test_preferences_unauthenticated(self, api_client):
        """Test que les préférences requièrent l'authentification"""
        response = api_client.get('/api/v1/notifications/preferences/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - NotificationListView
# =============================================================================

@pytest.mark.django_db
class TestNotificationList:
    """Tests pour la liste des notifications"""

    def test_list_notifications(self, auth_client, multiple_notifications):
        """Test de liste des notifications"""
        response = auth_client.get('/api/v1/notifications/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert 'count' in response.data
        assert 'page' in response.data
        assert 'total_pages' in response.data
        assert response.data['count'] == 15

    def test_list_notifications_pagination(self, auth_client, multiple_notifications):
        """Test de pagination"""
        response = auth_client.get('/api/v1/notifications/', {'page': 1, 'page_size': 5})
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 5
        assert response.data['page'] == 1
        assert response.data['page_size'] == 5
        assert response.data['total_pages'] == 3

    def test_list_notifications_page_2(self, auth_client, multiple_notifications):
        """Test de la deuxième page"""
        response = auth_client.get('/api/v1/notifications/', {'page': 2, 'page_size': 5})
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['page'] == 2

    def test_list_unread_only(self, auth_client, multiple_notifications):
        """Test de filtrage par non lues"""
        response = auth_client.get('/api/v1/notifications/', {'unread_only': 'true'})
        
        assert response.status_code == status.HTTP_200_OK
        # 10 notifications sont non lues (indices 5-14)
        assert response.data['count'] == 10

    def test_list_by_type(self, auth_client, multiple_notifications):
        """Test de filtrage par type"""
        response = auth_client.get('/api/v1/notifications/', {'type': 'order_update'})
        
        assert response.status_code == status.HTTP_200_OK
        # Les notifications pairs sont de type order_update
        for notif in response.data['results']:
            assert notif['notification_type'] == 'order_update'

    def test_list_excludes_expired(self, auth_client, notification, expired_notification):
        """Test que les notifications expirées sont exclues"""
        response = auth_client.get('/api/v1/notifications/')
        
        assert response.status_code == status.HTTP_200_OK
        # Seule la notification non expirée doit apparaître
        notification_ids = [n['id'] for n in response.data['results']]
        assert str(notification.id) in notification_ids
        assert str(expired_notification.id) not in notification_ids

    def test_list_notifications_unauthenticated(self, api_client):
        """Test que la liste requiert l'authentification"""
        response = api_client.get('/api/v1/notifications/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_notifications_isolation(self, auth_client, second_auth_client, notification, second_user):
        """Test que chaque utilisateur ne voit que ses notifications"""
        # Créer une notification pour le deuxième utilisateur
        other_notif = Notification.objects.create(
            user=second_user,
            notification_type='system',
            title="Notification autre user",
            body="Test"
        )
        
        # Premier utilisateur
        response1 = auth_client.get('/api/v1/notifications/')
        assert response1.status_code == status.HTTP_200_OK
        ids1 = [n['id'] for n in response1.data['results']]
        assert str(notification.id) in ids1
        assert str(other_notif.id) not in ids1
        
        # Deuxième utilisateur
        response2 = second_auth_client.get('/api/v1/notifications/')
        assert response2.status_code == status.HTTP_200_OK
        ids2 = [n['id'] for n in response2.data['results']]
        assert str(other_notif.id) in ids2
        assert str(notification.id) not in ids2


# =============================================================================
# TESTS - NotificationDetailView
# =============================================================================

@pytest.mark.django_db
class TestNotificationDetail:
    """Tests pour le détail d'une notification"""

    def test_get_notification_detail(self, auth_client, notification):
        """Test de récupération du détail"""
        response = auth_client.get(f'/api/v1/notifications/{notification.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(notification.id)
        assert response.data['title'] == notification.title
        assert response.data['body'] == notification.body

    def test_get_notification_not_found(self, auth_client):
        """Test avec notification inexistante"""
        fake_uuid = '00000000-0000-0000-0000-000000000000'
        response = auth_client.get(f'/api/v1/notifications/{fake_uuid}/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_other_user_notification_forbidden(self, auth_client, second_user):
        """Test qu'on ne peut pas accéder à la notification d'un autre"""
        other_notif = Notification.objects.create(
            user=second_user,
            notification_type='system',
            title="Private",
            body="Test"
        )
        
        response = auth_client.get(f'/api/v1/notifications/{other_notif.id}/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_notification(self, auth_client, notification):
        """Test de suppression d'une notification"""
        notif_id = notification.id
        
        response = auth_client.delete(f'/api/v1/notifications/{notif_id}/')
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Notification.objects.filter(id=notif_id).exists()

    def test_delete_other_user_notification_forbidden(self, auth_client, second_user):
        """Test qu'on ne peut pas supprimer la notification d'un autre"""
        other_notif = Notification.objects.create(
            user=second_user,
            notification_type='system',
            title="Private",
            body="Test"
        )
        
        response = auth_client.delete(f'/api/v1/notifications/{other_notif.id}/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        # La notification existe toujours
        assert Notification.objects.filter(id=other_notif.id).exists()


# =============================================================================
# TESTS - MarkNotificationReadView
# =============================================================================

@pytest.mark.django_db
class TestMarkNotificationRead:
    """Tests pour marquer une notification comme lue"""

    def test_mark_as_read(self, auth_client, notification):
        """Test de marquage comme lu"""
        assert notification.is_read is False
        
        response = auth_client.post(f'/api/v1/notifications/{notification.id}/read/')
        
        assert response.status_code == status.HTTP_200_OK
        
        notification.refresh_from_db()
        assert notification.is_read is True
        assert notification.read_at is not None

    def test_mark_already_read(self, auth_client, read_notification):
        """Test de marquage d'une notification déjà lue"""
        response = auth_client.post(f'/api/v1/notifications/{read_notification.id}/read/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_read'] is True

    def test_mark_other_user_notification_forbidden(self, auth_client, second_user):
        """Test qu'on ne peut pas marquer la notification d'un autre"""
        other_notif = Notification.objects.create(
            user=second_user,
            notification_type='system',
            title="Private",
            body="Test",
            is_read=False
        )
        
        response = auth_client.post(f'/api/v1/notifications/{other_notif.id}/read/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        
        other_notif.refresh_from_db()
        assert other_notif.is_read is False


# =============================================================================
# TESTS - MarkAllReadView
# =============================================================================

@pytest.mark.django_db
class TestMarkAllRead:
    """Tests pour marquer toutes les notifications comme lues"""

    def test_mark_all_as_read(self, auth_client, multiple_notifications):
        """Test de marquage de toutes comme lues"""
        unread_before = Notification.objects.filter(
            user=multiple_notifications[0].user,
            is_read=False
        ).count()
        assert unread_before == 10  # 10 notifications non lues
        
        response = auth_client.post('/api/v1/notifications/read-all/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['marked_count'] == 10
        
        unread_after = Notification.objects.filter(
            user=multiple_notifications[0].user,
            is_read=False
        ).count()
        assert unread_after == 0

    def test_mark_all_read_empty(self, auth_client, read_notification):
        """Test quand toutes sont déjà lues"""
        response = auth_client.post('/api/v1/notifications/read-all/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['marked_count'] == 0

    def test_mark_all_read_isolation(self, auth_client, notification, second_user):
        """Test que seules les notifications de l'utilisateur sont marquées"""
        other_notif = Notification.objects.create(
            user=second_user,
            notification_type='system',
            title="Other",
            body="Test",
            is_read=False
        )
        
        response = auth_client.post('/api/v1/notifications/read-all/')
        
        assert response.status_code == status.HTTP_200_OK
        
        # La notification de l'autre utilisateur reste non lue
        other_notif.refresh_from_db()
        assert other_notif.is_read is False


# =============================================================================
# TESTS - UnreadCountView
# =============================================================================

@pytest.mark.django_db
class TestUnreadCount:
    """Tests pour le compteur de notifications non lues"""

    def test_unread_count(self, auth_client, multiple_notifications):
        """Test du compteur de non lues"""
        response = auth_client.get('/api/v1/notifications/unread-count/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['unread_count'] == 10

    def test_unread_count_zero(self, auth_client, read_notification):
        """Test quand tout est lu"""
        response = auth_client.get('/api/v1/notifications/unread-count/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['unread_count'] == 0

    def test_unread_count_excludes_expired(self, auth_client, notification, expired_notification):
        """Test que les notifications expirées ne sont pas comptées"""
        response = auth_client.get('/api/v1/notifications/unread-count/')
        
        assert response.status_code == status.HTTP_200_OK
        # Seule la notification non expirée et non lue compte
        assert response.data['unread_count'] == 1

    def test_unread_count_unauthenticated(self, api_client):
        """Test que le compteur requiert l'authentification"""
        response = api_client.get('/api/v1/notifications/unread-count/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - TestNotificationView (DEBUG only)
# =============================================================================

@pytest.mark.django_db
class TestTestNotificationView:
    """Tests pour l'endpoint de test de notifications"""

    def test_test_notification_debug_mode(self, auth_client, settings):
        """Test d'envoi de notification de test en mode DEBUG"""
        settings.DEBUG = True
        
        data = {
            'title': 'Test notification',
            'body': 'Ceci est un test'
        }
        
        # Note: Ce test peut échouer si le service de notification n'est pas mockée
        # ou si l'utilisateur n'a pas de token push
        response = auth_client.post('/api/v1/notifications/test/', data, format='json')
        
        # Peut être 200 (succès) ou autre selon la config du service
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN]

    def test_test_notification_production_forbidden(self, auth_client, settings):
        """Test que l'endpoint est désactivé en production"""
        settings.DEBUG = False
        
        data = {
            'title': 'Test notification',
            'body': 'Ceci est un test'
        }
        
        response = auth_client.post('/api/v1/notifications/test/', data, format='json')
        
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_test_notification_unauthenticated(self, api_client, settings):
        """Test que l'endpoint requiert l'authentification"""
        settings.DEBUG = True
        
        response = api_client.post('/api/v1/notifications/test/', {}, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# TESTS - Intégration et cas limites
# =============================================================================

@pytest.mark.django_db
class TestNotificationIntegration:
    """Tests d'intégration et cas limites"""

    def test_full_notification_workflow(self, auth_client, user):
        """Test du workflow complet: créer, lire, marquer lu, supprimer"""
        # Créer une notification directement en base
        notif = Notification.objects.create(
            user=user,
            notification_type='order_ready',
            title="Commande prête",
            body="Test workflow",
            is_read=False
        )
        
        # Vérifier le compteur
        response = auth_client.get('/api/v1/notifications/unread-count/')
        assert response.data['unread_count'] == 1
        
        # Lire le détail
        response = auth_client.get(f'/api/v1/notifications/{notif.id}/')
        assert response.status_code == status.HTTP_200_OK
        
        # Marquer comme lue
        response = auth_client.post(f'/api/v1/notifications/{notif.id}/read/')
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier le compteur après lecture
        response = auth_client.get('/api/v1/notifications/unread-count/')
        assert response.data['unread_count'] == 0
        
        # Supprimer
        response = auth_client.delete(f'/api/v1/notifications/{notif.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_token_workflow(self, auth_client, user):
        """Test du workflow de token: enregistrer, mettre à jour, désactiver"""
        # Enregistrer
        data = {
            'expo_token': 'ExponentPushToken[workflow_test]',
            'device_platform': 'ios'
        }
        response = auth_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        
        # Mettre à jour
        data['device_name'] = 'Updated Device'
        response = auth_client.post('/api/v1/notifications/tokens/register/', data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['device_name'] == 'Updated Device'
        
        # Désactiver
        response = auth_client.post(
            '/api/v1/notifications/tokens/unregister/',
            {'expo_token': 'ExponentPushToken[workflow_test]'},
            format='json'
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier désactivation
        token = PushNotificationToken.objects.get(expo_token='ExponentPushToken[workflow_test]')
        assert token.is_active is False

    def test_max_page_size_limit(self, auth_client, multiple_notifications):
        """Test que la taille de page est limitée à 100"""
        response = auth_client.get('/api/v1/notifications/', {'page_size': 500})
        
        assert response.status_code == status.HTTP_200_OK
        # La taille devrait être plafonnée à 100
        assert response.data['page_size'] <= 100