from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from django.utils import timezone

from api.live_pricing_service import (
    DEFAULT_CARRY_OVER_MAX_BUSINESS_DAYS,
    can_activate_live_pricing,
    find_intraday_trade,
    is_live_pricing_active,
    run_live_pricing_for_transaction,
    update_carry_over,
)
from api.live_pricing_runner import run_process_live_pricing
from api.models import Asset


class UpdateCarryOverTest(SimpleTestCase):
    def test_resets_when_target_met(self):
        config = {
            "carry_over_amount": "5.00",
            "carry_over_business_days": 2,
            "carry_over_max_business_days": DEFAULT_CARRY_OVER_MAX_BUSINESS_DAYS,
            "end_period_spread_business_days": 5,
        }
        result = update_carry_over(
            config,
            target=Decimal("10.00"),
            realized=Decimal("10.00"),
            session_date=date(2026, 7, 7),
            contract_end_date=date(2026, 12, 31),
        )
        self.assertEqual(result["carry_over_amount"], "0.00")
        self.assertEqual(result["carry_over_business_days"], 0)

    def test_increments_carry_over_business_days(self):
        config = {
            "carry_over_amount": "0.00",
            "carry_over_business_days": 0,
            "carry_over_max_business_days": 3,
            "end_period_spread_business_days": 5,
        }
        result = update_carry_over(
            config,
            target=Decimal("5.00"),
            realized=Decimal("2.00"),
            session_date=date(2026, 7, 7),
            contract_end_date=date(2026, 12, 31),
        )
        self.assertEqual(result["carry_over_amount"], "3.00")
        self.assertEqual(result["carry_over_business_days"], 1)


class FindIntradayTradeTest(SimpleTestCase):
    @patch("api.live_pricing_service._fetch_intraday_candles")
    def test_finds_trade_matching_target(self, mock_fetch):
        from datetime import datetime

        mock_fetch.return_value = [
            {
                "datetime": datetime(2026, 7, 7, 10, 0),
                "open": 100.0,
                "high": 101.0,
                "low": 99.5,
                "close": 100.5,
            },
            {
                "datetime": datetime(2026, 7, 7, 11, 0),
                "open": 100.5,
                "high": 102.0,
                "low": 100.0,
                "close": 101.5,
            },
        ]
        asset = MagicMock(spec=Asset)
        asset.id = "asset1"
        asset.type = "Bourse"
        asset.exchange = "EURONEXT"
        asset.region = "france"

        trade = find_intraday_trade(
            asset,
            date(2026, 7, 7),
            Decimal("5.00"),
            Decimal("1000.00"),
            avoid_losses=True,
        )
        self.assertIsNotNone(trade)
        self.assertGreater(trade["profit_loss"], Decimal("0"))


class FetchIntradayCandlesFallbackTest(SimpleTestCase):
    @patch("api.alpha_vantage_service.get_alpha_vantage_service")
    @patch("api.alpha_vantage_service.get_stock_candles_finnhub", return_value=None)
    def test_daily_ohlc_fallback_for_international_symbol(self, _mock_finnhub, mock_av_service):
        from api.live_pricing_service import _fetch_intraday_candles

        av = MagicMock()
        av.get_intraday_data.return_value = None
        av.get_daily_data.return_value = {
            "data": [
                {
                    "date": "2026-07-07",
                    "open": 45.78,
                    "high": 46.32,
                    "low": 45.69,
                    "close": 45.97,
                }
            ]
        }
        mock_av_service.return_value = av

        asset = MagicMock(spec=Asset)
        asset.id = "mbg"
        asset.type = "Bourse"
        asset.exchange = "XETRA"
        asset.region = "germany"
        asset.alpha_vantage_symbol = "MBG.DE"
        asset.reference = "MBG.DE"

        candles = _fetch_intraday_candles(asset, date(2026, 7, 7))
        self.assertEqual(len(candles), 3)
        self.assertEqual(candles[0]["open"], 45.78)
        self.assertEqual(candles[-1]["close"], 45.97)
        av.get_intraday_data.assert_called()
        av.get_daily_data.assert_called()


class CanActivateLivePricingTest(SimpleTestCase):
    @patch("api.live_pricing_service.ProductAssetAllocation.objects.filter")
    @patch("api.live_pricing_service._get_product_for_transaction")
    @patch("api.live_pricing_service.transaction_has_saved_position_generation")
    @patch("api.live_pricing_service.is_live_pricing_active")
    def test_can_activate_when_eligible(
        self,
        mock_active,
        mock_saved,
        mock_product,
        mock_alloc,
    ):
        mock_active.return_value = False
        mock_saved.return_value = False
        product = MagicMock()
        product.id = "prod1"
        mock_product.return_value = product
        mock_alloc.return_value.exists.return_value = True

        txn = MagicMock()
        txn.type = "transfert"
        txn.transfer_to = "prod1"

        ok, err = can_activate_live_pricing(txn)
        self.assertTrue(ok)
        self.assertEqual(err, "")

    @patch("api.live_pricing_service.is_live_pricing_active")
    @patch("api.live_pricing_service.transaction_has_saved_position_generation")
    def test_cannot_activate_when_positions_exist(self, mock_saved, mock_active):
        mock_active.return_value = False
        mock_saved.return_value = True
        txn = MagicMock()
        txn.type = "transfert"
        txn.transfer_to = "prod1"
        ok, err = can_activate_live_pricing(txn)
        self.assertFalse(ok)
        self.assertIn("anticipées", err)


class LivePricingRunnerDryRunTest(SimpleTestCase):
    @patch("api.live_pricing_runner.run_live_pricing_for_transaction")
    @patch("api.live_pricing_runner.iter_active_live_pricing_transactions")
    def test_dry_run_does_not_require_db_positions(self, mock_iter, mock_run):
        txn = MagicMock()
        txn.id = "txn1"
        mock_iter.return_value = [txn]
        mock_run.return_value = {"status": "ok", "positions_created": 0, "dry_run": True}

        result = run_process_live_pricing(dry_run=True)
        self.assertEqual(result["processed"], 1)
        mock_run.assert_called_once()
        self.assertTrue(mock_run.call_args.kwargs.get("dry_run"))


class IsLivePricingActiveTest(SimpleTestCase):
    def test_detects_active_config(self):
        txn = MagicMock()
        txn.position_generation_history = [
            {
                "mode": "live_pricing",
                "live_config": {"status": "active"},
            }
        ]
        self.assertTrue(is_live_pricing_active(txn))

    def test_inactive_when_no_history(self):
        txn = MagicMock()
        txn.position_generation_history = []
        self.assertFalse(is_live_pricing_active(txn))


class RunLivePricingLoopTerminationTest(SimpleTestCase):
    def _build_active_transaction(self) -> MagicMock:
        txn = MagicMock()
        txn.id = "txn1"
        txn.client_id = "client1"
        txn.validated_at = timezone.make_aware(datetime(2026, 1, 1, 12, 0))
        txn.datetime = txn.validated_at
        txn.position_generation_history = [
            {
                "mode": "live_pricing",
                "live_config": {
                    "status": "active",
                    "avoid_losses": False,
                    "positive_gains_only": False,
                    "daily_plan": [
                        {
                            "date": "2026-07-07",
                            "base_target_profit": "10.00",
                            "num_positions": 5,
                        }
                    ],
                    "max_positions_per_day": 5,
                },
            }
        ]
        return txn

    @patch("api.live_pricing_service._persist_live_config")
    @patch("api.live_pricing_service._next_live_period_index", return_value=0)
    @patch("api.live_pricing_service.find_intraday_trade")
    @patch("api.live_pricing_service._get_allocations")
    @patch("api.live_pricing_service._get_product_for_transaction")
    @patch("api.live_pricing_service.build_investment_context")
    def test_stops_after_target_met_even_without_avoid_losses(
        self,
        mock_build_ctx,
        mock_get_product,
        mock_get_allocations,
        mock_find_trade,
        _mock_next_period,
        _mock_persist,
    ):
        txn = self._build_active_transaction()

        product = MagicMock()
        product.id = "prod1"
        mock_get_product.return_value = product

        asset = MagicMock()
        asset.id = "asset1"
        mock_get_allocations.return_value = [(asset, Decimal("1.0"))]

        ctx = MagicMock()
        ctx.invested_amount = Decimal("10000")
        ctx.duration_days = 365
        mock_build_ctx.return_value = ctx

        mock_find_trade.return_value = {
            "profit_loss": Decimal("10.00"),
            "entry_price": Decimal("100.00"),
            "quantity": Decimal("10.00"),
            "opened_at": timezone.make_aware(datetime(2026, 7, 7, 10, 0)),
            "closed_at": timezone.make_aware(datetime(2026, 7, 7, 11, 0)),
        }

        result = run_live_pricing_for_transaction(
            txn,
            session_date=date(2026, 7, 7),
            dry_run=True,
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["positions_created"], 1)
        self.assertEqual(mock_find_trade.call_count, 1)
