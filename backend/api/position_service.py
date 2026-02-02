from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction
from django.utils import timezone

from .models import Product, Transaction, Position, ProductAssetAllocation, Log


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


def _add_months(d: date, months: int) -> date:
    # Keep it simple: normalize to 1st of month then add months.
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    return date(year, month, 1)


def _add_months_dt(dt: datetime, months: int) -> datetime:
    # Add months while keeping day-of-month when possible.
    year = dt.year + (dt.month - 1 + months) // 12
    month = (dt.month - 1 + months) % 12 + 1
    # Clamp day to last day of target month
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, last_day)
    return dt.replace(year=year, month=month, day=day)


def _period_months_from_profitability_period(period: str | None) -> int:
    if not period:
        return 1
    p = str(period).strip().lower()
    # End of contract / maturity (caller should replace with full duration months)
    if 'fin' in p and ('contrat' in p or 'matur' in p):
        return 0
    if 'mens' in p or p in {'month', 'mois'}:
        return 1
    if 'trim' in p or p in {'quarter', 'trimestre'}:
        return 3
    if 'sem' in p or p in {'semester', 'semestre'}:
        return 6
    if 'ann' in p or p in {'year', 'année', 'an'}:
        return 12
    # Fallback: try to parse number
    m = _DURATION_RE.search(p)
    if m:
        try:
            v = int(m.group(1))
            return v if v > 0 else 1
        except Exception:
            return 1
    return 1


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


def _distribute_pnl_total_capped(target_total: Decimal, amounts: list[Decimal]) -> list[Decimal]:
    """
    Distribute total P&L across positions, but cap each position's P&L
    to keep it "logical" relative to its amount.
    """
    n = len(amounts)
    if n == 0:
        return []
    target_total = target_total.quantize(Decimal('0.01'))
    if n == 1:
        cap = (amounts[0] * _pick_pnl_cap_pct()).quantize(Decimal('0.01'))
        v = max(-cap, min(cap, target_total))
        return [v]

    # Start with an unconstrained distribution
    parts = _distribute_pnl_total(target_total, amounts)

    # Apply per-position caps
    caps = [(a * _pick_pnl_cap_pct()).quantize(Decimal('0.01')) for a in amounts]
    parts = [max(-caps[i], min(caps[i], parts[i])).quantize(Decimal('0.01')) for i in range(n)]

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
) -> int:
    """
    Choose a total number of trades across the duration, but guarantee:
    - at least 1 trade per tradable day
    - at most max_per_day per day
    """
    if trading_days_count <= 0:
        return 0
    base = _choose_trade_count_for_duration(total_amount, duration_months)
    total = max(trading_days_count, base)
    total = min(total, trading_days_count * max_per_day)
    # Safety cap (still allows long durations)
    total = min(total, 5000)
    return total


def _build_day_targets(trading_days: list[date], total_trades: int, *, max_per_day: int, rng: random.Random) -> dict[date, int]:
    """
    Build per-day trade targets such that each day has >=1 and <= max_per_day.
    """
    if not trading_days:
        return {}
    total_trades = max(len(trading_days), total_trades)
    total_trades = min(total_trades, len(trading_days) * max_per_day)

    targets: dict[date, int] = {d: 1 for d in trading_days}
    remaining = total_trades - len(trading_days)
    if remaining <= 0:
        return targets

    # Distribute remaining trades randomly across days, capped per day.
    candidates = list(trading_days)
    while remaining > 0 and candidates:
        day = rng.choice(candidates)
        if targets[day] < max_per_day:
            targets[day] += 1
            remaining -= 1
        else:
            candidates = [d for d in candidates if targets[d] < max_per_day]
    return targets


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
        # duration <= 5h, but must fit before market close
        duration_minutes = rng.randint(5, 5 * 60)
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
    - at least 1 trade per tradable day (Mon-Fri)
    - market hours only
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

    desired_total = _choose_total_trades_with_min_per_day(
        total_amount=invested_total,
        duration_months=ctx.duration_months,
        trading_days_count=len(trading_days),
        max_per_day=max_per_day,
    )
    day_targets = _build_day_targets(trading_days, desired_total, max_per_day=max_per_day, rng=rng)

    existing_count_before = Position.objects.filter(transaction_id=ctx.transaction_id).count()
    existing_counts, max_idx = _existing_trade_counts(ctx.transaction_id)
    next_idx = max_idx + 1

    # Profitability config (rate unit is product.profitability_period)
    pm = _period_months_from_profitability_period(getattr(product, 'profitability_period', None) if product else None)
    profit_period_months = ctx.duration_months if pm == 0 else max(1, pm)
    does_compound = _product_compounds(product)

    market_open = time(9, 30)
    market_close = time(16, 0)

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
        step_months = min(profit_period_months, remaining_months)
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

            pnl_parts = _distribute_pnl_total_capped(profit_remaining, invested_amounts)
            created_profit_this_period = _safe_decimal_sum(pnl_parts).quantize(Decimal('0.01'))
            created_count_this_period = len(pnl_parts)

            for (day, slot), amt, pnl in zip(trade_specs, invested_amounts, pnl_parts):
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

                asset_obj = None
                if assets_weighted:
                    asset_rng = random.Random(f"{txn.id}:{period_idx}:{day.isoformat()}:{slot}:asset")
                    asset_obj = _weighted_choice_with_rng(assets_weighted, asset_rng)

                asset_currency = None
                fx_rate = None
                invested_amount_asset_currency = None
                if asset_obj is not None:
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

                created.append(
                    Position.objects.create(
                        id=position_id,
                        client_id=ctx.client_id,
                        product_id=ctx.product_id,
                        transaction_id=ctx.transaction_id,
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


def _extract_product_from_description(description: str) -> Product | None:
    """
    Best-effort inference used when admin edits a transaction but transfer_to/product
    isn't set. Matches frontend format: "Transfert de Balance Cash vers Nom (REF)".
    """
    if not description:
        return None
    m = re.search(r"Transfert de Balance Cash vers\s+([^(]+?)(?:\s*\(([^)]+)\))?", description, flags=re.IGNORECASE)
    if not m:
        return None
    name = (m.group(1) or '').strip()
    ref = (m.group(2) or '').strip() or None
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
    - Generate a random number of positions per day (market hours only).
    - Each position duration <= 5 hours.
    - Total P&L over the period should approximate product profitability (±10%).
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        return []

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
    if product is None:
        return None

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

    invested_amount = _to_decimal(txn.amount) or Decimal('0')

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
def create_positions_for_investment(txn: Transaction, *, trigger: str | None = None) -> list[Position]:
    """
    Create monthly positions for an investment transaction.

    - Safe to call multiple times: it will only create missing periods for this transaction.
    - Designed to be reused from a scheduler/management command.
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        return []

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

    market_open = time(9, 30)
    market_close = time(16, 0)
    tz = timezone.get_current_timezone()

    return _create_trade_positions_compounding(
        txn=txn,
        product=product,
        ctx=ctx,
        allocations=None,
        trigger=trigger,
    )

