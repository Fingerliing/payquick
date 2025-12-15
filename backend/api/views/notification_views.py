"""
Vues API pour la gestion des notifications push EatQuickeR
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes

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
    UnreadCountSerializer
)

import logging

logger = logging.getLogger(__name__)


# =============================================================================
# GESTION DES TOKENS PUSH
# =============================================================================

@extend_schema(tags=["Notifications"])
class RegisterPushTokenView(APIView):
    """
    Enregistrer ou mettre à jour un token de notification push.
    Permet aux utilisateurs authentifiés et aux invités d'enregistrer leur token.
    """
    permission_classes = [AllowAny]
    
    @extend_schema(
        summary="Enregistrer un token push",
        description="""
        Enregistre un token Expo Push pour recevoir des notifications.
        
        **Pour les utilisateurs authentifiés:** Le token sera associé à leur compte.
        **Pour les invités:** Fournir un numéro de téléphone pour associer le token.
        
        Le même token peut être mis à jour s'il existe déjà.
        """,
        request=RegisterTokenSerializer,
        responses={
            201: OpenApiResponse(
                response=PushTokenSerializer,
                description="Token enregistré avec succès"
            ),
            200: OpenApiResponse(
                response=PushTokenSerializer,
                description="Token mis à jour"
            ),
            400: OpenApiResponse(description="Données invalides")
        },
        examples=[
            OpenApiExample(
                "Utilisateur authentifié",
                value={
                    "expo_token": "ExponentPushToken[xxxxxx]",
                    "device_id": "device-uuid-123",
                    "device_name": "iPhone de Jean",
                    "device_platform": "ios"
                }
            ),
            OpenApiExample(
                "Invité",
                value={
                    "expo_token": "ExponentPushToken[yyyyyy]",
                    "guest_phone": "+33612345678",
                    "device_platform": "android"
                }
            )
        ]
    )
    def post(self, request):
        serializer = RegisterTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        expo_token = serializer.validated_data['expo_token']
        device_id = serializer.validated_data.get('device_id')
        device_name = serializer.validated_data.get('device_name')
        device_platform = serializer.validated_data.get('device_platform', 'android')
        guest_phone = serializer.validated_data.get('guest_phone')
        
        # Déterminer l'utilisateur
        user = request.user if request.user.is_authenticated else None
        
        # Vérifier qu'on a soit un user soit un guest_phone
        if not user and not guest_phone:
            return Response(
                {"error": "Authentification ou numéro de téléphone requis"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Chercher un token existant
        existing_token = PushNotificationToken.objects.filter(
            expo_token=expo_token
        ).first()
        
        if existing_token:
            # Mettre à jour le token existant
            existing_token.user = user
            existing_token.device_id = device_id or existing_token.device_id
            existing_token.device_name = device_name or existing_token.device_name
            existing_token.device_platform = device_platform
            existing_token.guest_phone = guest_phone if not user else None
            existing_token.is_active = True
            existing_token.save()
            
            logger.info(f"Token push mis à jour: {expo_token[:30]}...")
            return Response(
                PushTokenSerializer(existing_token).data,
                status=status.HTTP_200_OK
            )
        
        # Créer un nouveau token
        token = PushNotificationToken.objects.create(
            user=user,
            expo_token=expo_token,
            device_id=device_id,
            device_name=device_name,
            device_platform=device_platform,
            guest_phone=guest_phone if not user else None
        )
        
        logger.info(f"Nouveau token push enregistré: {expo_token[:30]}...")
        return Response(
            PushTokenSerializer(token).data,
            status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["Notifications"])
class UnregisterPushTokenView(APIView):
    """Supprimer un token de notification push"""
    permission_classes = [AllowAny]
    
    @extend_schema(
        summary="Supprimer un token push",
        description="Désactive un token push. Utilisé lors de la déconnexion.",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "expo_token": {"type": "string"}
                },
                "required": ["expo_token"]
            }
        },
        responses={
            200: OpenApiResponse(description="Token supprimé"),
            404: OpenApiResponse(description="Token non trouvé")
        }
    )
    def post(self, request):
        expo_token = request.data.get('expo_token')
        
        if not expo_token:
            return Response(
                {"error": "expo_token requis"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Désactiver le token (soft delete)
        updated = PushNotificationToken.objects.filter(
            expo_token=expo_token
        ).update(is_active=False)
        
        if updated:
            logger.info(f"Token push désactivé: {expo_token[:30]}...")
            return Response({"message": "Token supprimé"})
        
        return Response(
            {"error": "Token non trouvé"},
            status=status.HTTP_404_NOT_FOUND
        )


# =============================================================================
# PRÉFÉRENCES DE NOTIFICATION
# =============================================================================

@extend_schema(tags=["Notifications"])
class NotificationPreferencesView(APIView):
    """Gérer les préférences de notification de l'utilisateur"""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Récupérer les préférences",
        description="Récupère les préférences de notification de l'utilisateur connecté.",
        responses={200: NotificationPreferencesSerializer}
    )
    def get(self, request):
        prefs, created = NotificationPreferences.objects.get_or_create(
            user=request.user,
            defaults={}
        )
        return Response(NotificationPreferencesSerializer(prefs).data)
    
    @extend_schema(
        summary="Mettre à jour les préférences",
        description="Met à jour les préférences de notification.",
        request=NotificationPreferencesSerializer,
        responses={200: NotificationPreferencesSerializer}
    )
    def put(self, request):
        prefs, created = NotificationPreferences.objects.get_or_create(
            user=request.user
        )
        
        serializer = NotificationPreferencesSerializer(
            prefs, 
            data=request.data, 
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(serializer.data)
    
    @extend_schema(
        summary="Mise à jour partielle",
        description="Met à jour partiellement les préférences.",
        request=NotificationPreferencesSerializer,
        responses={200: NotificationPreferencesSerializer}
    )
    def patch(self, request):
        return self.put(request)


# =============================================================================
# HISTORIQUE DES NOTIFICATIONS
# =============================================================================

@extend_schema(tags=["Notifications"])
class NotificationListView(APIView):
    """Liste des notifications de l'utilisateur"""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Liste des notifications",
        description="""
        Récupère les notifications de l'utilisateur avec pagination.
        
        **Paramètres de requête:**
        - `page`: Numéro de page (défaut: 1)
        - `page_size`: Taille de page (défaut: 20, max: 100)
        - `unread_only`: Si true, ne retourne que les non lues
        - `type`: Filtrer par type de notification
        """,
        parameters=[
            OpenApiParameter("page", OpenApiTypes.INT, description="Numéro de page"),
            OpenApiParameter("page_size", OpenApiTypes.INT, description="Taille de page"),
            OpenApiParameter("unread_only", OpenApiTypes.BOOL, description="Non lues uniquement"),
            OpenApiParameter("type", OpenApiTypes.STR, description="Type de notification"),
        ],
        responses={200: NotificationListSerializer}
    )
    def get(self, request):
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('page_size', 20)), 100)
        unread_only = request.query_params.get('unread_only', 'false').lower() == 'true'
        notification_type = request.query_params.get('type')
        
        # Filtrer les notifications
        queryset = Notification.objects.filter(user=request.user)
        
        if unread_only:
            queryset = queryset.filter(is_read=False)
        
        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)
        
        # Exclure les notifications expirées
        queryset = queryset.filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        )
        
        # Pagination
        total = queryset.count()
        start = (page - 1) * page_size
        end = start + page_size
        
        notifications = queryset.order_by('-created_at')[start:end]
        
        return Response({
            "results": NotificationSerializer(notifications, many=True).data,
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        })


@extend_schema(tags=["Notifications"])
class NotificationDetailView(APIView):
    """Détail d'une notification"""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Détail d'une notification",
        responses={200: NotificationSerializer, 404: OpenApiResponse(description="Non trouvée")}
    )
    def get(self, request, notification_id):
        notification = get_object_or_404(
            Notification,
            id=notification_id,
            user=request.user
        )
        return Response(NotificationSerializer(notification).data)
    
    @extend_schema(
        summary="Supprimer une notification",
        responses={204: OpenApiResponse(description="Supprimée")}
    )
    def delete(self, request, notification_id):
        notification = get_object_or_404(
            Notification,
            id=notification_id,
            user=request.user
        )
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Notifications"])
class MarkNotificationReadView(APIView):
    """Marquer une notification comme lue"""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Marquer comme lue",
        description="Marque une notification spécifique comme lue.",
        responses={200: NotificationSerializer}
    )
    def post(self, request, notification_id):
        notification = get_object_or_404(
            Notification,
            id=notification_id,
            user=request.user
        )
        notification.mark_as_read()
        return Response(NotificationSerializer(notification).data)


@extend_schema(tags=["Notifications"])
class MarkAllReadView(APIView):
    """Marquer toutes les notifications comme lues"""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Tout marquer comme lu",
        description="Marque toutes les notifications non lues comme lues.",
        responses={
            200: OpenApiResponse(
                description="Succès",
                examples=[
                    OpenApiExample(
                        "Réponse",
                        value={"marked_count": 5}
                    )
                ]
            )
        }
    )
    def post(self, request):
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )
        
        return Response({"marked_count": count})


@extend_schema(tags=["Notifications"])
class UnreadCountView(APIView):
    """Nombre de notifications non lues"""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Compteur non lues",
        description="Retourne le nombre de notifications non lues.",
        responses={200: UnreadCountSerializer}
    )
    def get(self, request):
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
        ).count()
        
        return Response({"unread_count": count})


# =============================================================================
# ACTIONS DE TEST (Développement uniquement)
# =============================================================================

@extend_schema(tags=["Notifications"], exclude=True)
class TestNotificationView(APIView):
    """Envoyer une notification de test (développement uniquement)"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        from django.conf import settings
        
        if not getattr(settings, 'DEBUG', False):
            return Response(
                {"error": "Disponible uniquement en mode DEBUG"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from api.services.notification_service import notification_service
        
        title = request.data.get('title', '🔔 Notification de test')
        body = request.data.get('body', 'Ceci est une notification de test depuis EatQuickeR')
        
        success = notification_service.send_to_user(
            user_id=request.user.id,
            title=title,
            body=body,
            data={"test": True},
            notification_type="system"
        )
        
        return Response({
            "success": success,
            "message": "Notification de test envoyée" if success else "Échec de l'envoi"
        })