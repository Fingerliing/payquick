from decimal import Decimal
from types import SimpleNamespace

from api.utils.comptabilite_utils import VATCalculator


def test_calculate_from_ttc():
    result = VATCalculator.calculate_from_ttc(Decimal("11.00"), Decimal("0.10"))
    assert result["ht"] == Decimal("10.00")
    assert result["tva"] == Decimal("1.00")
    assert result["ttc"] == Decimal("11.00")


def test_calculate_from_ht():
    result = VATCalculator.calculate_from_ht(Decimal("10.00"), Decimal("0.20"))
    assert result["ht"] == Decimal("10.00")
    assert result["tva"] == Decimal("2.00")
    assert result["ttc"] == Decimal("12.00")


def test_get_rate_for_item_with_vat_rate():
    item = SimpleNamespace(
        menu_item=SimpleNamespace(vat_rate=Decimal("0.20")),
        order=SimpleNamespace(order_type="dine_in"),
    )
    assert VATCalculator.get_rate_for_item(item) == Decimal("0.20")


def test_get_rate_for_item_alcohol():
    item = SimpleNamespace(
        menu_item=SimpleNamespace(name="Vin rouge", category="boissons"),
        order=SimpleNamespace(order_type="dine_in"),
    )
    assert VATCalculator.get_rate_for_item(item) == VATCalculator.RATES["ALCOHOL"]


def test_get_rate_for_item_packaged():
    item = SimpleNamespace(
        menu_item=SimpleNamespace(name="Sandwich", is_packaged=True, category="food"),
        order=SimpleNamespace(order_type="takeaway"),
    )
    assert VATCalculator.get_rate_for_item(item) == VATCalculator.RATES["PACKAGED"]


def test_get_rate_for_item_soft_drink():
    item = SimpleNamespace(
        menu_item=SimpleNamespace(name="Cola", category="drinks"),
        order=SimpleNamespace(order_type="dine_in"),
    )
    assert VATCalculator.get_rate_for_item(item) == VATCalculator.RATES["SOFT_DRINK"]


def test_get_rate_for_item_takeaway_default():
    item = SimpleNamespace(
        menu_item=SimpleNamespace(name="Plat du jour", category="food"),
        order=SimpleNamespace(order_type="takeaway"),
    )
    assert VATCalculator.get_rate_for_item(item) == VATCalculator.RATES["FOOD_TAKEAWAY"]
