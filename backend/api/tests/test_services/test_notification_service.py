import types

from api.services.notification_service import NotificationService


def test_send_push_notification_no_tokens():
    service = NotificationService()
    assert service._send_push_notification(tokens=[], title="t", body="b") is False


def test_send_push_notification_filters_invalid_tokens(monkeypatch):
    service = NotificationService()

    def fake_post(*args, **kwargs):
        raise AssertionError("request should not be sent")

    monkeypatch.setattr("api.services.notification_service.requests.post", fake_post)

    result = service._send_push_notification(tokens=["invalid-token"], title="t", body="b")
    assert result is False


def test_send_push_notification_success(monkeypatch):
    service = NotificationService()

    def fake_post(*args, **kwargs):
        return types.SimpleNamespace(status_code=200, json=lambda: {"data": []})

    monkeypatch.setattr("api.services.notification_service.requests.post", fake_post)

    result = service._send_push_notification(
        tokens=["ExponentPushToken[abc]"],
        title="t",
        body="b",
        data={"order_id": 1},
    )
    assert result is True


def test_send_push_notification_timeout(monkeypatch):
    service = NotificationService()

    class DummyTimeout(Exception):
        pass

    def fake_post(*args, **kwargs):
        raise DummyTimeout()

    monkeypatch.setattr("api.services.notification_service.requests.exceptions.Timeout", DummyTimeout)
    monkeypatch.setattr("api.services.notification_service.requests.post", fake_post)

    result = service._send_push_notification(
        tokens=["ExponentPushToken[abc]"],
        title="t",
        body="b",
    )
    assert result is False
