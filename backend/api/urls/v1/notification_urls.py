"""
URLs pour l'API de notifications push EatQuickeR
"""

from django.urls import path
from api.views.notification_views import (
    RegisterPushTokenView,
    UnregisterPushTokenView,
    NotificationPreferencesView,
    NotificationListView,
    NotificationDetailView,
    MarkNotificationReadView,
    MarkAllReadView,
    UnreadCountView,
    TestNotificationView,
)

urlpatterns = [
    # Gestion des tokens push
    path('tokens/register/', RegisterPushTokenView.as_view(), name='register_push_token'),
    path('tokens/unregister/', UnregisterPushTokenView.as_view(), name='unregister_push_token'),
    
    # Préférences de notification
    path('preferences/', NotificationPreferencesView.as_view(), name='notification_preferences'),
    
    # Historique des notifications
    path('', NotificationListView.as_view(), name='notification_list'),
    path('<uuid:notification_id>/', NotificationDetailView.as_view(), name='notification_detail'),
    path('<uuid:notification_id>/read/', MarkNotificationReadView.as_view(), name='mark_notification_read'),
    path('read-all/', MarkAllReadView.as_view(), name='mark_all_read'),
    path('unread-count/', UnreadCountView.as_view(), name='unread_count'),
    
    # Test (développement)
    path('test/', TestNotificationView.as_view(), name='test_notification'),
]