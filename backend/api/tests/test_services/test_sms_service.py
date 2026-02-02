import sys
import types

import pytest
from twilio.base.exceptions import TwilioRestException

from api.services.sms_service import SMSService


def test_send_verification_code_success(monkeypatch, settings):
    settings.TWILIO_ACCOUNT_SID = "sid"
    settings.TWILIO_AUTH_TOKEN = "token"
    settings.TWILIO_PHONE_NUMBER = "+33123456789"
    settings.TWILIO_VERIFY_SERVICE_SID = "service"
    settings.SMS_CODE_EXPIRY_MINUTES = 5

    created = {}

    class DummyMessages:
        def create(self, **kwargs):
            created.update(kwargs)
            return types.SimpleNamespace(sid="sms-123")

    class DummyClient:
        messages = DummyMessages()

    monkeypatch.setattr("api.services.sms_service.Client", lambda *args, **kwargs: DummyClient())

    service = SMSService()
    assert service.send_verification_code("+33123456789", "1234") is True
    assert created["to"] == "+33123456789"
    assert created["from_"] == settings.TWILIO_PHONE_NUMBER


def test_send_verification_code_twilio_error(monkeypatch, settings):
    settings.TWILIO_ACCOUNT_SID = "sid"
    settings.TWILIO_AUTH_TOKEN = "token"
    settings.TWILIO_PHONE_NUMBER = "+33123456789"
    settings.TWILIO_VERIFY_SERVICE_SID = "service"
    settings.SMS_CODE_EXPIRY_MINUTES = 5

    class DummyMessages:
        def create(self, **kwargs):
            raise TwilioRestException(status=400, uri="/messages", msg="invalid")

    class DummyClient:
        messages = DummyMessages()

    monkeypatch.setattr("api.services.sms_service.Client", lambda *args, **kwargs: DummyClient())

    service = SMSService()
    assert service.send_verification_code("+33123456789", "1234") is False


def test_format_phone_number_valid(monkeypatch):
    dummy = types.ModuleType("phonenumbers")
    dummy.PhoneNumberFormat = types.SimpleNamespace(E164="E164")

    def parse(value, region):
        return {"value": value, "region": region}

    def is_valid_number(parsed):
        return True

    def format_number(parsed, format_type):
        return "+33123456789"

    dummy.parse = parse
    dummy.is_valid_number = is_valid_number
    dummy.format_number = format_number
    dummy.NumberParseException = type("NumberParseException", (Exception,), {})

    monkeypatch.setitem(sys.modules, "phonenumbers", dummy)

    service = SMSService()
    assert service.format_phone_number("01 23 45 67 89") == "+33123456789"


def test_format_phone_number_invalid(monkeypatch):
    dummy = types.ModuleType("phonenumbers")
    dummy.PhoneNumberFormat = types.SimpleNamespace(E164="E164")

    def parse(value, region):
        return {"value": value, "region": region}

    def is_valid_number(parsed):
        return False

    def format_number(parsed, format_type):
        return "+33123456789"

    dummy.parse = parse
    dummy.is_valid_number = is_valid_number
    dummy.format_number = format_number
    dummy.NumberParseException = type("NumberParseException", (Exception,), {})

    monkeypatch.setitem(sys.modules, "phonenumbers", dummy)

    service = SMSService()
    with pytest.raises(ValueError, match="Numéro de téléphone invalide"):
        service.format_phone_number("invalid")
