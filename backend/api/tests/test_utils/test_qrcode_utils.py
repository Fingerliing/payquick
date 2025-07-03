import pytest
from api.tests.factories import TableFactory
from api.utils.qrcode_utils import generate_qr_for_table

@pytest.mark.django_db
def test_generate_qr_for_table_saves_file():
    table = TableFactory()
    generate_qr_for_table(table)
    assert table.qr_code_file.name.endswith(".png")
    assert table.qr_code_file.size > 0