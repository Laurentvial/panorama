from __future__ import annotations

import os
from typing import Optional, Tuple

from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone

from api.alpha_vantage_service import (
    get_alpha_vantage_service,
    get_crypto_quote_alpha_vantage,
    get_oanda_candles_finnhub,
    get_oanda_quote_finnhub,
    get_stock_quote_with_fallback,
    FINNHUB_API_KEY,
    FMP_API_KEY,
)
from api.models import Asset, ProductAssetAllocation


def _update_one_asset_price(asset: Asset, av_service) -> Tuple[bool, Optional[str]]:
    """
    Best-effort price refresh for one Asset.
    Returns (updated, error_message).
    """
    if not asset.alpha_vantage_symbol:
        return False, "missing alpha_vantage_symbol"

    symbol_upper = (asset.alpha_vantage_symbol or "").strip().upper()
    asset_type = (asset.type or "").strip().lower()

    try:
        # Crypto: Alpha Vantage
        if asset_type == "crypto":
            quote = get_crypto_quote_alpha_vantage(symbol_upper)
            if not quote:
                return False, "crypto quote not found / rate limited"

            asset.last_price = quote["price"]
            asset.last_price_update = timezone.now()
            asset.price_change = quote.get("change")
            cp = quote.get("change_percent")
            asset.price_change_percent = float(cp) if cp not in (None, "",) else None
            asset.save(update_fields=["last_price", "last_price_update", "price_change", "price_change_percent"])
            return True, None

        # FX / metals (or explicit FOREX exchange): Finnhub OANDA endpoints
        if symbol_upper in ["XAU", "XAG"] or (asset.exchange or "").strip().upper() == "FOREX":
            to_ccy = (asset.currency or "USD").strip().upper() or "USD"

            fx_quote = get_oanda_quote_finnhub(symbol_upper, to_ccy)
            if (not fx_quote or not fx_quote.get("exchange_rate")) and to_ccy != "USD":
                metal_usd = get_oanda_quote_finnhub(symbol_upper, "USD")
                usd_to = get_oanda_quote_finnhub("USD", to_ccy)
                if (
                    metal_usd
                    and usd_to
                    and metal_usd.get("exchange_rate")
                    and usd_to.get("exchange_rate")
                ):
                    fx_quote = {"exchange_rate": float(metal_usd["exchange_rate"]) * float(usd_to["exchange_rate"])}

            if not fx_quote or not fx_quote.get("exchange_rate"):
                return False, f"fx quote {symbol_upper}/{to_ccy} not found / rate limited"

            asset.last_price = fx_quote["exchange_rate"]
            asset.last_price_update = timezone.now()

            # Best-effort change from last 2 daily closes (same as your API view)
            fx_daily = get_oanda_candles_finnhub(symbol_upper, to_ccy, resolution="D", days=30)
            if not fx_daily and to_ccy != "USD":
                metal_usd = get_oanda_candles_finnhub(symbol_upper, "USD", resolution="D", days=30)
                usd_to = get_oanda_candles_finnhub("USD", to_ccy, resolution="D", days=30)
                if metal_usd and usd_to:
                    usd_to_by_date = {p["date"]: p for p in (usd_to.get("data") or []) if p.get("date")}
                    out = []
                    for p in (metal_usd.get("data") or []):
                        d = p.get("date")
                        fx = usd_to_by_date.get(d)
                        if not d or not fx:
                            continue
                        out.append(
                            {
                                "date": d,
                                "close": float(p.get("close", 0) or 0) * float(fx.get("close", 0) or 0),
                            }
                        )
                    out.sort(key=lambda x: x["date"])
                    fx_daily = {"data": out}

            try:
                series = (fx_daily or {}).get("data") or []
                if len(series) >= 2:
                    prev_close = float(series[-2]["close"])
                    last_close = float(series[-1]["close"])
                    delta = last_close - prev_close
                    asset.price_change = delta
                    asset.price_change_percent = (delta / prev_close * 100) if prev_close else None
            except Exception:
                # Don't fail the whole refresh on change calc issues
                pass

            asset.save(update_fields=["last_price", "last_price_update", "price_change", "price_change_percent"])
            return True, None

        # Stocks / ETFs: tries FMP, Finnhub, Alpha Vantage, and symbol variants (e.g. HAG.DE->HAG.DEX)
        # Check API config first so we give a clear error when no provider is configured
        if not FMP_API_KEY and not FINNHUB_API_KEY and not av_service:
            return False, "FMP_API_KEY, FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis"
        quote = get_stock_quote_with_fallback(symbol_upper)
        if not quote:
            return False, "quote not found"

        new_price = quote["price"]
        old_price = asset.last_price
        
        # Log price change for debugging
        if old_price is not None and float(old_price) != float(new_price):
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Price changed for {symbol_upper}: {old_price} -> {new_price}")

        asset.last_price = new_price
        asset.last_price_update = timezone.now()
        asset.price_change = quote.get("change")
        cp = quote.get("change_percent")
        asset.price_change_percent = float(cp) if cp not in (None, "",) else None
        asset.save(update_fields=["last_price", "last_price_update", "price_change", "price_change_percent"])
        return True, None

    except Exception as e:
        return False, str(e)


class Command(BaseCommand):
    help = "Refresh prices for external assets (assets used by products by default)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--scope",
            choices=["product-assets", "all"],
            default="product-assets",
            help="Which assets to refresh. 'product-assets' = only assets linked to products. 'all' = all assets with symbols.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=int(os.getenv("PRICE_REFRESH_LIMIT", "20")),
            help="Max number of assets to refresh per run (default: PRICE_REFRESH_LIMIT or 20).",
        )
        parser.add_argument(
            "--min-age-seconds",
            type=int,
            default=int(os.getenv("PRICE_REFRESH_MIN_AGE_SECONDS", "240")),
            help="Skip assets updated more recently than this many seconds (default: 240).",
        )

    def handle(self, *args, **options):
        scope = options["scope"]
        limit = max(int(options["limit"]), 1)
        min_age_seconds = max(int(options["min_age_seconds"]), 0)

        now = timezone.now()
        cutoff = now - timezone.timedelta(seconds=min_age_seconds)

        qs = Asset.objects.filter(alpha_vantage_symbol__isnull=False).exclude(alpha_vantage_symbol="")

        if scope == "product-assets":
            product_asset_ids = ProductAssetAllocation.objects.values_list("asset_id", flat=True).distinct()
            qs = qs.filter(id__in=product_asset_ids)

        # Debug: show all assets before filtering
        all_assets_before_filter = qs.count()
        self.stdout.write(f"Assets with symbols (before age filter): {all_assets_before_filter}")
        
        qs = qs.filter(models.Q(last_price_update__isnull=True) | models.Q(last_price_update__lt=cutoff))
        total_eligible = qs.count()
        
        # Debug: show some examples
        if total_eligible > 0:
            sample_assets = list(qs[:5])
            self.stdout.write(f"Sample eligible assets:")
            for a in sample_assets:
                self.stdout.write(f"  - {a.id} {a.alpha_vantage_symbol}: last_update={a.last_price_update}, price={a.last_price}")
        else:
            # Show why assets are not eligible
            sample_all = Asset.objects.filter(
                alpha_vantage_symbol__isnull=False
            ).exclude(alpha_vantage_symbol="")
            if scope == "product-assets":
                product_asset_ids = ProductAssetAllocation.objects.values_list("asset_id", flat=True).distinct()
                sample_all = sample_all.filter(id__in=product_asset_ids)
            sample_all = list(sample_all[:5])
            self.stdout.write(f"Sample assets (not eligible - too recent):")
            for a in sample_all:
                age_seconds = (now - a.last_price_update).total_seconds() if a.last_price_update else None
                self.stdout.write(
                    f"  - {a.id} {a.alpha_vantage_symbol}: "
                    f"last_update={a.last_price_update}, "
                    f"age_seconds={age_seconds:.1f if age_seconds else 'None'}, "
                    f"cutoff={cutoff}, "
                    f"needs_update={age_seconds is None or (age_seconds is not None and age_seconds >= min_age_seconds)}"
                )
        
        qs = qs.order_by(models.F("last_price_update").asc(nulls_first=True), "id")[:limit]

        av_service = get_alpha_vantage_service()

        updated = 0
        errors = 0

        self.stdout.write(
            f"Refreshing asset prices (scope={scope}, limit={limit}, min_age_seconds={min_age_seconds})..."
        )
        self.stdout.write(f"Found {total_eligible} assets eligible for update (cutoff: {cutoff})")

        for asset in qs:
            old_price = asset.last_price
            old_update = asset.last_price_update
            ok, err = _update_one_asset_price(asset, av_service)
            if ok:
                # Refresh from DB to get actual saved values
                asset.refresh_from_db()
                new_price = asset.last_price
                new_update = asset.last_price_update
                updated += 1
                price_changed = old_price != new_price
                price_status = "CHANGED" if price_changed else "SAME"
                self.stdout.write(
                    f"[OK] {asset.id} {asset.alpha_vantage_symbol}: "
                    f"price {old_price} -> {new_price} ({price_status}), "
                    f"updated {old_update} -> {new_update}"
                )
            else:
                errors += 1
                self.stdout.write(f"[ERROR] {asset.id} {asset.alpha_vantage_symbol}: {err}")

        self.stdout.write(f"Done. Updated={updated}, Errors={errors}, TotalConsidered={qs.count()}")

