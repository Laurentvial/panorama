import random
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from datetime import datetime, timezone as dt_timezone

from django.test import SimpleTestCase

from .position_service import (
    GENERATION_HORIZON_MAX_DAYS,
    GENERATION_HORIZON_MIN_DAYS,
    _apply_profit_variability,
    _clamp_generation_horizon_days,
    _distribute_pnl_total_capped,
    _invested_amount_for_recalc_transaction,
    _product_has_explicit_contract_duration,
    calculate_remaining_interests_for_transaction,
    delete_pending_positions_for_transaction,
)
from .views import (
    _build_preview_contract,
    _has_existing_pending_positions_for_product,
    _validate_preview_contract,
    _validate_recalculation_execution_against_expected,
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


class PreviewContractValidationTest(SimpleTestCase):
    def test_preview_contract_round_trip(self):
        cutoff = datetime(2026, 6, 1, 12, 30, tzinfo=dt_timezone.utc)
        per_tx = [
            {'transaction_id': 'txnA', 'created': 10, 'before_pending': 7, 'after_pending': 10, 'status': 'ok'},
            {'transaction_id': 'txnB', 'created': 5, 'before_pending': 3, 'after_pending': 5, 'status': 'ok'},
        ]
        contract = _build_preview_contract(
            cutoff_dt=cutoff,
            regenerated_total=15,
            per_transaction_expected=per_tx,
            source='unit_test',
        )
        parsed, err = _validate_preview_contract(contract)
        self.assertIsNone(err)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed['expected_total'], 15)
        self.assertEqual(len(parsed['expected_per_transaction']), 2)
        self.assertEqual(parsed['cutoff_datetime'], cutoff.isoformat())

    def test_preview_contract_signature_mismatch_detected(self):
        cutoff = datetime(2026, 6, 1, 12, 30, tzinfo=dt_timezone.utc)
        contract = _build_preview_contract(
            cutoff_dt=cutoff,
            regenerated_total=3,
            per_transaction_expected=[{'transaction_id': 'txnA', 'created': 3}],
            source='unit_test',
        )
        contract['expected_total'] = 999
        parsed, err = _validate_preview_contract(contract)
        self.assertIsNone(parsed)
        self.assertIsNotNone(err)
        self.assertIn('signature mismatch', err)

    def test_validate_recalculation_execution_against_expected_per_transaction(self):
        expected_per_tx = [
            {'transaction_id': 'txnA', 'created': 10},
            {'transaction_id': 'txnB', 'created': 5},
        ]
        execution_summary = {
            'regenerated_total': 15,
            'per_transaction': [
                {'transaction_id': 'txnA', 'created': 10},
                {'transaction_id': 'txnB', 'created': 2},
            ],
        }
        mismatch = _validate_recalculation_execution_against_expected(
            expected_total=15,
            expected_per_transaction=expected_per_tx,
            execution_summary=execution_summary,
        )
        self.assertIsNotNone(mismatch)
        self.assertIn('par transaction', mismatch)


class AdditionPendingDetectionTest(SimpleTestCase):
    @patch('api.views.Position.objects.filter')
    def test_has_existing_pending_positions_for_product_without_exclude(self, mock_filter):
        qs = mock_filter.return_value
        qs.exists.return_value = True

        result = _has_existing_pending_positions_for_product(
            client_id='clientA',
            product_id='productA',
        )

        self.assertTrue(result)
        mock_filter.assert_called_once_with(
            product_id='productA',
            client_id='clientA',
            status='pending',
        )
        qs.exclude.assert_not_called()
        qs.exists.assert_called_once()

    @patch('api.views.Position.objects.filter')
    def test_has_existing_pending_positions_for_product_with_exclude_transaction(self, mock_filter):
        base_qs = mock_filter.return_value
        excluded_qs = base_qs.exclude.return_value
        excluded_qs.exists.return_value = True

        result = _has_existing_pending_positions_for_product(
            client_id='clientA',
            product_id='productA',
            exclude_transaction_id='txnA',
        )

        self.assertTrue(result)
        base_qs.exclude.assert_called_once_with(transaction_id='txnA')
        excluded_qs.exists.assert_called_once()

    @patch('api.views.Position.objects.filter')
    def test_has_existing_pending_positions_for_product_ignores_solde_or_empty(self, mock_filter):
        self.assertFalse(
            _has_existing_pending_positions_for_product(
                client_id='clientA',
                product_id='solde',
            )
        )
        self.assertFalse(
            _has_existing_pending_positions_for_product(
                client_id='clientA',
                product_id='',
            )
        )
        mock_filter.assert_not_called()


class RemainingInterestsComputationTest(SimpleTestCase):
    @patch('api.position_service.Position.objects.filter')
    def test_calculates_interests_from_done_positions_pnl(self, mock_filter):
        qs = mock_filter.return_value
        qs.aggregate.return_value = {'total': Decimal('26.45')}
        txn = SimpleNamespace(
            id='txnA',
            client_id='clientA',
            type='transfert',
            transfer_to='productA',
        )

        remaining = calculate_remaining_interests_for_transaction(txn)

        self.assertEqual(remaining, Decimal('26.45'))
        mock_filter.assert_called_once_with(transaction_id='txnA', status='done')
        qs.aggregate.assert_called_once()

    @patch('api.position_service.Position.objects.filter')
    def test_clamps_remaining_interests_to_zero(self, mock_filter):
        qs = mock_filter.return_value
        qs.aggregate.return_value = {'total': Decimal('-12.00')}
        txn = SimpleNamespace(
            id='txnA',
            client_id='clientA',
            type='transfert',
            transfer_to='productA',
        )

        remaining = calculate_remaining_interests_for_transaction(txn)
        self.assertEqual(remaining, Decimal('0.00'))

    def test_returns_zero_for_non_investment_transfer(self):
        txn = SimpleNamespace(
            id='txnA',
            client_id='clientA',
            type='transfert',
            transfer_to='solde',
        )
        remaining = calculate_remaining_interests_for_transaction(txn)
        self.assertEqual(remaining, Decimal('0.00'))


class DeletePendingPositionsForTransactionTest(SimpleTestCase):
    @patch('api.position_service.position_deletion_audit')
    @patch('api.position_service.Position.objects.filter')
    def test_delete_pending_positions_uses_audit_context(self, mock_filter, mock_audit):
        delete_qs = mock_filter.return_value
        delete_qs.delete.return_value = (3, {'api.Position': 3})

        class _Ctx:
            def __enter__(self):
                return None

            def __exit__(self, exc_type, exc, tb):
                return False

        mock_audit.return_value = _Ctx()

        deleted = delete_pending_positions_for_transaction(
            transaction_id='txnA',
            trigger='unit_test_cleanup',
        )

        self.assertEqual(deleted, 3)
        mock_filter.assert_called_once_with(transaction_id='txnA', status='pending')
        mock_audit.assert_called_once_with('unit_test_cleanup')
        delete_qs.delete.assert_called_once()


class TextVariablesTest(SimpleTestCase):
    def test_resolve_known_and_unknown_variables(self):
        from .text_variables import resolve_text_variables

        variables = {
            "platform_name": "Syz SA",
            "email": "contact@example.com",
            "address": "",
        }
        text = "Bienvenue sur {{ platform_name }} — contact: {{email}} — {{unknown_key}}"
        resolved = resolve_text_variables(text, variables)
        self.assertEqual(
            resolved,
            "Bienvenue sur Syz SA — contact: contact@example.com — {{unknown_key}}",
        )

    def test_resolve_empty_value_replaces_with_empty_string(self):
        from .text_variables import resolve_text_variables

        variables = {"platform_name": "", "email": "a@b.c"}
        self.assertEqual(resolve_text_variables("{{platform_name}}", variables), "")
        self.assertEqual(resolve_text_variables("A{{platform_name}}B", variables), "AB")

    def test_text_without_variables_is_unchanged(self):
        from .text_variables import resolve_text_variables

        text = "Description statique sans placeholder."
        self.assertEqual(resolve_text_variables(text, {"platform_name": "X"}), text)

    def test_build_platform_variables_from_settings(self):
        from .text_variables import build_platform_variables_from_settings

        settings = SimpleNamespace(
            platform_name="Syz SA",
            address="Genève",
            website="https://example.com",
            email="service@example.com",
            legal_form="SA",
            share_capital="1 000 000 CHF",
            siren="CHE-123",
            siret="",
            rcs="RC Genève",
            vat_number="CHE123",
            publication_director="Jean Dupont",
            hosting_provider="Host SA",
            dpo_contact="dpo@example.com",
            consumer_mediator="Médiateur XYZ",
            regulatory_mentions="FINMA",
            company_country="CH",
        )
        variables = build_platform_variables_from_settings(settings)
        self.assertEqual(variables["platform_name"], "Syz SA")
        self.assertEqual(variables["company_country"], "Suisse")
        self.assertEqual(variables["siret"], "")

    def test_apply_to_product_dict_resolves_description_and_cgv(self):
        from .text_variables import apply_to_product_dict

        data = {
            "id": "prod1",
            "name": "Produit test",
            "description": "Offre {{platform_name}}",
            "cgv": "Email: {{email}}",
        }
        resolved = apply_to_product_dict(
            data,
            variables={"platform_name": "Panorama", "email": "info@panorama.test"},
        )
        self.assertEqual(resolved["description"], "Offre Panorama")
        self.assertEqual(resolved["cgv"], "Email: info@panorama.test")
        self.assertEqual(resolved["name"], "Produit test")


class WithdrawalRecalcInvestedAmountTest(SimpleTestCase):
    """Proportional capital allocation after withdrawal/addition recalculation."""

    def _withdrawal_meta(self):
        return {
            'principal_before_withdrawal': Decimal('9100.00'),
            'total_value_after_withdrawal': Decimal('1204.11'),
            'capital_scale_factor': Decimal('0.130823'),
        }

    def test_single_investment_gets_full_remaining_value(self):
        meta = self._withdrawal_meta()
        amount = _invested_amount_for_recalc_transaction(
            total_after=meta['total_value_after_withdrawal'],
            principal_before=meta['principal_before_withdrawal'],
            transaction_amount=Decimal('9100.00'),
            real_invested_capital=Decimal('1100.00'),
            scale_factor=meta['capital_scale_factor'],
        )
        self.assertEqual(amount, Decimal('1204.11'))

    def test_four_investments_split_remaining_value_proportionally(self):
        meta = self._withdrawal_meta()
        txn_amounts = [
            Decimal('2000.00'),
            Decimal('3000.00'),
            Decimal('2100.00'),
            Decimal('2000.00'),
        ]
        allocated = [
            _invested_amount_for_recalc_transaction(
                total_after=meta['total_value_after_withdrawal'],
                principal_before=meta['principal_before_withdrawal'],
                transaction_amount=amt,
                real_invested_capital=Decimal('1100.00'),
                scale_factor=meta['capital_scale_factor'],
            )
            for amt in txn_amounts
        ]
        self.assertEqual(sum(allocated, Decimal('0')), Decimal('1204.11'))
        for amt in allocated:
            self.assertLess(amt, Decimal('1204.11'))
            self.assertGreater(amt, Decimal('0'))
        self.assertEqual(allocated[0], Decimal('264.64'))
        self.assertEqual(allocated[1], Decimal('396.96'))

    def test_scale_factor_fallback_when_principal_missing(self):
        amount = _invested_amount_for_recalc_transaction(
            total_after=Decimal('1204.11'),
            principal_before=None,
            transaction_amount=Decimal('9100.00'),
            real_invested_capital=Decimal('1100.00'),
            scale_factor=Decimal('0.130823'),
        )
        self.assertEqual(amount, Decimal('143.91'))

    def test_addition_uses_full_post_addition_value(self):
        amount = _invested_amount_for_recalc_transaction(
            total_after=Decimal('5500.00'),
            principal_before=Decimal('5000.00'),
            transaction_amount=Decimal('2500.00'),
            real_invested_capital=Decimal('7500.00'),
            scale_factor=Decimal('1.1'),
            is_addition=True,
        )
        self.assertEqual(amount, Decimal('5500.00'))

    def test_addition_larger_than_existing_principal(self):
        """Regression: 2040€ addition on 360€ must not inflate capital via amount/principal_before."""
        amount = _invested_amount_for_recalc_transaction(
            total_after=Decimal('2401.01'),
            principal_before=Decimal('360.00'),
            transaction_amount=Decimal('2040.00'),
            real_invested_capital=Decimal('2400.00'),
            scale_factor=Decimal('6.650813'),
            is_addition=True,
        )
        self.assertEqual(amount, Decimal('2401.01'))
