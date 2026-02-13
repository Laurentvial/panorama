import os
from typing import Any

import requests
from urllib.parse import urlparse
import re


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _normalize_base_url(raw: str) -> str:
    """
    Infobip base URL is often provided without scheme in dashboards.
    Accept:
      - https://xxxx.api.infobip.com
      - http://xxxx.api.infobip.com
      - xxxx.api.infobip.com
    """
    raw = (raw or "").strip()
    if not raw:
        return raw
    # If the user provided no scheme, default to https.
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise RuntimeError(f"Invalid INFOBIP_BASE_URL: {raw}")
    return raw.rstrip("/")


def send_infobip_sms(*, to_phone: str, text: str) -> dict[str, Any]:
    """
    Send an SMS through Infobip.

    Env vars:
    - INFOBIP_BASE_URL (required) e.g. https://xxxx.api.infobip.com
    - INFOBIP_API_KEY (required)
    - INFOBIP_SENDER (required) sender ID / from
    """
    base_url = _normalize_base_url(_require_env("INFOBIP_BASE_URL"))
    api_key = _require_env("INFOBIP_API_KEY")
    sender = _require_env("INFOBIP_SENDER")

    to_phone = (to_phone or "").strip()
    if not to_phone:
        raise RuntimeError("Missing destination phone number")
    # Infobip commonly expects E.164 digits without "+".
    to_phone = re.sub(r"\D", "", to_phone)
    if not to_phone:
        raise RuntimeError("Invalid destination phone number")

    # Infobip SMS Advanced endpoint
    url = f"{base_url}/sms/2/text/advanced"
    payload: dict[str, Any] = {
        "messages": [
            {
                "from": sender,
                "destinations": [{"to": to_phone}],
                "text": text,
            }
        ]
    }

    resp = requests.post(
        url,
        headers={
            "Authorization": f"App {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Infobip send failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json()


def get_infobip_sms_reports(*, message_id: str) -> dict[str, Any]:
    """
    Fetch delivery reports for a given Infobip messageId.

    Endpoint (per Infobip docs): GET /sms/1/reports?messageId=...
    """
    base_url = _normalize_base_url(_require_env("INFOBIP_BASE_URL"))
    api_key = _require_env("INFOBIP_API_KEY")
    message_id = (message_id or "").strip()
    if not message_id:
        raise RuntimeError("Missing message_id")

    url = f"{base_url}/sms/1/reports"
    resp = requests.get(
        url,
        headers={
            "Authorization": f"App {api_key}",
            "Accept": "application/json",
        },
        params={"messageId": message_id},
        timeout=20,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Infobip reports failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json()

