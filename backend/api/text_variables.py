"""
Runtime substitution of {{variable}} tokens in product description/CGV text.

Values are sourced from AppSettings (platform details in admin Paramètres).
Stored product text keeps placeholders; resolution happens at read/render time.
"""
from __future__ import annotations

import re
from typing import Any

from .models import AppSettings

APP_SETTINGS_ID = "settings001"

# Public catalog of allowed variable keys (v1).
PLATFORM_VARIABLE_KEYS: frozenset[str] = frozenset(
    {
        "platform_name",
        "address",
        "website",
        "email",
        "legal_form",
        "share_capital",
        "siren",
        "siret",
        "rcs",
        "vat_number",
        "publication_director",
        "hosting_provider",
        "dpo_contact",
        "consumer_mediator",
        "regulatory_mentions",
        "company_country",
    }
)

PRODUCT_TEXT_FIELDS: tuple[str, ...] = ("description", "cgv")

_COMPANY_COUNTRY_LABELS: dict[str, str] = {
    "FR": "France",
    "BE": "Belgique",
    "LU": "Luxembourg",
    "CH": "Suisse",
    "GR": "Grèce",
}

_VARIABLE_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def _company_country_label(code: str) -> str:
    normalized = (code or "").strip().upper()
    return _COMPANY_COUNTRY_LABELS.get(normalized, normalized)


def build_platform_variables_from_settings(settings: AppSettings | None) -> dict[str, str]:
    """Build the substitution map from an AppSettings instance."""
    if settings is None:
        return {key: "" for key in PLATFORM_VARIABLE_KEYS}

    return {
        "platform_name": (settings.platform_name or "").strip(),
        "address": (settings.address or "").strip(),
        "website": (settings.website or "").strip(),
        "email": (settings.email or "").strip(),
        "legal_form": (settings.legal_form or "").strip(),
        "share_capital": (settings.share_capital or "").strip(),
        "siren": (settings.siren or "").strip(),
        "siret": (settings.siret or "").strip(),
        "rcs": (settings.rcs or "").strip(),
        "vat_number": (settings.vat_number or "").strip(),
        "publication_director": (settings.publication_director or "").strip(),
        "hosting_provider": (settings.hosting_provider or "").strip(),
        "dpo_contact": (settings.dpo_contact or "").strip(),
        "consumer_mediator": (settings.consumer_mediator or "").strip(),
        "regulatory_mentions": (settings.regulatory_mentions or "").strip(),
        "company_country": _company_country_label(settings.company_country or ""),
    }


def get_platform_variables() -> dict[str, str]:
    """Load platform variables from the singleton AppSettings row."""
    try:
        settings = AppSettings.objects.get(id=APP_SETTINGS_ID)
    except AppSettings.DoesNotExist:
        settings = None
    return build_platform_variables_from_settings(settings)


def resolve_text_variables(text: str | None, variables: dict[str, str] | None = None) -> str:
    """
    Replace {{key}} tokens. Unknown keys are left unchanged.
    Empty setting values replace with an empty string.
    """
    if not text:
        return text or ""

    vars_map = variables if variables is not None else get_platform_variables()

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        if key not in PLATFORM_VARIABLE_KEYS:
            return match.group(0)
        return vars_map.get(key, "")

    return _VARIABLE_PATTERN.sub(_replace, text)


def apply_to_product_dict(
    data: dict[str, Any] | None,
    variables: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Resolve description/cgv on a serialized product dict (camelCase keys)."""
    if not data:
        return data or {}
    out = dict(data)
    vars_map = variables if variables is not None else get_platform_variables()
    for field in PRODUCT_TEXT_FIELDS:
        value = out.get(field)
        if isinstance(value, str) and value:
            out[field] = resolve_text_variables(value, vars_map)
    return out


def get_variable_catalog() -> list[dict[str, str]]:
    """Metadata for admin UI and API documentation."""
    labels = {
        "platform_name": "Nom de la plateforme",
        "address": "Adresse",
        "website": "Site web",
        "email": "Email",
        "legal_form": "Forme juridique",
        "share_capital": "Capital social / apports",
        "siren": "Identifiant d'entreprise (principal)",
        "siret": "N° d'établissement",
        "rcs": "Immatriculation registre du commerce",
        "vat_number": "Numéro de TVA",
        "publication_director": "Directeur de la publication",
        "hosting_provider": "Hébergeur",
        "dpo_contact": "Délégué à la protection des données",
        "consumer_mediator": "Médiateur consommateurs",
        "regulatory_mentions": "Mentions réglementaires",
        "company_country": "Pays d'établissement",
    }
    return [
        {
            "key": key,
            "token": f"{{{{{key}}}}}",
            "label": labels.get(key, key),
        }
        for key in sorted(PLATFORM_VARIABLE_KEYS)
    ]
