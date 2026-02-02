from decimal import Decimal

import pytest

from api.utils import commission_utils


def test_calculate_platform_fee_rounding():
    amount = Decimal("12.34")
    fee = commission_utils.calculate_platform_fee(amount)
    assert fee == Decimal("0.25")


def test_calculate_platform_fee_cents():
    assert commission_utils.calculate_platform_fee_cents(1000) == 20


def test_calculate_estimated_stripe_fee():
    amount = Decimal("10.00")
    fee = commission_utils.calculate_estimated_stripe_fee(amount)
    assert fee == Decimal("0.39")


def test_calculate_net_revenue_online():
    result = commission_utils.calculate_net_revenue(Decimal("10.00"), payment_method="online")
    assert result["gross_amount"] == Decimal("10.00")
    assert result["platform_fee"] == Decimal("0.20")
    assert result["stripe_fee_estimated"] == Decimal("0.39")
    assert result["net_amount"] == Decimal("9.41")


def test_calculate_net_revenue_cash():
    result = commission_utils.calculate_net_revenue(Decimal("10.00"), payment_method="cash")
    assert result["platform_fee"] == Decimal("0")
    assert result["stripe_fee_estimated"] == Decimal("0")
    assert result["net_amount"] == Decimal("10.00")
