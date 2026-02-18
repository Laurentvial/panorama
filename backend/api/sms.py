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
    Provider base URL may be provided without scheme.
    Accept:
      - https://api.prelude.dev
      - http://api.prelude.dev
      - api.prelude.dev
    """
    raw = (raw or "").strip()
    if not raw:
        return raw
    # If the user provided no scheme, default to https.
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise RuntimeError(f"Invalid PRELUDE_BASE_URL: {raw}")
    return raw.rstrip("/")


def _normalize_phone_e164(raw_phone: str) -> str:
    to_phone = (raw_phone or "").strip()
    if not to_phone:
        raise RuntimeError("Missing destination phone number")
    if to_phone.startswith("00"):
        to_phone = "+" + to_phone[2:]
    if to_phone.startswith("+"):
        to_phone = "+" + re.sub(r"\D", "", to_phone)
    else:
        digits = re.sub(r"\D", "", to_phone)
        to_phone = f"+{digits}" if digits else ""
    if len(to_phone) < 8:
        raise RuntimeError("Invalid destination phone number")
    return to_phone


def _prelude_auth_header() -> dict[str, str]:
    api_key = (os.getenv("PRELUDE_API_KEY") or os.getenv("INFOBIP_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("Missing required env var: PRELUDE_API_KEY")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _get_prelude_base_url() -> str:
    raw_base = (os.getenv("PRELUDE_BASE_URL") or "").strip()
    if not raw_base:
        raw_base = "https://api.prelude.dev"
    return _normalize_base_url(raw_base)


def create_prelude_verification(*, to_phone: str, locale: str | None = None) -> dict[str, Any]:
    """
    Start or retry an OTP verification through Prelude Verify API.

    Env vars:
    - PRELUDE_VERIFY_TEMPLATE_ID / PRELUDE_TEMPLATE_ID (optional)
    - PRELUDE_SENDER / INFOBIP_SENDER (optional): sender ID for SMS; must be whitelisted by Prelude.
    """
    base_url = _get_prelude_base_url()
    normalized_phone = _normalize_phone_e164(to_phone)
    verify_template_id = (os.getenv("PRELUDE_VERIFY_TEMPLATE_ID") or os.getenv("PRELUDE_TEMPLATE_ID") or "").strip()
    sender_id = (os.getenv("PRELUDE_SENDER") or os.getenv("INFOBIP_SENDER") or "").strip()

    options: dict[str, Any] = {
        "method": "message",
        "preferred_channel": "sms",
    }
    if verify_template_id:
        options["template_id"] = verify_template_id
    if locale:
        options["locale"] = locale
    if sender_id:
        options["sender_id"] = sender_id

    payload: dict[str, Any] = {
        "target": {"type": "phone_number", "value": normalized_phone},
        "options": options,
    }

    resp = requests.post(
        f"{base_url}/v2/verification",
        headers=_prelude_auth_header(),
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 300:
        err = resp.text[:500]
        try:
            data = resp.json()
            code = data.get("code")
            message = data.get("message")
            if code or message:
                err = f"{code or 'error'}: {message or err}"
        except Exception:
            pass
        raise RuntimeError(f"Prelude verify create failed ({resp.status_code}): {err}")
    return resp.json()


def check_prelude_verification(*, to_phone: str, code: str) -> dict[str, Any]:
    """
    Check OTP code validity through Prelude Verify API.
    """
    base_url = _get_prelude_base_url()
    normalized_phone = _normalize_phone_e164(to_phone)
    otp_code = (code or "").strip()
    if not otp_code:
        raise RuntimeError("Missing verification code")

    payload: dict[str, Any] = {
        "target": {"type": "phone_number", "value": normalized_phone},
        "code": otp_code,
    }

    resp = requests.post(
        f"{base_url}/v2/verification/check",
        headers=_prelude_auth_header(),
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 300:
        err = resp.text[:500]
        try:
            data = resp.json()
            code_val = data.get("code")
            message = data.get("message")
            if code_val or message:
                err = f"{code_val or 'error'}: {message or err}"
        except Exception:
            pass
        raise RuntimeError(f"Prelude verify check failed ({resp.status_code}): {err}")
    return resp.json()


def send_infobip_sms(*, to_phone: str, text: str) -> dict[str, Any]:
    """
    Backward-compatible function name that now sends SMS through Prelude Notify API.

    Env vars:
    - PRELUDE_BASE_URL (optional, defaults to https://api.prelude.dev)
    - PRELUDE_API_KEY (required, fallback: INFOBIP_API_KEY)
    - PRELUDE_TEMPLATE_ID (required)
    - PRELUDE_SENDER (optional, fallback: INFOBIP_SENDER)
    """
    base_url = _get_prelude_base_url()
    template_id = _require_env("PRELUDE_TEMPLATE_ID")
    sender = (os.getenv("PRELUDE_SENDER") or os.getenv("INFOBIP_SENDER") or "").strip()

    to_phone = _normalize_phone_e164(to_phone)

    # Prelude Notify endpoint
    url = f"{base_url}/v2/notify"
    payload: dict[str, Any] = {
        "to": to_phone,
        "template_id": template_id,
        "preferred_channel": "sms",
        # Keep compatibility with existing plain-text OTP flow by passing the generated
        # message as a single variable. The linked Prelude template should include {{message}}.
        "variables": {"message": text},
    }
    if sender:
        payload["from"] = sender

    resp = requests.post(
        url,
        headers=_prelude_auth_header(),
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 300:
        err = resp.text[:500]
        try:
            data = resp.json()
            code = data.get("code")
            message = data.get("message")
            if code or message:
                err = f"{code or 'error'}: {message or err}"
        except Exception:
            pass
        raise RuntimeError(f"Prelude send failed ({resp.status_code}): {err}")

    data = resp.json()
    message_id = data.get("id")
    # Keep backward-compatible shape expected by OTP endpoint logging code.
    return {
        "id": message_id,
        "to": data.get("to"),
        "provider": "prelude",
        "raw": data,
        "messages": [
            {
                "messageId": message_id,
                "status": {
                    "groupName": "ACCEPTED",
                    "name": "ACCEPTED",
                    "description": "Accepted by Prelude",
                },
            }
        ],
    }


def get_infobip_sms_reports(*, message_id: str) -> dict[str, Any]:
    """
    Backward-compatible function name.
    Prelude delivery state is typically handled through webhooks, so this is a no-op
    compatible response for existing call sites.
    """
    message_id = (message_id or "").strip()
    if not message_id:
        raise RuntimeError("Missing message_id")
    return {"results": []}

