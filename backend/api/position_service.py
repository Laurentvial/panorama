from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

import pytz
from django.db import transaction as db_transaction
from django.utils import timezone
from django.db.models import Q, Sum

from .models import Product, Transaction, Position, ProductAssetAllocation, Log, Asset
from django.db.models import Q, Sum


@dataclass(frozen=True)
class InvestmentContext:
    client_id: str
    product_id: str
    transaction_id: str
    start_date: date
    duration_months: int
    invested_amount: Decimal
    total_expected_profit: Decimal | None
    total_expected_amount: Decimal | None


_DURATION_RE = re.compile(r"(\d+)")
COMPLETED_TRANSACTION_STATUSES = ("valide",)


def _add_months(d: date, months: int) -> date:
    # Keep it simple: normalize to 1st of month then add months.
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    return date(year, month, 1)


def _add_months_dt(dt: datetime, months: float | int) -> datetime:
    # Add months while keeping day-of-month when possible.
    # If months is a fraction (< 1), convert to days instead
    if isinstance(months, float) and months < 1.0:
        # Convert fraction of month to days (approximate: 30 days per month)
        # Use round() instead of int() to properly handle fractional months
        # Ensure at least 1 day for very small fractions (e.g., daily periods)
        days = max(1, round(months * 30))
        return dt + timedelta(days=days)
    
    months_int = int(months)
    year = dt.year + (dt.month - 1 + months_int) // 12
    month = (dt.month - 1 + months_int) % 12 + 1
    # Clamp day to last day of target month
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, last_day)
    return dt.replace(year=year, month=month, day=day)


def _period_months_from_profitability_period(period: str | None) -> float:
    """
    Convert profitability period string to number of months.
    Returns float to support daily (0.033) and weekly (0.25) periods.
    """
    if not period:
        return 1.0
    p = str(period).strip().lower()
    # End of contract / maturity (caller should replace with full duration months)
    if 'fin' in p and ('contrat' in p or 'matur' in p):
        return 0.0
    # Daily period: ~1/30 of a month
    if 'quotid' in p or p in {'daily', 'jour', 'journee'}:
        return 1.0 / 30.0  # Approximately 0.033 months
    # Weekly period: ~1/4 of a month
    if 'hebdo' in p or 'semaine' in p or p in {'weekly', 'week'}:
        return 1.0 / 4.0  # Approximately 0.25 months
    if 'mens' in p or p in {'month', 'mois'}:
        return 1.0
    if 'trim' in p or p in {'quarter', 'trimestre'}:
        return 3.0
    if 'sem' in p or p in {'semester', 'semestre'}:
        return 6.0
    if 'ann' in p or p in {'year', 'année', 'an'}:
        return 12.0
    # Fallback: try to parse number
    m = _DURATION_RE.search(p)
    if m:
        try:
            v = int(m.group(1))
            return float(v) if v > 0 else 1.0
        except Exception:
            return 1.0
    return 1.0


def _is_smart_portfolio(product: Product) -> bool:
    t = (product.type or '').lower()
    s = (product.subcategory or '').lower()
    return 'smart portfolio' in t or 'smartportfolio' in t or 'smart portfolio' in s or 'smartportfolio' in s


def _parse_decimal(value) -> Decimal | None:
    return _to_decimal(value)


def _weighted_choice(items_with_weights: list[tuple[object, Decimal]]):
    # items_with_weights: [(item, weight)]
    weights = [float(w if w is not None else Decimal('0')) for _, w in items_with_weights]
    total = sum(weights)
    if total <= 0:
        return random.choice([i for i, _ in items_with_weights])
    r = random.random() * total
    upto = 0.0
    for item, w in items_with_weights:
        upto += float(w)
        if upto >= r:
            return item
    return items_with_weights[-1][0]


def _split_amount_random(total: Decimal, n: int, *, alpha: float = 0.6) -> list[Decimal]:
    """
    Split `total` into `n` positive parts (>= 0.01), randomized, summing to total (0.01 precision).
    If total is too small, reduces n accordingly.
    """
    total = (total or Decimal('0')).quantize(Decimal('0.01'))
    if total <= 0 or n <= 0:
        return []

    max_parts = int((total * 100).to_integral_value())
    if max_parts <= 0:
        return []
    n = min(n, max_parts)  # each needs at least 0.01
    if n == 1:
        return [total]

    # Random weights (Dirichlet-like using Gamma; alpha<1 => spikier, bigger trades possible)
    # Avoid alpha <= 0 which would error.
    a = alpha if alpha and alpha > 0 else 0.6
    weights = [random.gammavariate(a, 1.0) for _ in range(n)]
    s = sum(weights) or 1.0
    parts = [Decimal(str(w / s)) * total for w in weights]
    parts = [p.quantize(Decimal('0.01')) for p in parts]

    # Ensure minimum 0.01 by borrowing from the largest part
    for i in range(n):
        if parts[i] < Decimal('0.01'):
            diff = Decimal('0.01') - parts[i]
            j = max(range(n), key=lambda k: parts[k])
            if j != i and parts[j] - diff >= Decimal('0.01'):
                parts[j] = (parts[j] - diff).quantize(Decimal('0.01'))
                parts[i] = Decimal('0.01')

    # Fix rounding drift
    drift = total - sum(parts)
    parts[-1] = (parts[-1] + drift).quantize(Decimal('0.01'))

    # Avoid identical amounts when possible (small tweak, doesn't change sum)
    if n >= 2:
        seen = {}
        for idx, p in enumerate(parts):
            seen.setdefault(p, []).append(idx)
        for value, idxs in list(seen.items()):
            if len(idxs) > 1:
                # Try to shift 0.01 from one duplicate to another non-duplicate
                for dup_i in idxs[1:]:
                    donor = max(range(n), key=lambda k: parts[k])
                    if donor != dup_i and parts[donor] - Decimal('0.01') >= Decimal('0.01'):
                        parts[donor] = (parts[donor] - Decimal('0.01')).quantize(Decimal('0.01'))
                        parts[dup_i] = (parts[dup_i] + Decimal('0.01')).quantize(Decimal('0.01'))
                        break

    return parts


def _pick_pnl_cap_pct() -> Decimal:
    """
    Cap percent for P&L relative to position amount.
    Typical: ±30%, rare: higher.
    """
    r = random.random()
    if r < 0.01:
        return Decimal('0.80')  # very rare spike
    if r < 0.03:
        return Decimal('0.60')  # rare spike
    return Decimal('0.30')  # default


def _distribute_pnl_total(target_total: Decimal, amounts: list[Decimal]) -> list[Decimal]:
    """
    Distribute a total P&L across positions, roughly proportional to amounts,
    with a mix of wins/losses, summing to target_total (0.01 precision).
    """
    n = len(amounts)
    if n == 0:
        return []
    if n == 1:
        return [target_total.quantize(Decimal('0.01'))]

    # base weights: amount * random factor
    factors = [random.random() for _ in range(n)]
    base = [abs(a) * Decimal(str(f)) for a, f in zip(amounts, factors)]
    base_sum = sum(base) or Decimal('1')

    # signs: more often wins
    signs = [1 if random.random() < 0.65 else -1 for _ in range(n)]
    if target_total >= 0 and all(s < 0 for s in signs):
        signs[random.randrange(n)] = 1
    if target_total < 0 and all(s > 0 for s in signs):
        signs[random.randrange(n)] = -1

    parts = [(b / base_sum) * target_total for b in base]
    parts = [(p.copy_sign(Decimal(sign))).quantize(Decimal('0.01')) for p, sign in zip(parts, signs)]
    drift = target_total.quantize(Decimal('0.01')) - sum(parts)
    parts[-1] = (parts[-1] + drift).quantize(Decimal('0.01'))
    return parts


def _distribute_pnl_total_capped(target_total: Decimal, amounts: list[Decimal], *, avoid_losses: bool = False) -> list[Decimal]:
    """
    Distribute total P&L across positions, but cap each position's P&L
    to keep it "logical" relative to its amount.
    
    If avoid_losses=True, all positions will have profit_loss >= 0 (no losses).
    """
    n = len(amounts)
    if n == 0:
        return []
    target_total = target_total.quantize(Decimal('0.01'))
    
    # If avoid_losses is True and target_total is negative, we can't avoid losses
    # In this case, we'll set all positions to 0 (no profit, no loss)
    if avoid_losses and target_total < 0:
        return [Decimal('0.00')] * n
    
    if n == 1:
        cap = (amounts[0] * _pick_pnl_cap_pct()).quantize(Decimal('0.01'))
        v = max(-cap, min(cap, target_total))
        if avoid_losses:
            v = max(Decimal('0'), v)
        return [v]

    # Start with an unconstrained distribution
    parts = _distribute_pnl_total(target_total, amounts)

    # Apply per-position caps
    caps = [(a * _pick_pnl_cap_pct()).quantize(Decimal('0.01')) for a in amounts]
    parts = [max(-caps[i], min(caps[i], parts[i])).quantize(Decimal('0.01')) for i in range(n)]
    
    # If avoid_losses is True, ensure all parts are >= 0
    if avoid_losses:
        parts = [max(Decimal('0'), p).quantize(Decimal('0.01')) for p in parts]

    # Adjust drift while respecting caps
    drift = (target_total - sum(parts)).quantize(Decimal('0.01'))
    step = Decimal('0.01')
    guard = 0
    while drift != 0 and guard < 20000:
        guard += 1
        direction = 1 if drift > 0 else -1

        # Find candidates with slack in drift direction
        candidates = []
        for i in range(n):
            if direction > 0:
                slack = caps[i] - parts[i]
            else:
                # If avoid_losses is True, we can't go below 0
                if avoid_losses:
                    slack = parts[i]  # Can only reduce to 0
                else:
                    slack = parts[i] + caps[i]
            if slack >= step:
                candidates.append((i, slack))

        if not candidates:
            break  # can't fit perfectly, return best effort

        # Prefer adjusting bigger trades (more slack)
        candidates.sort(key=lambda x: float(x[1]), reverse=True)
        i, slack = candidates[0]
        delta = min(abs(drift), slack).quantize(Decimal('0.01'))
        if delta < step:
            break
        parts[i] = (parts[i] + (delta if direction > 0 else -delta)).quantize(Decimal('0.01'))
        # Ensure we don't go below 0 if avoid_losses is True
        if avoid_losses:
            parts[i] = max(Decimal('0'), parts[i])
        drift = (target_total - sum(parts)).quantize(Decimal('0.01'))

    return parts


def _choose_trade_count(total_amount: Decimal, days: int, window_minutes: int) -> int:
    """
    Choose a more realistic number of trades:
    - bigger total amount -> fewer trades with bigger sizes
    - keep within the time window (min 5 minutes/trade)
    """
    total_amount = (total_amount or Decimal('0')).quantize(Decimal('0.01'))
    if total_amount <= 0:
        return 0

    # Target average trade size: 8%..18% of total, but at least 2k
    avg_pct = Decimal(str(random.uniform(0.08, 0.18)))
    avg_target = max(Decimal('2000.00'), (total_amount * avg_pct).quantize(Decimal('0.01')))
    base = int((total_amount / avg_target).to_integral_value(rounding='ROUND_FLOOR')) or 1

    # Slight randomness around base
    low = max(1, int(base * 0.7))
    high = max(low, int(base * 1.5))

    # Also keep some relation to days (not too many per day)
    high = min(high, max(3, days * 2))  # up to 2 trades/day

    # Cap by minimum duration
    min_minutes = 5
    high = min(high, max(1, window_minutes // min_minutes))

    return random.randint(low, high)


def _choose_trade_count_for_duration(total_amount: Decimal, duration_months: int) -> int:
    """
    Choose a total number of trade-like positions across an investment duration.

    We want:
    - A *non-trivial* number of trades even for small tickets (e.g. 2k)
    - More trades for longer durations
    - Still bounded to avoid huge DB writes
    """
    total_amount = (total_amount or Decimal("0")).quantize(Decimal("0.01"))
    months = int(duration_months or 0) if duration_months else 0
    if total_amount <= 0 or months <= 0:
        return 0

    # Rough heuristic: trades per month based on ticket size.
    if total_amount < Decimal("5000"):
        tpm_low, tpm_high = 2, 5
    elif total_amount < Decimal("20000"):
        tpm_low, tpm_high = 4, 10
    else:
        tpm_low, tpm_high = 6, 14

    trades_per_month = random.randint(tpm_low, tpm_high)
    desired_total = trades_per_month * months
    return max(1, min(250, desired_total))


def _trading_days_between(start_dt: datetime, end_dt: datetime) -> list[date]:
    """Return Mon-Fri dates between start_dt and end_dt (inclusive)."""
    start_day = start_dt.date()
    end_day = end_dt.date()
    days_list: list[date] = []
    d = start_day
    while d <= end_day:
        if d.weekday() < 5:
            days_list.append(d)
        d += timedelta(days=1)
    return days_list


def _existing_trade_counts(txn_id: str) -> tuple[dict[date, int], int]:
    """
    Return (count_by_day, max_period_index) for existing positions of a transaction.
    """
    counts: dict[date, int] = {}
    max_idx = -1
    qs = Position.objects.filter(transaction_id=txn_id).only("period_date", "period_index")
    for p in qs.iterator():
        if p.period_date:
            counts[p.period_date] = counts.get(p.period_date, 0) + 1
        if p.period_index is not None:
            try:
                max_idx = max(max_idx, int(p.period_index))
            except Exception:
                pass
    return counts, max_idx


def _choose_total_trades_with_min_per_day(
    *,
    total_amount: Decimal,
    duration_months: int,
    trading_days_count: int,
    max_per_day: int = 3,
    override_trades_per_month_min: int | None = None,
    override_trades_per_month_max: int | None = None,
    rng: random.Random | None = None,
) -> int:
    """
    Choose a total number of trades across the duration.
    - No guarantee of 1 trade per day (allows days with 0 trades)
    - At most max_per_day per day
    
    Args:
        override_trades_per_month_min: Optional override for minimum trades per month
        override_trades_per_month_max: Optional override for maximum trades per month
        rng: Random number generator for deterministic selection (required if override is provided)
    """
    if trading_days_count <= 0:
        return 0
    
    # Calculate maximum theoretical trades per month based on trading days
    # Approximate: trading_days_count / duration_months gives average days per month
    # Max trades per month = (days_per_month) * max_per_day
    # Use ceiling to be conservative (round up)
    if duration_months > 0:
        avg_days_per_month = trading_days_count / duration_months
        max_theoretical_per_month = int((avg_days_per_month * max_per_day) + 0.5)  # Round to nearest
    else:
        avg_days_per_month = 0.0  # Initialize to avoid NameError in error message
        max_theoretical_per_month = 0
    
    # Use override if provided
    if override_trades_per_month_min is not None and override_trades_per_month_max is not None:
        # Validate override range
        if override_trades_per_month_min < 0 or override_trades_per_month_max < override_trades_per_month_min:
            # Invalid override, fall back to default behavior
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Invalid override range: min={override_trades_per_month_min}, max={override_trades_per_month_max}. "
                f"Falling back to default calculation."
            )
            # Explicitly continue to default behavior below (no return here)
        elif override_trades_per_month_min > max_theoretical_per_month:
            # Even minimum exceeds theoretical maximum - raise error
            # Build error message safely (handle case where duration_months <= 0)
            if duration_months > 0:
                error_msg = (
                    f"La fourchette demandée ({override_trades_per_month_min}-{override_trades_per_month_max} positions/mois) "
                    f"est trop élevée. Le maximum théorique pour cette durée est d'environ {max_theoretical_per_month} positions/mois "
                    f"(environ {avg_days_per_month:.1f} jours de bourse/mois × {max_per_day} max/jour)."
                )
            else:
                error_msg = (
                    f"La fourchette demandée ({override_trades_per_month_min}-{override_trades_per_month_max} positions/mois) "
                    f"est trop élevée. La durée de l'investissement est invalide (durée <= 0 mois)."
                )
            raise ValueError(error_msg)
        else:
            # Valid override: pick a deterministic value in the range
            if rng is None:
                # Fallback to default RNG if not provided
                rng = random.Random()
            trades_per_month = rng.randint(override_trades_per_month_min, override_trades_per_month_max)
            desired_total = trades_per_month * duration_months
            # Still apply caps
            total = min(desired_total, trading_days_count * max_per_day)
            total = min(total, 5000)
            return total
    
    # Default behavior: use heuristic based on amount
    # (This is also reached when override is invalid or not provided)
    base = _choose_trade_count_for_duration(total_amount, duration_months)
    # Don't force minimum of trading_days_count - allows fewer trades than days
    total = base
    total = min(total, trading_days_count * max_per_day)
    # Safety cap (still allows long durations)
    total = min(total, 5000)
    return total


def _build_day_targets(trading_days: list[date], total_trades: int, *, max_per_day: int, rng: random.Random) -> dict[date, int]:
    """
    Build per-day trade targets such that each day has >=0 and <= max_per_day.
    Avoids having exactly 1 trade per day every day - allows some days with 0 trades.
    """
    if not trading_days:
        return {}
    total_trades = min(total_trades, len(trading_days) * max_per_day)

    # Start with all days at 0 (no guarantee of 1 trade per day)
    targets: dict[date, int] = {d: 0 for d in trading_days}
    
    # Distribute trades randomly across days, capped per day.
    # This allows some days to have 0 trades, avoiding the pattern of exactly 1 trade per day.
    candidates = list(trading_days)
    remaining = total_trades
    while remaining > 0 and candidates:
        day = rng.choice(candidates)
        if targets[day] < max_per_day:
            targets[day] += 1
            remaining -= 1
        else:
            candidates = [d for d in candidates if targets[d] < max_per_day]
    return targets


def _get_market_hours_for_asset(asset: Asset | None, *, reference_date: date | None = None) -> tuple[time, time]:
    """
    Determine market hours for an asset in French time (Europe/Paris).
    
    Returns (market_open_time, market_close_time) in French timezone.
    
    Rules:
    - NASDAQ/NYSE/US markets: 9:30 - 16:00 ET, converted to French time based on reference_date
    - EURONEXT/European markets: 9:00 - 17:30 French time (local)
    - Crypto: 24/7 (but we'll use default hours for consistency)
    - Default: 9:30 - 16:00 French time
    
    The base timezone is France (Europe/Paris), and times are returned in that timezone.
    The reference_date is used to correctly handle daylight saving time transitions for US markets.
    """
    if asset is None:
        # Default market hours (French time)
        return time(9, 30), time(16, 0)
    
    exchange = (asset.exchange or '').upper()
    region = (asset.region or '').lower()
    asset_type = (asset.type or '').lower()
    
    # Crypto markets are 24/7, but we'll use default hours for consistency
    if 'crypto' in asset_type or 'cryptocurrency' in asset_type:
        return time(9, 30), time(16, 0)
    
    # US markets (NASDAQ, NYSE, etc.)
    if ('NASDAQ' in exchange or 'NYSE' in exchange or 'AMEX' in exchange or 
        'NYSEARCA' in exchange or 'BATS' in exchange or
        'united' in region or region == 'us' or 'usa' in region):
        # US market hours: 9:30 - 16:00 ET
        # Convert to French time based on reference_date to handle DST correctly
        if reference_date is None:
            # If no reference date provided, use today's date
            reference_date = timezone.now().date()
        
        # US Eastern timezone (handles EST/EDT automatically)
        us_eastern = pytz.timezone('US/Eastern')
        # French timezone
        french_tz = pytz.timezone('Europe/Paris')
        
        # Create datetime objects for market open and close in US Eastern time
        # Use the reference_date to determine if DST is in effect
        us_open_dt = us_eastern.localize(datetime.combine(reference_date, time(9, 30)))
        us_close_dt = us_eastern.localize(datetime.combine(reference_date, time(16, 0)))
        
        # Convert to French time
        french_open_dt = us_open_dt.astimezone(french_tz)
        french_close_dt = us_close_dt.astimezone(french_tz)
        
        # Extract time components
        return french_open_dt.time(), french_close_dt.time()
    
    # European markets (EURONEXT, etc.)
    if ('EURONEXT' in exchange or 'france' in region or 'paris' in region or
        'belgium' in region or 'netherlands' in region or 'portugal' in region):
        # European market hours: 9:00 - 17:30 local time (French time)
        return time(9, 0), time(17, 30)
    
    # Default: standard market hours
    return time(9, 30), time(16, 0)


def _day_market_window(
    *,
    day: date,
    start_dt: datetime,
    end_dt: datetime,
    market_open: time,
    market_close: time,
    tz,
) -> tuple[datetime, datetime] | None:
    """
    Compute the tradable window for a given day, considering overall [start_dt, end_dt].
    """
    day_open = timezone.make_aware(datetime.combine(day, market_open), tz)
    day_close = timezone.make_aware(datetime.combine(day, market_close), tz)
    if day == start_dt.date() and start_dt > day_open:
        day_open = start_dt
    if day == end_dt.date() and end_dt < day_close:
        day_close = end_dt
    if day_close <= day_open:
        return None
    return day_open, day_close


def _schedule_trades_for_day(
    *,
    day_open: datetime,
    day_close: datetime,
    count: int,
    rng: random.Random,
) -> list[tuple[datetime, datetime]]:
    """
    Create sequential (non-overlapping) [opened_at, closed_at] windows within market hours.
    """
    if count <= 0:
        return []
    scheduled: list[tuple[datetime, datetime]] = []
    cursor = day_open
    for i in range(count):
        # Leave a random gap (0..45min), but ensure we can still fit at least 5 minutes.
        gap_minutes = rng.randint(0, 45)
        opened_at = cursor + timedelta(minutes=gap_minutes)
        if opened_at >= day_close - timedelta(minutes=5):
            # Force a minimal trade at the end of the window if none scheduled yet.
            if not scheduled:
                opened_at = day_close - timedelta(minutes=5)
            else:
                break
        # duration <= 1h30 (90 minutes), but must fit before market close
        duration_minutes = rng.randint(5, 90)
        closed_at = opened_at + timedelta(minutes=duration_minutes)
        if closed_at > day_close:
            closed_at = day_close
        if closed_at <= opened_at:
            continue
        scheduled.append((opened_at, closed_at))
        cursor = closed_at
    # Guarantee at least one if requested count>0
    if not scheduled and count > 0 and day_close > day_open:
        scheduled.append((day_close - timedelta(minutes=5), day_close))
    return scheduled


def _product_compounds(product: Product | None) -> bool:
    """
    Return True when the product is configured to compound profits between profitability periods.
    """
    if product is None:
        return False
    v = getattr(product, 'capitalisation_fonds', False)
    # Backward compatibility: historical DB values were 'Oui'/'Non'
    if isinstance(v, str):
        return v.strip().lower() in {'oui', 'true', '1', 'yes'}
    return bool(v)


def _choose_profitability_rate_pct(product: Product | None, *, rng: random.Random) -> Decimal:
    """
    Pick a profitability rate (percent) expressed in the unit of product.profitability_period.

    Examples:
    - profitability_period == "Quotidien"      => rate is % per day
    - profitability_period == "Hebdomadaire"   => rate is % per week
    - profitability_period == "Mensuelle"      => rate is % per month
    - profitability_period == "Trimestrielle"  => rate is % per trimester (3 months)
    - profitability_period == "Semestrielle"   => rate is % per semester (6 months)
    - profitability_period == "Annuelle"       => rate is % per year (12 months)
    - profitability_period == "Fin de contrat" => rate is % over the full contract duration

    - If variable profitability: pick within [profitability, variable_profitability]
    - Else: use profitability
    """
    if product is None:
        return Decimal('0')
    # Some products explicitly disable profitability.
    if bool(getattr(product, 'no_profitability', False)):
        return Decimal('0')

    rate_min = _parse_decimal(getattr(product, 'profitability', None)) or Decimal('0')
    if (getattr(product, 'is_variable_profitability', '') or '').lower() == 'oui':
        rate_max = _parse_decimal(getattr(product, 'variable_profitability', None))
        if rate_max is not None and rate_max > rate_min:
            return Decimal(str(rng.uniform(float(rate_min), float(rate_max))))
    return rate_min


def _weighted_choice_with_rng(items_with_weights: list[tuple[object, Decimal]], rng: random.Random):
    """Like _weighted_choice, but uses a provided RNG (no global random)."""
    weights = [float(w if w is not None else Decimal('0')) for _, w in items_with_weights]
    total = sum(weights)
    if total <= 0:
        return items_with_weights[int(rng.random() * len(items_with_weights))][0]
    r = rng.random() * total
    upto = 0.0
    for item, w in items_with_weights:
        upto += float(w)
        if upto >= r:
            return item
    return items_with_weights[-1][0]


def _new_log_id() -> str:
    log_id = uuid.uuid4().hex[:12]
    while Log.objects.filter(id=log_id).exists():
        log_id = uuid.uuid4().hex[:12]
    return log_id


def _safe_decimal_sum(values) -> Decimal:
    total = Decimal('0')
    for v in values:
        if v is None:
            continue
        try:
            total += Decimal(str(v))
        except Exception:
            continue
    return total


def _log_positions_generation(
    *,
    txn: Transaction,
    product: Product | None,
    ctx: InvestmentContext,
    trigger: str | None,
    start_dt: datetime,
    end_dt: datetime,
    created_positions: list[Position],
    period_summaries: list[dict],
    existing_count_before: int,
) -> None:
    """
    Store a structured Log entry about a positions generation run.

    We log when we create positions, or when the run is a validation-triggered run (signal),
    or when there were no positions before (first run). This keeps noise low while ensuring
    we have an audit trail for the important events.
    """
    if not created_positions and not (trigger == "signal" or int(existing_count_before or 0) == 0):
        return

    try:
        from django.db.models import Count, Max, Min, Sum  # local import to avoid global dependency

        created_profit = _safe_decimal_sum([p.profit_loss for p in created_positions]).quantize(Decimal("0.01"))
        created_invested = _safe_decimal_sum([p.invested_amount for p in created_positions]).quantize(Decimal("0.01"))

        # Totals after generation
        totals = Position.objects.filter(transaction_id=txn.id).aggregate(
            count=Count("id"),
            profit=Sum("profit_loss"),
            invested=Sum("invested_amount"),
        )
        all_count = int(totals.get("count") or 0)
        all_profit = (Decimal(str(totals.get("profit") or "0"))).quantize(Decimal("0.01"))
        all_invested = (Decimal(str(totals.get("invested") or "0"))).quantize(Decimal("0.01"))

        # Period/date range for created positions
        if created_positions:
            created_dates_agg = Position.objects.filter(id__in=[p.id for p in created_positions]).aggregate(
                min_date=Min("period_date"),
                max_date=Max("period_date"),
            )
            min_date = created_dates_agg.get("min_date")
            max_date = created_dates_agg.get("max_date")
        else:
            min_date = None
            max_date = None

        details = {
            "transactionId": txn.id,
            "clientId": getattr(txn, "client_id", None),
            "productId": ctx.product_id,
            "productName": getattr(product, "name", None) if product else None,
            "trigger": trigger,
            "status": getattr(txn, "status", None),
            "validatedAt": getattr(txn, "validated_at", None).isoformat() if getattr(txn, "validated_at", None) else None,
            "startDt": start_dt.isoformat() if start_dt else None,
            "endDt": end_dt.isoformat() if end_dt else None,
            "durationMonths": ctx.duration_months,
            "profitabilityPeriod": getattr(product, "profitability_period", None) if product else None,
            "capitalisationFonds": bool(getattr(product, "capitalisation_fonds", False)) if product is not None else False,
            "existingPositionsBefore": int(existing_count_before or 0),
            "createdPositions": int(len(created_positions)),
            "createdInvestedTotal": str(created_invested),
            "createdProfitTotal": str(created_profit),
            "createdPeriodDateMin": min_date.isoformat() if min_date else None,
            "createdPeriodDateMax": max_date.isoformat() if max_date else None,
            "positionsTotalAfter": int(all_count),
            "investedTotalAfter": str(all_invested),
            "profitTotalAfter": str(all_profit),
            "periods": period_summaries,
        }

        Log.objects.create(
            id=_new_log_id(),
            event_type="positions_generated",
            user_id=None,
            details=details,
            old_value={},
            new_value={},
        )
    except Exception:
        # Best-effort logging; never block business flow
        return


def _create_trade_positions_compounding(
    *,
    txn: Transaction,
    product: Product | None,
    ctx: InvestmentContext,
    allocations: list[ProductAssetAllocation] | None,
    trigger: str | None = None,
) -> list[Position]:
    """
    Create trade-like positions across the whole duration with:
    - Multiple trades possible per day, but not guaranteed (avoids 1 trade/day pattern)
    - Market hours only (specific to each asset's exchange/region, in French time)
    - Maximum trade duration: 1h30
    - profitability_period support (mensuel/trimestriel/semestriel/annuel/fin de contrat)
    - compounding: profits credited at each profitability period boundary

    Idempotent-by-day: it checks existing Position rows for this transaction and only fills missing
    trades up to the per-day target.
    """
    tz = timezone.get_current_timezone()
    # IMPORTANT: start generating from validation time when available.
    # Transactions can be created days before being validated.
    start_dt = getattr(txn, 'validated_at', None) or txn.datetime or timezone.now()
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, tz)
    end_dt = _add_months_dt(start_dt, ctx.duration_months)

    trading_days = _trading_days_between(start_dt, end_dt)
    if not trading_days:
        return []

    invested_total = ctx.invested_amount
    if invested_total <= 0:
        return []

    max_per_day = 3
    rng = random.Random(str(txn.id))

    # Extract override from subscription_details if present
    override_min = None
    override_max = None
    subscription_details = getattr(txn, 'subscription_details', None) or {}
    if isinstance(subscription_details, dict):
        override_min_raw = subscription_details.get('positionsPerMonthMin')
        override_max_raw = subscription_details.get('positionsPerMonthMax')
        if override_min_raw is not None:
            try:
                override_min = int(override_min_raw)
            except (ValueError, TypeError):
                pass
        if override_max_raw is not None:
            try:
                override_max = int(override_max_raw)
            except (ValueError, TypeError):
                pass

    try:
        desired_total = _choose_total_trades_with_min_per_day(
            total_amount=invested_total,
            duration_months=ctx.duration_months,
            trading_days_count=len(trading_days),
            max_per_day=max_per_day,
            override_trades_per_month_min=override_min,
            override_trades_per_month_max=override_max,
            rng=rng,
        )
    except ValueError as e:
        # Re-raise as ValueError so it can be caught by the API endpoint
        raise ValueError(str(e))
    
    day_targets = _build_day_targets(trading_days, desired_total, max_per_day=max_per_day, rng=rng)

    # CRITICAL: Always use txn.id directly to ensure correct transaction linkage
    existing_count_before = Position.objects.filter(transaction_id=txn.id).count()
    existing_counts, max_idx = _existing_trade_counts(txn.id)
    next_idx = max_idx + 1

    # Profitability config (rate unit is product.profitability_period)
    pm = _period_months_from_profitability_period(getattr(product, 'profitability_period', None) if product else None)
    # For daily/weekly periods (< 1 month), use the fraction directly; otherwise use at least 1 month
    profit_period_months = ctx.duration_months if pm == 0 else (pm if pm < 1.0 else max(1.0, pm))
    does_compound = _product_compounds(product)

    assets_weighted: list[tuple[object, Decimal]] = []
    if allocations:
        assets_weighted = [
            (a.asset, (a.proportion if a.proportion is not None else Decimal('0')))
            for a in allocations
        ]

    created: list[Position] = []
    period_summaries: list[dict] = []
    capital = invested_total.quantize(Decimal('0.01'))
    remaining_months = ctx.duration_months
    cursor_dt = start_dt
    period_idx = 0

    while remaining_months > 0:
        step_months = min(float(profit_period_months), float(remaining_months))
        period_end_dt = _add_months_dt(cursor_dt, step_months)

        # Days within this profitability period
        period_days = [d for d in trading_days if d >= cursor_dt.date() and d < period_end_dt.date()]
        if not period_days:
            cursor_dt = period_end_dt
            remaining_months -= step_months
            period_idx += 1
            continue

        # Existing realized profit in this period (so reruns remain consistent)
        existing_profit = Decimal('0.00')
        for v in Position.objects.filter(
            transaction_id=ctx.transaction_id,
            period_date__gte=period_days[0],
            period_date__lte=period_days[-1],
        ).values_list('profit_loss', flat=True):
            if v is None:
                continue
            try:
                existing_profit += Decimal(str(v))
            except Exception:
                continue

        # Target profit for this period.
        # The profitability rate is configured per `profitability_period` (monthly/quarterly/etc).
        # If this period is shorter than the configured period (e.g. last half-year for annual),
        # pro-rate linearly by months.
        rate_rng = random.Random(f"{txn.id}:rate:{period_idx}")
        period_rate_pct = _choose_profitability_rate_pct(product, rng=rate_rng)
        proration = (
            (Decimal(str(step_months)) / Decimal(str(profit_period_months)))
            if profit_period_months and step_months != profit_period_months
            else Decimal('1')
        )
        effective_rate_pct = (period_rate_pct * proration).quantize(Decimal('0.0001'))

        capital_base = capital if does_compound else invested_total
        target_profit = (capital_base * effective_rate_pct / Decimal('100')).quantize(Decimal('0.01'))
        profit_remaining = (target_profit - existing_profit).quantize(Decimal('0.01'))

        # Determine missing trades for each day in this period
        trade_specs: list[tuple[date, int]] = []
        for day in period_days:
            target = day_targets.get(day, 1)
            existing = existing_counts.get(day, 0)
            missing = max(0, min(max_per_day, target) - existing)
            for slot in range(missing):
                trade_specs.append((day, slot))

        created_profit_this_period = Decimal('0.00')
        created_count_this_period = 0
        if trade_specs:
            invested_amounts: list[Decimal] = []
            for day, slot in trade_specs:
                amt_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:amt")
                pct = Decimal(str(amt_rng.uniform(0.05, 0.25)))
                amt = ((capital if does_compound else invested_total) * pct).quantize(Decimal('0.01'))
                if amt < Decimal('50.00'):
                    amt = Decimal('50.00')
                invested_amounts.append(amt)

            pnl_parts = _distribute_pnl_total_capped(profit_remaining, invested_amounts, avoid_losses=False)
            created_profit_this_period = _safe_decimal_sum(pnl_parts).quantize(Decimal('0.01'))
            created_count_this_period = len(pnl_parts)

            for (day, slot), amt, pnl in zip(trade_specs, invested_amounts, pnl_parts):
                # Determine asset first to get market-specific hours
                asset_obj = None
                if assets_weighted:
                    asset_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:asset")
                    asset_obj = _weighted_choice_with_rng(assets_weighted, asset_rng)
                
                # Get market hours for this specific asset (in French time)
                market_open, market_close = _get_market_hours_for_asset(asset_obj, reference_date=day)
                
                win = _day_market_window(
                    day=day,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    market_open=market_open,
                    market_close=market_close,
                    tz=tz,
                )
                if not win:
                    continue
                day_open, day_close = win

                time_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:time")
                windows = _schedule_trades_for_day(day_open=day_open, day_close=day_close, count=1, rng=time_rng)
                if not windows:
                    continue
                opened_at, closed_at = windows[0]

                asset_currency = None
                fx_rate = None
                invested_amount_asset_currency = None
                # Ne pas enregistrer les conversions FX pour les positions futures
                # car on ne peut pas connaître le taux de change dans le futur
                now = timezone.now()
                is_future_position = opened_at > now
                if asset_obj is not None and not is_future_position:
                    asset_currency = (getattr(asset_obj, 'currency', None) or '').strip().upper() or None
                    fx_rate = _get_fx_rate_eur_to_ccy(asset_currency or '')
                    if fx_rate is not None:
                        try:
                            invested_amount_asset_currency = (Decimal(str(amt)) * fx_rate).quantize(Decimal('0.00000001'))
                        except Exception:
                            invested_amount_asset_currency = None

                position_id = uuid.uuid4().hex[:12]
                while Position.objects.filter(id=position_id).exists():
                    position_id = uuid.uuid4().hex[:12]

                # CRITICAL: Always use txn.id for transaction_id to ensure correct linkage
                transaction_id_to_use = txn.id
                
                created.append(
                    Position.objects.create(
                        id=position_id,
                        client_id=ctx.client_id,
                        product_id=ctx.product_id,
                        transaction_id=transaction_id_to_use,  # Always use txn.id to ensure correct linkage
                        asset_id=getattr(asset_obj, 'id', asset_obj) if asset_obj is not None else None,
                        opened_at=opened_at,
                        closed_at=closed_at,
                        invested_amount=amt,
                        fx_rate_eur_to_asset=fx_rate,
                        invested_amount_asset_currency=invested_amount_asset_currency,
                        profit_loss=pnl,
                        period_index=next_idx,
                        period_date=opened_at.date(),
                        status='pending',
                    )
                )
                next_idx += 1

        # Compound (if enabled) at period boundary using realized profit (existing + newly created for this period)
        if does_compound:
            new_profit = sum(
                (p.profit_loss or Decimal('0')) for p in created
                if p.period_date and period_days[0] <= p.period_date <= period_days[-1]
            )
            capital = (capital + existing_profit + new_profit).quantize(Decimal('0.01'))

        period_summaries.append(
            {
                "periodIndex": int(period_idx),
                "months": int(step_months),
                "startDate": period_days[0].isoformat() if period_days else None,
                "endDate": period_days[-1].isoformat() if period_days else None,
                "ratePct": str(effective_rate_pct),
                "capitalBase": str(capital_base.quantize(Decimal("0.01"))),
                "targetProfit": str(target_profit),
                "existingProfit": str(existing_profit.quantize(Decimal("0.01"))),
                "createdProfit": str(created_profit_this_period),
                "createdCount": int(created_count_this_period),
            }
        )

        cursor_dt = period_end_dt
        remaining_months -= step_months
        period_idx += 1

    _log_positions_generation(
        txn=txn,
        product=product,
        ctx=ctx,
        trigger=trigger,
        start_dt=start_dt,
        end_dt=end_dt,
        created_positions=created,
        period_summaries=period_summaries,
        existing_count_before=existing_count_before,
    )

    return created


def generate_rates_for_investment(
    txn: Transaction,
    *,
    custom_rates: dict[int, Decimal] | None = None,
) -> list[dict]:
    """
    Generate profitability rates for each period without creating positions.
    Returns a list of period summaries with rates that can be edited.
    
    custom_rates: Optional dict mapping period_index to custom rate percentage
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"build_investment_context returned None for transaction {txn.id}")
        return []

    product: Product | None = txn.product
    if product is None:
        try:
            product = Product.objects.get(id=ctx.product_id)
        except Product.DoesNotExist:
            product = None

    # Check if product has asset allocations (for both Smart Portfolios and regular products)
    has_allocations = False
    if product is not None:
        has_allocations = ProductAssetAllocation.objects.filter(product_id=product.id).exists()

    start_dt = txn.datetime or timezone.now()
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
    end_dt = _add_months_dt(start_dt, ctx.duration_months)

    trading_days = _trading_days_between(start_dt, end_dt)
    if not trading_days:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"No trading days found for transaction {txn.id}: start_dt={start_dt}, end_dt={end_dt}, duration_months={ctx.duration_months}")
        return []

    invested_total = ctx.invested_amount
    if invested_total <= 0:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"invested_amount is {invested_total} for transaction {txn.id}. Cannot generate rates.")
        return []
    
    # Debug logging
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Generating rates for transaction {txn.id}: invested_amount={invested_total}, duration_months={ctx.duration_months}, trading_days={len(trading_days)}")

    pm = _period_months_from_profitability_period(getattr(product, 'profitability_period', None) if product else None)
    # For daily/weekly periods (< 1 month), use the fraction directly; otherwise use at least 1 month
    profit_period_months = ctx.duration_months if pm == 0 else (pm if pm < 1.0 else max(1.0, pm))
    does_compound = _product_compounds(product)

    # Calculate initial capital: if compounding, add profits from all closed and open positions
    # IMPORTANT: Exclude ALL pending positions (even those with opened_at <= now) because they will
    # be regenerated with new rates. Only count positions that are already closed (done) or currently
    # open - these cannot be changed. This must match the logic in the per-period profit calculation.
    capital = invested_total.quantize(Decimal('0.01'))
    if does_compound:
        existing_profits = Position.objects.filter(
            transaction_id=ctx.transaction_id
        ).filter(
            # Only count positions that are already closed (done) or currently open
            # Exclude ALL pending positions - they will be regenerated with new rates
            Q(status='done') | 
            Q(status='open')
        ).aggregate(
            total_profit=Sum('profit_loss')
        )['total_profit'] or Decimal('0')
        capital = (capital + existing_profits).quantize(Decimal('0.01'))

    period_summaries: list[dict] = []
    remaining_months = ctx.duration_months
    cursor_dt = start_dt
    period_idx = 0

    while remaining_months > 0:
        step_months = min(float(profit_period_months), float(remaining_months))
        period_end_dt = _add_months_dt(cursor_dt, step_months)

        period_days = [d for d in trading_days if d >= cursor_dt.date() and d < period_end_dt.date()]
        if not period_days:
            cursor_dt = period_end_dt
            remaining_months -= step_months
            period_idx += 1
            continue

        # Calculate existing profit from CLOSED and OPEN positions only
        # IMPORTANT: When using custom rates, exclude ALL pending positions (even those with opened_at <= now)
        # because they were generated with old rates and will be regenerated with new rates.
        # Only count positions that are already closed (done) or currently open - these cannot be changed.
        now = timezone.now()
        existing_profit = Decimal('0.00')
        existing_positions = Position.objects.filter(
            transaction_id=ctx.transaction_id,
            period_date__gte=period_days[0],
            period_date__lte=period_days[-1],
        ).filter(
            # Only count positions that are already closed (done) or currently open
            # Exclude ALL pending positions - they will be regenerated with new rates
            Q(status='done') | 
            Q(status='open')
        )
        for pos in existing_positions:
            if pos.profit_loss is not None:
                try:
                    existing_profit += Decimal(str(pos.profit_loss))
                except Exception:
                    continue

        # Use custom rate if provided, otherwise generate
        if custom_rates and period_idx in custom_rates:
            period_rate_pct = custom_rates[period_idx]
        else:
            rate_rng = random.Random(f"{txn.id}:rate:{period_idx}")
            period_rate_pct = _choose_profitability_rate_pct(product, rng=rate_rng)

        proration = (
            (Decimal(str(step_months)) / Decimal(str(profit_period_months)))
            if profit_period_months and step_months != profit_period_months
            else Decimal('1')
        )
        effective_rate_pct = (period_rate_pct * proration).quantize(Decimal('0.0001'))

        capital_base = capital if does_compound else invested_total
        target_profit = (capital_base * effective_rate_pct / Decimal('100')).quantize(Decimal('0.01'))

        period_summaries.append({
            "periodIndex": int(period_idx),
            "months": int(step_months),
            "startDate": period_days[0].isoformat() if period_days else None,
            "endDate": period_days[-1].isoformat() if period_days else None,
            "ratePct": str(effective_rate_pct),
            "baseRatePct": str(period_rate_pct),  # Base rate before proration
            "capitalBase": str(capital_base.quantize(Decimal("0.01"))),
            "targetProfit": str(target_profit),
        })

        cursor_dt = period_end_dt
        remaining_months -= step_months
        period_idx += 1

    return period_summaries


def generate_positions_with_rates(
    txn: Transaction,
    *,
    custom_rates: dict[int, Decimal],
    save_to_db: bool = False,
    avoid_losses: bool = False,
) -> list[Position | dict]:
    """
    Generate positions using custom rates without saving to database (unless save_to_db=True).
    
    custom_rates: Dict mapping period_index to rate percentage (before proration)
    avoid_losses: If True, only generate positions with profit_loss >= 0 (no losses)
    Returns list of Position objects (if saved) or dict representations (if not saved)
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        return []

    product: Product | None = txn.product
    if product is None:
        try:
            product = Product.objects.get(id=ctx.product_id)
        except Product.DoesNotExist:
            product = None

    # Always fetch asset allocations if they exist (not just for Smart Portfolios)
    allocations = None
    if product is not None:
        allocations_list = list(
            ProductAssetAllocation.objects.select_related('asset')
            .filter(product_id=product.id)
        )
        if allocations_list:
            allocations = allocations_list

    start_dt = txn.datetime or timezone.now()
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
    end_dt = _add_months_dt(start_dt, ctx.duration_months)

    trading_days = _trading_days_between(start_dt, end_dt)
    if not trading_days:
        return []

    invested_total = ctx.invested_amount
    # IMPORTANT: If invested_amount is 0 or negative, don't generate any positions
    # This can happen for withdrawals where all capital has been withdrawn
    if invested_total <= 0:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Skipping position generation for transaction {txn.id}: invested_amount={invested_total} (zero or negative capital)")
        return []

    # IMPORTANT: When generating with custom rates, we should exclude future positions
    # from existing_profit calculation, because they will be regenerated with new rates.
    # Only count CLOSED and currently OPEN positions (not future pending positions).
    now = timezone.now()

    max_per_day = 3
    rng = random.Random(str(txn.id))

    # Extract override from subscription_details if present
    override_min = None
    override_max = None
    subscription_details = getattr(txn, 'subscription_details', None) or {}
    if isinstance(subscription_details, dict):
        override_min_raw = subscription_details.get('positionsPerMonthMin')
        override_max_raw = subscription_details.get('positionsPerMonthMax')
        if override_min_raw is not None:
            try:
                override_min = int(override_min_raw)
            except (ValueError, TypeError):
                pass
        if override_max_raw is not None:
            try:
                override_max = int(override_max_raw)
            except (ValueError, TypeError):
                pass

    try:
        desired_total = _choose_total_trades_with_min_per_day(
            total_amount=invested_total,
            duration_months=ctx.duration_months,
            trading_days_count=len(trading_days),
            max_per_day=max_per_day,
            override_trades_per_month_min=override_min,
            override_trades_per_month_max=override_max,
            rng=rng,
        )
    except ValueError as e:
        # Re-raise as ValueError so it can be caught by the API endpoint
        raise ValueError(str(e))
    
    day_targets = _build_day_targets(trading_days, desired_total, max_per_day=max_per_day, rng=rng)

    existing_count_before = Position.objects.filter(transaction_id=ctx.transaction_id).count() if save_to_db else 0
    existing_counts, max_idx = _existing_trade_counts(ctx.transaction_id) if save_to_db else ({}, 0)
    next_idx = max_idx + 1

    pm = _period_months_from_profitability_period(getattr(product, 'profitability_period', None) if product else None)
    # For daily/weekly periods (< 1 month), use the fraction directly; otherwise use at least 1 month
    profit_period_months = ctx.duration_months if pm == 0 else (pm if pm < 1.0 else max(1.0, pm))
    does_compound = _product_compounds(product)

    # Market hours will be determined per asset in the loop
    tz = timezone.get_current_timezone()

    assets_weighted: list[tuple[object, Decimal]] = []
    if allocations:
        assets_weighted = [
            (a.asset, (a.proportion if a.proportion is not None else Decimal('0')))
            for a in allocations
            if a.asset is not None  # Ensure asset exists
        ]
        # Debug: log if allocations exist but assets_weighted is empty
        if allocations and not assets_weighted:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Product {product.id if product else 'unknown'} has {len(allocations)} allocations but no valid assets")

    # Calculate initial capital: if compounding, add profits from all closed and open positions
    # IMPORTANT: Exclude ALL pending positions (even those with opened_at <= now) because they will
    # be regenerated with new rates. Only count positions that are already closed (done) or currently
    # open - these cannot be changed. This must match the logic in the per-period profit calculation.
    capital = invested_total.quantize(Decimal('0.01'))
    if does_compound:
        existing_profits = Position.objects.filter(
            transaction_id=ctx.transaction_id
        ).filter(
            # Only count positions that are already closed (done) or currently open
            # Exclude ALL pending positions - they will be regenerated with new rates
            Q(status='done') | 
            Q(status='open')
        ).aggregate(
            total_profit=Sum('profit_loss')
        )['total_profit'] or Decimal('0')
        capital = (capital + existing_profits).quantize(Decimal('0.01'))

    created: list[Position | dict] = []
    remaining_months = ctx.duration_months
    cursor_dt = start_dt
    period_idx = 0

    while remaining_months > 0:
        step_months = min(float(profit_period_months), float(remaining_months))
        period_end_dt = _add_months_dt(cursor_dt, step_months)

        period_days = [d for d in trading_days if d >= cursor_dt.date() and d < period_end_dt.date()]
        if not period_days:
            cursor_dt = period_end_dt
            remaining_months -= step_months
            period_idx += 1
            continue

        # Calculate existing profit from CLOSED and OPEN positions only
        # IMPORTANT: Exclude future pending positions (opened_at > now) because they will be
        # regenerated with the new custom rates. We only want to preserve profit from positions
        # that are already closed or currently open.
        now = timezone.now()
        existing_profit = Decimal('0.00')
        existing_positions = Position.objects.filter(
            transaction_id=ctx.transaction_id,
            period_date__gte=period_days[0],
            period_date__lte=period_days[-1],
        ).filter(
            # Only count positions that are already closed (done) or currently open
            # Exclude future positions (pending with opened_at > now) - they will be regenerated
            Q(status='done') | 
            Q(status='open')
        )
        for pos in existing_positions:
            if pos.profit_loss is not None:
                try:
                    existing_profit += Decimal(str(pos.profit_loss))
                except Exception:
                    continue

        # Use custom rate - must be provided
        import logging
        logger = logging.getLogger(__name__)
        
        if period_idx not in custom_rates:
            # This should not happen if frontend sends all rates, but log for debugging
            logger.warning(f"Missing rate for period {period_idx} in custom_rates. Available periods: {list(custom_rates.keys())}")
            # Fallback: use 0 (should not happen in normal flow)
            period_rate_pct = Decimal('0')
        else:
            period_rate_pct = custom_rates[period_idx]
            # Debug: log which rate is being used
            logger.info(f"Period {period_idx}: Using custom rate {period_rate_pct}% (received from frontend)")
        
        proration = (
            (Decimal(str(step_months)) / Decimal(str(profit_period_months)))
            if profit_period_months and step_months != profit_period_months
            else Decimal('1')
        )
        effective_rate_pct = (period_rate_pct * proration).quantize(Decimal('0.0001'))

        capital_base = capital if does_compound else invested_total
        target_profit = (capital_base * effective_rate_pct / Decimal('100')).quantize(Decimal('0.01'))
        profit_remaining = (target_profit - existing_profit).quantize(Decimal('0.01'))
        
        # Debug logging
        logger.info(f"Period {period_idx}: capital_base={capital_base}, effective_rate={effective_rate_pct}%, target_profit={target_profit}, existing_profit={existing_profit}, profit_remaining={profit_remaining}")

        # Count CLOSED and OPEN positions for existing counts
        # IMPORTANT: When using custom rates, exclude ALL pending positions because they will be regenerated
        # Only count positions that are already closed (done) or currently open
        now = timezone.now()
        existing_counts_by_day = {}
        if save_to_db:
            existing_positions_by_day = Position.objects.filter(
                transaction_id=ctx.transaction_id,
                period_date__gte=period_days[0],
                period_date__lte=period_days[-1],
            ).filter(
                # Only count positions that are already closed (done) or currently open
                # Exclude ALL pending positions - they will be regenerated with new rates
                Q(status='done') | 
                Q(status='open')
            ).values_list('period_date', flat=True)
            for day in period_days:
                existing_counts_by_day[day] = sum(1 for pd in existing_positions_by_day if pd == day)
        else:
            existing_counts_by_day = {}

        trade_specs: list[tuple[date, int]] = []
        for day in period_days:
            target = day_targets.get(day, 1)
            existing = existing_counts_by_day.get(day, 0)
            missing = max(0, min(max_per_day, target) - existing)
            for slot in range(missing):
                trade_specs.append((day, slot))

        if trade_specs:
            invested_amounts: list[Decimal] = []
            for day, slot in trade_specs:
                amt_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:amt")
                pct = Decimal(str(amt_rng.uniform(0.05, 0.25)))
                amt = ((capital if does_compound else invested_total) * pct).quantize(Decimal('0.01'))
                if amt < Decimal('50.00'):
                    amt = Decimal('50.00')
                invested_amounts.append(amt)

            pnl_parts = _distribute_pnl_total_capped(profit_remaining, invested_amounts, avoid_losses=avoid_losses)

            for (day, slot), amt, pnl in zip(trade_specs, invested_amounts, pnl_parts):
                # Determine asset first to get market-specific hours
                asset_obj = None
                if assets_weighted:
                    asset_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:asset")
                    asset_obj = _weighted_choice_with_rng(assets_weighted, asset_rng)
                    # Ensure asset_obj is an Asset object, not None
                    if asset_obj is None and assets_weighted:
                        # Fallback: use first asset if weighted choice fails
                        asset_obj = assets_weighted[0][0]
                
                # Get market hours for this specific asset (in French time)
                market_open, market_close = _get_market_hours_for_asset(asset_obj, reference_date=day)
                
                win = _day_market_window(
                    day=day,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    market_open=market_open,
                    market_close=market_close,
                    tz=tz,
                )
                if not win:
                    continue
                day_open, day_close = win

                time_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:time")
                windows = _schedule_trades_for_day(day_open=day_open, day_close=day_close, count=1, rng=time_rng)
                if not windows:
                    continue
                opened_at, closed_at = windows[0]

                asset_currency = None
                fx_rate = None
                invested_amount_asset_currency = None
                # Ne pas enregistrer les conversions FX pour les positions futures
                # car on ne peut pas connaître le taux de change dans le futur
                now = timezone.now()
                is_future_position = opened_at > now
                if asset_obj is not None and not is_future_position:
                    asset_currency = (getattr(asset_obj, 'currency', None) or '').strip().upper() or None
                    fx_rate = _get_fx_rate_eur_to_ccy(asset_currency or '')
                    if fx_rate is not None:
                        try:
                            invested_amount_asset_currency = (Decimal(str(amt)) * fx_rate).quantize(Decimal('0.00000001'))
                        except Exception:
                            invested_amount_asset_currency = None

                position_id = uuid.uuid4().hex[:12]
                if save_to_db:
                    while Position.objects.filter(id=position_id).exists():
                        position_id = uuid.uuid4().hex[:12]

                    # CRITICAL: Always use txn.id for transaction_id to ensure correct linkage
                    transaction_id_to_use = txn.id
                    
                    created.append(
                        Position.objects.create(
                            id=position_id,
                            client_id=ctx.client_id,
                            product_id=ctx.product_id,
                            transaction_id=transaction_id_to_use,  # Always use txn.id to ensure correct linkage
                            asset_id=getattr(asset_obj, 'id', asset_obj) if asset_obj is not None else None,
                            opened_at=opened_at,
                            closed_at=closed_at,
                            invested_amount=amt,
                            fx_rate_eur_to_asset=fx_rate,
                            invested_amount_asset_currency=invested_amount_asset_currency,
                            profit_loss=pnl,
                            period_index=next_idx,
                            period_date=opened_at.date(),
                            status='pending',
                        )
                    )
                else:
                    # Return dict representation with asset info
                    asset_info = {}
                    if asset_obj is not None:
                        asset_info = {
                            'asset_id': getattr(asset_obj, 'id', None),
                            'asset_name': getattr(asset_obj, 'name', None) or '',
                            'asset_reference': getattr(asset_obj, 'reference', None) or '',
                            'asset_type': getattr(asset_obj, 'type', None) or '',
                        }
                    
                    created.append({
                        'id': position_id,
                        'client_id': ctx.client_id,
                        'product_id': ctx.product_id,
                        'transaction_id': ctx.transaction_id,
                        'asset_id': asset_info.get('asset_id') if asset_info else None,
                        'asset_name': asset_info.get('asset_name', '') if asset_info else '',
                        'asset_reference': asset_info.get('asset_reference', '') if asset_info else '',
                        'asset_type': asset_info.get('asset_type', '') if asset_info else '',
                        'opened_at': opened_at.isoformat(),
                        'closed_at': closed_at.isoformat(),
                        'invested_amount': str(amt),
                        'fx_rate_eur_to_asset': str(fx_rate) if fx_rate else None,
                        'invested_amount_asset_currency': str(invested_amount_asset_currency) if invested_amount_asset_currency else None,
                        'profit_loss': str(pnl),
                        'period_index': next_idx,
                        'period_date': opened_at.date().isoformat(),
                        'status': 'pending',
                    })
                next_idx += 1

        if does_compound:
            # For compounding, add existing profit (from closed and open positions) + new profit from this period
            new_profit = sum(
                Decimal(str(p.get('profit_loss', 0) if isinstance(p, dict) else (p.profit_loss or Decimal('0'))))
                for p in created
                if (isinstance(p, dict) and p.get('period_date') and period_days[0] <= date.fromisoformat(p['period_date']) <= period_days[-1])
                or (not isinstance(p, dict) and p.period_date and period_days[0] <= p.period_date <= period_days[-1])
            )
            # Capital grows with existing profit (from closed and open positions) + new profit
            capital = (capital + existing_profit + new_profit).quantize(Decimal('0.01'))

        cursor_dt = period_end_dt
        remaining_months -= step_months
        period_idx += 1

    return created


@db_transaction.atomic
def save_generated_positions(
    txn: Transaction, 
    positions_data: list[dict],
    *,
    rates_used: dict[int, Decimal] | None = None,
    period_summaries: list[dict] | None = None,
) -> tuple[list[Position], dict]:
    """
    Save previously generated positions (from generate_positions_with_rates) to database.
    
    Before saving, deletes future positions (pending/open with closed_at > now) to allow recalculation
    when transaction amount changes (deposit/withdrawal).
    
    Also records generation history in transaction.position_generation_history.
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        empty_deletion_info = {
            'total_count': 0,
            'deleted_by_transaction': {},
            'positions': [],
            'note': None
        }
        return [], empty_deletion_info
    
    # CRITICAL: Ensure we're using the correct transaction ID
    # Log to verify the transaction ID is correct
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"DEBUG: save_generated_positions called for transaction {txn.id}, "
               f"ctx.transaction_id={ctx.transaction_id}, "
               f"txn.id={txn.id}")
    
    # Verify transaction ID matches
    if ctx.transaction_id != txn.id:
        logger.error(f"ERROR: Transaction ID mismatch! ctx.transaction_id={ctx.transaction_id}, txn.id={txn.id}")
        # Use the transaction ID from the parameter, not from context
        ctx = InvestmentContext(
            client_id=ctx.client_id,
            product_id=ctx.product_id,
            transaction_id=txn.id,  # Force use of the correct transaction ID
            start_date=ctx.start_date,
            duration_months=ctx.duration_months,
            invested_amount=ctx.invested_amount,
            total_expected_profit=ctx.total_expected_profit,
            total_expected_amount=ctx.total_expected_amount,
        )
        logger.warning(f"Fixed transaction ID mismatch: using txn.id={txn.id}")

    # CRITICAL: Delete ALL pending positions for ALL investment transactions on the same product
    # This is necessary because when regenerating positions, we recalculate based on the total
    # invested capital across all transactions. All pending positions must be deleted and regenerated
    # to ensure consistency with the new capital calculation.
    import logging
    logger = logging.getLogger(__name__)
    now = timezone.now()
    
    # Delete ALL pending positions for this product and client directly
    # This is more reliable than filtering by transactions, as it catches all positions
    # regardless of transaction status
    deleted_positions_info = []
    total_pending_count = 0
    deleted_by_transaction = {}
    deleted_count = 0  # Initialize to 0 in case there are no positions to delete
    
    if ctx.product_id:
        # Create base queryset for pending positions
        base_queryset = Position.objects.filter(
            product_id=ctx.product_id,
            client_id=ctx.client_id,
            status='pending'
        )
        
        # Get total count
        total_pending_count = base_queryset.count()
        logger.info(f"DEBUG: Found {total_pending_count} pending positions for product {ctx.product_id} and client {ctx.client_id}")
        
        if total_pending_count > 0:
            # Get breakdown by transaction before deletion
            from django.db.models import Count
            pending_by_transaction = base_queryset.values('transaction_id').annotate(
                count=Count('id')
            )
            for item in pending_by_transaction:
                txn_id = item['transaction_id']
                count = item['count']
                deleted_by_transaction[txn_id] = count
            
            logger.info(f"DEBUG: Breakdown by transaction: {deleted_by_transaction}")
            
            # Get detailed position information for display (limit to first 100 for performance)
            # Use select_related for efficient fetching
            positions_to_delete = list(base_queryset.select_related('transaction', 'asset')[:100])
            logger.info(f"DEBUG: Fetched {len(positions_to_delete)} positions for display (out of {total_pending_count})")
            
            for pos in positions_to_delete:
                deleted_positions_info.append({
                    'id': pos.id,
                    'transaction_id': pos.transaction_id,
                    'asset_id': pos.asset_id,
                    'asset_name': pos.asset.name if pos.asset else None,
                    'invested_amount': str(pos.invested_amount),
                    'profit_loss': str(pos.profit_loss) if pos.profit_loss else '0',
                    'opened_at': pos.opened_at.isoformat() if pos.opened_at else None,
                    'closed_at': pos.closed_at.isoformat() if pos.closed_at else None,
                    'period_index': pos.period_index,
                    'period_date': pos.period_date.isoformat() if pos.period_date else None,
                })
            
            # Get all IDs to delete (for verification and logging)
            logger.info(f"DEBUG: Fetching all pending position IDs...")
            all_pending_ids = list(base_queryset.values_list('id', flat=True))
            logger.info(f"DEBUG: Retrieved {len(all_pending_ids)} position IDs to delete")
            
            if len(all_pending_ids) != total_pending_count:
                logger.error(f"ERROR: Mismatch! Count says {total_pending_count} but got {len(all_pending_ids)} IDs")
            
            deleted_ids_sample = all_pending_ids[:20]
            
            logger.info(f"DEBUG: About to delete {len(all_pending_ids)} pending positions (sample IDs: {deleted_ids_sample[:10]}{'...' if len(deleted_ids_sample) > 10 else ''}) "
                       f"for product {ctx.product_id} and client {ctx.client_id} before regeneration. "
                       f"Breakdown by transaction: {deleted_by_transaction}")
            
            # CRITICAL: Delete all pending positions directly using a fresh queryset
            # Recreate the queryset to ensure it's up-to-date and not cached
            logger.info(f"DEBUG: Executing delete() on fresh queryset with {total_pending_count} positions...")
            delete_queryset = Position.objects.filter(
                product_id=ctx.product_id,
                client_id=ctx.client_id,
                status='pending'
            )
            deleted_result = delete_queryset.delete()
            deleted_count = deleted_result[0] if isinstance(deleted_result, tuple) else deleted_result
            deleted_by_model = deleted_result[1] if isinstance(deleted_result, tuple) and len(deleted_result) > 1 else {}
            
            logger.info(f"DEBUG: Delete operation completed. Result: {deleted_result}")
            logger.info(f"DEBUG: Deleted {deleted_count} positions. Details by model: {deleted_by_model}")
            
            logger.info(f"Successfully deleted {deleted_count} pending positions (expected {total_pending_count}, IDs count: {len(all_pending_ids)}) "
                       f"across {len(deleted_by_transaction)} transactions "
                       f"on product {ctx.product_id} before regenerating positions for transaction {txn.id}")
            
            # Verify deletion immediately after
            logger.info(f"DEBUG: Verifying deletion...")
            remaining_queryset = Position.objects.filter(
                product_id=ctx.product_id,
                client_id=ctx.client_id,
                status='pending'
            )
            remaining_count = remaining_queryset.count()
            
            if remaining_count > 0:
                # Get details about remaining positions for debugging
                remaining_positions = list(remaining_queryset.values('id', 'transaction_id', 'status', 'opened_at', 'closed_at')[:20])
                remaining_by_transaction = remaining_queryset.values('transaction_id').annotate(count=Count('id'))
                remaining_by_txn_dict = {item['transaction_id']: item['count'] for item in remaining_by_transaction}
                
                logger.error(f"ERROR: {remaining_count} pending positions still exist after deletion! "
                            f"Expected 0. Deleted {deleted_count} positions but {remaining_count} remain. "
                            f"Remaining breakdown by transaction: {remaining_by_txn_dict}")
                logger.error(f"DEBUG: Sample of remaining positions: {remaining_positions}")
                logger.error(f"DEBUG: Original IDs to delete: {all_pending_ids[:20]}...")
                logger.error(f"DEBUG: Remaining position IDs: {list(remaining_queryset.values_list('id', flat=True)[:20])}")
            elif deleted_count != total_pending_count:
                logger.warning(f"WARNING: Deleted {deleted_count} positions but expected {total_pending_count}. "
                             f"Some positions may have been deleted by another process.")
            else:
                logger.info(f"DEBUG: Verification passed! All {deleted_count} positions were successfully deleted.")
        else:
            logger.info(f"No pending positions to delete for product {ctx.product_id} and client {ctx.client_id}")
    else:
        logger.warning(f"Cannot delete pending positions: no product_id in context for transaction {txn.id}")
    
    # Check existing positions for current transaction (for logging)
    # CRITICAL: Use txn.id directly to ensure we're checking the correct transaction
    all_existing_positions = Position.objects.filter(transaction_id=txn.id)
    total_existing = all_existing_positions.count()
    pending_count = all_existing_positions.filter(status='pending').count()
    open_count = all_existing_positions.filter(status='open').count()
    done_count = all_existing_positions.filter(status='done').count()
    
    logger.info(f"After deletion, current transaction {txn.id} has: "
                f"total={total_existing}, pending={pending_count}, open={open_count}, done={done_count}")
    
    # Check total pending positions for product/client before creating new ones
    total_pending_before_create = Position.objects.filter(
        product_id=ctx.product_id,
        client_id=ctx.client_id,
        status='pending'
    ).count() if ctx.product_id else 0
    logger.info(f"DEBUG: Total pending positions for product {ctx.product_id} BEFORE creating new positions: {total_pending_before_create}")

    created: list[Position] = []
    logger.info(f"DEBUG: About to create {len(positions_data)} new positions for transaction {txn.id}")
    
    for idx, pos_data in enumerate(positions_data):
        position_id = pos_data.get('id') or uuid.uuid4().hex[:12]
        while Position.objects.filter(id=position_id).exists():
            position_id = uuid.uuid4().hex[:12]

        opened_at = datetime.fromisoformat(pos_data['opened_at'].replace('Z', '+00:00'))
        closed_at = datetime.fromisoformat(pos_data['closed_at'].replace('Z', '+00:00'))
        if timezone.is_naive(opened_at):
            opened_at = timezone.make_aware(opened_at, timezone.get_current_timezone())
        if timezone.is_naive(closed_at):
            closed_at = timezone.make_aware(closed_at, timezone.get_current_timezone())

        # Ne pas enregistrer les conversions FX pour les positions futures
        # car on ne peut pas connaître le taux de change dans le futur
        now = timezone.now()
        is_future_position = opened_at > now
        fx_rate_eur_to_asset = None
        invested_amount_asset_currency = None
        
        if not is_future_position:
            # Try to get FX rate from pos_data first
            fx_rate_eur_to_asset = Decimal(str(pos_data['fx_rate_eur_to_asset'])) if pos_data.get('fx_rate_eur_to_asset') else None
            invested_amount_asset_currency = Decimal(str(pos_data['invested_amount_asset_currency'])) if pos_data.get('invested_amount_asset_currency') else None
            
            # If pos_data doesn't have FX rate (e.g., position was future when generated),
            # recalculate it now that the position is no longer future
            if fx_rate_eur_to_asset is None and pos_data.get('asset_id'):
                try:
                    asset_id = pos_data.get('asset_id')
                    asset = Asset.objects.filter(id=asset_id).first()
                    if asset:
                        asset_currency = (getattr(asset, 'currency', None) or '').strip().upper() or None
                        if asset_currency:
                            fx_rate_eur_to_asset = _get_fx_rate_eur_to_ccy(asset_currency)
                            if fx_rate_eur_to_asset is not None:
                                invested_amount = Decimal(str(pos_data['invested_amount']))
                                try:
                                    invested_amount_asset_currency = (invested_amount * fx_rate_eur_to_asset).quantize(Decimal('0.00000001'))
                                except Exception:
                                    invested_amount_asset_currency = None
                except Exception:
                    # If asset lookup or FX calculation fails, keep None values
                    pass

        # CRITICAL: Always use txn.id for transaction_id, not pos_data.get('transaction_id')
        # This ensures positions are linked to the correct transaction even if pos_data contains wrong transaction_id
        transaction_id_to_use = txn.id  # Always use the transaction passed as parameter
        
        # Log first position to verify transaction ID
        if idx == 0:
            logger.info(f"DEBUG: Creating first position with transaction_id={transaction_id_to_use} "
                       f"(txn.id={txn.id}, ctx.transaction_id={ctx.transaction_id}, "
                       f"pos_data.transaction_id={pos_data.get('transaction_id', 'N/A')})")
        
        created.append(
            Position.objects.create(
                id=position_id,
                client_id=ctx.client_id,
                product_id=ctx.product_id,
                transaction_id=transaction_id_to_use,  # Always use txn.id to ensure correct linkage
                asset_id=pos_data.get('asset_id'),
                opened_at=opened_at,
                closed_at=closed_at,
                invested_amount=Decimal(str(pos_data['invested_amount'])),
                fx_rate_eur_to_asset=fx_rate_eur_to_asset,
                invested_amount_asset_currency=invested_amount_asset_currency,
                profit_loss=Decimal(str(pos_data['profit_loss'])),
                period_index=pos_data['period_index'],
                period_date=date.fromisoformat(pos_data['period_date']),
                status='pending',
            )
        )
        if (idx + 1) % 10 == 0:
            logger.debug(f"DEBUG: Created {idx + 1}/{len(positions_data)} positions so far")
    
    logger.info(f"DEBUG: Created {len(created)} positions for transaction {txn.id}")
    
    # Verify that all created positions have the correct transaction_id
    if created:
        for pos in created[:5]:  # Check first 5 positions
            if pos.transaction_id != txn.id:
                logger.error(f"ERROR: Position {pos.id} has wrong transaction_id! Expected {txn.id}, got {pos.transaction_id}")
            else:
                logger.debug(f"DEBUG: Position {pos.id} correctly linked to transaction {txn.id}")
    
    # Check total pending positions for product/client after creating new ones
    total_pending_after_create = Position.objects.filter(
        product_id=ctx.product_id,
        client_id=ctx.client_id,
        status='pending'
    ).count() if ctx.product_id else 0
    
    # Check positions specifically for the current transaction
    positions_for_current_txn = Position.objects.filter(
        transaction_id=txn.id,
        status='pending'
    ).count()
    logger.info(f"DEBUG: Total pending positions for product {ctx.product_id} AFTER creating new positions: {total_pending_after_create} "
               f"(expected: {total_pending_before_create} + {len(created)} = {total_pending_before_create + len(created)})")
    logger.info(f"DEBUG: Pending positions for current transaction {txn.id}: {positions_for_current_txn} (expected: {len(created)})")

    # IMPORTANT: When capital changes on a product, all other investment transactions
    # on the same product must have their future positions recalculated.
    # This is because the total invested capital affects position calculations.
    # Recalculate positions for all other investment transactions on the same product
    if ctx.product_id:
        import logging
        logger = logging.getLogger(__name__)
        
        # Find all other investment transactions (transfer_to = product_id) for the same client and product
        # that are 'valide' and have positions
        # CRITICAL: Use txn.id directly to exclude the current transaction, not ctx.transaction_id
        # This ensures we don't accidentally include the current transaction in the recalculation
        other_investment_transactions = Transaction.objects.filter(
            client_id=ctx.client_id,
            type='transfert',
            transfer_to=ctx.product_id,
            status__in=COMPLETED_TRANSACTION_STATUSES
        ).exclude(id=txn.id)  # Exclude the current transaction using txn.id directly
        
        logger.info(f"Recalculating positions for {other_investment_transactions.count()} other investment transactions "
                    f"on product {ctx.product_id} after updating transaction {txn.id}")
        
        # For each other investment transaction, recalculate future positions
        # This ensures that when capital changes, all future positions are recalculated
        # with the updated total invested capital
        # NOTE: Pending positions for these transactions have already been deleted above
        logger.info(f"DEBUG: About to regenerate positions for {other_investment_transactions.count()} other transactions")
        
        # Check pending positions count before regeneration
        pending_before_regen = Position.objects.filter(
            product_id=ctx.product_id,
            client_id=ctx.client_id,
            status='pending'
        ).count()
        logger.info(f"DEBUG: Pending positions count BEFORE regeneration of other transactions: {pending_before_regen}")
        
        # Track failed regenerations to prevent data loss
        failed_regenerations = []
        max_retries = 2  # Retry failed regenerations up to 2 times
        
        for other_txn in other_investment_transactions:
            # Check pending positions for this transaction before regeneration
            pending_for_txn_before = Position.objects.filter(
                transaction_id=other_txn.id,
                status='pending'
            ).count()
            logger.info(f"DEBUG: Transaction {other_txn.id}: {pending_for_txn_before} pending positions before regeneration")
            
            # Attempt regeneration with retries
            regeneration_successful = False
            last_error = None
            created_positions = []
            
            for attempt in range(max_retries + 1):  # 0, 1, 2 = 3 attempts total
                try:
                    # Regenerate positions for this investment transaction
                    # This will use the updated capital (which includes the change from the current transaction)
                    # delete_pending=False because we already deleted all pending positions above (for all transactions)
                    created_positions = create_positions_for_investment(other_txn, trigger="capital_update_recalculation", delete_pending=False)
                    logger.info(f"DEBUG: Transaction {other_txn.id}: Created {len(created_positions)} new positions (attempt {attempt + 1}/{max_retries + 1})")
                    
                    # Verify that positions were actually created
                    pending_for_txn_after = Position.objects.filter(
                        transaction_id=other_txn.id,
                        status='pending'
                    ).count()
                    
                    # Check if regeneration was successful
                    # Success criteria: either positions were created, or there were no positions before (normal case)
                    if len(created_positions) > 0 or pending_for_txn_before == 0:
                        regeneration_successful = True
                        logger.info(f"DEBUG: Transaction {other_txn.id}: {pending_for_txn_after} pending positions after regeneration (expected {len(created_positions)})")
                        logger.info(f"Regenerated positions for investment transaction {other_txn.id} after capital update")
                        break  # Success, exit retry loop
                    else:
                        # No positions created but we had positions before - this is a problem
                        if attempt < max_retries:
                            logger.warning(f"WARNING: Transaction {other_txn.id}: No positions created on attempt {attempt + 1}. "
                                         f"Had {pending_for_txn_before} positions before deletion. Retrying...")
                            last_error = 'No positions created despite having positions before deletion'
                            continue  # Retry
                        else:
                            # Final attempt failed
                            logger.error(f"ERROR: Transaction {other_txn.id}: Position regeneration failed after {max_retries + 1} attempts! "
                                       f"Had {pending_for_txn_before} positions before deletion, but 0 positions after regeneration. "
                                       f"This indicates a potential data loss.")
                            failed_regenerations.append({
                                'transaction_id': other_txn.id,
                                'positions_before': pending_for_txn_before,
                                'positions_created': len(created_positions),
                                'positions_after': pending_for_txn_after,
                                'error': last_error or 'No positions created despite having positions before deletion'
                            })
                            break  # Give up after max retries
                            
                except Exception as e:
                    last_error = str(e)
                    if attempt < max_retries:
                        logger.warning(f"WARNING: Transaction {other_txn.id}: Exception during regeneration attempt {attempt + 1}: {str(e)}. Retrying...")
                        continue  # Retry
                    else:
                        # Final attempt failed with exception
                        logger.error(f"CRITICAL ERROR: Failed to regenerate positions for investment transaction {other_txn.id} "
                                   f"after {max_retries + 1} attempts following capital update on transaction {txn.id}. "
                                   f"This transaction had {pending_for_txn_before} positions before deletion, "
                                   f"which are now permanently lost unless manually regenerated. "
                                   f"Error: {str(e)}", exc_info=True)
                        failed_regenerations.append({
                            'transaction_id': other_txn.id,
                            'positions_before': pending_for_txn_before,
                            'positions_created': 0,
                            'positions_after': 0,
                            'error': str(e)
                        })
                        break  # Give up after max retries
            
            if not regeneration_successful and pending_for_txn_before > 0:
                # Final check: verify positions exist
                final_pending_count = Position.objects.filter(
                    transaction_id=other_txn.id,
                    status='pending'
                ).count()
                if final_pending_count == 0:
                    logger.error(f"CRITICAL: Transaction {other_txn.id} has lost {pending_for_txn_before} positions due to failed regeneration!")
        
        # Log summary of failed regenerations
        if failed_regenerations:
            logger.error(f"CRITICAL: {len(failed_regenerations)} transaction(s) failed position regeneration after capital update on transaction {txn.id}:")
            for failure in failed_regenerations:
                logger.error(f"  - Transaction {failure['transaction_id']}: {failure['positions_before']} positions lost. Error: {failure['error']}")
            logger.error(f"These transactions need manual position regeneration to recover lost positions.")
        
        # Check pending positions count after all regenerations
        pending_after_regen = Position.objects.filter(
            product_id=ctx.product_id,
            client_id=ctx.client_id,
            status='pending'
        ).count()
        
        # CRITICAL: Verify that positions for the current transaction still exist after recalculation
        positions_for_current_txn_after_regen = Position.objects.filter(
            transaction_id=txn.id,
            status='pending'
        ).count()
        logger.info(f"DEBUG: Pending positions count AFTER regeneration of other transactions: {pending_after_regen}")
        logger.info(f"DEBUG: Pending positions for current transaction {txn.id} AFTER recalculation: {positions_for_current_txn_after_regen} "
                   f"(expected: {len(created)})")
        
        if positions_for_current_txn_after_regen != len(created):
            logger.error(f"ERROR: Position count mismatch for transaction {txn.id}! "
                        f"Expected {len(created)} positions, but found {positions_for_current_txn_after_regen} after recalculation. "
                        f"This suggests positions were deleted during recalculation.")
        
        if pending_after_regen != len(created):
            logger.warning(f"DEBUG: Mismatch! Created {len(created)} positions for current transaction, "
                         f"but total pending positions is {pending_after_regen}. "
                         f"This includes positions from other transactions that were regenerated.")
        
        # Final summary log
        logger.info(f"DEBUG: === FINAL SUMMARY FOR TRANSACTION {txn.id} ===")
        logger.info(f"DEBUG: - Started with {total_pending_count} pending positions to delete")
        logger.info(f"DEBUG: - Deleted {deleted_count} pending positions")
        logger.info(f"DEBUG: - Created {len(created)} new positions for current transaction")
        logger.info(f"DEBUG: - Regenerated positions for {other_investment_transactions.count()} other transactions")
        logger.info(f"DEBUG: - Failed regenerations: {len(failed_regenerations)}")
        logger.info(f"DEBUG: - Final pending positions count: {pending_after_regen}")
        if failed_regenerations:
            logger.error(f"DEBUG: - WARNING: {len(failed_regenerations)} transaction(s) have lost positions and need manual regeneration!")
        logger.info(f"DEBUG: ============================================")
    
    # Record generation history in transaction (without duplicating position details)
    try:
        # Calculate summary statistics
        total_invested = sum(Decimal(str(p.invested_amount)) for p in created).quantize(Decimal('0.01'))
        total_profit = sum(Decimal(str(p.profit_loss)) for p in created).quantize(Decimal('0.01'))
        
        # Count positions by asset (summary only)
        positions_by_asset = {}
        for pos in created:
            asset_id = str(pos.asset_id) if pos.asset_id else 'none'
            if asset_id not in positions_by_asset:
                positions_by_asset[asset_id] = {
                    "count": 0,
                    "total_invested": Decimal('0'),
                    "total_profit": Decimal('0'),
                }
            positions_by_asset[asset_id]["count"] += 1
            positions_by_asset[asset_id]["total_invested"] += Decimal(str(pos.invested_amount))
            positions_by_asset[asset_id]["total_profit"] += Decimal(str(pos.profit_loss))
        
        # Convert Decimal to string for JSON serialization
        for asset_id, summary in positions_by_asset.items():
            positions_by_asset[asset_id]["total_invested"] = str(summary["total_invested"].quantize(Decimal('0.01')))
            positions_by_asset[asset_id]["total_profit"] = str(summary["total_profit"].quantize(Decimal('0.01')))
        
        history_entry = {
            "timestamp": now.isoformat(),
            "rates_used": {str(k): str(v) for k, v in (rates_used or {}).items()},
            "period_summaries": period_summaries or [],
            "summary": {
                "positions_generated": len(created),
                "total_invested": str(total_invested),
                "total_profit": str(total_profit),
                "positions_by_asset": positions_by_asset,
            },
            "deleted_future_positions": {
                "count": total_pending_count,
                "deleted_by_transaction": deleted_by_transaction,
                "note": "All pending positions deleted for all investment transactions on this product before regeneration"
            },
        }
        
        # Append to transaction history
        if txn.position_generation_history is None:
            txn.position_generation_history = []
        txn.position_generation_history.append(history_entry)
        txn.save(update_fields=['position_generation_history'])
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to record position generation history for transaction {txn.id}: {e}", exc_info=True)
        # Don't fail the operation if history recording fails

    # Return both created positions and deletion info
    # Store deletion info separately since we can't add attributes to a list
    deletion_info = {
        'total_count': total_pending_count,
        'deleted_by_transaction': deleted_by_transaction,
        'positions': deleted_positions_info,
        'note': f'{len(deleted_positions_info)} positions shown (out of {total_pending_count} total)' if total_pending_count > len(deleted_positions_info) else None
    }
    
    # Store in a way that the API can access it
    # We'll return it separately in the API response
    return created, deletion_info


def save_position_generation_history(
    txn: Transaction,
    *,
    rates_used: dict[int, Decimal] | None = None,
    period_summaries: list[dict] | None = None,
    positions_data: list[dict] | None = None,
) -> None:
    """
    Save position generation history for a transaction without creating positions.
    Used for withdrawals where we want to record the rates and periods that were shown
    but don't create positions (they are recalculated for other investment transactions).
    """
    from django.utils import timezone
    
    now = timezone.now()
    
    # Calculate summary from positions_data if provided
    total_invested = Decimal('0')
    total_profit = Decimal('0')
    positions_by_asset = {}
    
    if positions_data:
        for pos_data in positions_data:
            invested = _to_decimal(pos_data.get('invested_amount', 0)) or Decimal('0')
            profit = _to_decimal(pos_data.get('profit_loss', 0)) or Decimal('0')
            total_invested += invested
            total_profit += profit
            
            asset_id = str(pos_data.get('asset_id', '')) if pos_data.get('asset_id') else 'none'
            if asset_id not in positions_by_asset:
                positions_by_asset[asset_id] = {
                    "count": 0,
                    "total_invested": Decimal('0'),
                    "total_profit": Decimal('0'),
                }
            positions_by_asset[asset_id]["count"] += 1
            positions_by_asset[asset_id]["total_invested"] += invested
            positions_by_asset[asset_id]["total_profit"] += profit
    
    # Convert Decimal to string for JSON serialization
    for asset_id, summary in positions_by_asset.items():
        positions_by_asset[asset_id]["total_invested"] = str(summary["total_invested"].quantize(Decimal('0.01')))
        positions_by_asset[asset_id]["total_profit"] = str(summary["total_profit"].quantize(Decimal('0.01')))
    
    history_entry = {
        "timestamp": now.isoformat(),
        "rates_used": {str(k): str(v) for k, v in (rates_used or {}).items()},
        "period_summaries": period_summaries or [],
        "summary": {
            "positions_generated": len(positions_data) if positions_data else 0,
            "total_invested": str(total_invested.quantize(Decimal('0.01'))),
            "total_profit": str(total_profit.quantize(Decimal('0.01'))),
            "positions_by_asset": positions_by_asset,
        },
        "deleted_future_positions": {
            "count": 0,
            "position_ids": [],
        },
    }
    
    # Append to transaction history
    if txn.position_generation_history is None:
        txn.position_generation_history = []
    txn.position_generation_history.append(history_entry)
    txn.save(update_fields=['position_generation_history'])


def get_or_create_product_for_asset(asset: Asset) -> Product:
    """
    Get or create a Product that represents an Asset for trading positions.
    Uses asset.id as the product reference to ensure one Product per Asset.
    """
    # Try to find existing product with reference matching asset ID
    product = Product.objects.filter(reference=f'ASSET_{asset.id}').first()
    if product:
        return product
    
    # Create a new Product for this Asset
    product_id = uuid.uuid4().hex[:12]
    while Product.objects.filter(id=product_id).exists():
        product_id = uuid.uuid4().hex[:12]
    
    product = Product.objects.create(
        id=product_id,
        name=asset.name,
        reference=f'ASSET_{asset.id}',
        type='Trading',
        subcategory=asset.type or '',
        status='Inactif',
        profitability=Decimal('0'),
        duration='',
        description=f'Produit technique pour actif: {asset.name}',
    )
    return product


def _calculate_real_invested_capital(client_id: str, product_id: str, *, up_to_datetime: datetime | None = None, exclude_transaction_id: str | None = None) -> Decimal:
    """
    Calculate the real invested capital in a product for a client.
    
    This sums all completed transfers TO the product and subtracts all completed transfers FROM the product.
    Only considers transactions with status='valide' (completed).
    Transactions with status='en_cours' are NOT included here - they should be added manually
    if they are the current transaction being processed.
    
    Args:
        client_id: Client ID
        product_id: Product ID
        up_to_datetime: Optional datetime to only consider transactions up to this point
        exclude_transaction_id: Optional transaction ID to exclude from calculation
    
    Returns:
        Total invested capital (positive = net investment, negative = net withdrawal)
    """
    from .models import Transaction
    
    # Query for completed transactions only
    # Do NOT include 'en_cours' transactions here - only the current transaction (if 'en_cours')
    # should be added manually in build_investment_context
    qs = Transaction.objects.filter(
        client_id=client_id,
        type='transfert',
        status__in=COMPLETED_TRANSACTION_STATUSES
    )
    
    if up_to_datetime:
        qs = qs.filter(datetime__lte=up_to_datetime)
    
    # Exclude specific transaction if provided (e.g., current transaction if not yet 'valide')
    if exclude_transaction_id:
        qs = qs.exclude(id=exclude_transaction_id)
    
    total = Decimal('0')
    
    # Sum transfers TO the product (investments)
    # Investment: transfer_to = product_id
    investments = qs.filter(transfer_to=product_id)
    for txn in investments:
        amount = _to_decimal(txn.amount) or Decimal('0')
        total += amount
    
    # Subtract transfers FROM the product (withdrawals)
    # Withdrawal can be identified by:
    # 1. transfer_to='balance' AND product_id=product_id (product field set on transaction)
    # 2. transfer_to='balance' AND transfer_from=product_id (transfer_from field set)
    # 3. transfer_from=product_id (regardless of transfer_to, if transfer_from is set)
    # We use distinct() to avoid counting the same transaction twice
    withdrawals = qs.filter(
        Q(transfer_to='balance', product_id=product_id) |
        Q(transfer_to='balance', transfer_from=product_id) |
        Q(transfer_from=product_id)
    ).distinct()
    for txn in withdrawals:
        amount = _to_decimal(txn.amount) or Decimal('0')
        total -= amount
    
    return total.quantize(Decimal('0.01'))


def _extract_product_from_description(description: str) -> Product | None:
    """
    Best-effort inference used when admin edits a transaction but transfer_to/product
    isn't set. Matches frontend format: "Transfert de [from] vers [to]." or "Transfert de Balance Cash vers Nom (REF)".
    Supports both old and new simplified formats.
    """
    if not description:
        return None
    # Pattern matches: "Transfert de [from] vers [to]." or "Transfert de Balance Cash vers Nom (REF)"
    # Use .*? (non-greedy) instead of [^v]+? to handle product names containing 'v' (e.g., "Volkswagen")
    m = re.search(r"Transfert de\s+(.*?)\s+vers\s+([^(]+?)(?:\s*\(([^)]+)\))?", description, flags=re.IGNORECASE)
    if not m:
        return None
    # Extract the destination (to) which is what we're interested in
    # Group 1 is "from" (ignored), Group 2 is product name, Group 3 is reference
    name = (m.group(2) or '').strip()
    ref = (m.group(3) or '').strip() or None
    if ref:
        p = Product.objects.filter(reference=ref).first()
        if p:
            return p
    if name:
        return Product.objects.filter(name=name).first()
    return None


@db_transaction.atomic
def create_trade_positions_for_smart_portfolio_investment(txn: Transaction, *, trigger: str | None = None) -> list[Position]:
    """
    Generate trade-like positions for Smart Portfolio investment transactions.

    Rules (requested):
    - Link each generated position to an Asset linked to the Smart Portfolio (ProductAssetAllocation).
    - If product has no linked assets, do nothing.
    - Generate positions from txn start datetime until +duration (product/transaction duration).
    - Generate a random number of positions per day (market hours only, specific to each asset).
    - Each position duration <= 1h30 (90 minutes).
    - Total P&L over the period should approximate product profitability (±10%).
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        return []
    
    # CRITICAL: Ensure we're using the correct transaction ID
    # Verify transaction ID matches
    if ctx.transaction_id != txn.id:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"ERROR: Transaction ID mismatch in create_trade_positions_for_smart_portfolio_investment! "
                    f"ctx.transaction_id={ctx.transaction_id}, txn.id={txn.id}")
        # Use the transaction ID from the parameter, not from context
        ctx = InvestmentContext(
            client_id=ctx.client_id,
            product_id=ctx.product_id,
            transaction_id=txn.id,  # Force use of the correct transaction ID
            start_date=ctx.start_date,
            duration_months=ctx.duration_months,
            invested_amount=ctx.invested_amount,
            total_expected_profit=ctx.total_expected_profit,
            total_expected_amount=ctx.total_expected_amount,
        )
        logger.warning(f"Fixed transaction ID mismatch: using txn.id={txn.id}")

    # Resolve product
    product: Product | None = txn.product
    if product is None:
        try:
            product = Product.objects.get(id=ctx.product_id)
        except Product.DoesNotExist:
            return []

    if not _is_smart_portfolio(product):
        return []

    allocations = list(
        ProductAssetAllocation.objects.select_related('asset')
        .filter(product_id=product.id)
    )

    return _create_trade_positions_compounding(
        txn=txn,
        product=product,
        ctx=ctx,
        allocations=allocations,
        trigger=trigger,
    )


def _parse_months(duration: str | None) -> int:
    if not duration:
        return 1
    m = _DURATION_RE.search(str(duration))
    if not m:
        return 1
    try:
        months = int(m.group(1))
        return months if months > 0 else 1
    except Exception:
        return 1


def _to_decimal(value) -> Decimal | None:
    if value is None or value == '':
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _get_fx_rate_eur_to_ccy(
    to_currency: str,
    *,
    _cache: dict[str, Decimal] = {},
) -> Decimal | None:
    """
    Best-effort FX rate snapshot EUR -> to_currency.

    Used for populating Position.fx_rate_eur_to_asset and Position.invested_amount_asset_currency
    on generated asset-linked positions.

    - Uses an in-memory cache per process run.
    - Uses Frankfurter (ECB-based) to avoid API key + rate limits.
    """
    ccy = (to_currency or '').strip().upper()
    if not ccy:
        return None
    if ccy == 'EUR':
        return Decimal('1')
    if ccy in _cache:
        return _cache[ccy]

    try:
        import requests  # type: ignore

        r = requests.get(
            "https://api.frankfurter.app/latest",
            params={"from": "EUR", "to": ccy},
            timeout=5,
        )
        if r.status_code == 200:
            payload = r.json() or {}
            rate = (payload.get("rates") or {}).get(ccy)
            if rate is not None:
                d = Decimal(str(rate))
                if d > 0:
                    _cache[ccy] = d
                    return d
    except Exception:
        pass

    return None


def build_investment_context(txn: Transaction) -> InvestmentContext | None:
    """
    Build the context needed to generate monthly Positions.

    Investment definition:
    - txn.type == 'transfert'
    - txn.transfer_to is a product id (not 'balance')
    """
    if txn.type != 'transfert':
        return None

    # Determine product robustly (admin edits may omit transfer_to/product)
    product: Product | None = txn.product
    if product is None and isinstance(txn.subscription_details, dict):
        pid = txn.subscription_details.get('productId')
        if pid:
            product = Product.objects.filter(id=str(pid)).first()
    if product is None and txn.transfer_to and txn.transfer_to != 'balance':
        product = Product.objects.filter(id=txn.transfer_to).first()
    if product is None:
        product = _extract_product_from_description(txn.description or '')
    
    # Log product resolution for debugging
    import logging
    logger = logging.getLogger(__name__)
    if product is None:
        logger.warning(f"Cannot resolve product for transaction {txn.id}: "
                      f"txn.product={txn.product}, transfer_to={txn.transfer_to}, "
                      f"subscription_details={txn.subscription_details}")
        return None
    else:
        logger.info(f"Product resolved for transaction {txn.id}: product_id={product.id}, "
                   f"product_name={product.name}, transfer_to={txn.transfer_to}")

    # Determine start date (transaction datetime date)
    start = txn.datetime.date() if txn.datetime else date.today()
    start = date(start.year, start.month, 1)

    # Determine duration (months): subscription_details.duration first, fallback to product.duration
    # Some historical transactions stored "N/A" (or empty) in subscription_details.duration;
    # in that case we must fall back to the product duration to generate the correct number of periods.
    duration_candidates: list[str | None] = []
    if isinstance(txn.subscription_details, dict):
        duration_candidates.append(txn.subscription_details.get('duration'))
    # Also consider the explicit column (admin edits may fill it).
    duration_candidates.append(getattr(txn, 'subscription_duration', None) or None)
    duration_candidates.append(product.duration)

    duration_str: str | None = None
    for cand in duration_candidates:
        if cand and _DURATION_RE.search(str(cand)):
            duration_str = str(cand)
            break

    months = _parse_months(duration_str)
    
    # Log duration resolution for debugging
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Duration resolution for transaction {txn.id}: duration_candidates={duration_candidates}, "
                f"duration_str={duration_str}, months={months}, product.duration={product.duration}")
    
    # Ensure we have a valid duration (at least 1 month)
    if months <= 0:
        logger.warning(f"Invalid duration ({months} months) for transaction {txn.id}. Using default of 1 month.")
        months = 1

    # Calculate real invested capital: sum of all completed transfers to/from this product
    # This takes into account all previous transactions (deposits and withdrawals)
    # Only counts transactions with status='valide' (completed)
    
    # Exclude current transaction from calculation (we'll add it manually below)
    real_invested_capital = _calculate_real_invested_capital(
        client_id=txn.client_id,
        product_id=product.id,
        up_to_datetime=txn.datetime if txn.datetime else None,
        exclude_transaction_id=txn.id  # Always exclude current transaction, add it manually below
    )
    
    # Log initial capital calculation
    logger.info(f"Initial capital calculation for transaction {txn.id}: "
               f"real_invested_capital={real_invested_capital}, "
               f"txn.status={txn.status}, txn.transfer_to={txn.transfer_to}, "
               f"txn.transfer_from={txn.transfer_from}")
    
    # IMPORTANT: Always include the current transaction in the capital calculation
    # This ensures that when generating positions for a transaction, its amount is included
    # in the capital base, even if it's not yet saved with status 'valide' in the database
    current_txn_amount = _to_decimal(txn.amount) or Decimal('0')
    
    # Check if this is a withdrawal by looking at the original transaction
    # For withdrawals, we create a temp transaction with transfer_to=product.id to simulate investment
    # But we need to check the original transaction's transfer_to to know if it's a withdrawal
    # We can detect this by checking if transfer_from was originally 'balance' (meaning it's a temp transaction for withdrawal)
    # OR by checking if the transaction ID matches a withdrawal pattern
    # Actually, the safest way is to check: if transfer_to == product.id AND transfer_from == 'balance',
    # AND the transaction was originally a withdrawal (we can't know this directly, so we need another way)
    # Better approach: check if this is a withdrawal by looking at the description or by checking
    # if transfer_from == 'balance' AND we're in a withdrawal context
    
    # For withdrawals, the temp transaction has transfer_to=product.id and transfer_from='balance'
    # But we need to subtract, not add. We can detect this by checking if transfer_from == 'balance'
    # AND the transaction is being used for withdrawal recalculation
    # Actually, simpler: if transfer_to == product.id AND transfer_from == 'balance' AND 
    # the transaction ID is the same as a withdrawal transaction, it's a withdrawal
    
    # The issue is: when we create a temp transaction for withdrawal, it looks like an investment
    # but we need to subtract it. We can detect this by checking the original transaction.
    # Since we don't have access to the original transaction here, we need to pass a flag
    # OR we can check: if transfer_from == 'balance' AND transfer_to == product.id, 
    # it might be a temp transaction for withdrawal. But this is ambiguous.
    
    # Better solution: Check if the transaction description indicates a withdrawal
    # OR: Pass a flag through the context, OR: Check if transfer_from == 'balance' 
    # which would indicate this is a temp transaction created for withdrawal
    
    # Actually, the simplest fix: if transfer_from == 'balance' AND transfer_to == product.id,
    # this is likely a temp transaction for withdrawal, so we should check the original transaction
    # But we don't have it here. Let's check the description pattern instead.
    
    # Check if this is a temporary transaction created for withdrawal recalculation
    # These have transfer_to=product.id and transfer_from='balance' but represent a withdrawal
    # For withdrawals, we need to subtract the withdrawal amount from the capital
    # IMPORTANT: We need to distinguish between:
    # - Normal investment: transfer_from='balance' (or None), transfer_to=product.id, description doesn't contain "vers Balance Cash"
    # - Withdrawal temp: transfer_from='balance', transfer_to=product.id, AND (_is_withdrawal_temp=True OR description contains "vers Balance Cash")
    is_withdrawal_temp_transaction = (
        getattr(txn, '_is_withdrawal_temp', False) or
        (txn.transfer_from == 'balance' and 
         txn.transfer_to == product.id and
         ('vers Balance Cash' in (txn.description or '') or 
          'vers balance' in (txn.description or '').lower()))
    )
    
    # Debug logging for withdrawal detection
    import logging
    logger = logging.getLogger(__name__)
    if txn.transfer_from == 'balance' and txn.transfer_to == product.id:
        logger.info(f"Checking withdrawal temp transaction for txn {txn.id}: "
                    f"_is_withdrawal_temp={getattr(txn, '_is_withdrawal_temp', False)}, "
                    f"transfer_from='{txn.transfer_from}', transfer_to='{txn.transfer_to}', "
                    f"description='{txn.description}', "
                    f"is_withdrawal_temp_transaction={is_withdrawal_temp_transaction}, "
                    f"real_invested_capital before={real_invested_capital}, "
                    f"current_txn_amount={current_txn_amount}")
    
    # Always include current transaction in capital calculation
    # For investments: add the amount (transfer_to = product_id and not a withdrawal temp)
    # For withdrawals: subtract the amount (either direct withdrawal or withdrawal temp transaction)
    # This ensures the transaction being processed is always included in the capital base
    # IMPORTANT: For withdrawals, the capital base should be the total capital MINUS the withdrawal amount
    
    # CRITICAL: Check withdrawal temp transaction FIRST before checking transfer_to == product.id
    # This ensures withdrawals are detected correctly even when transfer_to == product.id
    if is_withdrawal_temp_transaction:
        # This is a withdrawal: subtract the withdrawal amount from the capital
        # The capital base should be the capital AFTER the withdrawal
        capital_before_subtraction = real_invested_capital
        real_invested_capital -= current_txn_amount
        logger.info(f"Withdrawal temp transaction detected for txn {txn.id}: "
                    f"capital before={capital_before_subtraction}, "
                    f"subtracting {current_txn_amount}, "
                    f"capital after withdrawal: {real_invested_capital}")
        # Verify the subtraction succeeded (for debugging/logging purposes)
        expected_capital = capital_before_subtraction - current_txn_amount
        if real_invested_capital != expected_capital:
            logger.error(f"Subtraction validation failed for transaction {txn.id}: "
                        f"expected {expected_capital}, got {real_invested_capital}. "
                        f"capital_before={capital_before_subtraction}, "
                        f"current_txn_amount={current_txn_amount}")
            # Correct the value to prevent downstream issues
            real_invested_capital = expected_capital
    elif txn.transfer_to == product.id and not is_withdrawal_temp_transaction:
        # This is an investment: add the investment amount to the capital
        # Only add if it's NOT a withdrawal temp transaction (double-check)
        real_invested_capital += current_txn_amount
        logger.info(f"Investment detected for txn {txn.id}: adding {current_txn_amount} to capital. "
                    f"Capital after investment: {real_invested_capital}")
    elif txn.transfer_to == 'balance' or txn.transfer_from == product.id:
        # This is a direct withdrawal: subtract the withdrawal amount from the capital
        real_invested_capital -= current_txn_amount
        logger.info(f"Direct withdrawal detected for txn {txn.id}: subtracting {current_txn_amount} from capital. "
                    f"Capital after withdrawal: {real_invested_capital}")
    else:
        # This should not happen, but log it for debugging
        logger.warning(f"No condition matched for txn {txn.id}: transfer_to={txn.transfer_to}, "
                      f"transfer_from={txn.transfer_from}, is_withdrawal_temp_transaction={is_withdrawal_temp_transaction}")
    
    # Use real invested capital instead of just this transaction's amount
    # This ensures that when capital is added/removed, we use the net invested amount
    invested_amount = real_invested_capital
    
    # Log final capital for debugging - ALWAYS log for withdrawal temp transactions
    if txn.transfer_from == 'balance' and txn.transfer_to == product.id:
        logger.info(f"Final capital calculation for withdrawal temp transaction {txn.id}: "
                   f"real_invested_capital={real_invested_capital}, "
                   f"invested_amount={invested_amount}, "
                   f"is_withdrawal_temp_transaction={is_withdrawal_temp_transaction}, "
                   f"current_txn_amount={current_txn_amount}")
    
    # Ensure we don't have negative invested amount (but allow zero for withdrawals)
    if invested_amount < 0:
        # If capital becomes negative, something is wrong - log it and set to 0
        logger.warning(f"Negative invested amount calculated for transaction {txn.id}: {invested_amount}. Setting to 0.")
        invested_amount = Decimal('0')
    # For withdrawals, invested_amount can legitimately be 0 (all capital withdrawn)
    # Only use fallback for investments (not withdrawals)
    elif invested_amount == 0 and not is_withdrawal_temp_transaction:
        # If no capital is invested, use the current transaction amount as fallback
        # This handles the case of the first investment or investment after full withdrawal
        if current_txn_amount > 0 and txn.transfer_to == product.id and not is_withdrawal_temp_transaction:
            # Investment: use the transaction amount as capital base
            invested_amount = current_txn_amount
            logger.info(f"Using transaction amount as capital base for investment {txn.id}: {invested_amount} "
                       f"(previous capital was 0, this is a new investment)")
        else:
            # No capital invested and current transaction is not a positive investment
            logger.warning(f"No capital and transaction is not a positive investment: "
                          f"txn.transfer_to={txn.transfer_to}, product.id={product.id}, "
                          f"current_txn_amount={current_txn_amount}, is_withdrawal_temp={is_withdrawal_temp_transaction}")
            invested_amount = Decimal('0')

    total_profit = None
    total_amount = None
    if isinstance(txn.subscription_details, dict):
        total_profit = _to_decimal(txn.subscription_details.get('profits'))
        total_amount = _to_decimal(txn.subscription_details.get('total'))

    return InvestmentContext(
        client_id=txn.client_id,
        product_id=product.id,
        transaction_id=txn.id,
        start_date=start,
        duration_months=months,
        invested_amount=invested_amount,
        total_expected_profit=total_profit,
        total_expected_amount=total_amount,
    )


@db_transaction.atomic
def create_positions_for_investment(txn: Transaction, *, trigger: str | None = None, delete_pending: bool = True) -> list[Position]:
    """
    Create monthly positions for an investment transaction.

    - By default, deletes all pending positions before creating new ones (to replace them).
    - If delete_pending=False, only creates missing positions (idempotent mode).
    - Designed to be reused from a scheduler/management command.
    
    Args:
        txn: Transaction to create positions for
        trigger: Optional trigger string for logging
        delete_pending: If True (default), delete all pending positions before creating new ones.
                       If False, only create missing positions (idempotent mode).
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        return []

    import logging
    logger = logging.getLogger(__name__)
    
    # CRITICAL: Ensure we're using the correct transaction ID
    # Verify transaction ID matches
    if ctx.transaction_id != txn.id:
        logger.error(f"ERROR: Transaction ID mismatch in create_positions_for_investment! "
                    f"ctx.transaction_id={ctx.transaction_id}, txn.id={txn.id}")
        # Use the transaction ID from the parameter, not from context
        ctx = InvestmentContext(
            client_id=ctx.client_id,
            product_id=ctx.product_id,
            transaction_id=txn.id,  # Force use of the correct transaction ID
            start_date=ctx.start_date,
            duration_months=ctx.duration_months,
            invested_amount=ctx.invested_amount,
            total_expected_profit=ctx.total_expected_profit,
            total_expected_amount=ctx.total_expected_amount,
        )
        logger.warning(f"Fixed transaction ID mismatch: using txn.id={txn.id}")
    
    # Delete all pending positions before creating new ones (unless idempotent mode)
    if delete_pending:
        now = timezone.now()
        pending_positions = Position.objects.filter(
            transaction_id=txn.id,  # Use txn.id directly to ensure correct transaction
            status='pending'
        )
        pending_count = pending_positions.count()
        if pending_count > 0:
            deleted_ids = list(pending_positions.values_list('id', flat=True))
            logger.info(f"Deleting {pending_count} pending positions (IDs: {deleted_ids[:10]}{'...' if len(deleted_ids) > 10 else ''}) "
                       f"for transaction {txn.id} before creating new positions (trigger: {trigger})")
            pending_positions.delete()
        else:
            logger.debug(f"No pending positions to delete for transaction {txn.id} (trigger: {trigger})")

    # New behavior: generate trade-like positions during market hours (random per day).
    product: Product | None = txn.product
    if product is None:
        try:
            product = Product.objects.get(id=ctx.product_id)
        except Product.DoesNotExist:
            product = None

    # For Smart Portfolio, generate asset-linked trades (uses allocations if present).
    if product is not None and _is_smart_portfolio(product):
        return create_trade_positions_for_smart_portfolio_investment(txn, trigger=trigger)

    # Non-smart internal products: trade-like positions without asset linkage, with profitability_period + compounding.
    start_dt = txn.datetime or timezone.now()
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
    end_dt = _add_months_dt(start_dt, ctx.duration_months)

    trading_days = _trading_days_between(start_dt, end_dt)
    if not trading_days:
        return []

    # Check if product has asset allocations (even if not a Smart Portfolio)
    allocations = None
    if product is not None:
        allocations_list = list(
            ProductAssetAllocation.objects.select_related('asset')
            .filter(product_id=product.id)
        )
        if allocations_list:
            allocations = allocations_list

    return _create_trade_positions_compounding(
        txn=txn,
        product=product,
        ctx=ctx,
        allocations=allocations,
        trigger=trigger,
    )


@db_transaction.atomic
def recalculate_positions_for_product_withdrawal(withdrawal_txn: Transaction, *, force_recalculate: bool = False) -> None:
    """
    Recalculate future positions for all investment transactions on the same product
    when a withdrawal (product -> balance) is validated.
    
    This ensures that when capital is withdrawn, all future positions are recalculated
    with the new (reduced) invested capital.
    
    Args:
        withdrawal_txn: Transaction with type='transfert', transfer_to='balance' or transfer_from=product_id
        force_recalculate: If True, recalculate even if transaction status is not 'valide'.
                          Used when save-positions is called for withdrawals that may still have status 'en_cours'.
    """
    if withdrawal_txn.type != 'transfert':
        return
    
    # Only check status if not forcing recalculation
    # This allows save-positions endpoint to trigger recalculation even for withdrawals with status 'en_cours'
    if not force_recalculate and withdrawal_txn.status not in COMPLETED_TRANSACTION_STATUSES:
        return
    
    # Determine the product from which capital is being withdrawn
    # For withdrawals (transfert product -> balance), the product is the source (transfer_from)
    product: Product | None = None
    
    # First, try to get product from transfer_from (most reliable for withdrawals)
    if withdrawal_txn.transfer_from and withdrawal_txn.transfer_from != 'balance':
        try:
            product = Product.objects.get(id=withdrawal_txn.transfer_from)
        except Product.DoesNotExist:
            pass
    
    # If not found, try the product field on the transaction (may be set for withdrawals)
    if product is None and withdrawal_txn.product:
        product = withdrawal_txn.product
    
    # If still not found and transfer_to == 'balance', try to extract from description
    if product is None and withdrawal_txn.transfer_to == 'balance':
        product = _extract_product_from_description(withdrawal_txn.description or '')
    
    # If we still don't have a product, we can't proceed
    if product is None:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Cannot determine product for withdrawal transaction {withdrawal_txn.id}. "
                      f"transfer_from={withdrawal_txn.transfer_from}, transfer_to={withdrawal_txn.transfer_to}, "
                      f"product={withdrawal_txn.product}")
        return
    
    # Verify this is indeed a withdrawal
    is_withdrawal = (
        withdrawal_txn.transfer_to == 'balance' or
        withdrawal_txn.transfer_from == product.id
    )
    if not is_withdrawal:
        return
    
    import logging
    logger = logging.getLogger(__name__)
    
    # CRITICAL: Delete ALL pending positions for this product and client BEFORE recalculating
    # This ensures we delete positions from ALL transactions, not just investment transactions
    # Similar to what save_generated_positions does
    from .models import Position
    from django.db.models import Count
    
    all_pending_positions = Position.objects.filter(
        product_id=product.id,
        client_id=withdrawal_txn.client_id,
        status='pending'
    )
    
    total_pending_count = all_pending_positions.count()
    
    if total_pending_count > 0:
        # Get breakdown by transaction before deletion
        pending_by_transaction = all_pending_positions.values('transaction_id').annotate(
            count=Count('id')
        )
        deleted_by_transaction = {item['transaction_id']: item['count'] for item in pending_by_transaction}
        
        # Get all IDs to delete (for logging)
        all_pending_ids = list(all_pending_positions.values_list('id', flat=True))
        
        logger.info(f"Deleting {total_pending_count} pending positions (IDs: {all_pending_ids[:10]}{'...' if len(all_pending_ids) > 10 else ''}) "
                   f"for product {product.id} and client {withdrawal_txn.client_id} before recalculation after withdrawal {withdrawal_txn.id}. "
                   f"Breakdown by transaction: {deleted_by_transaction}")
        
        # CRITICAL: Delete all pending positions directly using a fresh queryset
        # Recreate the queryset to ensure it's up-to-date and not cached
        delete_queryset = Position.objects.filter(
            product_id=product.id,
            client_id=withdrawal_txn.client_id,
            status='pending'
        )
        deleted_result = delete_queryset.delete()
        deleted_count = deleted_result[0] if isinstance(deleted_result, tuple) else deleted_result
        
        logger.info(f"Successfully deleted {deleted_count} pending positions (expected {total_pending_count}) "
                   f"for product {product.id} and client {withdrawal_txn.client_id} before recalculation")
        
        # Verify deletion
        remaining_count = Position.objects.filter(
            product_id=product.id,
            client_id=withdrawal_txn.client_id,
            status='pending'
        ).count()
        
        if remaining_count > 0:
            logger.error(f"ERROR: {remaining_count} pending positions still exist after deletion! "
                        f"Expected 0. Deleted {deleted_count} positions but {remaining_count} remain.")
        else:
            logger.info(f"Verification passed! All {deleted_count} pending positions were successfully deleted.")
    else:
        logger.info(f"No pending positions to delete for product {product.id} and client {withdrawal_txn.client_id}")
    
    # Find all investment transactions (transfer_to = product_id) for the same client and product
    # that are 'valide' and have positions
    investment_transactions = Transaction.objects.filter(
        client_id=withdrawal_txn.client_id,
        type='transfert',
        transfer_to=product.id,
        status__in=COMPLETED_TRANSACTION_STATUSES
    ).exclude(id=withdrawal_txn.id)  # Exclude the withdrawal transaction itself
    
    logger.info(f"Recalculating positions for {investment_transactions.count()} investment transactions "
                f"on product {product.id} after withdrawal transaction {withdrawal_txn.id}")
    
    # For each investment transaction, recalculate positions
    # This will use the updated capital (which now excludes the withdrawal)
    # Note: We already deleted all pending positions above, so delete_pending=False
    for inv_txn in investment_transactions:
        try:
            # Check all existing positions before recalculation
            # Note: All pending positions have already been deleted above for the entire product/client
            all_existing = Position.objects.filter(transaction_id=inv_txn.id)
            total_before = all_existing.count()
            pending_before = all_existing.filter(status='pending').count()
            open_before = all_existing.filter(status='open').count()
            done_before = all_existing.filter(status='done').count()
            
            logger.info(f"Before recalculation for investment transaction {inv_txn.id} after withdrawal {withdrawal_txn.id}: "
                       f"total={total_before}, pending={pending_before}, open={open_before}, done={done_before}")
            
            # Regenerate positions for this investment transaction
            # This will use the updated capital (reduced by the withdrawal)
            # delete_pending=False because we already deleted ALL pending positions above (for all transactions)
            create_positions_for_investment(inv_txn, trigger="withdrawal_recalculation", delete_pending=False)
            logger.info(f"Regenerated positions for investment transaction {inv_txn.id} after withdrawal")
        except Exception as e:
            logger.error(f"Failed to recalculate positions for investment transaction {inv_txn.id} "
                        f"after withdrawal {withdrawal_txn.id}: {str(e)}", exc_info=True)


@db_transaction.atomic
def create_interest_transaction_for_period_if_complete(
    txn: Transaction,
    period_index: int,
    *,
    trigger: str | None = None,
) -> Transaction | None:
    """
    Create an 'interets' transaction for a completed period if all positions of that period are 'done'
    and the product doesn't compound (capitalisation_fonds = False).
    
    This function is idempotent: it checks if an interest transaction already exists for this period
    before creating a new one.
    
    Args:
        txn: Investment transaction (transfert balance -> product)
        period_index: Period index to check (0-based)
        trigger: Optional trigger string for logging
    
    Returns:
        Created Transaction if created, None otherwise
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Verify this is an investment transaction
        if txn.type != 'transfert' or not txn.transfer_to or txn.transfer_to == 'balance':
            return None
        
        # Get the product
        product = txn.product
        if not product:
            try:
                product = Product.objects.get(id=txn.transfer_to)
            except Product.DoesNotExist:
                logger.warning(f"Cannot create interest transaction: product {txn.transfer_to} not found")
                return None
        
        # Only create interest transactions for non-compounding products
        if _product_compounds(product):
            return None
        
        # Get all positions for this transaction and period
        positions_in_period = Position.objects.filter(
            transaction_id=txn.id,
            period_index=period_index
        )

        period_summary: dict | None = None
        used_positions = positions_in_period.exists()
        if used_positions:
            # Check if all positions in this period are 'done'
            total_positions = positions_in_period.count()
            done_positions = positions_in_period.filter(status='done').count()

            if done_positions < total_positions:
                # Period not yet complete
                return None
        else:
            # Fallback path: no positions linked to this validated transfer.
            # We still create "interets" at period end using generated target profit.
            generated_periods = generate_rates_for_investment(txn)
            period_summary = next(
                (
                    p for p in generated_periods
                    if int(p.get("periodIndex", -1)) == int(period_index)
                ),
                None,
            )
            if not period_summary:
                return None

            period_end_raw = period_summary.get("endDate")
            if not period_end_raw:
                return None
            try:
                period_end_date = date.fromisoformat(str(period_end_raw))
            except Exception:
                return None

            # Only create interest once the period is fully elapsed.
            if period_end_date > timezone.localdate():
                return None

        # Check if an interest transaction already exists for this period (idempotent)
        # We identify it by checking for an 'interets' transaction with:
        # - same client
        # - same product
        # - description containing the period index and transaction reference
        period_ref = f"Période {period_index + 1}"
        existing_interest = Transaction.objects.filter(
            client=txn.client,
            type='interets',
            product=product,
            description__icontains=period_ref
        ).filter(
            # Also check that it references this transaction's period
            Q(description__icontains=f"transaction {txn.id}") |
            Q(description__icontains=f"txn {txn.id}") |
            # Or check by datetime proximity (within same period date range)
            Q(datetime__gte=txn.datetime)
        ).first()
        
        if existing_interest:
            logger.debug(f"Interest transaction already exists for transaction {txn.id}, period {period_index} (transaction {existing_interest.id})")
            return None
        
        # Calculate total profit for this period:
        # - from realized positions when available
        # - from generated targetProfit when no positions are linked to this transaction
        if used_positions:
            total_profit = positions_in_period.aggregate(
                total=Sum('profit_loss')
            )['total'] or Decimal('0')
        else:
            try:
                total_profit = Decimal(str((period_summary or {}).get('targetProfit', '0')))
            except Exception:
                total_profit = Decimal('0')
        
        if total_profit <= 0:
            # No profit to create interest transaction for
            return None
        
        # Get period date range for description
        if used_positions:
            period_positions = positions_in_period.order_by('period_date')
            first_date = period_positions.first().period_date if period_positions.exists() else None
            last_date = period_positions.last().period_date if period_positions.exists() else None
        else:
            first_raw = (period_summary or {}).get("startDate")
            last_raw = (period_summary or {}).get("endDate")
            try:
                first_date = date.fromisoformat(str(first_raw)) if first_raw else None
            except Exception:
                first_date = None
            try:
                last_date = date.fromisoformat(str(last_raw)) if last_raw else None
            except Exception:
                last_date = None
        
        # Create the interest transaction
        transaction_id = uuid.uuid4().hex[:12]
        while Transaction.objects.filter(id=transaction_id).exists():
            transaction_id = uuid.uuid4().hex[:12]
        
        # Build description with transaction reference for better idempotence checking
        product_name = product.name or f"Produit {product.id}"
        period_info = f"Période {period_index + 1}"
        if first_date and last_date:
            if first_date == last_date:
                period_info += f" ({first_date.strftime('%d/%m/%Y')})"
            else:
                period_info += f" ({first_date.strftime('%d/%m/%Y')} - {last_date.strftime('%d/%m/%Y')})"
        description = f"Intérêts {product_name} - {period_info} - Transaction {txn.id}"
        
        # Create the interest transaction
        interest_transaction = Transaction.objects.create(
            id=transaction_id,
            client=txn.client,
            type='interets',
            amount=total_profit,
            description=description,
            status='valide',  # Auto-completed since it's automatic
            datetime=timezone.now(),
            product=product,  # Link to the product for reference
        )
        
        logger.info(
            f"Created interest transaction {interest_transaction.id} for transaction {txn.id}, "
            f"period {period_index} (client {txn.client_id}, product {product.id}, amount {total_profit}, trigger: {trigger})"
        )
        
        return interest_transaction
        
    except Exception as e:
        logger.error(
            f"Failed to create interest transaction for transaction {txn.id}, period {period_index}: {e}",
            exc_info=True
        )
        return None

