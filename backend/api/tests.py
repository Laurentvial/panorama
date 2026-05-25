import random
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from .position_service import (
    GENERATION_HORIZON_MAX_DAYS,
    GENERATION_HORIZON_MIN_DAYS,
    _apply_profit_variability,
    _clamp_generation_horizon_days,
    _distribute_pnl_total_capped,
    _product_has_explicit_contract_duration,
)


class GenerationHorizonHelpersTest(SimpleTestCase):
    def test_product_has_explicit_contract_duration(self):
        self.assertFalse(_product_has_explicit_contract_duration(None))
        self.assertFalse(_product_has_explicit_contract_duration(""))
        self.assertFalse(_product_has_explicit_contract_duration("   "))
        self.assertTrue(_product_has_explicit_contract_duration("90"))
        self.assertTrue(_product_has_explicit_contract_duration("12 mois"))
        self.assertFalse(_product_has_explicit_contract_duration("abc"))

    def test_clamp_generation_horizon_days(self):
        self.assertEqual(_clamp_generation_horizon_days(15), GENERATION_HORIZON_MIN_DAYS)
        self.assertEqual(_clamp_generation_horizon_days(270), 270)
        self.assertEqual(_clamp_generation_horizon_days(99999), GENERATION_HORIZON_MAX_DAYS)


class DistributePnlNegativeTargetTest(SimpleTestCase):
    """_distribute_pnl_total_capped: proportional losses when target_total < 0."""

    @patch('api.position_service.random.random', return_value=0.5)
    def test_negative_target_proportional_losses(self, _mock_random):
        amounts = [Decimal('5000')] * 4
        target = Decimal('-1200.00')
        parts = _distribute_pnl_total_capped(target, amounts, avoid_losses=False)
        self.assertEqual(len(parts), 4)
        for p in parts:
            self.assertLessEqual(p, Decimal('0'))
        total = sum(parts, Decimal('0')).quantize(Decimal('0.01'))
        self.assertEqual(total, target)
        for p in parts:
            self.assertEqual(p, Decimal('-300.00'))

    @patch('api.position_service.random.random', return_value=0.5)
    def test_negative_target_zero_skips_random(self, _mock_random):
        amounts = [Decimal('1000'), Decimal('2000')]
        parts = _distribute_pnl_total_capped(Decimal('0'), amounts, avoid_losses=False)
        self.assertEqual(parts, [Decimal('0.00'), Decimal('0.00')])

    @patch('api.position_service.random.random', return_value=0.5)
    def test_negative_target_respects_cap_sum(self, _mock_random):
        """
        When |target| exceeds what per-trade caps can absorb, the sum may not reach target;
        drift stops once no slack remains (same class of behaviour as before for impossible totals).
        """
        amounts = [Decimal('1000.00'), Decimal('1000.00')]
        target = Decimal('-50000.00')
        cap_amt = (Decimal('1000') * Decimal('0.30')).quantize(Decimal('0.01'))
        max_mag = cap_amt * 2
        parts = _distribute_pnl_total_capped(target, amounts, avoid_losses=False)
        total = sum(parts, Decimal('0')).quantize(Decimal('0.01'))
        self.assertGreaterEqual(total, target)
        self.assertGreaterEqual(total, -max_mag)
        for p in parts:
            self.assertGreaterEqual(p, -cap_amt)
            self.assertLessEqual(p, Decimal('0'))


class DistributePnlAvoidLossesTest(SimpleTestCase):
    @staticmethod
    def _longest_adjacent_run(values: list[Decimal]) -> int:
        if not values:
            return 0
        longest = 1
        current = 1
        for i in range(1, len(values)):
            if values[i] == values[i - 1]:
                current += 1
                longest = max(longest, current)
            else:
                current = 1
        return longest

    @patch('api.position_service.random.uniform', return_value=1.0)
    @patch('api.position_service.random.random', return_value=0.5)
    def test_avoid_losses_reduces_identical_adjacent_gains_for_equal_amounts(
        self,
        _mock_random,
        _mock_uniform,
    ):
        amounts = [Decimal('5000.00')] * 6
        target = Decimal('600.00')

        parts = _distribute_pnl_total_capped(target, amounts, avoid_losses=True)

        self.assertEqual(len(parts), 6)
        self.assertEqual(sum(parts, Decimal('0')).quantize(Decimal('0.01')), target)
        cap = (Decimal('5000.00') * Decimal('0.30')).quantize(Decimal('0.01'))
        for p in parts:
            self.assertGreaterEqual(p, Decimal('0.00'))
            self.assertLessEqual(p, cap)

        # Before anti-run handling this setup was usually [100.00] * 6.
        self.assertGreater(len(set(parts)), 1)
        self.assertLess(self._longest_adjacent_run(parts), len(parts))

    @patch('api.position_service.random.uniform', return_value=1.0)
    @patch('api.position_service.random.random', return_value=0.5)
    def test_avoid_losses_keeps_bounds_when_target_exceeds_total_caps(
        self,
        _mock_random,
        _mock_uniform,
    ):
        amounts = [Decimal('1000.00'), Decimal('1000.00')]
        target = Decimal('50000.00')

        parts = _distribute_pnl_total_capped(target, amounts, avoid_losses=True)

        cap = (Decimal('1000.00') * Decimal('0.30')).quantize(Decimal('0.01'))
        total = sum(parts, Decimal('0')).quantize(Decimal('0.01'))
        self.assertLessEqual(total, target)
        self.assertEqual(total, (cap * 2).quantize(Decimal('0.01')))
        for p in parts:
            self.assertGreaterEqual(p, Decimal('0.00'))
            self.assertLessEqual(p, cap)

    @patch('api.position_service.random.uniform', return_value=1.0)
    @patch('api.position_service.random.random', return_value=0.5)
    def test_avoid_losses_natural_distribution_for_small_total(
        self,
        _mock_random,
        _mock_uniform,
    ):
        amounts = [Decimal('500.00')] * 6
        target = Decimal('1.55')

        parts = _distribute_pnl_total_capped(target, amounts, avoid_losses=True)
        self.assertEqual(sum(parts, Decimal('0')).quantize(Decimal('0.01')), target)
        self.assertGreaterEqual(len(set(parts)), 4)
        self.assertLessEqual(self._longest_adjacent_run(parts), 2)
        self.assertGreaterEqual(max(parts) - min(parts), Decimal('0.10'))


class ProfitVariabilityTest(SimpleTestCase):
    def test_small_profit_variability_breaks_cent_lock(self):
        values = []
        for i in range(20):
            rng = random.Random(f"txnA:{i}:variability")
            values.append(_apply_profit_variability(Decimal('0.26'), rng))
        self.assertGreater(len(set(values)), 1)

    def test_variability_keeps_positive_floor_for_positive_profits(self):
        rng = random.Random("tiny-profit")
        value = _apply_profit_variability(Decimal('0.01'), rng)
        self.assertGreaterEqual(value, Decimal('0.01'))
