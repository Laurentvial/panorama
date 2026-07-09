"""
Live Pricing position generation: daily batch at 23:00 UTC using intraday market data.
"""
from __future__ import annotations

import logging
import random
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

import pytz
from django.db.models import Max
from django.utils import timezone

from api.models import Asset, Position, Product, ProductAssetAllocation, Transaction
from api.position_service import (
    _distribute_positions_across_days,
    _get_market_hours_for_asset,
    _trading_days_between,
    _weighted_choice_with_rng,
    build_investment_context,
    transaction_has_saved_position_generation,
)

logger = logging.getLogger(__name__)

DEFAULT_EXECUTION_TIME_UTC = "23:00"
DEFAULT_CARRY_OVER_MAX_BUSINESS_DAYS = 3
DEFAULT_MAX_POSITIONS_PER_DAY = 5
DEFAULT_END_PERIOD_SPREAD_BUSINESS_DAYS = 5
DEFAULT_PNL_TOLERANCE_EUR = Decimal("0.10")
LIVE_PRICING_MODE = "live_pricing"


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _is_business_day(d: date) -> bool:
    return d.weekday() < 5


def _business_days_between(start: date, end: date) -> list[date]:
    if start > end:
        return []
    days: list[date] = []
    cursor = start
    while cursor <= end:
        if _is_business_day(cursor):
            days.append(cursor)
        cursor += timedelta(days=1)
    return days


def get_live_pricing_entry(txn: Transaction) -> dict | None:
    for entry in reversed(txn.position_generation_history or []):
        if entry.get("mode") == LIVE_PRICING_MODE:
            return entry
    return None


def get_live_pricing_config(txn: Transaction) -> dict | None:
    entry = get_live_pricing_entry(txn)
    if not entry:
        return None
    live_config = entry.get("live_config")
    return live_config if isinstance(live_config, dict) else None


def is_live_pricing_active(txn: Transaction) -> bool:
    live_config = get_live_pricing_config(txn)
    return bool(live_config and live_config.get("status") == "active")


def _get_product_for_transaction(txn: Transaction) -> Product | None:
    if txn.product_id:
        return txn.product
    if txn.transfer_to and txn.transfer_to not in ("solde", "trading"):
        return Product.objects.filter(id=txn.transfer_to).first()
    return None


def can_activate_live_pricing(txn: Transaction) -> tuple[bool, str]:
    if txn.type != "transfert" or not txn.transfer_to or txn.transfer_to == "solde":
        return False, "Cette transaction n'est pas un investissement produit."

    if is_live_pricing_active(txn):
        return False, "La génération Live Pricing est déjà active sur cette transaction."

    if transaction_has_saved_position_generation(txn):
        return False, (
            "Des positions anticipées existent déjà. "
            "Impossible d'activer le Live Pricing sur cette transaction."
        )

    product = _get_product_for_transaction(txn)
    if product is None:
        return False, "Produit introuvable pour cette transaction."

    if not ProductAssetAllocation.objects.filter(product_id=product.id).exists():
        return False, "Le produit n'a pas d'allocations d'actifs."

    return True, ""


def build_daily_plan(
    txn: Transaction,
    *,
    period_summaries: list[dict],
    positions_per_month_min: int | None = None,
    positions_per_month_max: int | None = None,
) -> list[dict]:
    """Build per-day targets: num_positions and base P&L target."""
    ctx = build_investment_context(txn)
    if ctx is None:
        return []

    start_dt = timezone.now()
    if txn.validated_at:
        start_dt = txn.validated_at
    elif txn.datetime:
        start_dt = txn.datetime if timezone.is_aware(txn.datetime) else timezone.make_aware(txn.datetime)

    end_dt = start_dt + timedelta(days=ctx.duration_days)
    all_trading_days = _trading_days_between(start_dt, end_dt)
    if not all_trading_days:
        return []

    rng = random.Random(f"{txn.id}:live_daily_plan")
    daily_entries: list[dict] = []

    for period in period_summaries:
        start_raw = period.get("startDate") or period.get("start_date")
        end_raw = period.get("endDate") or period.get("end_date")
        if not start_raw or not end_raw:
            continue
        try:
            period_start = date.fromisoformat(str(start_raw)[:10])
            period_end = date.fromisoformat(str(end_raw)[:10])
        except ValueError:
            continue

        period_days = [d for d in all_trading_days if period_start <= d <= period_end]
        if not period_days:
            continue

        target_profit = _to_decimal(period.get("targetProfit") or period.get("target_profit")) or Decimal("0")
        if target_profit <= 0:
            continue

        profit_per_day = (target_profit / Decimal(len(period_days))).quantize(Decimal("0.01"))
        period_index = int(period.get("periodIndex") if period.get("periodIndex") is not None else period.get("period_index") or 0)

        num_positions_period = 1
        if positions_per_month_min is not None and positions_per_month_max is not None:
            lo = min(positions_per_month_min, positions_per_month_max)
            hi = max(positions_per_month_min, positions_per_month_max)
            num_positions_period = rng.randint(lo, hi)

        positions_per_day = _distribute_positions_across_days(
            num_positions_period,
            len(period_days),
            rng,
        )

        for day_idx, day in enumerate(period_days):
            count = positions_per_day[day_idx]
            if count <= 0:
                continue
            daily_entries.append(
                {
                    "date": day.isoformat(),
                    "period_index": period_index,
                    "num_positions": count,
                    "base_target_profit": str(profit_per_day),
                    "target_profit": str(profit_per_day),
                }
            )

    daily_entries.sort(key=lambda x: x["date"])
    return daily_entries


def _default_live_config(**overrides: Any) -> dict:
    config = {
        "execution_time_utc": DEFAULT_EXECUTION_TIME_UTC,
        "trading_session_date_rule": "utc_calendar_date",
        "positions_per_month_min": None,
        "positions_per_month_max": None,
        "avoid_losses": False,
        "positive_gains_only": False,
        "carry_over_max_business_days": DEFAULT_CARRY_OVER_MAX_BUSINESS_DAYS,
        "max_positions_per_day": DEFAULT_MAX_POSITIONS_PER_DAY,
        "end_period_spread_business_days": DEFAULT_END_PERIOD_SPREAD_BUSINESS_DAYS,
        "activated_at": timezone.now().isoformat(),
        "status": "active",
        "carry_over_amount": "0.00",
        "carry_over_business_days": 0,
        "last_execution_at": None,
        "last_trading_session_date": None,
        "pnl_realized_cumulative": "0.00",
        "daily_plan": [],
    }
    config.update(overrides)
    return config


def activate_live_pricing(
    txn: Transaction,
    *,
    rates_used: dict | None,
    period_summaries: list[dict],
    positions_per_month_min: int | None = None,
    positions_per_month_max: int | None = None,
    avoid_losses: bool = False,
    positive_gains_only: bool = False,
) -> dict:
    ok, err = can_activate_live_pricing(txn)
    if not ok:
        raise ValueError(err)

    daily_plan = build_daily_plan(
        txn,
        period_summaries=period_summaries,
        positions_per_month_min=positions_per_month_min,
        positions_per_month_max=positions_per_month_max,
    )
    if not daily_plan:
        raise ValueError("Impossible de construire le plan journalier Live Pricing.")

    live_config = _default_live_config(
        positions_per_month_min=positions_per_month_min,
        positions_per_month_max=positions_per_month_max,
        avoid_losses=bool(avoid_losses),
        positive_gains_only=bool(positive_gains_only),
        daily_plan=daily_plan,
    )

    history_entry = {
        "timestamp": timezone.now().isoformat(),
        "mode": LIVE_PRICING_MODE,
        "rates_used": {str(k): str(v) for k, v in (rates_used or {}).items()},
        "period_summaries": period_summaries,
        "live_config": live_config,
        "summary": {
            "mode_label": "Live Pricing",
            "positions_generated": 0,
            "daily_plan_days": len(daily_plan),
        },
    }

    history = list(txn.position_generation_history or [])
    history.append(history_entry)
    txn.position_generation_history = history

    subscription_details = txn.subscription_details or {}
    if not isinstance(subscription_details, dict):
        subscription_details = {}
    subscription_details["skipPositions"] = True
    subscription_details["livePricing"] = True
    txn.subscription_details = subscription_details

    update_fields = ["position_generation_history", "subscription_details"]
    if txn.status == "en_cours":
        txn.status = "valide"
        update_fields.append("status")

    txn.save(update_fields=update_fields)
    return history_entry


def get_live_pricing_status(txn: Transaction) -> dict:
    entry = get_live_pricing_entry(txn)
    live_config = get_live_pricing_config(txn) or {}
    daily_plan = live_config.get("daily_plan") or []
    return {
        "active": is_live_pricing_active(txn),
        "mode": LIVE_PRICING_MODE if entry else None,
        "live_config": live_config,
        "daily_plan_count": len(daily_plan),
        "daily_plan_preview": daily_plan[:30],
        "period_summaries": (entry or {}).get("period_summaries") or [],
        "rates_used": (entry or {}).get("rates_used") or {},
    }


def update_carry_over(
    live_config: dict,
    *,
    target: Decimal,
    realized: Decimal,
    session_date: date,
    contract_end_date: date | None,
) -> dict:
    """Update carry-over after a daily run. Mutates and returns live_config."""
    remaining = (target - realized).quantize(Decimal("0.01"))
    if remaining <= 0:
        live_config["carry_over_amount"] = "0.00"
        live_config["carry_over_business_days"] = 0
        return live_config

    max_days = int(live_config.get("carry_over_max_business_days") or DEFAULT_CARRY_OVER_MAX_BUSINESS_DAYS)
    carry_days = int(live_config.get("carry_over_business_days") or 0) + 1

    spread_days = int(live_config.get("end_period_spread_business_days") or DEFAULT_END_PERIOD_SPREAD_BUSINESS_DAYS)
    if contract_end_date:
        remaining_business = _business_days_between(session_date + timedelta(days=1), contract_end_date)
        if len(remaining_business) <= spread_days:
            per_day = (remaining / Decimal(max(1, len(remaining_business)))).quantize(Decimal("0.01"))
            live_config["carry_over_amount"] = str(per_day)
            live_config["carry_over_business_days"] = 0
            live_config["end_period_spread_active"] = True
            return live_config

    if carry_days >= max_days:
        live_config["carry_over_amount"] = str(remaining)
        live_config["carry_over_business_days"] = carry_days
        live_config["spread_triggered"] = True
    else:
        live_config["carry_over_amount"] = str(remaining)
        live_config["carry_over_business_days"] = carry_days

    return live_config


def _normalize_finnhub_intraday_candles(raw: dict, session_date: date) -> list[dict]:
    session_str = session_date.isoformat()
    candles: list[dict] = []
    for row in raw.get("data") or []:
        if str(row.get("date", ""))[:10] != session_str:
            continue
        dt_str = row.get("datetime") or row.get("date")
        if isinstance(dt_str, str) and len(dt_str) > 10:
            try:
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            except ValueError:
                dt = datetime.combine(session_date, time(12, 0))
        else:
            dt = datetime.combine(session_date, time(12, 0))
        candles.append(
            {
                "datetime": dt,
                "open": float(row.get("open", 0)),
                "high": float(row.get("high", 0)),
                "low": float(row.get("low", 0)),
                "close": float(row.get("close", 0)),
            }
        )
    candles.sort(key=lambda c: c["datetime"])
    return candles


def _normalize_av_intraday_candles(intraday: dict, session_date: date) -> list[dict]:
    candles: list[dict] = []
    for ts_key, ohlc in (intraday.get("data") or {}).items():
        try:
            dt = datetime.strptime(ts_key, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        if dt.date() != session_date:
            continue
        candles.append(
            {
                "datetime": dt,
                "open": float(ohlc.get("1. open", 0)),
                "high": float(ohlc.get("2. high", 0)),
                "low": float(ohlc.get("3. low", 0)),
                "close": float(ohlc.get("4. close", 0)),
            }
        )
    candles.sort(key=lambda c: c["datetime"])
    return candles


def _synthesize_candles_from_daily(daily_row: dict, asset: Asset, session_date: date) -> list[dict]:
    """Build pseudo-intraday candles from a daily OHLC bar (international stocks fallback)."""
    o = float(daily_row.get("open", 0) or 0)
    h = float(daily_row.get("high", 0) or 0)
    l = float(daily_row.get("low", 0) or 0)
    c = float(daily_row.get("close", 0) or 0)
    if o <= 0 or c <= 0:
        return []

    market_open, market_close = _get_market_hours_for_asset(asset, reference_date=session_date)
    open_minutes = market_open.hour * 60 + market_open.minute
    close_minutes = market_close.hour * 60 + market_close.minute
    mid_minutes = (open_minutes + close_minutes) // 2
    mid_time = time(mid_minutes // 60, mid_minutes % 60)

    return [
        {
            "datetime": datetime.combine(session_date, market_open),
            "open": o,
            "high": h,
            "low": l,
            "close": o,
        },
        {
            "datetime": datetime.combine(session_date, mid_time),
            "open": o,
            "high": h,
            "low": l,
            "close": h,
        },
        {
            "datetime": datetime.combine(session_date, market_close),
            "open": c,
            "high": h,
            "low": l,
            "close": c,
        },
    ]


def _find_daily_row_for_session(chart_data: dict | None, session_date: date) -> dict | None:
    if not chart_data or not chart_data.get("data"):
        return None
    session_str = session_date.isoformat()
    for row in chart_data["data"]:
        if str(row.get("date", ""))[:10] == session_str:
            return row
    return None


def _fetch_intraday_candles(asset: Asset, session_date: date) -> list[dict]:
    """Return list of {datetime, open, high, low, close} for session_date."""
    symbol = (asset.alpha_vantage_symbol or asset.reference or "").strip()
    if not symbol:
        return []

    asset_type = (asset.type or "").lower()
    is_crypto = "crypto" in asset_type

    try:
        from api.alpha_vantage_service import (
            FMP_API_KEY,
            _get_symbol_variants_for_fallback,
            get_alpha_vantage_service,
            get_crypto_candles_finnhub,
            get_stock_candles_finnhub,
            get_stock_candles_fmp,
        )

        variants = [symbol] if is_crypto else _get_symbol_variants_for_fallback(symbol)
        av = get_alpha_vantage_service()

        for sym in variants:
            if is_crypto:
                raw = get_crypto_candles_finnhub(sym, resolution="5", days=3)
            else:
                raw = get_stock_candles_finnhub(sym, resolution="5", days=3)
            if raw and raw.get("data"):
                candles = _normalize_finnhub_intraday_candles(raw, session_date)
                if candles:
                    return candles

        if av and not is_crypto:
            for sym in variants:
                intraday = av.get_intraday_data(
                    sym,
                    interval="5min",
                    outputsize="compact",
                    quiet=True,
                )
                if intraday and intraday.get("data"):
                    candles = _normalize_av_intraday_candles(intraday, session_date)
                    if candles:
                        return candles

        if not is_crypto:
            for sym in variants:
                daily_row = None
                if FMP_API_KEY:
                    daily_row = _find_daily_row_for_session(get_stock_candles_fmp(sym, days=30), session_date)
                if not daily_row and av:
                    daily_row = _find_daily_row_for_session(
                        av.get_daily_data(sym, outputsize="compact"),
                        session_date,
                    )
                if daily_row:
                    candles = _synthesize_candles_from_daily(daily_row, asset, session_date)
                    if candles:
                        logger.info(
                            "Using daily OHLC fallback for %s on %s (intraday unavailable)",
                            sym,
                            session_date,
                        )
                        return candles

        return []
    except Exception as exc:
        logger.warning("Failed to fetch intraday candles for %s: %s", asset.id, exc)
        return []


def find_intraday_trade(
    asset: Asset,
    session_date: date,
    target_pnl: Decimal,
    invested_amount: Decimal,
    *,
    avoid_losses: bool = False,
    positive_gains_only: bool = False,
    tolerance: Decimal = DEFAULT_PNL_TOLERANCE_EUR,
) -> dict | None:
    """Find buy/sell pair on intraday candles matching target P&L."""
    candles = _fetch_intraday_candles(asset, session_date)
    if len(candles) < 2:
        return None

    market_open, market_close = _get_market_hours_for_asset(asset, reference_date=session_date)
    tz = pytz.timezone("Europe/Paris")

    best: dict | None = None
    best_diff = None

    for i, buy_candle in enumerate(candles[:-1]):
        buy_dt = buy_candle["datetime"]
        if timezone.is_naive(buy_dt):
            buy_dt = timezone.make_aware(buy_dt, tz)
        buy_time = buy_dt.astimezone(tz).time()
        if buy_time < market_open or buy_time > market_close:
            continue

        buy_price = Decimal(str(buy_candle["open"] or buy_candle["close"]))
        if buy_price <= 0:
            continue

        quantity = (invested_amount / buy_price).quantize(Decimal("0.00000001"))

        for sell_candle in candles[i + 1 :]:
            sell_dt = sell_candle["datetime"]
            if timezone.is_naive(sell_dt):
                sell_dt = timezone.make_aware(sell_dt, tz)
            sell_time = sell_dt.astimezone(tz).time()
            if sell_time < market_open or sell_time > market_close:
                continue

            sell_price = Decimal(str(sell_candle["close"] or sell_candle["high"]))
            if sell_price <= buy_price and not avoid_losses:
                pnl = (quantity * (sell_price - buy_price)).quantize(Decimal("0.01"))
            elif sell_price > buy_price:
                pnl = (quantity * (sell_price - buy_price)).quantize(Decimal("0.01"))
            else:
                continue

            if avoid_losses and pnl < 0:
                continue
            if positive_gains_only and pnl < Decimal("0.01"):
                continue

            diff = abs(pnl - target_pnl)
            if best_diff is None or diff < best_diff:
                best_diff = diff
                best = {
                    "entry_price": buy_price,
                    "exit_price": sell_price,
                    "quantity": quantity,
                    "profit_loss": pnl,
                    "opened_at": buy_dt,
                    "closed_at": sell_dt,
                    "diff": diff,
                }

    if best is None:
        return None
    return best


def _get_allocations(product: Product) -> list[tuple[Asset, Decimal]]:
    rows = ProductAssetAllocation.objects.select_related("asset").filter(product_id=product.id)
    items: list[tuple[Asset, Decimal]] = []
    for row in rows:
        if row.asset and row.proportion:
            items.append((row.asset, Decimal(str(row.proportion))))
    return items


def _next_live_period_index(txn: Transaction) -> int:
    agg = Position.objects.filter(transaction_id=txn.id).aggregate(m=Max("period_index"))
    current = agg.get("m")
    if current is None:
        return 0
    return int(current) + 1


def _get_day_plan(live_config: dict, session_date: date) -> dict | None:
    session_str = session_date.isoformat()
    for entry in live_config.get("daily_plan") or []:
        if entry.get("date") == session_str:
            return entry
    return None


def _persist_live_config(txn: Transaction, live_config: dict) -> None:
    history = list(txn.position_generation_history or [])
    for idx in range(len(history) - 1, -1, -1):
        if history[idx].get("mode") == LIVE_PRICING_MODE:
            history[idx]["live_config"] = live_config
            break
    txn.position_generation_history = history
    txn.save(update_fields=["position_generation_history"])


def run_live_pricing_for_transaction(
    txn: Transaction,
    *,
    session_date: date | None = None,
    dry_run: bool = False,
) -> dict:
    """Execute live pricing for one transaction on session_date."""
    if not is_live_pricing_active(txn):
        return {"status": "skipped", "reason": "not_active"}

    live_config = get_live_pricing_config(txn) or {}
    if session_date is None:
        session_date = timezone.now().date()

    if not _is_business_day(session_date):
        return {"status": "skipped", "reason": "not_business_day"}

    if live_config.get("last_trading_session_date") == session_date.isoformat():
        return {"status": "skipped", "reason": "already_executed"}

    day_plan = _get_day_plan(live_config, session_date)
    carry_over = _to_decimal(live_config.get("carry_over_amount")) or Decimal("0")

    if day_plan is None and carry_over <= 0:
        return {"status": "skipped", "reason": "no_plan_for_day"}

    base_target = _to_decimal(day_plan.get("base_target_profit") if day_plan else None) or Decimal("0")
    day_target = (base_target + carry_over).quantize(Decimal("0.01"))

    num_positions = int(day_plan.get("num_positions") if day_plan else 1)
    max_per_day = int(live_config.get("max_positions_per_day") or DEFAULT_MAX_POSITIONS_PER_DAY)
    if carry_over > 0:
        avg_pnl = base_target / Decimal(max(1, num_positions)) if base_target > 0 else Decimal("1")
        extra = min(2, int((carry_over / avg_pnl).quantize(Decimal("1"))))
        num_positions = min(max_per_day, num_positions + extra)
    num_positions = max(1, min(num_positions, max_per_day))

    product = _get_product_for_transaction(txn)
    if product is None:
        return {"status": "error", "reason": "missing_product"}

    allocations = _get_allocations(product)
    if not allocations:
        return {"status": "error", "reason": "missing_allocations"}

    ctx = build_investment_context(txn)
    capital = ctx.invested_amount if ctx else Decimal("1000")
    avoid_losses = bool(live_config.get("avoid_losses"))
    positive_only = bool(live_config.get("positive_gains_only"))

    created: list[dict] = []
    pnl_realized = Decimal("0")
    remaining_target = day_target

    for pos_idx in range(num_positions):
        if remaining_target <= 0:
            break
        pos_target = (remaining_target / Decimal(num_positions - pos_idx)).quantize(Decimal("0.01"))
        invested = (capital * Decimal("0.1")).quantize(Decimal("0.01"))
        if invested < Decimal("50"):
            invested = Decimal("50.00")

        asset_rng = random.Random(f"{txn.id}:{session_date}:{pos_idx}")
        asset = _weighted_choice_with_rng(allocations, asset_rng)

        trade = find_intraday_trade(
            asset,
            session_date,
            pos_target,
            invested,
            avoid_losses=avoid_losses,
            positive_gains_only=positive_only,
        )
        if trade is None:
            continue

        pnl = trade["profit_loss"]
        pnl_realized += pnl
        remaining_target = (remaining_target - pnl).quantize(Decimal("0.01"))

        period_index = _next_live_period_index(txn)
        pos_data = {
            "asset_id": asset.id,
            "asset_name": asset.name,
            "invested_amount": str(invested),
            "profit_loss": str(pnl),
            "entry_price": str(trade["entry_price"]),
            "quantity": str(trade["quantity"]),
            "opened_at": trade["opened_at"].isoformat(),
            "closed_at": trade["closed_at"].isoformat(),
            "period_index": period_index,
            "period_date": session_date.isoformat(),
        }
        created.append(pos_data)

        if not dry_run:
            opened_at = trade["opened_at"]
            closed_at = trade["closed_at"]
            if timezone.is_naive(opened_at):
                opened_at = timezone.make_aware(opened_at, timezone.get_current_timezone())
            if timezone.is_naive(closed_at):
                closed_at = timezone.make_aware(closed_at, timezone.get_current_timezone())
            now_ref = timezone.now()
            if closed_at <= now_ref:
                status = "done"
            elif opened_at <= now_ref < closed_at:
                status = "open"
            else:
                status = "pending"

            Position.objects.create(
                id=uuid.uuid4().hex[:12],
                client_id=txn.client_id,
                product_id=product.id,
                transaction_id=txn.id,
                asset_id=asset.id,
                invested_amount=invested,
                entry_price=trade["entry_price"],
                quantity=trade["quantity"],
                profit_loss=pnl,
                opened_at=opened_at,
                closed_at=closed_at,
                period_index=period_index,
                period_date=session_date,
                status=status,
            )

    ctx_end = None
    if ctx:
        start_dt = txn.validated_at or txn.datetime or timezone.now()
        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        ctx_end = (start_dt + timedelta(days=ctx.duration_days)).date()

    update_carry_over(
        live_config,
        target=day_target,
        realized=pnl_realized,
        session_date=session_date,
        contract_end_date=ctx_end,
    )

    cumulative = (_to_decimal(live_config.get("pnl_realized_cumulative")) or Decimal("0")) + pnl_realized
    live_config["pnl_realized_cumulative"] = str(cumulative.quantize(Decimal("0.01")))
    live_config["last_execution_at"] = timezone.now().isoformat()
    live_config["last_trading_session_date"] = session_date.isoformat()

    if ctx_end and session_date >= ctx_end and pnl_realized >= day_target:
        live_config["status"] = "completed"
    elif ctx_end and session_date >= ctx_end and (_to_decimal(live_config.get("carry_over_amount")) or Decimal("0")) > 0:
        live_config["status"] = "incomplete"

    if not dry_run:
        _persist_live_config(txn, live_config)

    return {
        "status": "ok",
        "session_date": session_date.isoformat(),
        "target": str(day_target),
        "realized": str(pnl_realized.quantize(Decimal("0.01"))),
        "positions_created": len(created),
        "positions_preview": created,
        "dry_run": dry_run,
    }


def iter_active_live_pricing_transactions(*, client_id: str | None = None):
    qs = (
        Transaction.objects.filter(type="transfert", status__in=["valide", "cloture"])
        .exclude(transfer_to__isnull=True)
        .exclude(transfer_to="solde")
        .select_related("product", "client")
    )
    if client_id:
        qs = qs.filter(client_id=client_id)
    for txn in qs.iterator():
        if is_live_pricing_active(txn):
            yield txn
