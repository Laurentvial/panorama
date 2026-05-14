import os
import hmac
import hashlib
from typing import Any, Optional
from urllib.parse import urlparse

import requests
from django.template.loader import render_to_string


RESEND_API_URL = "https://api.resend.com/emails"


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def get_frontend_public_url() -> str:
    """
    Base URL used in client-facing emails (password reset link).
    Prefer explicit env var(s); default to local dev.
    """
    # New preferred config: comma-separated public URLs.
    raw_urls = (os.getenv("FRONTEND_PUBLIC_URLS") or "").strip()
    if raw_urls:
        for part in raw_urls.split(","):
            value = (part or "").strip()
            if value:
                return value.rstrip("/")
    # Backward-compatible single value.
    value = (os.getenv("FRONTEND_PUBLIC_URL") or "").strip()
    if value:
        return value.rstrip("/")
    return "http://localhost:5173"


def _is_publicly_reachable_base(url: str) -> bool:
    """
    Basic guard for email links: avoid local/internal hosts.
    """
    value = (url or "").strip()
    if not value:
        return False
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").strip().lower()
    except Exception:
        return False
    if not host:
        return False
    if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        return False
    return True


def get_email_asset_base_url() -> str:
    """
    Resolve the public base URL used in email asset links.
    Prefer backend URL (direct), then frontend URL (when /api is proxied).
    """
    try:
        from django.conf import settings as django_settings

        backend_base = (getattr(django_settings, "BACKEND_PUBLIC_URL", "") or "").strip()
        if backend_base and _is_publicly_reachable_base(backend_base):
            return backend_base.rstrip("/")
    except Exception:
        pass

    frontend_base = get_frontend_public_url().rstrip("/")
    if _is_publicly_reachable_base(frontend_base):
        return frontend_base
    return ""


def get_platform_name() -> str:
    # Import lazily to avoid potential app-loading issues at import time.
    try:
        from .models import AppSettings

        settings_obj = AppSettings.objects.first()
        name = (getattr(settings_obj, "platform_name", "") or "").strip()
        return name or "Panorama"
    except Exception:
        return "Panorama"


def get_platform_logo_url() -> str:
    """
    Returns an absolute logo URL if configured in AppSettings.
    When S3/MinIO is configured, returns proxy URL (required for private bucket).
    """
    try:
        from django.conf import settings as django_settings
        from urllib.parse import quote

        from .models import AppSettings

        settings_obj = AppSettings.objects.first()
        if not settings_obj:
            return ""
        logo_field = getattr(settings_obj, "logo", None)
        if not logo_field:
            return ""
        if getattr(django_settings, "S3_CONFIGURED", False):
            # Use proxy URL so private MinIO bucket works (emails, PDFs, etc.)
            path = getattr(logo_field, "name", None) or ""
            if path:
                base = get_email_asset_base_url()
                if base:
                    proxy_path = quote(path, safe="/")
                    return f"{base}/api/media/{proxy_path}/"
        logo_url = getattr(logo_field, "url", "") or ""
        logo_url = str(logo_url).strip()
        if logo_url.startswith("/"):
            base = get_email_asset_base_url()
            if base:
                return f"{base}{logo_url}"
        return logo_url
    except Exception:
        return ""


def _format_resend_from(sender_email: str, display_name: str) -> str:
    """
    Resend supports: "Name <email@domain.com>".
    If the env var already contains a display name, keep it.
    """
    sender_email = (sender_email or "").strip()
    if not sender_email:
        return ""
    # Already formatted.
    if "<" in sender_email and ">" in sender_email:
        return sender_email
    if "@" not in sender_email:
        return sender_email

    display_name = (display_name or "").strip()
    if not display_name:
        return sender_email
    # Quote to be safe with punctuation.
    safe_name = display_name.replace('"', "'")
    return f"\"{safe_name}\" <{sender_email}>"


def render_email(template_name: str, context: dict[str, Any]) -> str:
    return render_to_string(template_name, context)


def send_resend_email(
    *,
    to_email: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
    from_email: Optional[str] = None,
) -> dict[str, Any]:
    """
    Send an email through Resend.

    Env vars:
    - RESEND_API_KEY (required)
    - RESEND_FROM_EMAIL (recommended)
    """
    api_key = _require_env("RESEND_API_KEY")
    sender = (from_email or os.getenv("RESEND_FROM_EMAIL") or "").strip()
    if not sender:
        # Keep a safe default for local dev; production should set RESEND_FROM_EMAIL.
        sender = "onboarding@resend.dev"
    # Use platform name as display name (avoid "service" when sender is service@domain).
    sender = _format_resend_from(sender, get_platform_name())

    payload: dict[str, Any] = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    resp = requests.post(
        RESEND_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Resend send failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json()


def otp_hmac(*, otp_id: str, code: str, secret: str) -> str:
    """
    Stateless OTP check:
    - We do NOT store the OTP server-side.
    - We return a signed challenge token that includes otp_id + expected HMAC.
    - The OTP itself is only sent by email.
    """
    msg = f"{otp_id}:{code}".encode("utf-8")
    key = secret.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()

