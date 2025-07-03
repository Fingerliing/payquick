from api.utils.order_utils import notify_order_updated
from unittest.mock import patch
from requests.exceptions import RequestException, Timeout
import pytest

@patch("api.utils.order_utils.requests.post")
def test_notify_order_updated_success(mock_post):
    mock_post.return_value.status_code = 200
    data = {"id": 1, "status": "pending"}
    notify_order_updated(data)
    mock_post.assert_called_once_with(
        'http://ws-server:4000/emit-order',
        json=data,
        timeout=2
    )

@patch("api.utils.order_utils.requests.post", side_effect=RequestException("fail"))
def test_notify_order_updated_fails_gracefully(mock_post):
    data = {"id": 2, "status": "served"}
    notify_order_updated(data)
    mock_post.assert_called_once()

@patch("api.utils.order_utils.requests.post", side_effect=Timeout("too slow"))
def test_notify_order_updated_timeout(mock_post):
    data = {"id": 99, "status": "error"}
    notify_order_updated(data)
    mock_post.assert_called_once()

@patch("api.utils.order_utils.requests.post")
def test_notify_order_updated_with_empty_data(mock_post):
    notify_order_updated({})
    mock_post.assert_called_once()
