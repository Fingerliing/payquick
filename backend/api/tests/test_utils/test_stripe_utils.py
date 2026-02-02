import importlib

import pytest


def test_create_connect_account(monkeypatch, settings):
    settings.STRIPE_SECRET_KEY = "sk_test"
    stripe_utils = importlib.import_module("api.utils.stripe_utils")
    importlib.reload(stripe_utils)

    created = {}

    def fake_create(**kwargs):
        created.update(kwargs)
        return {"id": "acct_123"}

    monkeypatch.setattr(stripe_utils.stripe.Account, "create", fake_create)

    result = stripe_utils.create_connect_account("user@example.com")

    assert result["id"] == "acct_123"
    assert created["email"] == "user@example.com"
    assert created["type"] == "standard"


def test_create_account_link(monkeypatch, settings):
    settings.STRIPE_SECRET_KEY = "sk_test"
    stripe_utils = importlib.import_module("api.utils.stripe_utils")
    importlib.reload(stripe_utils)

    created = {}

    def fake_create(**kwargs):
        created.update(kwargs)
        return {"url": "https://stripe.test"}

    monkeypatch.setattr(stripe_utils.stripe.AccountLink, "create", fake_create)

    result = stripe_utils.create_account_link("acct_456", "https://example.com")

    assert result["url"] == "https://stripe.test"
    assert created["account"] == "acct_456"
    assert created["return_url"] == "https://example.com/onboarding/success"
