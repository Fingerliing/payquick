from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from api.utils import qrcode_utils

class DummyQR:
    def __init__(self, payload=b"qr-bytes"):
        self.payload = payload
        self.saved_format = None
        self.saved_buffer = None

    def save(self, buffer, format=None):
        self.saved_format = format
        self.saved_buffer = buffer
        buffer.write(self.payload)


def test_generate_qr_for_table_builds_expected_url_and_saves_file(settings, monkeypatch):
    settings.DOMAIN = "https://payquick.test"
    dummy_qr = DummyQR(payload=b"fake-png")
    captured = {}

    def fake_make(url):
        captured["url"] = url
        return dummy_qr

    monkeypatch.setattr(qrcode_utils.qrcode, "make", fake_make)
    table = SimpleNamespace(identifiant="TBL123", qr_code_file=MagicMock())

    qrcode_utils.generate_qr_for_table(table)

    assert captured["url"] == "https://payquick.test/table/TBL123"
    assert dummy_qr.saved_format == "PNG"
    filename, content_file = table.qr_code_file.save.call_args.args[:2]
    assert filename == "qr_TBL123.png"
    assert content_file.read() == b"fake-png"
    assert table.qr_code_file.save.call_args.kwargs == {"save": True}


@pytest.mark.parametrize("identifiant", ["A1", "TABLE-999"])
def test_generate_qr_for_table_uses_table_identifiant_in_filename(settings, monkeypatch, identifiant):
    settings.DOMAIN = "https://payquick.test"
    dummy_qr = DummyQR()
    monkeypatch.setattr(qrcode_utils.qrcode, "make", lambda url: dummy_qr)
    table = SimpleNamespace(identifiant=identifiant, qr_code_file=MagicMock())

    qrcode_utils.generate_qr_for_table(table)

    filename = table.qr_code_file.save.call_args.args[0]
    assert filename == f"qr_{identifiant}.png"