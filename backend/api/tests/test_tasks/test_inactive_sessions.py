import pytest
from unittest.mock import patch, MagicMock
from django.utils import timezone
from datetime import timedelta
from api.models import CollaborativeTableSession
from api.tasks import auto_complete_inactive_sessions

@pytest.mark.django_db
class TestAutoCompleteInactiveSessions:

    def test_completes_inactive_active_session(self, collaborative_session):
        """Une session active sans activité depuis >15min est auto-complétée"""
        # Simuler une session vieille de 20 minutes
        CollaborativeTableSession.objects.filter(
            pk=collaborative_session.pk
        ).update(updated_at=timezone.now() - timedelta(minutes=20))

        with patch('api.tasks.notify_session_completed') as mock_notify, \
             patch('api.tasks.auto_archive_eligible_sessions.apply_async') as mock_archive:

            result = auto_complete_inactive_sessions()

        collaborative_session.refresh_from_db()
        assert collaborative_session.status == 'completed'
        mock_notify.assert_called_once_with(str(collaborative_session.id))
        mock_archive.assert_called_once_with(countdown=300)
        assert "1 session(s)" in result

    def test_completes_inactive_locked_session(self, collaborative_session):
        """Une session verrouillée inactive est aussi complétée"""
        CollaborativeTableSession.objects.filter(
            pk=collaborative_session.pk
        ).update(
            status='locked',
            updated_at=timezone.now() - timedelta(minutes=20)
        )

        with patch('api.tasks.notify_session_completed'), \
             patch('api.tasks.auto_archive_eligible_sessions.apply_async'):

            auto_complete_inactive_sessions()

        collaborative_session.refresh_from_db()
        assert collaborative_session.status == 'completed'

    def test_ignores_recent_active_session(self, collaborative_session):
        """Une session active récente (5min) n'est pas touchée"""
        CollaborativeTableSession.objects.filter(
            pk=collaborative_session.pk
        ).update(updated_at=timezone.now() - timedelta(minutes=5))

        with patch('api.tasks.notify_session_completed') as mock_notify:
            result = auto_complete_inactive_sessions()

        collaborative_session.refresh_from_db()
        assert collaborative_session.status == 'active'
        mock_notify.assert_not_called()
        assert "0 session(s)" in result

    def test_ignores_already_completed_session(self, collaborative_session):
        """Une session déjà complétée n'est pas retraitée"""
        CollaborativeTableSession.objects.filter(
            pk=collaborative_session.pk
        ).update(
            status='completed',
            updated_at=timezone.now() - timedelta(minutes=20)
        )

        with patch('api.tasks.notify_session_completed') as mock_notify:
            auto_complete_inactive_sessions()

        mock_notify.assert_not_called()

    def test_ignores_archived_session(self, collaborative_session):
        """Une session archivée n'est pas touchée"""
        CollaborativeTableSession.objects.filter(
            pk=collaborative_session.pk
        ).update(
            is_archived=True,
            updated_at=timezone.now() - timedelta(minutes=20)
        )

        with patch('api.tasks.notify_session_completed') as mock_notify:
            auto_complete_inactive_sessions()

        mock_notify.assert_not_called()

    def test_continues_on_single_session_error(self, collaborative_session, another_collaborative_session):
        """Une erreur sur une session n'empêche pas le traitement des autres"""
        CollaborativeTableSession.objects.filter(
            pk__in=[collaborative_session.pk, another_collaborative_session.pk]
        ).update(updated_at=timezone.now() - timedelta(minutes=20))

        call_count = 0

        def fail_first_then_succeed(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("Erreur simulée")

        with patch.object(
            CollaborativeTableSession, 'mark_completed',
            side_effect=fail_first_then_succeed
        ), patch('api.tasks.notify_session_completed'), \
           patch('api.tasks.auto_archive_eligible_sessions.apply_async'):

            result = auto_complete_inactive_sessions()

        # Au moins une session traitée malgré l'erreur
        assert "1 session(s)" in result