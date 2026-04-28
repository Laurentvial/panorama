"""
Per-client product overlays: allowlisted keys stored on ClientProduct.overrides (JSON),
merged at read time with the base Product. Keeps a single Product row in the catalog.
"""
from __future__ import annotations

import copy
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils.dateparse import parse_date, parse_datetime

# camelCase keys accepted in API / stored JSON; values merge onto ProductSerializer output.
# Maps to Product model field names (snake_case) for in-memory product copies used by contract PDF, etc.
OVERRIDABLE_TO_MODEL: dict[str, str] = {
    "name": "name",
    "reference": "reference",
    "type": "type",
    "subcategory": "subcategory",
    "status": "status",
    "profitability": "profitability",
    "duration": "duration",
    "description": "description",
    "cgv": "cgv",
    "noProfitability": "no_profitability",
    "isVariableProfitability": "is_variable_profitability",
    "variableProfitability": "variable_profitability",
    "profitabilityPeriod": "profitability_period",
    "interestPeriod": "interest_period",
    "availabilityStart": "availability_start",
    "availabilityEnd": "availability_end",
    "linkToAssets": "link_to_assets",
    "minEntryValue": "min_entry_value",
    "maxEntryValue": "max_entry_value",
    "availableFunds": "available_funds",
}


def allowlisted_override_keys() -> frozenset[str]:
    return frozenset(OVERRIDABLE_TO_MODEL.keys())


def _parse_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in ("oui", "true", "1", "yes")


def _parse_decimal(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _parse_date_value(v: Any) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    s = str(v).strip()
    d = parse_date(s[:10]) if len(s) >= 10 else None
    if d:
        return d
    dt = parse_datetime(s)
    return dt.date() if dt else None


def normalize_overrides_incoming(
    raw: Any,
) -> tuple[dict[str, Any] | None, str | None]:
    """
    Validate and normalize overrides from a write request.
    Returns (clean_dict, error_message). clean_dict is None if input was None (clear all).
    """
    if raw is None:
        return (None, None)  # caller: treat as clear
    if raw == "":
        return ({}, None)
    if not isinstance(raw, dict):
        return (None, "overrides must be a JSON object")
    unknown = [k for k in raw if k not in OVERRIDABLE_TO_MODEL]
    if unknown:
        return (None, f"Unknown override keys: {', '.join(sorted(unknown)[:20])}")
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if v is None:
            continue
        if k in ("minEntryValue", "maxEntryValue", "profitability"):
            dec = _parse_decimal(v)
            if v not in (None, "") and dec is None:
                return (None, f"Invalid number for {k}")
            # JSONField–safe (no Decimal in stored JSON)
            out[k] = float(dec) if dec is not None else None
        elif k in ("noProfitability", "availableFunds"):
            out[k] = _parse_bool(v)
        elif k in ("availabilityStart", "availabilityEnd"):
            if v in (None, ""):
                continue
            d = _parse_date_value(v)
            if d is None:
                return (None, f"Invalid date for {k}")
            out[k] = d.isoformat()  # JSON-safe
        elif k in (
            "name",
            "reference",
            "type",
            "subcategory",
            "status",
            "duration",
            "description",
            "cgv",
            "isVariableProfitability",
            "variableProfitability",
            "profitabilityPeriod",
            "interestPeriod",
            "linkToAssets",
        ):
            if isinstance(v, str):
                out[k] = v
            else:
                out[k] = str(v) if v is not None else ""
        else:
            out[k] = v
    return (out, None)


def _coerce_value_for_serialized_key(key: str, value: Any) -> Any:
    """Merge value into ProductSerializer.to_representation output (camelCase)."""
    if key in ("minEntryValue", "maxEntryValue", "profitability"):
        if value is None or value == "":
            return None
        d = _parse_decimal(value)
        return float(d) if d is not None else None
    if key in ("noProfitability", "availableFunds"):
        return _parse_bool(value) if not isinstance(value, bool) else value
    if key in ("availabilityStart", "availabilityEnd"):
        if value is None or value == "":
            return None
        if isinstance(value, (date, datetime)):
            return value.isoformat() if hasattr(value, "isoformat") else value
        d = _parse_date_value(value)
        # Never leak unparseable date strings into API payloads.
        return d.isoformat() if d else None
    return value


def merge_serialized_product_with_overrides(
    base: dict[str, Any],
    overrides: dict[str, Any] | None,
) -> dict[str, Any]:
    """Shallow merge: only keys present in `overrides` replace base (both camelCase)."""
    if not overrides:
        return dict(base)
    out = dict(base)
    for k, v in overrides.items():
        if k not in OVERRIDABLE_TO_MODEL:
            continue
        if v is None or v == "":
            continue
        out[k] = _coerce_value_for_serialized_key(k, v)
    return out


def _model_value_from_override_key(key: str, value: Any) -> Any:
    field = OVERRIDABLE_TO_MODEL.get(key)
    if not field:
        return None
    if key in ("minEntryValue", "maxEntryValue", "profitability"):
        return _parse_decimal(value) if value not in (None, "") else None
    if key in ("noProfitability", "availableFunds"):
        return _parse_bool(value)
    if key in ("availabilityStart", "availabilityEnd"):
        return _parse_date_value(value)
    if isinstance(value, str):
        return value
    if value is None:
        return None
    return str(value)


def apply_overrides_to_product_copy(base_product, overrides: dict | None):
    """
    Shallow copy of a Product model instance with overriden fields for read-only / PDF / calc.
    Does not save. Returns base_product if overrides empty.
    """
    if not base_product or not overrides:
        return base_product
    p = copy.copy(base_product)
    for k, v in overrides.items():
        if k not in OVERRIDABLE_TO_MODEL:
            continue
        if v is None or v == "":
            continue
        field = OVERRIDABLE_TO_MODEL[k]
        mv = _model_value_from_override_key(k, v)
        if mv is None and v not in (None, ""):
            continue
        try:
            setattr(p, field, mv)
        except (TypeError, ValueError):
            pass
    return p


def effective_product_for_client(client, product):
    """
    If client has a ClientProduct with non-empty overrides, return a shallow-copied Product
    with those fields set; else return product.
    """
    if not client or not product:
        return product
    from .models import ClientProduct

    try:
        cp = ClientProduct.objects.get(client=client, product=product)
    except ClientProduct.DoesNotExist:
        return product
    if not (cp.overrides and isinstance(cp.overrides, dict)):
        return product
    return apply_overrides_to_product_copy(product, cp.overrides)
