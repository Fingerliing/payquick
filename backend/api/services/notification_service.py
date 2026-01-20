# -*- coding: utf-8 -*-
"""
Service de notifications push via Expo Push API.

Ce service gère l'envoi de notifications push aux utilisateurs
via l'API Expo Push Notifications.
"""

import logging
import requests
from typing import Optional, Dict, Any, List
from django.conf import settings

logger = logging.getLogger(__name__)

# URL de l'API Expo Push
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class NotificationService:
    """
    Service pour envoyer des notifications push via Expo.
    """

    def __init__(self):
        self.expo_push_url = EXPO_PUSH_URL

    # =========================================================================
    # MÉTHODES UTILITAIRES
    # =========================================================================

    def _get_user_push_tokens(self, user_id: int) -> List[str]:
        """Récupérer les tokens push d'un utilisateur"""
        try:
            from api.models import PushNotificationToken
            tokens = PushNotificationToken.objects.filter(
                user_id=user_id,
                is_active=True
            ).values_list('token', flat=True)
            return list(tokens)
        except Exception as e:
            logger.error(f"Erreur récupération tokens user {user_id}: {e}")
            return []

    def _get_guest_push_tokens(self, phone: str) -> List[str]:
        """Récupérer les tokens push d'un invité par téléphone"""
        try:
            from api.models import PushNotificationToken
            tokens = PushNotificationToken.objects.filter(
                guest_phone=phone,
                is_active=True
            ).values_list('token', flat=True)
            return list(tokens)
        except Exception as e:
            logger.error(f"Erreur récupération tokens guest {phone}: {e}")
            return []

    def _get_restaurant_owner_tokens(self, restaurant) -> List[str]:
        """Récupérer les tokens push du propriétaire d'un restaurant"""
        try:
            if restaurant.owner and restaurant.owner.user:
                return self._get_user_push_tokens(restaurant.owner.user.id)
            return []
        except Exception as e:
            logger.error(f"Erreur récupération tokens restaurateur: {e}")
            return []

    def _send_push_notification(
        self,
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        priority: str = "default",
        sound: str = "default",
        badge: Optional[int] = None,
        channel_id: str = "default"
    ) -> bool:
        """
        Envoyer une notification push via Expo API.
        """
        if not tokens:
            logger.debug("Aucun token push disponible")
            return False

        messages = []
        for token in tokens:
            if not token.startswith("ExponentPushToken"):
                logger.warning(f"Token invalide ignoré: {token[:20]}...")
                continue

            message = {
                "to": token,
                "title": title,
                "body": body,
                "sound": sound,
                "priority": priority,
                "channelId": channel_id,
            }

            if data:
                message["data"] = data

            if badge is not None:
                message["badge"] = badge

            messages.append(message)

        if not messages:
            logger.debug("Aucun message valide à envoyer")
            return False

        try:
            response = requests.post(
                self.expo_push_url,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=10
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(f"✅ Push envoyé: {len(messages)} message(s)")
                return True
            else:
                logger.error(f"❌ Erreur Expo Push: {response.status_code} - {response.text}")
                return False

        except requests.exceptions.Timeout:
            logger.error("❌ Timeout lors de l'envoi push")
            return False
        except Exception as e:
            logger.error(f"❌ Erreur envoi push: {e}")
            return False

    def _save_notification(
        self,
        user_id: Optional[int],
        title: str,
        body: str,
        notification_type: str,
        data: Optional[Dict] = None,
        priority: str = "default"
    ):
        """Sauvegarder la notification en base de données"""
        try:
            from api.models import Notification
            Notification.objects.create(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                body=body,
                data=data or {},
                priority=priority
            )
        except Exception as e:
            logger.error(f"Erreur sauvegarde notification: {e}")

    # =========================================================================
    # MÉTHODES PUBLIQUES - ENVOI GÉNÉRIQUE
    # =========================================================================

    def send_to_user(
        self,
        user_id: int,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        notification_type: str = "general",
        priority: str = "default",
        save: bool = True
    ) -> bool:
        """Envoyer une notification à un utilisateur"""
        tokens = self._get_user_push_tokens(user_id)

        if save:
            self._save_notification(user_id, title, body, notification_type, data, priority)

        return self._send_push_notification(
            tokens=tokens,
            title=title,
            body=body,
            data=data,
            priority=priority
        )

    def send_to_guest(
        self,
        phone: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        notification_type: str = "general"
    ) -> bool:
        """Envoyer une notification à un invité (par téléphone)"""
        tokens = self._get_guest_push_tokens(phone)

        return self._send_push_notification(
            tokens=tokens,
            title=title,
            body=body,
            data=data
        )

    def send_to_restaurant(
        self,
        restaurant,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        notification_type: str = "restaurant",
        priority: str = "default"
    ) -> bool:
        """Envoyer une notification au propriétaire d'un restaurant"""
        tokens = self._get_restaurant_owner_tokens(restaurant)

        if restaurant.owner and restaurant.owner.user:
            self._save_notification(
                restaurant.owner.user.id,
                title, body, notification_type, data, priority
            )

        return self._send_push_notification(
            tokens=tokens,
            title=title,
            body=body,
            data=data,
            priority=priority,
            channel_id="orders"
        )

    # =========================================================================
    # NOTIFICATIONS COMMANDES
    # =========================================================================

    def notify_new_order(self, order) -> bool:
        """Notifier le restaurant d'une nouvelle commande"""
        return self.send_to_restaurant(
            restaurant=order.restaurant,
            title="🔔 Nouvelle commande !",
            body=f"Commande #{order.order_number} - {order.total_amount}€",
            data={
                "order_id": str(order.id),
                "order_number": order.order_number,
                "action": "view_order"
            },
            notification_type="new_order",
            priority="high"
        )

    def notify_order_confirmed(self, order) -> bool:
        """Notifier le client que sa commande est confirmée"""
        if order.user_id:
            return self.send_to_user(
                user_id=order.user_id,
                title="✅ Commande confirmée",
                body=f"Votre commande #{order.order_number} a été acceptée !",
                data={"order_id": str(order.id), "action": "view_order"},
                notification_type="order_confirmed"
            )
        elif order.guest_phone:
            return self.send_to_guest(
                phone=order.guest_phone,
                title="✅ Commande confirmée",
                body=f"Votre commande #{order.order_number} a été acceptée !",
                data={"order_id": str(order.id)},
                notification_type="order_confirmed"
            )
        return False

    def notify_order_preparing(self, order) -> bool:
        """Notifier le client que sa commande est en préparation"""
        if order.user_id:
            return self.send_to_user(
                user_id=order.user_id,
                title="👨‍🍳 En préparation",
                body=f"Votre commande #{order.order_number} est en cours de préparation.",
                data={"order_id": str(order.id), "action": "view_order"},
                notification_type="order_preparing"
            )
        elif order.guest_phone:
            return self.send_to_guest(
                phone=order.guest_phone,
                title="👨‍🍳 En préparation",
                body=f"Votre commande #{order.order_number} est en cours de préparation.",
                data={"order_id": str(order.id)},
                notification_type="order_preparing"
            )
        return False

    def notify_order_ready(self, order) -> bool:
        """Notifier le client que sa commande est prête"""
        if order.user_id:
            return self.send_to_user(
                user_id=order.user_id,
                title="🍽️ Commande prête !",
                body=f"Votre commande #{order.order_number} est prête !",
                data={"order_id": str(order.id), "action": "view_order"},
                notification_type="order_ready",
                priority="high"
            )
        elif order.guest_phone:
            return self.send_to_guest(
                phone=order.guest_phone,
                title="🍽️ Commande prête !",
                body=f"Votre commande #{order.order_number} est prête !",
                data={"order_id": str(order.id)},
                notification_type="order_ready"
            )
        return False

    def notify_order_served(self, order) -> bool:
        """Notifier le client que sa commande a été servie"""
        if order.user_id:
            return self.send_to_user(
                user_id=order.user_id,
                title="✨ Bon appétit !",
                body=f"Votre commande #{order.order_number} a été servie. Régalez-vous !",
                data={"order_id": str(order.id), "action": "view_order"},
                notification_type="order_served"
            )
        return False

    # =========================================================================
    # NOTIFICATIONS PAIEMENT
    # =========================================================================

    def notify_payment_received(self, order, amount: float) -> bool:
        """Notifier le restaurant d'un paiement reçu"""
        return self.send_to_restaurant(
            restaurant=order.restaurant,
            title="💰 Paiement reçu",
            body=f"Commande #{order.order_number} - {amount:.2f}€ reçus",
            data={
                "order_id": str(order.id),
                "amount": amount,
                "action": "view_payment"
            },
            notification_type="payment_received",
            priority="high"
        )

    def notify_split_payment_update(
        self,
        order,
        portions_paid: int,
        total_portions: int
    ) -> bool:
        """Notifier de l'avancement d'un paiement divisé"""
        return self.send_to_restaurant(
            restaurant=order.restaurant,
            title="💳 Paiement divisé",
            body=f"Commande #{order.order_number}: {portions_paid}/{total_portions} parts payées",
            data={
                "order_id": str(order.id),
                "portions_paid": portions_paid,
                "total_portions": total_portions,
                "action": "view_split_payment"
            },
            notification_type="split_payment_update"
        )

    # =========================================================================
    # NOTIFICATIONS SESSIONS COLLABORATIVES
    # =========================================================================

    def notify_session_participant_joined(
        self,
        session,
        participant_name: str
    ) -> bool:
        """Notifier l'hôte qu'un participant a rejoint la session"""
        if session.host_id:
            return self.send_to_user(
                user_id=session.host_id,
                title="👥 Nouveau participant",
                body=f"{participant_name} a rejoint votre table.",
                data={
                    "session_id": str(session.id),
                    "action": "view_session"
                },
                notification_type="participant_joined"
            )
        return False


# Instance singleton
notification_service = NotificationService()
