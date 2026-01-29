from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction
from django.utils import timezone

from .models import Product, Transaction, Position, ProductAssetAllocation


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
def create_trade_positions_for_smart_portfolio_investment(txn: Transaction) -> list[Position]:
    """
    Generate trade-like positions for Smart Portfolio investment transactions.

    Rules (requested):
    - Link each generated position to an Asset linked to the Smart Portfolio (ProductAssetAllocation).
    - If product has no linked assets, do nothing.
    - Generate positions from txn start datetime until +period (Mensuel=1M, Trimestriel=3M, etc.).
    - Generate all positions in one run.
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

    # Idempotency: don't generate twice
    if Position.objects.filter(transaction_id=ctx.transaction_id, asset__isnull=False).exists():
        return []

    allocations = list(
        ProductAssetAllocation.objects.select_related('asset')
        .filter(product_id=product.id)
    )
    if not allocations:
        # No linked assets => do not generate positions
        return []

    # Determine time window
    start_dt = txn.datetime or timezone.now()
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())

    months = _period_months_from_profitability_period(product.profitability_period)
    end_dt = _add_months_dt(start_dt, months)

    # Profitability rate selection
    rate_min = _parse_decimal(product.profitability) or Decimal('0')
    rate = rate_min
    if (product.is_variable_profitability or '').lower() == 'oui':
        rate_max = _parse_decimal(product.variable_profitability)
        if rate_max is not None and rate_max > rate_min:
            # Choose a rate within the allowed range
            r = Decimal(str(random.uniform(float(rate_min), float(rate_max))))
            rate = r

    # Total P&L target (±10%)
    invested_total = ctx.invested_amount
    target_rate_low = rate * Decimal('0.90')
    target_rate_high = rate * Decimal('1.10')
    chosen_rate = Decimal(str(random.uniform(float(target_rate_low), float(target_rate_high))))
    target_pnl_total = (invested_total * chosen_rate / Decimal('100')).quantize(Decimal('0.01'))

    # Decide how many positions to create (fewer but larger for big tickets), enforce "no overlap"
    days = max(1, (end_dt.date() - start_dt.date()).days)
    window_minutes = max(1, int((end_dt - start_dt).total_seconds() // 60))
    desired = _choose_trade_count(invested_total, days, window_minutes)
    if desired <= 0:
        return []

    # Random invested amount per position (sum == txn amount, no reuse of capital)
    # alpha<1 => spiky: allows a few large trades (better for big tickets)
    invested_amounts = _split_amount_random(invested_total, desired, alpha=0.5)
    if not invested_amounts:
        return []

    # Distribute P&L to match target total while allowing wins/losses, but cap per-position P&L
    pnl_parts = _distribute_pnl_total_capped(target_pnl_total, invested_amounts)

    # Build positions skeletons with timestamps (sequential => never overlapping)
    assets_weighted: list[tuple[object, Decimal]] = [
        (a.asset, (a.proportion if a.proportion is not None else Decimal('0')))
        for a in allocations
    ]

    opened_closed: list[tuple[datetime, datetime, object]] = []
    cursor = start_dt
    for _ in range(len(invested_amounts)):
        # random idle gap between trades (0..6h)
        gap_minutes = random.randint(0, 6 * 60)
        opened_at = cursor + timedelta(minutes=gap_minutes)
        if opened_at >= end_dt:
            break

        # duration <= 5h
        duration_minutes = random.randint(5, 5 * 60)
        closed_at = opened_at + timedelta(minutes=duration_minutes)
        if closed_at > end_dt:
            closed_at = end_dt
        if closed_at <= opened_at:
            closed_at = opened_at + timedelta(minutes=5)
            if closed_at > end_dt:
                break

        asset = _weighted_choice(assets_weighted)
        opened_closed.append((opened_at, closed_at, asset))
        cursor = closed_at  # sequential: next trade starts after this one closes

    # If we couldn't fit all desired trades, trim amounts/pnl accordingly
    if not opened_closed:
        return []
    if len(opened_closed) != len(invested_amounts):
        # Re-split (sum == total) and re-distribute pnl to new count
        invested_amounts = _split_amount_random(invested_total, len(opened_closed), alpha=0.5)
        pnl_parts = _distribute_pnl_total_capped(target_pnl_total, invested_amounts)

    created: list[Position] = []
    for i, (opened_at, closed_at, asset) in enumerate(opened_closed):
        position_id = uuid.uuid4().hex[:12]
        while Position.objects.filter(id=position_id).exists():
            position_id = uuid.uuid4().hex[:12]

        created.append(
            Position.objects.create(
                id=position_id,
                client_id=ctx.client_id,
                product_id=product.id,
                transaction_id=ctx.transaction_id,
                asset_id=getattr(asset, 'id', asset),
                opened_at=opened_at,
                closed_at=closed_at,
                invested_amount=invested_amounts[i],
                profit_loss=pnl_parts[i],
                period_index=i,
                period_date=opened_at.date(),
                # Let the scheduler open/close it based on opened_at/closed_at.
                status='pending',
            )
        )

    return created


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
    duration_str = None
    if isinstance(txn.subscription_details, dict):
        duration_str = txn.subscription_details.get('duration')
    duration_str = duration_str or product.duration
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
def create_positions_for_investment(txn: Transaction) -> list[Position]:
    """
    Create monthly positions for an investment transaction.

    - Safe to call multiple times: it will only create missing periods for this transaction.
    - Designed to be reused from a scheduler/management command.
    """
    ctx = build_investment_context(txn)
    if ctx is None:
        return []

    # If Smart Portfolio: generate trade positions linked to allocated assets instead.
    # If no linked assets => do nothing (requested).
    product: Product | None = txn.product
    if product is None:
        try:
            product = Product.objects.get(id=ctx.product_id)
        except Product.DoesNotExist:
            product = None
    if product is not None and _is_smart_portfolio(product):
        # Generate trade-like Position rows linked to allocated assets.
        # If no linked assets => returns [] and does nothing.
        return create_trade_positions_for_smart_portfolio_investment(txn)

    created: list[Position] = []

    # Simple proration: split expected profit/total evenly by month if provided.
    monthly_profit = None
    monthly_total = None
    if ctx.total_expected_profit is not None:
        monthly_profit = (ctx.total_expected_profit / Decimal(ctx.duration_months)).quantize(Decimal('0.01'))
    if ctx.total_expected_amount is not None:
        monthly_total = (ctx.total_expected_amount / Decimal(ctx.duration_months)).quantize(Decimal('0.01'))

    for period_index in range(ctx.duration_months):
        if Position.objects.filter(transaction_id=ctx.transaction_id, period_index=period_index).exists():
            continue

        position_id = uuid.uuid4().hex[:12]
        while Position.objects.filter(id=position_id).exists():
            position_id = uuid.uuid4().hex[:12]

        position = Position.objects.create(
            id=position_id,
            client_id=ctx.client_id,
            product_id=ctx.product_id,
            transaction_id=ctx.transaction_id,
            period_index=period_index,
            period_date=_add_months(ctx.start_date, period_index),
            invested_amount=ctx.invested_amount,
            expected_profit=monthly_profit,
            expected_total=monthly_total,
            status='pending',
        )
        created.append(position)

    return created

