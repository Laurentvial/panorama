from django.shortcuts import render
from django.contrib.auth.models import User as DjangoUser
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework import generics, status
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework.response import Response
from .models import Client
from .models import ReferralProspect
from .models import ClientSuccessor
from .models import ClientConversation
from .models import ClientChatMessage
from .models import Note
from .models import UserDetails
from .models import Team
from .models import TeamMember
from .models import Log, ClientPlatformLog
from .models import Asset
from .models import ClientAsset
from .models import RIB
from .models import ClientRIB
from .models import UsefulLink
from .models import ClientUsefulLink
from .models import Transaction
from .models import ProductCategory
from .models import Product
from .models import ProductAssetAllocation
from .models import ClientProduct
from .models import Position, PositionDeletionRecord
from .models import AppSettings
from .models import NewsPost
from .models import ClientVerificationConfig
from .models import ClientDocument
from .models import AppNotification
from .client_product_overrides import effective_product_for_client, merge_serialized_product_with_overrides
from .serializer import (
    UserSerializer, ClientSerializer, NoteSerializer,
    TeamSerializer, TeamDetailSerializer, UserDetailsSerializer, TeamMemberSerializer,
    AssetSerializer, ClientAssetSerializer, RIBSerializer, ClientRIBSerializer, UsefulLinkSerializer, ClientUsefulLinkSerializer,
    ReferralProspectCreateSerializer,
    TransactionSerializer, ProductCategorySerializer, ProductSerializer, ClientProductSerializer, PositionSerializer, AppSettingsSerializer, NewsPostSerializer, LogSerializer, PositionDeletionRecordSerializer,
    ClientChatMessageSerializer, ClientConversationSerializer, ClientVerificationConfigSerializer, ClientDocumentSerializer,
    ClientSuccessorSerializer,
    ClientHistoryLogSerializer, ClientPlatformLogSerializer,
    AppNotificationSerializer,
)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import api_view, permission_classes, authentication_classes, parser_classes
from rest_framework.authentication import SessionAuthentication
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
import uuid
import json
import os
import hmac
import re
import calendar
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta
from django.utils import timezone
from django.core import signing
from django.db.models import Count, Q, F
from django.db import IntegrityError
from django.db import connection
from django.db import transaction as db_transaction
from django.core.exceptions import ObjectDoesNotExist
from urllib.parse import quote
import secrets
import logging

logger = logging.getLogger(__name__)

PLATFORM_LOG_ORIGIN_CLIENT_LOGIN = 'client_login'
PLATFORM_LOG_ORIGIN_OTP_LOGIN = 'otp_login'
PLATFORM_LOG_ORIGIN_CRM_IMPERSONATION = 'crm_impersonation'
PLATFORM_LOG_ORIGIN_UNKNOWN = 'unknown'

ALLOWED_PLATFORM_LOG_ORIGINS = {
    PLATFORM_LOG_ORIGIN_CLIENT_LOGIN,
    PLATFORM_LOG_ORIGIN_OTP_LOGIN,
    PLATFORM_LOG_ORIGIN_CRM_IMPERSONATION,
    PLATFORM_LOG_ORIGIN_UNKNOWN,
}

from .emailing import (
    send_resend_email,
    render_email,
    get_frontend_public_url,
    get_platform_name,
    get_platform_logo_url,
    otp_hmac,
)
from .sms import create_prelude_verification, check_prelude_verification
from .alpha_vantage_service import get_alpha_vantage_service
from .position_service import (
    GENERATION_HORIZON_MAX_DAYS,
    GENERATION_HORIZON_MIN_DAYS,
    create_positions_for_investment,
    generate_rates_for_investment,
    generate_positions_with_rates,
    save_generated_positions,
    save_position_generation_history,
    recalculate_positions_for_product_withdrawal,
    calculate_withdrawal_recalculation_metadata,
    sync_position_statuses_from_schedule,
)

COMPLETED_TRANSACTION_STATUSES = ('valide',)

# Étapes 3–5 (profil, préférences, objectifs) activées par défaut ; 6–7 (conformité, sources) désactivées.
DEFAULT_CLIENT_VERIFICATION_STEPS_CONFIG = {
    'step_3': {'enabled': True},
    'step_4': {'enabled': True},
    'step_5': {'enabled': True},
    'step_6': {'enabled': False},
    'step_7': {'enabled': False},
}


def _parse_generation_horizon_days_from_request(request_data) -> tuple[int | None, Response | None]:
    """
    Optional generation_horizon_days for products without explicit contract duration.
    Returns (value_or_none, error_response_or_none).
    """
    raw = request_data.get('generation_horizon_days')
    if raw is None or raw == '':
        return None, None
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return None, Response(
            {'error': 'generation_horizon_days doit être un nombre entier'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if v < GENERATION_HORIZON_MIN_DAYS or v > GENERATION_HORIZON_MAX_DAYS:
        return None, Response(
            {
                'error': (
                    f'generation_horizon_days doit être entre '
                    f'{GENERATION_HORIZON_MIN_DAYS} et {GENERATION_HORIZON_MAX_DAYS}'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return v, None


class SafeTokenRefreshView(TokenRefreshView):
    """
    Token refresh view that returns 401 instead of 500 when the user
    referenced by the refresh token no longer exists (e.g. deleted user).
    """

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except ObjectDoesNotExist:
            return Response(
                {"detail": "Token is invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )


def get_client_ip(request):
    """Extract client IP address from request, checking multiple headers"""
    # Check various headers that might contain the real client IP
    # X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2)
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        # Get the first IP (original client) and strip whitespace
        ip = x_forwarded_for.split(',')[0].strip()
        if ip:
            return ip
    
    # Check X-Real-IP header (used by some proxies)
    x_real_ip = request.META.get('HTTP_X_REAL_IP')
    if x_real_ip:
        ip = x_real_ip.strip()
        if ip:
            return ip
    
    # Check CF-Connecting-IP (Cloudflare)
    cf_connecting_ip = request.META.get('HTTP_CF_CONNECTING_IP')
    if cf_connecting_ip:
        ip = cf_connecting_ip.strip()
        if ip:
            return ip
    
    # Fallback to REMOTE_ADDR
    ip = request.META.get('REMOTE_ADDR', '')
    return ip.strip() if ip else 'Unknown'


def _recompute_client_account_verified(client: Client) -> list[str]:
    """
    Keep the persisted `account_verified` consistent with required onboarding fields.
    Returns list of model fields that were changed and should be saved.
    """
    changed: list[str] = []

    # Derive legal_name if missing
    try:
        if not (client.legal_name or '').strip():
            derived = " ".join(
                p.strip()
                for p in [client.fname or '', getattr(client, 'middle_name', '') or '', client.lname or '']
                if p and p.strip()
            ).strip()
            if derived:
                client.legal_name = derived
                changed.append('legal_name')
    except Exception:
        pass

    prefs_complete = isinstance(getattr(client, 'preferences', None), list) and len(client.preferences) > 0
    compliance_complete = isinstance(getattr(client, 'compliance_family_flags', None), list) and len(client.compliance_family_flags) > 0
    sources_complete = isinstance(getattr(client, 'funds_sources', None), list) and len(client.funds_sources) > 0

    is_complete = (
        bool((client.legal_name or '').strip())
        and bool((client.fname or '').strip())
        and bool((client.lname or '').strip())
        and bool((getattr(client, 'sex', '') or '').strip())
        and bool(getattr(client, 'birth_date', None))
        and bool((getattr(client, 'address', '') or '').strip())
        and bool((getattr(client, 'postal_code', '') or '').strip())
        and bool((getattr(client, 'city', '') or '').strip())
        and prefs_complete
        and bool((getattr(client, 'trading_objective', '') or '').strip())
        and bool((getattr(client, 'planned_investment_12m', '') or '').strip())
        and compliance_complete
        and sources_complete
        and bool((getattr(client, 'primary_profession', '') or '').strip())
        and bool((getattr(client, 'annual_net_income', '') or '').strip())
        and bool((getattr(client, 'total_liquidities', '') or '').strip())
    )

    new_verified = bool(is_complete)
    if bool(getattr(client, 'account_verified', False)) != new_verified:
        client.account_verified = new_verified
        changed.append('account_verified')

    return changed


_DURATION_RE = re.compile(r"(\d+)")


def _parse_days_from_duration(duration_str: str | None) -> int:
    """
    Parse duration string to number of days.
    For backward compatibility: if the extracted integer is in the typical month range (1-24),
    treat as months and return v * 30 (days). Otherwise treat as days (e.g. 30, 90, 365).
    Using 24 as the upper bound avoids interpreting "30" (new default for 30 days) as 30 months.
    """
    if not duration_str:
        return 30  # default ~1 month in days
    m = _DURATION_RE.search(str(duration_str))
    if not m:
        return 30
    try:
        v = int(m.group(1))
        if v <= 0:
            return 30
        if v <= 24:
            # Legacy: value was in months (e.g. "12" = 12 months; typical contracts 1-24 months)
            return v * 30
        return v  # already in days (30, 90, 365, etc.)
    except Exception:
        return 30


def _normalize_duration_value(raw_duration) -> str:
    """
    Normalize duration to a positive integer (as string, days).
    Raises ValueError when value is invalid.
    """
    if raw_duration is None:
        return ''
    duration = str(raw_duration).strip()
    if duration == '':
        return ''
    if not duration.isdigit():
        raise ValueError("La durée doit être un nombre entier (en jours).")
    days = int(duration)
    if days <= 0:
        raise ValueError("La durée doit être supérieure à 0.")
    return str(days)


def _sanitize_product_subcategory(raw_sub) -> str:
    """
    Sanitize product subcategory: parse JSON array, remove invalid characters
    (brackets, stray quotes, newlines), return clean JSON string for storage.
    """
    def _clean_item(s):
        s = str(s or '').strip()
        # Remove surrounding quotes and brackets
        s = re.sub(r'^[\'"\[\]]+|[\'"\[\]\n\r]+$', '', s).strip()
        # Remove any remaining control chars
        s = re.sub(r'[\n\r]', '', s)
        return s

    if raw_sub is None:
        return ''
    if isinstance(raw_sub, list):
        cleaned = [_clean_item(x) for x in raw_sub if _clean_item(x)]
        return json.dumps(cleaned) if cleaned else ''
    raw_str = str(raw_sub).strip()
    if not raw_str:
        return ''
    try:
        parsed = json.loads(raw_str)
        if isinstance(parsed, list):
            cleaned = [_clean_item(x) for x in parsed if _clean_item(x)]
            return json.dumps(cleaned) if cleaned else ''
    except (json.JSONDecodeError, TypeError):
        pass
    # Single string - sanitize and return as single-element array for consistency
    s = _clean_item(raw_str)
    return json.dumps([s]) if s else ''


TECHNICAL_SHEET_MAX_BYTES = 20 * 1024 * 1024


def _validate_product_technical_sheet_upload(uploaded_file):
    """Validate PDF fiche technique upload. Raises ValueError if invalid."""
    if not uploaded_file:
        raise ValueError('Fichier manquant.')
    size = getattr(uploaded_file, 'size', None) or 0
    if size > TECHNICAL_SHEET_MAX_BYTES:
        raise ValueError('La fiche technique ne doit pas dépasser 20 Mo.')
    fname = (uploaded_file.name or '').lower()
    if not fname.endswith('.pdf'):
        raise ValueError('La fiche technique doit être un fichier PDF.')
    return uploaded_file


def _add_months_keep_day(d: date, months: int) -> date:
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(d.day, last_day)
    return date(year, month, day)


def _profitability_text_for_product(product: Product) -> str:
    try:
        is_var = str(product.is_variable_profitability or '').lower() == 'oui'
    except Exception:
        is_var = False
    period = (product.profitability_period or '').strip()
    if is_var and product.variable_profitability:
        base = f"{product.profitability}% à {product.variable_profitability}%"
    else:
        base = f"{product.profitability}%"
    return f"{base} {period}".strip()


def _profitability_text_for_contract(*, product: Product, duration_days: int) -> str:
    """
    Contract recap must be internally consistent:
    - profits are estimated using an annual rate prorated by (duration_days / 365)
    - the displayed profitability should match that same period yield
    """
    period = (product.profitability_period or '').strip()
    try:
        is_var = str(product.is_variable_profitability or '').lower() == 'oui'
    except Exception:
        is_var = False

    # If duration is missing/invalid, fall back to the raw product text.
    if not isinstance(duration_days, int) or duration_days <= 0:
        return _profitability_text_for_product(product)

    def _to_decimal_percent(v) -> Decimal:
        try:
            return Decimal(str(v or 0))
        except Exception:
            return Decimal('0')

    # If the product profitability is expressed "Fin de contrat", interpret it as
    # the yield over the contract duration (NOT annualized), so keep raw %.
    if "fin" in period.lower() and "contrat" in period.lower():
        return _profitability_text_for_product(product)

    # Otherwise: convert annual % -> period % (simple pro-rata on 365d).
    prorata = (Decimal(duration_days) / Decimal('365'))
    min_rate = _to_decimal_percent(product.profitability)
    min_period = (min_rate * prorata).quantize(Decimal('0.01'))

    if is_var and product.variable_profitability:
        max_rate = _to_decimal_percent(product.variable_profitability)
        max_period = (max_rate * prorata).quantize(Decimal('0.01'))
        base = f"{min_period}% à {max_period}%"
    else:
        base = f"{min_period}%"

    return f"{base} {period}".strip()


def _format_amount_for_contract(amount: float, currency: str | None) -> str:
    """Format amount for contract PDF (French locale: 1 234,56 € / 1 234,56 CHF / 1 234,56 $)."""
    ccy = (currency or 'EUR').strip().upper()
    if ccy not in ('EUR', 'USD', 'CHF'):
        ccy = 'EUR'
    formatted = f"{float(amount):,.2f}".replace(',', ' ').replace('.', ',')
    if ccy == 'USD':
        return f"{formatted} $"
    if ccy == 'CHF':
        return f"{formatted} CHF"
    return f"{formatted} €"


def _profitability_rate_for_calc(product: Product) -> Decimal:
    """
    Best-effort rate for profits estimation (keeps consistency with existing frontend simulator).
    Uses average if variable.
    """
    try:
        min_rate = Decimal(str(product.profitability or 0))
    except Exception:
        min_rate = Decimal('0')
    is_var = str(product.is_variable_profitability or '').lower() == 'oui'
    if is_var and product.variable_profitability:
        try:
            max_rate = Decimal(str(product.variable_profitability))
            if max_rate > min_rate:
                return (min_rate + max_rate) / Decimal('2')
        except Exception:
            pass
    return min_rate


def _build_subscription_details_defaults(
    *,
    client: Client,
    product: Product,
    amount: Decimal,
    transaction_datetime: datetime,
    request,
) -> dict:
    admin_ip = get_client_ip(request)
    duration_str = product.duration or ''
    duration_days = _parse_days_from_duration(duration_str)

    # Profit estimation:
    # - if profitability period is "Fin de contrat", treat rate as over the contract duration
    # - otherwise treat it as annualized and prorate by days/365
    rate = _profitability_rate_for_calc(product)
    period_label = (product.profitability_period or '').strip().lower()
    if 'fin' in period_label and 'contrat' in period_label:
        profits = (amount * (rate / Decimal('100'))).quantize(Decimal('0.01'))
    else:
        profits = (amount * (rate / Decimal('100')) * (Decimal(duration_days) / Decimal('365'))).quantize(Decimal('0.01'))
    total = (amount + profits).quantize(Decimal('0.01'))

    try:
        birth_date = client.birth_date.isoformat() if client.birth_date else ''
    except Exception:
        birth_date = ''

    # Contract end
    try:
        end_date = transaction_datetime.date() + timedelta(days=duration_days)
        contract_end = end_date.strftime('%d/%m/%Y')
    except Exception:
        contract_end = ''

    # Subscription date (FR)
    try:
        subscription_date = transaction_datetime.date().strftime('%d/%m/%Y')
    except Exception:
        subscription_date = ''

    category_title = ''
    try:
        category_title = product.category.title if product.category else ''
    except Exception:
        category_title = ''

    return {
        'firstName': client.fname or '',
        'lastName': client.lname or '',
        'birthDate': birth_date,
        'city': client.city or '',
        'ip': admin_ip or '',
        'productId': product.id,
        'productName': product.name or '',
        'productReference': product.reference or None,
        'category': category_title,
        'country': 'FRANCE',
        'subscriptionDate': subscription_date,
        'duration': duration_str,
        'interestPeriod': product.interest_period or '',
        'profitability': _profitability_text_for_contract(product=product, duration_days=duration_days),
        'investment': float(amount),
        'profits': float(profits),
        'total': float(total),
        'contractEnd': contract_end,
        'hasSignature': False,
        'signature': '',
    }


def _merge_missing_fields(target: dict, defaults: dict) -> dict:
    """
    Fill missing/empty keys in target with defaults (target wins if value is set).
    """
    if target is None:
        target = {}
    if not isinstance(target, dict):
        target = {}
    for k, v in defaults.items():
        cur = target.get(k)
        if cur is None or cur == '' or cur == {}:
            target[k] = v
    return target


def get_browser_info(request):
    """Extract browser information from request headers"""
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    
    # Parse browser info from user agent
    browser_info = {
        'user_agent': user_agent,
    }
    
    # Try to extract browser name and version
    if user_agent:
        user_agent_lower = user_agent.lower()
        
        # Detect browser
        if 'chrome' in user_agent_lower and 'edg' not in user_agent_lower:
            browser_info['browser'] = 'Chrome'
            # Extract Chrome version
            try:
                chrome_index = user_agent_lower.find('chrome/')
                if chrome_index != -1:
                    version_part = user_agent[chrome_index + 7:chrome_index + 20]
                    version = version_part.split()[0].split('.')[0]
                    browser_info['browser_version'] = version
            except:
                pass
        elif 'firefox' in user_agent_lower:
            browser_info['browser'] = 'Firefox'
            try:
                firefox_index = user_agent_lower.find('firefox/')
                if firefox_index != -1:
                    version_part = user_agent[firefox_index + 8:firefox_index + 20]
                    version = version_part.split()[0].split('.')[0]
                    browser_info['browser_version'] = version
            except:
                pass
        elif 'safari' in user_agent_lower and 'chrome' not in user_agent_lower:
            browser_info['browser'] = 'Safari'
        elif 'edg' in user_agent_lower:
            browser_info['browser'] = 'Edge'
        elif 'opera' in user_agent_lower or 'opr' in user_agent_lower:
            browser_info['browser'] = 'Opera'
        
        # Detect OS
        if 'windows' in user_agent_lower:
            browser_info['os'] = 'Windows'
            if 'windows nt 10.0' in user_agent_lower:
                browser_info['os_version'] = '10'
            elif 'windows nt 11.0' in user_agent_lower:
                browser_info['os_version'] = '11'
        elif 'mac' in user_agent_lower or 'macintosh' in user_agent_lower:
            browser_info['os'] = 'macOS'
        elif 'linux' in user_agent_lower:
            browser_info['os'] = 'Linux'
        elif 'android' in user_agent_lower:
            browser_info['os'] = 'Android'
        elif 'ios' in user_agent_lower or 'iphone' in user_agent_lower or 'ipad' in user_agent_lower:
            browser_info['os'] = 'iOS'
    
    return browser_info


def get_user_data_for_log(django_user, user_details=None):
    """Helper function to extract user data for logging"""
    user_data = {
        'id': str(django_user.id),
        'username': django_user.username,
        'email': django_user.email or '',
        'first_name': django_user.first_name or '',
        'last_name': django_user.last_name or '',
    }
    
    # Get UserDetails if not provided
    if user_details is None:
        try:
            user_details = UserDetails.objects.get(django_user=django_user)
        except UserDetails.DoesNotExist:
            return user_data
    
    if user_details:
        user_data['user_details_id'] = user_details.id
        user_data['role'] = user_details.role
        if user_details.phone:
            user_data['phone'] = user_details.phone
        
        # Get team ID if user is in a team
        team_member = user_details.team_memberships.first()
        if team_member:
            user_data['teamId'] = team_member.team.id
    
    return user_data


def get_team_data_for_log(team):
    """Helper function to extract team data for logging"""
    team_data = {
        'id': team.id,
        'name': team.name,
    }
    
    # Get team members count
    team_members_count = team.team_members.count()
    if team_members_count > 0:
        team_data['members_count'] = team_members_count
    
    return team_data

def get_useful_link_data_for_log(useful_link):
    """Helper function to extract useful link data for logging"""
    useful_link_data = {
        'id': useful_link.id,
        'name': useful_link.name,
        'url': useful_link.url,
        'description': useful_link.description or '',
        'button': useful_link.button or '',
        'default': useful_link.default,
    }
    
    # Include image URL if available
    if useful_link.image:
        useful_link_data['has_image'] = True
    
    return useful_link_data

def get_transaction_data_for_log(transaction):
    """Helper function to extract transaction data for logging"""
    transaction_data = {
        'id': transaction.id,
        'clientId': transaction.client.id,
        'type': transaction.type,
        'amount': float(transaction.amount) if transaction.amount else 0,
        'description': transaction.description or '',
        'status': transaction.status,
        'datetime': transaction.datetime.isoformat() if transaction.datetime else None,
        'transfer_from': transaction.transfer_from,
        'transfer_to': transaction.transfer_to,
    }
    
    if transaction.product:
        transaction_data['productId'] = transaction.product.id
    
    return transaction_data


def create_log_entry(event_type, user_id, request, old_value=None, new_value=None, transaction_id=None, client_name=None, client_id=None):
    """Create a log entry for an activity"""
    try:
        # Generate log ID
        log_id = uuid.uuid4().hex[:12]
        while Log.objects.filter(id=log_id).exists():
            log_id = uuid.uuid4().hex[:12]
        
        # Extract details from request
        details = {
            'ip_address': get_client_ip(request),
            'browser': get_browser_info(request),
        }
        
        # Add transaction_id to details if provided
        if transaction_id:
            details['transaction_id'] = transaction_id
        
        # Add client name to details if provided (for client-created transactions)
        if client_name:
            details['client_name'] = client_name
        
        # Create log entry
        Log.objects.create(
            id=log_id,
            event_type=event_type,
            user_id=user_id if user_id else None,
            client_id=client_id if client_id else None,
            details=details,
            old_value=old_value if old_value else {},
            new_value=new_value if new_value else {}
        )
    except Exception as e:
        # Log the error but don't raise it (to prevent breaking the main operation)
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to create log entry for event_type={event_type}, transaction_id={transaction_id}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        # Don't re-raise - allow the main operation to succeed even if logging fails

def _normalize_platform_log_origin(origin):
    value = (origin or '').strip().lower()
    if value in ALLOWED_PLATFORM_LOG_ORIGINS:
        return value
    return PLATFORM_LOG_ORIGIN_UNKNOWN


def _client_platform_log_has_origin_column():
    """Return whether the DB table has the origin column (backward-compatible with old schemas)."""
    table_name = ClientPlatformLog._meta.db_table
    try:
        with connection.cursor() as cursor:
            columns = connection.introspection.get_table_description(cursor, table_name)
        return any(col.name == 'origin' for col in columns)
    except Exception:
        # If introspection fails, assume current schema to avoid masking other issues.
        return True


def _serialize_platform_log_rows(rows, include_client_display_name=False):
    """Serialize platform log rows without requiring model field access."""
    client_display_names = {}
    if include_client_display_name:
        client_ids = {row.get('client_id') for row in rows if row.get('client_id')}
        if client_ids:
            for client in Client.objects.filter(id__in=client_ids).values('id', 'fname', 'lname', 'email'):
                fname = (client.get('fname') or '').strip()
                lname = (client.get('lname') or '').strip()
                display_name = f'{fname} {lname}'.strip() or client.get('email') or client.get('id')
                client_display_names[client['id']] = display_name

    payload = []
    for row in rows:
        action_details = row.get('action_details')
        if not isinstance(action_details, dict):
            action_details = {}
        origin = row.get('origin') or action_details.get('origin')
        item = {
            'id': row.get('id'),
            'actionType': row.get('action_type', ''),
            'origin': _normalize_platform_log_origin(origin),
            'actionDetails': action_details,
            'ipAddress': row.get('ip_address'),
            'userAgent': row.get('user_agent'),
            'createdAt': row.get('created_at'),
            'clientId': row.get('client_id'),
        }
        if include_client_display_name:
            item['clientDisplayName'] = client_display_names.get(item['clientId'], item['clientId'] or '')
        payload.append(item)
    return payload


def create_platform_log(client_id, action_type, action_details, request, forced_origin=None):
    """Create a platform log entry for a client action"""
    try:
        # Generate log ID
        log_id = uuid.uuid4().hex[:12]
        while ClientPlatformLog.objects.filter(id=log_id).exists():
            log_id = uuid.uuid4().hex[:12]
        
        # Get client
        try:
            client = Client.objects.get(id=client_id)
        except Client.DoesNotExist:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create platform log: Client {client_id} does not exist")
            return
        
        # Extract IP and user agent
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        normalized_details = dict(action_details) if isinstance(action_details, dict) else {}
        origin = _normalize_platform_log_origin(forced_origin)
        normalized_details['origin'] = origin
        
        # Create platform log entry
        platform_log = ClientPlatformLog.objects.create(
            id=log_id,
            client=client,
            action_type=action_type,
            origin=origin,
            action_details=normalized_details,
            ip_address=ip_address if ip_address != 'Unknown' else None,
            user_agent=user_agent if user_agent else None
        )
        
        # Debug logging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Created platform log: {platform_log.id} for client {client_id}, action_type={action_type}")
    except Exception as e:
        # Log the error but don't raise it (to prevent breaking the main operation)
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to create platform log for client_id={client_id}, action_type={action_type}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        # Don't re-raise - allow the main operation to succeed even if logging fails


def create_app_notification(
    recipient_type,
    notification_type,
    recipient_user=None,
    recipient_client=None,
    title=None,
    message=None,
    payload=None,
):
    """Create an in-app notification. Does not raise; logs errors."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        if recipient_type == AppNotification.RECIPIENT_CRM_USER and not recipient_user:
            return
        if recipient_type == AppNotification.RECIPIENT_CLIENT and not recipient_client:
            return
        nid = uuid.uuid4().hex[:12]
        while AppNotification.objects.filter(id=nid).exists():
            nid = uuid.uuid4().hex[:12]
        AppNotification.objects.create(
            id=nid,
            recipient_type=recipient_type,
            recipient_user=recipient_user,
            recipient_client=recipient_client,
            notification_type=notification_type,
            title=title or "",
            message=message or "",
            payload=payload or {},
        )
    except Exception as e:
        logger.error(
            "Failed to create app notification: recipient_type=%s, type=%s, error=%s",
            recipient_type,
            notification_type,
            str(e),
        )
        logger.exception(e)


class UserCreateView(generics.CreateAPIView):
    queryset = DjangoUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def perform_create(self, serializer):
        # Save the user (this will trigger the serializer's create method)
        user = serializer.save()

        # Optional: handle profile photo upload for UserDetails
        try:
            user_details = UserDetails.objects.filter(django_user=user).first()
            profile_photo_file = self.request.FILES.get('profilePhoto')
            if user_details and profile_photo_file:
                # Build a stable filename for storage
                original_filename = profile_photo_file.name or 'photo'
                _, ext = os.path.splitext(original_filename)
                ext = ext.lower() if ext else '.jpg'
                custom_filename = f"user_{user_details.id}_{uuid.uuid4().hex[:8]}{ext}"
                user_details.profile_photo.save(custom_filename, profile_photo_file, save=True)
        except Exception as e:
            # Don't block user creation if photo upload fails
            import logging
            logging.getLogger(__name__).warning(f"User profile photo upload failed: {str(e)}")
        
        # Get the user who created this (if authenticated, otherwise None)
        created_by_user = self.request.user if self.request.user.is_authenticated else None
        
        # Prepare new_value with user data using helper function
        new_value = get_user_data_for_log(user)
        
        # Create log entry
        create_log_entry(
            event_type='createUser',
            user_id=created_by_user,
            request=self.request,
            old_value={},  # No old value for creation
            new_value=new_value
        )

class NoteListCreateView(generics.ListCreateAPIView):
    serializer_class = NoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Note.objects.filter(userId=user)

    def perform_create(self, serializer):
        # serializer is already validated at this point
        # clientId can be null if not provided - preserve it from validated_data
        # If not provided, it will be None/null which is allowed
        validated_data = serializer.validated_data
        note_id = validated_data.get('id')
        # Generate a unique ID if not provided
        if not note_id:
            # Generate a 12-character unique ID
            note_id = uuid.uuid4().hex[:12]
            # Ensure uniqueness (small chance of collision, but unlikely)
            while Note.objects.filter(id=note_id).exists():
                note_id = uuid.uuid4().hex[:12]
        serializer.save(
            id=note_id,
            userId=self.request.user, 
            clientId=validated_data.get('clientId')  # Can be None/null
        )

class NoteDeleteView(generics.DestroyAPIView):
    serializer_class = NoteSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'id'
    lookup_url_kwarg = 'pk'
    
    def get_queryset(self):
        user = self.request.user
        return Note.objects.filter(userId=user)

def _get_client_ids_user_has_access_to(request):
    """
    Returns set of client IDs the user can access, or None if access to all.
    - admin: None (all)
    - teamleader: same as gestionnaire + clients of all team members (managed_by in team member user ids)
    - gestionnaire: client IDs where client.managed_by == request.user.id
    """
    try:
        user_details = UserDetails.objects.get(django_user=request.user)
        role = (user_details.role or '').lower().strip()
        if role == 'admin':
            return None
        if role == 'teamleader':
            team_memberships = user_details.team_memberships.all()
            team_ids = [tm.team_id for tm in team_memberships if tm.team_id]
            if not team_ids:
                # No team: same as gestionnaire (only own clients)
                return set(Client.objects.filter(managed_by=str(request.user.id)).values_list('id', flat=True))
            # Get all UserDetails in these teams (includes teamleader)
            team_member_ids = UserDetails.objects.filter(
                team_memberships__team_id__in=team_ids
            ).values_list('django_user_id', flat=True).distinct()
            manager_ids = [str(uid) for uid in team_member_ids if uid]
            if not manager_ids:
                return set(Client.objects.filter(managed_by=str(request.user.id)).values_list('id', flat=True))
            return set(Client.objects.filter(managed_by__in=manager_ids).values_list('id', flat=True))
        if role == 'gestionnaire':
            return set(Client.objects.filter(managed_by=str(request.user.id)).values_list('id', flat=True))
    except UserDetails.DoesNotExist:
        pass  # No UserDetails, allow access (e.g. superuser)
    return None


ONLINE_ACTIVITY_MINUTES = 5
ONLINE_ACTION_TYPES = ('login', 'page_view', 'click')


def _get_online_client_ids(request):
    """
    Returns list of client IDs that have recent platform activity (login, page_view, click)
    within ONLINE_ACTIVITY_MINUTES. Respects user access (gestionnaire/teamleader).
    """
    cutoff = timezone.now() - timedelta(minutes=ONLINE_ACTIVITY_MINUTES)
    qs = ClientPlatformLog.objects.filter(
        created_at__gte=cutoff,
        action_type__in=ONLINE_ACTION_TYPES,
    ).values_list('client_id', flat=True).distinct()
    online_ids = list(qs)
    allowed_ids = _get_client_ids_user_has_access_to(request)
    if allowed_ids is not None:
        online_ids = [cid for cid in online_ids if cid in allowed_ids]
    return online_ids


def _check_gestionnaire_client_access(request, client):
    """
    If user has role 'gestionnaire', ensure they are assigned to this client.
    If user has role 'teamleader', ensure client.managed_by is teamleader or a team member.
    Returns Response (403) if access denied, None if allowed.
    """
    try:
        user_details = UserDetails.objects.get(django_user=request.user)
        role = (user_details.role or '').lower().strip()
        if role == 'gestionnaire':
            if not client.managed_by or str(client.managed_by) != str(request.user.id):
                return Response(
                    {'error': 'Accès refusé - client non assigné'},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif role == 'teamleader':
            team_memberships = user_details.team_memberships.all()
            team_ids = [tm.team_id for tm in team_memberships if tm.team_id]
            if not team_ids:
                # No team: same as gestionnaire
                if not client.managed_by or str(client.managed_by) != str(request.user.id):
                    return Response(
                        {'error': 'Accès refusé - client non assigné'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            else:
                team_member_ids = UserDetails.objects.filter(
                    team_memberships__team_id__in=team_ids
                ).values_list('django_user_id', flat=True).distinct()
                manager_ids = {str(uid) for uid in team_member_ids if uid}
                if not client.managed_by or str(client.managed_by) not in manager_ids:
                    return Response(
                        {'error': 'Accès refusé - client non assigné à votre équipe'},
                        status=status.HTTP_403_FORBIDDEN
                    )
    except UserDetails.DoesNotExist:
        pass  # No UserDetails, allow access (e.g. superuser)
    return None


class ClientView(generics.ListAPIView):
    from django.db.models import Prefetch
    from .models import Transaction
    
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]  # Explicitly set permission
    
    def get_queryset(self):
        from django.db.models import Prefetch
        from .models import Transaction
        qs = Client.objects.select_related('team').prefetch_related(
            Prefetch(
                'transactions',
                queryset=Transaction.objects.filter(status__in=COMPLETED_TRANSACTION_STATUSES),
                to_attr='completed_transactions'
            )
        ).annotate(
            pending_positions_count=Count('positions', filter=Q(positions__status='pending')),
        )
        client_ids = _get_client_ids_user_has_access_to(self.request)
        if client_ids is not None:
            qs = qs.filter(id__in=client_ids)
        return qs
    
    def list(self, request, *args, **kwargs):
        try:
            response = super().list(request, *args, **kwargs)
            online_client_ids = _get_online_client_ids(request)
            return Response({
                'clients': response.data,
                'onlineClientIds': online_client_ids,
            })
        except Exception as exc:
            logger.exception(
                "ClientView.list failed: %s. Check DATABASE_URL, DB_SSL_REQUIRE, migrations, S3/MinIO.",
                exc,
            )
            raise


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_online_ids(request):
    """Lightweight endpoint returning IDs of clients with recent platform activity (for polling)."""
    online_ids = _get_online_client_ids(request)
    return Response({'onlineClientIds': online_ids})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_create(request):
    # Validate required fields
    if not request.data.get('firstName'):
        return Response({'error': 'Le prénom est requis'}, status=status.HTTP_400_BAD_REQUEST)
    if not request.data.get('lastName'):
        return Response({'error': 'Le nom est requis'}, status=status.HTTP_400_BAD_REQUEST)
    if not request.data.get('email'):
        return Response({'error': 'L\'email est requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if email already exists
    email = request.data.get('email', '').strip()
    if email and Client.objects.filter(email=email).exists():
        return Response({'error': 'Un client avec cet email existe déjà'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Generate client ID
    client_id = uuid.uuid4().hex[:12]
    while Client.objects.filter(id=client_id).exists():
        client_id = uuid.uuid4().hex[:12]
    
    # Helper function to safely convert to decimal
    def to_decimal(value, default=0):
        if value is None or value == '':
            return default
        try:
            result = float(value)
            return result if result >= 0 else default
        except (ValueError, TypeError):
            return default
    
    # Helper function to safely get date
    def get_date(value):
        if not value or value == '':
            return None
        return value
    
    # Helper function to safely get list
    def get_list(value, default=None):
        if default is None:
            default = []
        if value is None:
            return default
        if isinstance(value, list):
            return value
        # Handle QueryDict (from FormData) - getlist returns a list
        if hasattr(value, '__iter__') and not isinstance(value, (str, bytes)):
            return list(value)
        return default
    
    # Map frontend field names to model field names
    # Informations personnelles
    client_data = {
        'id': client_id,
        'civility': request.data.get('civility', '') or '',
        'fname': request.data.get('firstName', '') or '',
        'middle_name': request.data.get('middleName', '') or '',
        'lname': request.data.get('lastName', '') or '',
        'legal_name': request.data.get('legalName', '') or '',
        'sex': request.data.get('sex', '') or '',
        'account_verified': request.data.get('accountVerified', False),
        'active': request.data.get('active', True),
        'password': request.data.get('password', 'Access@123') or 'Access@123',
        'phone': request.data.get('phone', '') or '',
        'mobile': request.data.get('mobile', '') or '',
        'email': request.data.get('email', '') or '',
        'birth_date': get_date(request.data.get('birthDate')),
        'birth_place': request.data.get('birthPlace', '') or '',
        'address': request.data.get('address', '') or '',
        'postal_code': request.data.get('postalCode', '') or '',
        'city': request.data.get('city', '') or '',
        'nationality': request.data.get('nationality', '') or '',
        'successor': request.data.get('successor', '') or '',
        # Questionnaire fields
        'trading_objective': request.data.get('tradingObjective', '') or '',
        'planned_investment_12m': request.data.get('plannedInvestment12m', '') or '',
        'risk_reward_profile': request.data.get('riskRewardProfile', '') or '',
        'primary_profession': request.data.get('primaryProfession', '') or '',
        'employer_name': request.data.get('employerName', '') or '',
        'annual_net_income': request.data.get('annualNetIncome', '') or '',
        'total_liquidities': request.data.get('totalLiquidities', '') or '',
        # managed_by will be set separately to ensure it's a valid user ID
    }
    
    # Don't include profile_photo in client_data - handle it separately after client creation
    profile_photo_file = None
    if 'profilePhoto' in request.FILES:
        profile_photo_file = request.FILES['profilePhoto']
    
    # Convert active from string to boolean if needed (FormData sends strings)
    if isinstance(client_data.get('active'), str):
        client_data['active'] = client_data['active'].lower() == 'true'
    if isinstance(client_data.get('account_verified'), str):
        client_data['account_verified'] = client_data['account_verified'].lower() == 'true'
    else:
        client_data['account_verified'] = bool(client_data.get('account_verified', False))
    
    # Handle patrimonial data
    # Use getlist for FormData, get for JSON
    professions = request.data.getlist('professions') if hasattr(request.data, 'getlist') else get_list(request.data.get('professions'))
    objectives = request.data.getlist('objectives') if hasattr(request.data, 'getlist') else get_list(request.data.get('objectives'))
    experience = request.data.getlist('experience') if hasattr(request.data, 'getlist') else get_list(request.data.get('experience'))
    preferences = request.data.getlist('preferences') if hasattr(request.data, 'getlist') else get_list(request.data.get('preferences'))
    compliance_family_flags = request.data.getlist('complianceFamilyFlags') if hasattr(request.data, 'getlist') else get_list(request.data.get('complianceFamilyFlags'))
    funds_sources = request.data.getlist('fundsSources') if hasattr(request.data, 'getlist') else get_list(request.data.get('fundsSources'))
    
    # Handle managed_by separately to ensure it's a valid user ID
    # The frontend sends UserDetails.id (string), we need to convert it to DjangoUser.id
    managed_by_value = request.data.get('managerId', '') or request.data.get('managed_by', '') or ''
    if managed_by_value:
        try:
            # First try to find UserDetails by ID (this is what the frontend sends)
            user_details = UserDetails.objects.filter(id=managed_by_value).first()
            if user_details and user_details.django_user:
                # Use DjangoUser.id for managed_by
                client_data['managed_by'] = str(user_details.django_user.id)
            else:
                # Fallback: try to find DjangoUser directly by ID (for backward compatibility)
                try:
                    user_id = int(managed_by_value)
                    from django.contrib.auth.models import User as DjangoUser
                    if DjangoUser.objects.filter(id=user_id).exists():
                        client_data['managed_by'] = str(user_id)
                    else:
                        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
                except (ValueError, TypeError):
                    # Try to find by username
                    from django.contrib.auth.models import User as DjangoUser
                    user = DjangoUser.objects.filter(username=managed_by_value).first()
                    if user:
                        client_data['managed_by'] = str(user.id)
                    else:
                        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': f'Error finding user: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        client_data['managed_by'] = ''
    
    # Validate account_currency
    account_currency_raw = (request.data.get('accountCurrency') or 'EUR').strip().upper()
    if account_currency_raw not in ('EUR', 'USD', 'CHF'):
        account_currency_raw = 'EUR'
    
    client_data.update({
        # Fiche patrimoniale
        'account_currency': account_currency_raw,
        'professional_activity_status': request.data.get('professionalActivityStatus') or '',
        'professional_activity_comment': request.data.get('professionalActivityComment') or '',
        'professions': professions,
        'professions_comment': request.data.get('professionsComment') or '',
        'bank_name': request.data.get('bankName') or '',
        'current_account': to_decimal(request.data.get('currentAccount')),
        'livret_ab': to_decimal(request.data.get('livretAB')),
        'pea': to_decimal(request.data.get('pea')),
        'pel': to_decimal(request.data.get('pel')),
        'ldd': to_decimal(request.data.get('ldd')),
        'cel': to_decimal(request.data.get('cel')),
        'csl': to_decimal(request.data.get('csl')),
        'securities_account': to_decimal(request.data.get('securitiesAccount')),
        'life_insurance': to_decimal(request.data.get('lifeInsurance')),
        'savings_comment': request.data.get('savingsComment') or '',
        'total_wealth': to_decimal(request.data.get('totalWealth')),
        'objectives': objectives,
        'objectives_comment': request.data.get('objectivesComment') or '',
        'experience': experience,
        'experience_comment': request.data.get('experienceComment') or '',
        'tax_optimization': bool(request.data.get('taxOptimization', False)) if not isinstance(request.data.get('taxOptimization'), str) else request.data.get('taxOptimization', 'false').lower() == 'true',
        'tax_optimization_comment': request.data.get('taxOptimizationComment') or '',
        'annual_household_income': to_decimal(request.data.get('annualHouseholdIncome')),
        # Onboarding preferences
        'preferences': preferences,
        'compliance_family_flags': compliance_family_flags,
        'funds_sources': funds_sources,
        # Miscellaneous features
        'trading_enabled': bool(request.data.get('tradingEnabled', False)) if not isinstance(request.data.get('tradingEnabled'), str) else request.data.get('tradingEnabled', 'false').lower() == 'true',
        'banner_message': request.data.get('bannerMessage', '') or '',
    })
    
    try:
        client = Client.objects.create(**client_data)
        
        # Handle profile photo upload explicitly for storage
        if profile_photo_file:
            try:
                # Get file extension
                original_filename = profile_photo_file.name
                _, ext = os.path.splitext(original_filename)
                # Create filename with client ID: {client_id}.{ext}
                custom_filename = f'{client_id}{ext}'
                
                print(f"Uploading client profile photo: {original_filename} as {custom_filename}")
                
                # Save with custom filename - this will upload to cloud storage
                client.profile_photo.save(custom_filename, profile_photo_file, save=True)
                
                # Verify the photo was saved and uploaded to storage
                if not client.profile_photo:
                    print("Warning: Profile photo upload failed - file was not saved")
                else:
                    # Verify storage upload
                    try:
                        storage = client.profile_photo.storage
                        from api.storage import S3MediaStorage
                        if isinstance(storage, S3MediaStorage):
                            photo_url = client.profile_photo.url
                            if photo_url and (photo_url.startswith('http://') or photo_url.startswith('https://')):
                                print(f"Profile photo successfully uploaded to storage: {client.profile_photo.name}")
                                print(f"S3 URL: {photo_url[:100]}...")
                    except Exception as verify_error:
                        print(f"Warning: Could not verify storage upload: {str(verify_error)}")
            except Exception as upload_error:
                print(f"Error uploading profile photo: {str(upload_error)}")
                import traceback
                traceback.print_exc()
                # Don't fail client creation if photo upload fails, just log it
        
        # Automatically assign default assets, RIBs, and useful links
        # Assign default assets
        default_assets = Asset.objects.filter(default=True)
        for asset in default_assets:
            # Check if client already has this asset (shouldn't happen for new client, but safety check)
            if not ClientAsset.objects.filter(client=client, asset=asset).exists():
                client_asset_id = uuid.uuid4().hex[:12]
                while ClientAsset.objects.filter(id=client_asset_id).exists():
                    client_asset_id = uuid.uuid4().hex[:12]
                ClientAsset.objects.create(
                    id=client_asset_id,
                    client=client,
                    asset=asset
                )
        
        # Assign at most one default RIB catalogue (un seul RIB affichable côté client)
        default_rib = RIB.objects.filter(default=True).order_by('name', 'id').first()
        if default_rib and not ClientRIB.objects.filter(client=client, rib=default_rib).exists():
            client_rib_id = uuid.uuid4().hex[:12]
            while ClientRIB.objects.filter(id=client_rib_id).exists():
                client_rib_id = uuid.uuid4().hex[:12]
            ClientRIB.objects.create(
                id=client_rib_id,
                client=client,
                rib=default_rib
            )
        
        # Assign default useful links
        default_useful_links = UsefulLink.objects.filter(default=True)
        for useful_link in default_useful_links:
            # Check if client already has this useful link (shouldn't happen for new client, but safety check)
            if not ClientUsefulLink.objects.filter(client=client, useful_link=useful_link).exists():
                client_useful_link_id = uuid.uuid4().hex[:12]
                while ClientUsefulLink.objects.filter(id=client_useful_link_id).exists():
                    client_useful_link_id = uuid.uuid4().hex[:12]
                ClientUsefulLink.objects.create(
                    id=client_useful_link_id,
                    client=client,
                    useful_link=useful_link
                )
        
        # Create log entry for client creation
        try:
            client_data_for_log = {
                'id': client.id,
                'firstName': client.fname,
                'lastName': client.lname,
                'email': client.email,
            }
            create_log_entry(
                event_type='createClient',
                user_id=request.user if request.user.is_authenticated else None,
                request=request,
                old_value={},
                new_value=client_data_for_log,
                client_id=client
            )
        except Exception as log_error:
            # Log the error but don't fail the client creation
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create log entry for client creation {client_id}: {str(log_error)}")
        
        serializer = ClientSerializer(client, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error creating client: {error_details}")
        return Response({'error': str(e), 'details': error_details}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def client_detail(request, client_id):
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    
    if request.method == 'GET':
        serializer = ClientSerializer(client, context={'request': request})
        return Response({'client': serializer.data})
    
    if request.method == 'PATCH':
        # Helper functions
        def get_date(value):
            if not value:
                return None
            try:
                from datetime import datetime
                # Handle both YYYY-MM-DD and DD/MM/YYYY formats
                if '/' in str(value):
                    parts = str(value).split('/')
                    if len(parts) == 3:
                        day, month, year = parts
                        return datetime.strptime(f"{year}-{month}-{day}", "%Y-%m-%d").date()
                return datetime.strptime(str(value), "%Y-%m-%d").date()
            except:
                return None
        
        # Update personal information fields
        if 'civility' in request.data:
            client.civility = request.data.get('civility', '') or ''
        if 'firstName' in request.data:
            client.fname = request.data.get('firstName', '') or ''
        if 'middleName' in request.data:
            client.middle_name = request.data.get('middleName', '') or ''
        if 'lastName' in request.data:
            client.lname = request.data.get('lastName', '') or ''
        if 'legalName' in request.data:
            client.legal_name = request.data.get('legalName', '') or ''
        if 'sex' in request.data:
            client.sex = request.data.get('sex', '') or ''
        if 'accountVerified' in request.data:
            v = request.data.get('accountVerified')
            client.account_verified = (v.lower() == 'true') if isinstance(v, str) else bool(v)
        if 'password' in request.data:
            client.password = request.data.get('password', '') or ''
        if 'phone' in request.data:
            client.phone = request.data.get('phone', '') or ''
        if 'mobile' in request.data:
            client.mobile = request.data.get('mobile', '') or ''
        if 'email' in request.data:
            client.email = request.data.get('email', '') or ''
        if 'birthDate' in request.data:
            client.birth_date = get_date(request.data.get('birthDate'))
        if 'birthPlace' in request.data:
            client.birth_place = request.data.get('birthPlace', '') or ''
        if 'address' in request.data:
            client.address = request.data.get('address', '') or ''
        if 'postalCode' in request.data:
            client.postal_code = request.data.get('postalCode', '') or ''
        if 'city' in request.data:
            client.city = request.data.get('city', '') or ''
        if 'preferences' in request.data:
            prefs = request.data.get('preferences')
            if isinstance(prefs, str):
                try:
                    prefs = json.loads(prefs)
                except Exception:
                    prefs = []
            if not isinstance(prefs, list):
                prefs = []
            client.preferences = prefs
        if 'accountCurrency' in request.data:
            ac = (request.data.get('accountCurrency') or 'EUR').strip().upper()
            if ac in ('EUR', 'USD', 'CHF'):
                client.account_currency = ac
        if 'tradingObjective' in request.data:
            client.trading_objective = request.data.get('tradingObjective', '') or ''
        if 'plannedInvestment12m' in request.data:
            client.planned_investment_12m = request.data.get('plannedInvestment12m', '') or ''
        if 'riskRewardProfile' in request.data:
            client.risk_reward_profile = request.data.get('riskRewardProfile', '') or ''
        if 'complianceFamilyFlags' in request.data:
            flags = request.data.get('complianceFamilyFlags')
            if isinstance(flags, str):
                try:
                    flags = json.loads(flags)
                except Exception:
                    flags = []
            if not isinstance(flags, list):
                flags = []
            client.compliance_family_flags = flags
        if 'fundsSources' in request.data:
            sources = request.data.get('fundsSources')
            if isinstance(sources, str):
                try:
                    sources = json.loads(sources)
                except Exception:
                    sources = []
            if not isinstance(sources, list):
                sources = []
            client.funds_sources = sources
        if 'primaryProfession' in request.data:
            client.primary_profession = request.data.get('primaryProfession', '') or ''
        if 'employerName' in request.data:
            client.employer_name = request.data.get('employerName', '') or ''
        if 'annualNetIncome' in request.data:
            client.annual_net_income = request.data.get('annualNetIncome', '') or ''
        if 'totalLiquidities' in request.data:
            client.total_liquidities = request.data.get('totalLiquidities', '') or ''
        if 'nationality' in request.data:
            client.nationality = request.data.get('nationality', '') or ''
        if 'successor' in request.data:
            client.successor = request.data.get('successor', '') or ''
        if 'kycStatus' in request.data:
            client.kyc_status = request.data.get('kycStatus', 'pending') or 'pending'
        if 'kycDocumentsReview' in request.data:
            review_map = request.data.get('kycDocumentsReview')
            if isinstance(review_map, str):
                try:
                    review_map = json.loads(review_map)
                except Exception:
                    review_map = {}
            if not isinstance(review_map, dict):
                review_map = {}
            allowed_keys = {'identityDocument', 'identityDocumentVerso', 'proofOfAddress', 'selfiePhoto'}
            allowed_values = {'pending', 'approved', 'rejected'}
            sanitized_review_map = {}
            for key, value in review_map.items():
                if key not in allowed_keys:
                    continue
                normalized_value = (str(value or '')).strip().lower()
                sanitized_review_map[key] = normalized_value if normalized_value in allowed_values else 'pending'
            client.kyc_documents_review = sanitized_review_map
        if 'kycReviewedAt' in request.data:
            raw_reviewed_at = request.data.get('kycReviewedAt')
            if raw_reviewed_at in (None, '', 'null'):
                client.kyc_reviewed_at = None
            else:
                parsed_reviewed_at = None
                try:
                    parsed_reviewed_at = datetime.fromisoformat(str(raw_reviewed_at).replace('Z', '+00:00'))
                except Exception:
                    parsed_reviewed_at = None
                if parsed_reviewed_at is not None:
                    client.kyc_reviewed_at = parsed_reviewed_at
        
        # Update RIB fields
        if 'ribBankName' in request.data:
            client.rib_bank_name = request.data.get('ribBankName', '') or ''
        if 'ribAccountHolder' in request.data:
            client.rib_account_holder = request.data.get('ribAccountHolder', '') or ''
        if 'ribBankCode' in request.data:
            client.rib_bank_code = request.data.get('ribBankCode', '') or ''
        if 'ribBranchCode' in request.data:
            client.rib_branch_code = request.data.get('ribBranchCode', '') or ''
        if 'ribAccountNumber' in request.data:
            client.rib_account_number = request.data.get('ribAccountNumber', '') or ''
        if 'ribKey' in request.data:
            client.rib_key = request.data.get('ribKey', '') or ''
        if 'ribIban' in request.data:
            client.rib_iban = request.data.get('ribIban', '') or ''
        if 'ribBic' in request.data:
            client.rib_bic = request.data.get('ribBic', '') or ''
        if 'ribDomiciliation' in request.data:
            client.rib_domiciliation = request.data.get('ribDomiciliation', '') or ''
        
        # Handle profile photo upload or removal
        if 'profilePhoto' in request.FILES:
            try:
                profile_photo_file = request.FILES['profilePhoto']
                # Get file extension
                original_filename = profile_photo_file.name
                _, ext = os.path.splitext(original_filename)
                # Create filename with client ID: {client_id}.{ext}
                custom_filename = f'{client_id}{ext}'
                
                print(f"Uploading client profile photo: {original_filename} as {custom_filename}")
                
                # Delete old photo if it exists
                if client.profile_photo:
                    print(f"Deleting old profile photo: {client.profile_photo.name}")
                    old_photo_name = client.profile_photo.name
                    client.profile_photo.delete(save=False)
                    # Clear the field reference
                    client.profile_photo = None
                    # Save to clear the database field
                    client.save(update_fields=['profile_photo'])
                    print(f"Cleared old profile photo from database: {old_photo_name}")
                
                # Save with custom filename - this will upload to cloud storage
                client.profile_photo.save(custom_filename, profile_photo_file, save=True)
                
                # Verify the photo was saved and uploaded to storage
                if not client.profile_photo:
                    return Response({'error': 'Profile photo upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                # Verify storage upload
                try:
                    storage = client.profile_photo.storage
                    from api.storage import S3MediaStorage
                    if isinstance(storage, S3MediaStorage):
                        photo_url = client.profile_photo.url
                        if photo_url and (photo_url.startswith('http://') or photo_url.startswith('https://')):
                            print(f"Profile photo successfully uploaded to storage: {client.profile_photo.name}")
                            print(f"storage URL: {photo_url[:100]}...")
                except Exception as verify_error:
                    print(f"Warning: Could not verify storage upload: {str(verify_error)}")
            except Exception as upload_error:
                print(f"Error uploading profile photo: {str(upload_error)}")
                import traceback
                traceback.print_exc()
                return Response({'error': f'Profile photo upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        elif 'removeProfilePhoto' in request.data:
            # Handle both string and boolean values
            remove_photo = request.data.get('removeProfilePhoto')
            if isinstance(remove_photo, str):
                remove_photo = remove_photo.lower() == 'true'
            if remove_photo:
                # Delete the file if it exists
                if client.profile_photo:
                    client.profile_photo.delete(save=False)
                client.profile_photo = None
        
        # Update managed_by if provided (should be user ID)
        # The frontend may send UserDetails.id (string) or DjangoUser.id
        if 'managed_by' in request.data:
            managed_by_value = request.data.get('managed_by', '') or ''
            if managed_by_value:
                # First try to find UserDetails by ID (this is what the frontend sends)
                user_details = UserDetails.objects.filter(id=managed_by_value).first()
                if user_details and user_details.django_user:
                    # Use DjangoUser.id for managed_by
                    client.managed_by = str(user_details.django_user.id)
                else:
                    # Fallback: try to find DjangoUser directly by ID (for backward compatibility)
                    try:
                        user_id = int(managed_by_value)
                        from django.contrib.auth.models import User as DjangoUser
                        if DjangoUser.objects.filter(id=user_id).exists():
                            client.managed_by = str(user_id)
                        else:
                            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
                    except (ValueError, TypeError):
                        # Try to find by username
                        from django.contrib.auth.models import User as DjangoUser
                        user = DjangoUser.objects.filter(username=managed_by_value).first()
                        if user:
                            client.managed_by = str(user.id)
                        else:
                            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            else:
                client.managed_by = ''
        
        # Update source if provided
        if 'source' in request.data:
            client.source = request.data.get('source', '') or ''
        
        # Update team if provided
        if 'team' in request.data:
            team_id = request.data.get('team')
            if team_id and team_id != 'none' and team_id != '':
                try:
                    team = Team.objects.get(id=team_id)
                    client.team = team
                except Team.DoesNotExist:
                    return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)
            else:
                # Si team est 'none' ou vide, supprimer l'équipe
                client.team = None
        elif 'teamId' in request.data:
            team_id = request.data.get('teamId')
            if team_id and team_id != 'none':
                try:
                    team = Team.objects.get(id=team_id)
                    client.team = team
                except Team.DoesNotExist:
                    return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)
            else:
                # Si teamId est 'none' ou vide, supprimer l'équipe
                client.team = None
        
        # Helper functions for patrimonial data
        def to_decimal(value, default=0):
            if value is None or value == '':
                return default
            try:
                return float(value)
            except (ValueError, TypeError):
                return default
        
        def get_list(value, default=None):
            if default is None:
                default = []
            if value is None:
                return default
            if isinstance(value, list):
                return value
            if hasattr(value, '__iter__') and not isinstance(value, (str, bytes)):
                return list(value)
            return default
        
        # Update patrimonial fields
        if 'professionalActivityStatus' in request.data:
            client.professional_activity_status = request.data.get('professionalActivityStatus', '') or ''
        if 'professionalActivityComment' in request.data:
            client.professional_activity_comment = request.data.get('professionalActivityComment', '') or ''
        if 'professions' in request.data:
            professions = get_list(request.data.get('professions'))
            client.professions = professions
        if 'professionsComment' in request.data:
            client.professions_comment = request.data.get('professionsComment', '') or ''
        if 'bankName' in request.data:
            client.bank_name = request.data.get('bankName', '') or ''
        if 'currentAccount' in request.data:
            client.current_account = to_decimal(request.data.get('currentAccount'))
        if 'livretAB' in request.data:
            client.livret_ab = to_decimal(request.data.get('livretAB'))
        if 'pea' in request.data:
            client.pea = to_decimal(request.data.get('pea'))
        if 'pel' in request.data:
            client.pel = to_decimal(request.data.get('pel'))
        if 'ldd' in request.data:
            client.ldd = to_decimal(request.data.get('ldd'))
        if 'cel' in request.data:
            client.cel = to_decimal(request.data.get('cel'))
        if 'csl' in request.data:
            client.csl = to_decimal(request.data.get('csl'))
        if 'securitiesAccount' in request.data:
            client.securities_account = to_decimal(request.data.get('securitiesAccount'))
        if 'lifeInsurance' in request.data:
            client.life_insurance = to_decimal(request.data.get('lifeInsurance'))
        if 'savingsComment' in request.data:
            client.savings_comment = request.data.get('savingsComment', '') or ''
        if 'totalWealth' in request.data:
            client.total_wealth = to_decimal(request.data.get('totalWealth'))
        if 'objectives' in request.data:
            objectives = get_list(request.data.get('objectives'))
            client.objectives = objectives
        if 'objectivesComment' in request.data:
            client.objectives_comment = request.data.get('objectivesComment', '') or ''
        if 'experience' in request.data:
            experience = get_list(request.data.get('experience'))
            client.experience = experience
        if 'experienceComment' in request.data:
            client.experience_comment = request.data.get('experienceComment', '') or ''
        if 'taxOptimization' in request.data:
            tax_opt = request.data.get('taxOptimization')
            if isinstance(tax_opt, str):
                client.tax_optimization = tax_opt.lower() == 'true'
            else:
                client.tax_optimization = bool(tax_opt)
        if 'taxOptimizationComment' in request.data:
            client.tax_optimization_comment = request.data.get('taxOptimizationComment', '') or ''
        if 'annualHouseholdIncome' in request.data:
            client.annual_household_income = to_decimal(request.data.get('annualHouseholdIncome'))
        
        # Update payment methods
        if 'paymentMethods' in request.data:
            payment_methods = get_list(request.data.get('paymentMethods'))
            client.payment_methods = payment_methods
        
        # Update trading enabled if provided
        if 'tradingEnabled' in request.data:
            v = request.data.get('tradingEnabled')
            client.trading_enabled = (v.lower() == 'true') if isinstance(v, str) else bool(v)

        # Update position price visibility if provided
        if 'showPositionPrices' in request.data:
            v = request.data.get('showPositionPrices')
            client.show_position_prices = (v.lower() == 'true') if isinstance(v, str) else bool(v)
        
        # Update banner message if provided
        if 'bannerMessage' in request.data:
            client.banner_message = request.data.get('bannerMessage', '') or ''
        
        # Update contract preview enabled if provided
        if 'contractPreviewEnabled' in request.data:
            v = request.data.get('contractPreviewEnabled')
            client.contract_preview_enabled = (v.lower() == 'true') if isinstance(v, str) else bool(v)
            if client.contract_preview_enabled:
                client.imported_contract_preview_enabled = False

        if 'importedContractPreviewEnabled' in request.data:
            v = request.data.get('importedContractPreviewEnabled')
            parsed = (v.lower() == 'true') if isinstance(v, str) else bool(v)
            # Sous-option sans effet tant que la prévisualisation PDF est activée
            client.imported_contract_preview_enabled = bool(parsed) and not client.contract_preview_enabled
        
        # Create log entry for client update
        try:
            # Get list of changed fields
            changed_fields = []
            for field in request.data.keys():
                if field not in ['removeProfilePhoto']:  # Skip special fields
                    changed_fields.append(field)
            
            if changed_fields:
                create_log_entry(
                    event_type='editClient',
                    user_id=request.user if request.user.is_authenticated else None,
                    request=request,
                    old_value={},  # Could capture old values, but complex for now
                    new_value={'changed_fields': changed_fields},
                    client_id=client
                )
        except Exception as log_error:
            # Log the error but don't fail the client update
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create log entry for client update {client_id}: {str(log_error)}")
        
        client.save()
        serializer = ClientSerializer(client, context={'request': request})
        return Response({'client': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_toggle_active(request, client_id):
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    client.active = not client.active
    client.save()
    return Response({'active': client.active})

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_delete(request, client_id):
    from .position_audit import position_deletion_audit

    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    with position_deletion_audit('orm_cascade_client'):
        client.delete()
    return Response({'message': 'Client supprimé avec succès'}, status=status.HTTP_200_OK)

@api_view(['GET', 'PUT'])
@authentication_classes([])  # Disable authentication - we'll check manually to support client_ tokens
@permission_classes([AllowAny])
def client_verification_config(request, client_id):
    """Récupérer ou mettre à jour la configuration de vérification d'un client"""
    client = get_object_or_404(Client, id=client_id)
    
    # Check authentication manually - tokens must be in Authorization header only (not query params for security)
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    token = auth_header.replace('Bearer ', '')
    
    # Check if it's a client token accessing their own config
    is_client_access = False
    is_admin_access = False
    
    if token.startswith('client_'):
        token_client_id = token.replace('client_', '')
        if token_client_id == client_id:
            is_client_access = True
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    else:
        # Try to validate JWT token manually for admin access
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                is_admin_access = True
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # For PUT requests, only admins can modify
    if request.method == 'PUT' and is_client_access:
        return Response({'error': 'Seuls les administrateurs peuvent modifier la configuration'}, status=status.HTTP_403_FORBIDDEN)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if is_admin_access:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    if request.method == 'GET':
        # Récupérer ou créer la config si elle n'existe pas
        config, created = ClientVerificationConfig.objects.get_or_create(
            client=client,
            defaults={
                'id': uuid.uuid4().hex[:12],
                'steps_config': dict(DEFAULT_CLIENT_VERIFICATION_STEPS_CONFIG),
            },
        )
        serializer = ClientVerificationConfigSerializer(config, context={'request': request})
        response = Response(serializer.data)
        # Add cache-control headers to prevent caching
        response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response['Pragma'] = 'no-cache'
        response['Expires'] = '0'
        return response
    
    elif request.method == 'PUT':
        # Mettre à jour la config (admin only)
        config, created = ClientVerificationConfig.objects.get_or_create(
            client=client,
            defaults={
                'id': uuid.uuid4().hex[:12],
                'steps_config': dict(DEFAULT_CLIENT_VERIFICATION_STEPS_CONFIG),
            },
        )
        # Log the incoming data for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f'Updating verification config for client {client_id}: {request.data}')
        
        serializer = ClientVerificationConfigSerializer(config, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            # Log the saved data to verify it was saved correctly
            config.refresh_from_db()
            logger.info(f'Verification config saved for client {client_id}. steps_config: {config.steps_config}')
            response = Response(serializer.data)
            # Add cache-control headers to prevent caching
            response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response['Pragma'] = 'no-cache'
            response['Expires'] = '0'
            return response
        logger.error(f'Serializer errors for client {client_id}: {serializer.errors}')
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_history(request, client_id):
    """Get history of actions performed ON the client (admin/gestionnaire actions)"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    
    # Get logs related to this client
    logs = Log.objects.filter(client_id=client).order_by('-created_at')
    
    # Pagination support
    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '50')
    
    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 50
        if limit > 500:
            limit = 500
    except (ValueError, TypeError):
        page = 1
        limit = 50
    
    total_count = logs.count()
    offset = (page - 1) * limit
    paginated_logs = logs[offset:offset + limit]
    
    serializer = ClientHistoryLogSerializer(paginated_logs, many=True)
    return Response({
        'history': serializer.data,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_count,
            'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1
        }
    })


@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to reject client_ tokens
@permission_classes([AllowAny])
def platform_logs_list(request):
    """Aggregated platform logs from all clients the user has access to. Filters: client_id, action_type, date_from, date_to."""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    token = auth_header.replace('Bearer ', '')
    if token.startswith('client_'):
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    jwt_auth = JWTAuthentication()
    try:
        validated_token = jwt_auth.get_validated_token(token)
        user = jwt_auth.get_user(validated_token)
        if not user.is_authenticated:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        request.user = user
    except Exception:
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)

    client_ids = _get_client_ids_user_has_access_to(request)
    qs = ClientPlatformLog.objects.select_related('client').order_by('-created_at')
    if client_ids is not None:
        qs = qs.filter(client_id__in=client_ids)

    client_id = request.GET.get('client_id', '').strip()
    if client_id:
        if client_ids is not None and client_id not in client_ids:
            return Response({'error': 'Accès refusé à ce client'}, status=status.HTTP_403_FORBIDDEN)
        qs = qs.filter(client_id=client_id)

    action_type = request.GET.get('action_type', '').strip()
    if action_type:
        qs = qs.filter(action_type=action_type)

    date_from = request.GET.get('date_from', '').strip()
    date_to = request.GET.get('date_to', '').strip()
    if date_from:
        try:
            d = datetime.strptime(date_from, '%Y-%m-%d').date()
            qs = qs.filter(created_at__date__gte=d)
        except ValueError:
            pass
    if date_to:
        try:
            d = datetime.strptime(date_to, '%Y-%m-%d').date()
            qs = qs.filter(created_at__date__lte=d)
        except ValueError:
            pass

    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '50')
    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 50
        if limit > 500:
            limit = 500
    except (ValueError, TypeError):
        page = 1
        limit = 50

    total_count = qs.count()
    offset = (page - 1) * limit
    log_fields = ['id', 'action_type', 'action_details', 'ip_address', 'user_agent', 'created_at', 'client_id']
    if _client_platform_log_has_origin_column():
        log_fields.append('origin')
    paginated_rows = list(qs.values(*log_fields)[offset:offset + limit])
    serialized_logs = _serialize_platform_log_rows(paginated_rows, include_client_display_name=True)
    viewer_ip = get_client_ip(request)
    return Response({
        'platformLogs': serialized_logs,
        'viewerIp': viewer_ip if viewer_ip and viewer_ip != 'Unknown' else None,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_count,
            'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1
        }
    })


@api_view(['GET', 'POST'])
@authentication_classes([])  # Disable authentication - we'll check manually to support client_ tokens
@permission_classes([AllowAny])
def client_platform_logs(request, client_id):
    """Get or create platform logs for a client (actions performed BY the client)"""
    client = get_object_or_404(Client, id=client_id)
    
    if request.method == 'GET':
        # GET: Return platform logs (admin/gestionnaire only)
        # Check authentication manually
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        
        token = auth_header.replace('Bearer ', '')
        
        # Check if it's an admin token (not client token)
        if token.startswith('client_'):
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        
        # Verify admin authentication
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if not user.is_authenticated:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
            request.user = user
        except Exception:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
        
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
        
        # Get platform logs for this client
        logs = ClientPlatformLog.objects.filter(client=client).order_by('-created_at')
        
        # Pagination support
        page = request.GET.get('page', '1')
        limit = request.GET.get('limit', '50')
        
        try:
            page = int(page)
            limit = int(limit)
            if page < 1:
                page = 1
            if limit < 1:
                limit = 50
            if limit > 500:
                limit = 500
        except (ValueError, TypeError):
            page = 1
            limit = 50
        
        total_count = logs.count()
        offset = (page - 1) * limit
        log_fields = ['id', 'action_type', 'action_details', 'ip_address', 'user_agent', 'created_at', 'client_id']
        if _client_platform_log_has_origin_column():
            log_fields.append('origin')
        paginated_rows = list(logs.values(*log_fields)[offset:offset + limit])
        serialized_logs = _serialize_platform_log_rows(paginated_rows, include_client_display_name=False)
        viewer_ip = get_client_ip(request)
        return Response({
            'platformLogs': serialized_logs,
            'viewerIp': viewer_ip if viewer_ip and viewer_ip != 'Unknown' else None,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total_count,
                'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1
            }
        })
    
    elif request.method == 'POST':
        # POST: Create a platform log (client can create their own logs)
        # Check authentication manually
        auth_header = request.headers.get('Authorization', '')
        token = None
        
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '').strip()
        
        # If no token provided, return 401 Unauthorized (REST API semantics)
        if not token:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if it's a client token accessing their own logs
        is_client_access = False
        is_admin_access = False
        
        if token.startswith('client_'):
            token_client_id = token.replace('client_', '')
            if token_client_id == client_id:
                is_client_access = True
                if not client.active:
                    return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        
        # Check if it's an admin token
        if not token.startswith('client_'):
            from rest_framework_simplejwt.authentication import JWTAuthentication
            jwt_auth = JWTAuthentication()
            try:
                validated_token = jwt_auth.get_validated_token(token)
                user = jwt_auth.get_user(validated_token)
                if user.is_authenticated:
                    is_admin_access = True
            except Exception:
                pass
        
        if not is_client_access and not is_admin_access:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Get action data from request
        action_type = request.data.get('actionType', '')
        action_details = request.data.get('actionDetails', {})
        
        if not action_type:
            return Response({'error': 'actionType est requis'}, status=status.HTTP_400_BAD_REQUEST)

        if action_type == 'login':
            return Response(
                {'error': "L'événement login est réservé au backend"},
                status=status.HTTP_403_FORBIDDEN
            )

        normalized_action_details = dict(action_details) if isinstance(action_details, dict) else {}
        requested_origin = normalized_action_details.pop('__sessionOrigin', '')
        forced_origin = _normalize_platform_log_origin(requested_origin)
        
        # Create platform log
        create_platform_log(
            client_id,
            action_type,
            normalized_action_details,
            request,
            forced_origin=forced_origin
        )
        
        return Response({'message': 'Log créé avec succès'}, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([AllowAny])
def client_login(request):
    """Client login endpoint - authenticates clients using email/password"""
    import logging
    logger = logging.getLogger(__name__)
    
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '').strip()
    
    # Log login attempt with detailed debugging
    logger.info(f"Client login attempt for email: {email}")
    logger.info(f"Email after processing: {repr(email)}")
    logger.info(f"Password length received: {len(password)}")
    logger.info(f"Password first 3 chars: {repr(password[:3]) if len(password) >= 3 else repr(password)}")
    
    if not email or not password:
        logger.warning(f"Login attempt with missing credentials - email: {bool(email)}, password: {bool(password)}")
        return Response({'error': 'Email et mot de passe requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Use case-insensitive email lookup
        client = Client.objects.get(email__iexact=email)
    except Client.DoesNotExist:
        logger.warning(f"Login attempt with non-existent email: {email}")
        return Response({'error': 'Email ou mot de passe incorrect'}, status=status.HTTP_401_UNAUTHORIZED)
    except Client.MultipleObjectsReturned:
        # Should not happen due to unique constraint, but handle gracefully
        logger.error(f"Multiple clients found for email: {email}")
        client = Client.objects.filter(email__iexact=email).first()
    
    # Check if client is active
    if not client.active:
        logger.warning(f"Login attempt for inactive client {client.id}")
        return Response({'error': 'Compte désactivé'}, status=status.HTTP_403_FORBIDDEN)
    
    # Check if client is active
    if not client.active:
        logger.warning(f"Login attempt for inactive client {client.id}")
        return Response({'error': 'Compte désactivé'}, status=status.HTTP_403_FORBIDDEN)
    
    # Verify password (simple string comparison for now - in production, use hashing)
    # Strip whitespace from stored password for comparison (defensive programming)
    stored_password = (client.password or '').strip()
    
    # Enhanced logging for password comparison
    logger.info(f"Client found: {client.id}")
    logger.info(f"Stored password length: {len(stored_password)}")
    logger.info(f"Received password length: {len(password)}")
    logger.info(f"Passwords match: {stored_password == password}")
    
    if stored_password != password:
        logger.warning(f"Login attempt for client {client.id} with incorrect password")
        logger.warning(f"Stored password (first 3): {repr(stored_password[:3]) if len(stored_password) >= 3 else repr(stored_password)}")
        logger.warning(f"Received password (first 3): {repr(password[:3]) if len(password) >= 3 else repr(password)}")
        return Response({'error': 'Email ou mot de passe incorrect'}, status=status.HTTP_401_UNAUTHORIZED)
    
    logger.info(f"Successful login for client {client.id} ({email})")

    # Create platform log for login
    try:
        create_platform_log(
            client.id,
            'login',
            {'method': 'password'},
            request,
            forced_origin=PLATFORM_LOG_ORIGIN_CLIENT_LOGIN
        )
    except Exception as log_error:
        # Log the error but don't fail the login
        logger.error(f"Failed to create platform log for login {client.id}: {str(log_error)}")

    manager_user = _resolve_client_manager_user(client)
    if manager_user:
        client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=manager_user,
            notification_type=AppNotification.TYPE_CLIENT_LOGIN,
            title="Client connecté",
            message=f"{client_name} s'est connecté à la plateforme.",
            payload={"client_id": client.id},
        )

    # Ensure account_verified is consistent with required fields
    changed_fields = _recompute_client_account_verified(client)
    if changed_fields:
        client.save(update_fields=changed_fields)
    
    # Return client data (in production, generate a proper token)
    serializer = ClientSerializer(client, context={'request': request})
    return Response({
        'client': serializer.data,
        'token': f'client_{client.id}',  # Simple token for now
        'userType': 'client'
    }, status=status.HTTP_200_OK)


def _client_can_access_platform(client: Client) -> bool:
    return bool(client and client.active)


def _get_client_by_email(email: str) -> Client | None:
    try:
        return Client.objects.get(email__iexact=(email or "").strip().lower())
    except Client.DoesNotExist:
        return None
    except Client.MultipleObjectsReturned:
        # Should not happen due to unique constraint, but handle gracefully.
        return Client.objects.filter(email__iexact=(email or "").strip().lower()).first()


def _phone_digits(value: str) -> str:
    return re.sub(r'\D', '', str(value or ''))


def _phones_match(a: str, b: str) -> bool:
    da = _phone_digits(a)
    db = _phone_digits(b)
    if not da or not db:
        return False
    # Compare on last 9 digits to tolerate country codes (+33, 0033, etc.)
    if len(da) >= 9 and len(db) >= 9:
        return da[-9:] == db[-9:]
    return da == db


def _get_client_by_phone(phone: str) -> Client | None:
    digits = _phone_digits(phone)
    if len(digits) < 6:
        return None
    # Narrow candidates by last 6 digits (cheap prefilter), then verify.
    tail = digits[-6:]
    candidates = Client.objects.filter(
        Q(mobile__icontains=tail) | Q(phone__icontains=tail)
    )[:50]
    for c in candidates:
        if _phones_match(getattr(c, 'mobile', ''), phone) or _phones_match(getattr(c, 'phone', ''), phone):
            return c
    # Fallback: if numbers are stored with spaces/punctuation, icontains prefilter may miss.
    # Scan a limited subset and compare digits-only values.
    try:
        qs = Client.objects.exclude(Q(mobile='') & Q(phone='')).only('id', 'mobile', 'phone', 'email', 'active')[:5000]
        for c in qs:
            if _phones_match(getattr(c, 'mobile', ''), phone) or _phones_match(getattr(c, 'phone', ''), phone):
                return c
    except Exception:
        pass
    return None


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_password_reset_request(request):
    """
    Client platform only: request a password reset email.
    Returns a generic success response to avoid account enumeration.
    """
    email = (request.data.get('email') or '').strip().lower()
    if not email:
        return Response({'error': 'Email requis'}, status=status.HTTP_400_BAD_REQUEST)

    client = _get_client_by_email(email)
    if client and _client_can_access_platform(client):
        expires_seconds = 60 * 60  # 60 minutes
        expires_minutes = expires_seconds // 60
        token = signing.dumps(
            {'purpose': 'client_password_reset', 'client_id': client.id},
            salt='client-password-reset',
        )
        reset_url = f"{get_frontend_public_url()}/reset-password?token={quote(token)}"

        platform_name = get_platform_name()
        logo_url = get_platform_logo_url()
        subject = f"{platform_name} - Réinitialisation du mot de passe"
        html = render_email(
            'emails/client_password_reset.html',
            {
                'platform_name': platform_name,
                'logo_url': logo_url,
                'reset_url': reset_url,
                'expires_minutes': expires_minutes,
            },
        )
        try:
            send_resend_email(to_email=client.email, subject=subject, html=html)
        except Exception as e:
            # In production, keep response generic; in DEBUG return the underlying error.
            if getattr(settings, 'DEBUG', False):
                return Response({'error': f'Email send failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Always respond with the same message.
    return Response(
        {'message': "Si un compte existe pour cet email, un lien de reinitialisation a ete envoye."},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def referral_prospect_create(request):
    """
    Public endpoint: create a referral prospect (invited by a client).
    Body: { code, fname, lname, email, phone }
    """
    serializer = ReferralProspectCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    code = (serializer.validated_data.get('code') or '').strip()
    if not code:
        return Response({'error': 'Code d\'invitation invalide'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        referrer = Client.objects.get(id=code, active=True)
    except Client.DoesNotExist:
        return Response({'error': 'Lien d\'invitation invalide ou expiré'}, status=status.HTTP_400_BAD_REQUEST)

    prospect_id = uuid.uuid4().hex[:12]
    fname_val = (serializer.validated_data.get('fname') or '').strip()
    lname_val = (serializer.validated_data.get('lname') or '').strip()
    email_val = (serializer.validated_data.get('email') or '').strip().lower()
    phone_val = (serializer.validated_data.get('phone') or '').strip()
    ReferralProspect.objects.create(
        id=prospect_id,
        referrer=referrer,
        fname=fname_val,
        lname=lname_val,
        email=email_val,
        phone=phone_val,
    )

    # Notifications : admin + conseiller gestionnaire du client parrain
    prospect_name = f"{fname_val} {lname_val}".strip() or email_val
    referrer_name = f"{referrer.fname or ''} {referrer.lname or ''}".strip() or referrer.email or referrer.id
    notif_title = "Nouvelle inscription parrainage"
    notif_message = f"{prospect_name} s'est inscrit via l'invitation de {referrer_name}."
    notif_payload = {
        "prospect_id": prospect_id,
        "referrer_id": referrer.id,
        "prospect_email": email_val,
    }

    # Notification à tous les admins
    admin_user_ids = list(UserDetails.objects.filter(role='admin').values_list('django_user_id', flat=True))
    for admin_django_user in DjangoUser.objects.filter(id__in=admin_user_ids):
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=admin_django_user,
            notification_type=AppNotification.TYPE_REFERRAL_INSCRIPTION,
            title=notif_title,
            message=notif_message,
            payload=notif_payload,
        )

    # Notification au conseiller gestionnaire du client parrain
    manager_user = _resolve_client_manager_user(referrer)
    if manager_user and manager_user.id not in admin_user_ids:
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=manager_user,
            notification_type=AppNotification.TYPE_REFERRAL_INSCRIPTION,
            title=notif_title,
            message=notif_message,
            payload=notif_payload,
        )

    return Response({'message': 'Merci ! Nous vous contacterons rapidement.'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_password_reset_confirm(request):
    """Client platform only: confirm password reset using a signed token."""
    token = (request.data.get('token') or '').strip()
    new_password = (request.data.get('newPassword') or request.data.get('password') or '').strip()
    if not token or not new_password:
        return Response({'error': 'token et newPassword requis'}, status=status.HTTP_400_BAD_REQUEST)
    if len(new_password) < 6:
        return Response({'error': 'Le mot de passe doit contenir au moins 6 caracteres'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payload = signing.loads(token, salt='client-password-reset', max_age=60 * 60)
    except Exception:
        return Response({'error': 'Lien invalide ou expire'}, status=status.HTTP_400_BAD_REQUEST)

    if payload.get('purpose') != 'client_password_reset':
        return Response({'error': 'Lien invalide'}, status=status.HTTP_400_BAD_REQUEST)

    client_id = payload.get('client_id')
    if not client_id:
        return Response({'error': 'Lien invalide'}, status=status.HTTP_400_BAD_REQUEST)

    client = get_object_or_404(Client, id=client_id)
    if not _client_can_access_platform(client):
        return Response({'error': 'Acces refuse'}, status=status.HTTP_403_FORBIDDEN)

    client.password = new_password
    client.save(update_fields=['password', 'updated_at'])
    try:
        create_platform_log(client.id, 'password_reset', {}, request)
    except Exception:
        pass

    return Response({'message': 'Mot de passe mis a jour avec succes'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_login_otp_request(request):
    """
    Client platform only: request a one-time code by email or SMS.
    Response includes a signed challenge token used to verify the OTP.
    """
    channel = (request.data.get('channel') or 'email').strip().lower()
    if channel not in ('email', 'sms'):
        return Response({'error': 'channel invalide (email|sms)'}, status=status.HTTP_400_BAD_REQUEST)

    # Check if this auth method is enabled in app settings
    try:
        app_settings = AppSettings.objects.get(id='settings001')
        if channel == 'email' and not getattr(app_settings, 'otp_email_enabled', True):
            return Response({'error': 'Connexion par code email est désactivée.'}, status=status.HTTP_400_BAD_REQUEST)
        if channel == 'sms' and not getattr(app_settings, 'otp_sms_enabled', True):
            return Response({'error': 'Connexion par code SMS est désactivée.'}, status=status.HTTP_400_BAD_REQUEST)
    except AppSettings.DoesNotExist:
        pass  # defaults: both enabled

    email = (request.data.get('email') or '').strip().lower()
    phone = (request.data.get('phone') or '').strip()

    # Identify client depending on channel.
    if channel == 'email':
        if not email:
            return Response({'error': 'Email requis'}, status=status.HTTP_400_BAD_REQUEST)
        client = _get_client_by_email(email)
    else:
        # SMS: accept a phone number directly (recommended), or fallback to email.
        if phone:
            client = _get_client_by_phone(phone)
        elif email:
            client = _get_client_by_email(email)
        else:
            return Response({'error': 'phone ou email requis'}, status=status.HTTP_400_BAD_REQUEST)

    logger = logging.getLogger(__name__)
    logger.info("OTP request received", extra={"channel": channel, "has_email": bool(email), "has_phone": bool(phone)})

    if not (client and _client_can_access_platform(client)):
        # Keep response generic (avoid account enumeration).
        # We also return `sent: false` so the frontend only shows the OTP input when we actually sent one.
        return Response(
            {
                'sent': False,
                'channel': channel,
                'message': "Si un compte existe pour ces informations, vous recevrez un code de connexion.",
            },
            status=status.HTTP_200_OK,
        )

    expires_seconds = 10 * 60  # 10 minutes
    expires_minutes = expires_seconds // 60

    # Keep local OTP logic only for the email channel.
    otp_code = ""
    challenge_payload: dict[str, object] = {
        'purpose': 'client_login_otp',
        'client_id': client.id,
        'channel': channel,
    }
    if channel == 'email':
        otp_code = f"{secrets.randbelow(1_000_000):06d}"
        otp_id = secrets.token_hex(16)
        expected_hmac = otp_hmac(otp_id=otp_id, code=otp_code, secret=settings.SECRET_KEY)
        challenge_payload.update(
            {
                'otp_id': otp_id,
                'code_hmac': expected_hmac,
            }
        )

    try:
        if channel == 'email':
            challenge_token = signing.dumps(challenge_payload, salt='client-login-otp')
            platform_name = get_platform_name()
            logo_url = get_platform_logo_url()
            subject = f"{platform_name} - Code de connexion"
            html = render_email(
                'emails/client_login_otp.html',
                {
                    'platform_name': platform_name,
                    'logo_url': logo_url,
                    'otp_code': otp_code,
                    'expires_minutes': expires_minutes,
                },
            )
            send_resend_email(to_email=client.email, subject=subject, html=html)
        else:
            # Prefer mobile over phone for SMS.
            stored_mobile = (getattr(client, 'mobile', '') or '').strip()
            stored_phone = (getattr(client, 'phone', '') or '').strip()

            send_to = ""
            # If the user provided an international number (+.. / 00..), prefer sending to that exact value
            # (avoids local-format numbers like 06.. or 054.. causing "prefix missing" in Infobip),
            # but only if it matches the stored phone.
            phone_input = (phone or '').strip()
            is_international_input = phone_input.startswith('+') or phone_input.startswith('00')
            if is_international_input and (_phones_match(stored_mobile, phone_input) or _phones_match(stored_phone, phone_input)):
                send_to = phone_input
            elif phone_input and _phones_match(stored_mobile, phone_input):
                send_to = stored_mobile
            elif phone_input and _phones_match(stored_phone, phone_input):
                send_to = stored_phone
            else:
                send_to = stored_mobile or stored_phone

            if not send_to:
                # No SMS possible for this account.
                return Response(
                    {'sent': False, 'channel': channel, 'error': 'Aucun numéro de téléphone configuré pour ce compte.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            verify_resp = create_prelude_verification(to_phone=send_to, locale='fr-FR')
            request._prelude_verification_id = verify_resp.get('id') if isinstance(verify_resp, dict) else None
            request._prelude_verification_status = verify_resp.get('status') if isinstance(verify_resp, dict) else None
            request._prelude_verification_method = verify_resp.get('method') if isinstance(verify_resp, dict) else None

            challenge_payload['phone'] = send_to
            challenge_token = signing.dumps(challenge_payload, salt='client-login-otp')
    except Exception as e:
        # Log details server-side for troubleshooting.
        logger.exception("OTP send failed", extra={"channel": channel, "client_id": getattr(client, "id", None)})
        try:
            create_platform_log(
                client.id,
                'otp_send_failed',
                {'channel': channel, 'error': str(e)[:300]},
                request
            )
        except Exception:
            pass
        extra: dict[str, object] = {}
        if channel == 'sms':
            verification_id = getattr(request, '_prelude_verification_id', None)
            verification_status = getattr(request, '_prelude_verification_status', None)
            if verification_id:
                extra['preludeVerificationId'] = verification_id
            if verification_status:
                extra['preludeVerificationStatus'] = verification_status

        if getattr(settings, 'DEBUG', False):
            return Response({'error': f'OTP send failed: {str(e)}', **extra}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        # Production: avoid leaking details.
        return Response({'error': 'Erreur lors de l\'envoi du code', **extra}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    try:
        details = {'channel': channel}
        if channel == 'sms':
            verification_id = getattr(request, '_prelude_verification_id', None)
            if verification_id:
                details['prelude_verification_id'] = verification_id
            verification_status = getattr(request, '_prelude_verification_status', None)
            if verification_status:
                details['prelude_verification_status'] = verification_status
        create_platform_log(client.id, 'otp_login_requested', details, request)
    except Exception:
        pass

    resp_payload = {
        'sent': True,
        'message': 'Code envoye',
        'challengeToken': challenge_token,
        'expiresInSeconds': expires_seconds,
        'channel': channel,
    }
    if channel == 'sms':
        verification_id = getattr(request, '_prelude_verification_id', None)
        verification_status = getattr(request, '_prelude_verification_status', None)
        verification_method = getattr(request, '_prelude_verification_method', None)
        if verification_id:
            resp_payload['preludeVerificationId'] = verification_id
        if verification_status:
            resp_payload['preludeVerificationStatus'] = verification_status
        if verification_method:
            resp_payload['preludeVerificationMethod'] = verification_method
    return Response(resp_payload, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_login_otp_verify(request):
    """Client platform only: verify OTP and issue a client_ token."""
    challenge_token = (request.data.get('challengeToken') or '').strip()
    otp_code = (request.data.get('code') or '').strip()
    if not challenge_token or not otp_code:
        return Response({'error': 'challengeToken et code requis'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payload = signing.loads(challenge_token, salt='client-login-otp', max_age=10 * 60)
    except Exception:
        return Response({'error': 'Code invalide ou expire'}, status=status.HTTP_400_BAD_REQUEST)

    if payload.get('purpose') != 'client_login_otp':
        return Response({'error': 'Code invalide'}, status=status.HTTP_400_BAD_REQUEST)

    client_id = payload.get('client_id')
    channel = (payload.get('channel') or 'email').strip().lower()
    if not client_id or channel not in ('email', 'sms'):
        return Response({'error': 'Code invalide'}, status=status.HTTP_400_BAD_REQUEST)

    if channel == 'email':
        otp_id = payload.get('otp_id')
        expected_hmac = payload.get('code_hmac')
        if not otp_id or not expected_hmac:
            return Response({'error': 'Code invalide'}, status=status.HTTP_400_BAD_REQUEST)

        actual_hmac = otp_hmac(otp_id=str(otp_id), code=otp_code, secret=settings.SECRET_KEY)
        if not hmac.compare_digest(str(expected_hmac), str(actual_hmac)):
            return Response({'error': 'Code invalide'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        phone = (payload.get('phone') or '').strip()
        if not phone:
            return Response({'error': 'Code invalide'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            verify_check = check_prelude_verification(to_phone=phone, code=otp_code)
            verify_status = (verify_check.get('status') or '').strip().lower() if isinstance(verify_check, dict) else ''
            if verify_status != 'success':
                if verify_status == 'expired_or_not_found':
                    return Response({'error': 'Code invalide ou expire'}, status=status.HTTP_400_BAD_REQUEST)
                return Response({'error': 'Code invalide'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'error': 'Code invalide ou expire'}, status=status.HTTP_400_BAD_REQUEST)

    client = get_object_or_404(Client, id=client_id)
    if not _client_can_access_platform(client):
        return Response({'error': 'Acces refuse'}, status=status.HTTP_403_FORBIDDEN)

    try:
        create_platform_log(
            client.id,
            'login',
            {'method': 'otp', 'channel': channel},
            request,
            forced_origin=PLATFORM_LOG_ORIGIN_OTP_LOGIN
        )
    except Exception:
        pass

    manager_user = _resolve_client_manager_user(client)
    if manager_user:
        client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=manager_user,
            notification_type=AppNotification.TYPE_CLIENT_LOGIN,
            title="Client connecté",
            message=f"{client_name} s'est connecté à la plateforme.",
            payload={"client_id": client.id},
        )

    changed_fields = _recompute_client_account_verified(client)
    if changed_fields:
        client.save(update_fields=changed_fields)

    serializer = ClientSerializer(client, context={'request': request})
    return Response(
        {
            'client': serializer.data,
            'token': f'client_{client.id}',
            'userType': 'client',
        },
        status=status.HTTP_200_OK,
    )

@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])  # Disable JWT auth; client_ tokens aren't JWTs
def get_current_client(request):
    """Get current client from token"""
    # Get token from Authorization header or query param
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

        # Ensure account_verified is consistent with required fields
        changed_fields = _recompute_client_account_verified(client)
        if changed_fields:
            client.save(update_fields=changed_fields)

        # CRM impersonation path can bypass /api/client/login/.
        # When explicitly flagged by frontend, create a platform login log here.
        # Do NOT create a client login notification - only manual logins from the
        # login page should trigger notifications.
        if request.GET.get('source') == 'crm_impersonation':
            impersonation_mode = request.GET.get('mode', '')
            client_display_name = " ".join(
                [part for part in [client.fname or '', client.lname or ''] if part.strip()]
            ).strip() or (client.email or client.id)
            create_platform_log(
                client.id,
                'login',
                {
                    'source': 'crm_impersonation',
                    'mode': impersonation_mode,
                    'client_name': client_display_name,
                },
                request,
                forced_origin=PLATFORM_LOG_ORIGIN_CRM_IMPERSONATION
            )

        serializer = ClientSerializer(client, context={'request': request})
        client_data = dict(serializer.data)
        client_data['hasUsefulLinks'] = ClientUsefulLink.objects.filter(client=client).exists()
        return Response({
            'client': client_data,
            'userType': 'client'
        })
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_notification_list(request):
    """List notifications for the current client (token)."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if not client.active:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '20')
    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 20
        if limit > 100:
            limit = 100
    except (ValueError, TypeError):
        page = 1
        limit = 20
    # Exclure les notifications de type message (affichées dans la bulle messagerie)
    qs = AppNotification.objects.filter(
        recipient_type=AppNotification.RECIPIENT_CLIENT,
        recipient_client=client,
    ).exclude(notification_type=AppNotification.TYPE_MESSAGE_FROM_MANAGER).order_by('-created_at')
    total = qs.count()
    offset = (page - 1) * limit
    items = qs[offset:offset + limit]
    serializer = AppNotificationSerializer(items, many=True)
    return Response({
        'notifications': serializer.data,
        'unreadCount': qs.filter(read=False).count(),
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total,
            'totalPages': (total + limit - 1) // limit if limit > 0 else 1,
        },
    })


@api_view(['PATCH'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_notification_mark_all_read(request):
    """Mark all notifications as read for the current client."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if not client.active:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    updated = AppNotification.objects.filter(
        recipient_type=AppNotification.RECIPIENT_CLIENT,
        recipient_client=client,
        read=False,
    ).exclude(notification_type=AppNotification.TYPE_MESSAGE_FROM_MANAGER).update(read=True)
    return Response({'ok': True, 'updated': updated})


@api_view(['PATCH'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_notification_mark_read(request, notification_id):
    """Mark a notification as read (client)."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if not client.active:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    notification = get_object_or_404(
        AppNotification,
        id=notification_id,
        recipient_type=AppNotification.RECIPIENT_CLIENT,
        recipient_client=client,
    )
    notification.read = True
    notification.save(update_fields=['read'])
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def client_messages_unread_count(request):
    """Nombre de messages non lus par le client (envoyés par le gestionnaire)."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if not client.active:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    count = ClientChatMessage.objects.filter(
        client=client,
        sender='manager',
        read_by_client=False,
    ).count()
    return Response({'unreadCount': count})


@api_view(['PATCH'])
@permission_classes([AllowAny])
@authentication_classes([])  # Disable JWT auth; client_ tokens aren't JWTs
def client_update_identity(request):
    """
    Update current client identity fields using a client_ token.
    This endpoint is intended for the client platform (self-service verification).
    """
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)

    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if not client.active:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    def parse_birth_date(value):
        if not value:
            return None
        try:
            # Handle both YYYY-MM-DD and DD/MM/YYYY formats
            if '/' in str(value):
                parts = str(value).split('/')
                if len(parts) == 3:
                    day, month, year = parts
                    return datetime.strptime(f"{year}-{month}-{day}", "%Y-%m-%d").date()
            return datetime.strptime(str(value), "%Y-%m-%d").date()
        except Exception:
            return None

    # Update identity fields
    # Name, e-mail and phone numbers are CRM-managed; self-service clients cannot change them here.
    if 'legalName' in request.data:
        client.legal_name = request.data.get('legalName', '') or ''
    if 'sex' in request.data:
        client.sex = request.data.get('sex', '') or ''
    if 'birthDate' in request.data:
        client.birth_date = parse_birth_date(request.data.get('birthDate'))
    if 'address' in request.data:
        client.address = request.data.get('address', '') or ''
    if 'postalCode' in request.data:
        client.postal_code = request.data.get('postalCode', '') or ''
    if 'city' in request.data:
        client.city = request.data.get('city', '') or ''
    if 'civility' in request.data:
        client.civility = request.data.get('civility', '') or ''
    if 'birthPlace' in request.data:
        client.birth_place = request.data.get('birthPlace', '') or ''
    if 'nationality' in request.data:
        client.nationality = request.data.get('nationality', '') or ''
    if 'successor' in request.data:
        client.successor = request.data.get('successor', '') or ''
    if 'preferences' in request.data:
        prefs = request.data.get('preferences')
        # Accept array, or JSON-encoded string
        if isinstance(prefs, str):
            try:
                prefs = json.loads(prefs)
            except Exception:
                prefs = []
        if not isinstance(prefs, list):
            prefs = []
        client.preferences = prefs

    # Questionnaire fields
    if 'tradingObjective' in request.data:
        client.trading_objective = request.data.get('tradingObjective', '') or ''
    if 'plannedInvestment12m' in request.data:
        client.planned_investment_12m = request.data.get('plannedInvestment12m', '') or ''
    if 'riskRewardProfile' in request.data:
        client.risk_reward_profile = request.data.get('riskRewardProfile', '') or ''
    if 'complianceFamilyFlags' in request.data:
        flags = request.data.get('complianceFamilyFlags')
        if isinstance(flags, str):
            try:
                flags = json.loads(flags)
            except Exception:
                flags = []
        if not isinstance(flags, list):
            flags = []
        client.compliance_family_flags = flags
    if 'fundsSources' in request.data:
        sources = request.data.get('fundsSources')
        if isinstance(sources, str):
            try:
                sources = json.loads(sources)
            except Exception:
                sources = []
        if not isinstance(sources, list):
            sources = []
        client.funds_sources = sources
    if 'primaryProfession' in request.data:
        client.primary_profession = request.data.get('primaryProfession', '') or ''
    if 'employerName' in request.data:
        client.employer_name = request.data.get('employerName', '') or ''
    if 'annualNetIncome' in request.data:
        client.annual_net_income = request.data.get('annualNetIncome', '') or ''
    if 'totalLiquidities' in request.data:
        client.total_liquidities = request.data.get('totalLiquidities', '') or ''
    
    # Update RIB fields
    if 'ribBankName' in request.data:
        client.rib_bank_name = request.data.get('ribBankName', '') or ''
    if 'ribAccountHolder' in request.data:
        client.rib_account_holder = request.data.get('ribAccountHolder', '') or ''
    if 'ribBankCode' in request.data:
        client.rib_bank_code = request.data.get('ribBankCode', '') or ''
    if 'ribBranchCode' in request.data:
        client.rib_branch_code = request.data.get('ribBranchCode', '') or ''
    if 'ribAccountNumber' in request.data:
        client.rib_account_number = request.data.get('ribAccountNumber', '') or ''
    if 'ribKey' in request.data:
        client.rib_key = request.data.get('ribKey', '') or ''
    if 'ribIban' in request.data:
        client.rib_iban = request.data.get('ribIban', '') or ''
    if 'ribBic' in request.data:
        client.rib_bic = request.data.get('ribBic', '') or ''
    if 'ribDomiciliation' in request.data:
        client.rib_domiciliation = request.data.get('ribDomiciliation', '') or ''

    # Handle KYC document uploads
    update_fields_list = []
    kyc_uploaded_labels = []
    kyc_documents_review = client.kyc_documents_review if isinstance(client.kyc_documents_review, dict) else {}
    if 'identityDocument' in request.FILES:
        identity_file = request.FILES['identityDocument']
        try:
            original_filename = identity_file.name
            _, ext = os.path.splitext(original_filename)
            custom_filename = f'{client_id}_identity_recto{ext}'
            if client.identity_document:
                client.identity_document.delete(save=False)
            client.identity_document.save(custom_filename, identity_file, save=False)
            update_fields_list.append('identity_document')
            kyc_documents_review['identityDocument'] = 'pending'
            kyc_uploaded_labels.append("pièce d'identité (recto)")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error uploading identity document: {str(e)}")

    if 'identityDocumentVerso' in request.FILES:
        identity_verso_file = request.FILES['identityDocumentVerso']
        try:
            original_filename = identity_verso_file.name
            _, ext = os.path.splitext(original_filename)
            custom_filename = f'{client_id}_identity_verso{ext}'
            if client.identity_document_verso:
                client.identity_document_verso.delete(save=False)
            client.identity_document_verso.save(custom_filename, identity_verso_file, save=False)
            update_fields_list.append('identity_document_verso')
            kyc_documents_review['identityDocumentVerso'] = 'pending'
            kyc_uploaded_labels.append("pièce d'identité (verso)")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error uploading identity document verso: {str(e)}")

    if 'proofOfAddress' in request.FILES:
        address_file = request.FILES['proofOfAddress']
        try:
            original_filename = address_file.name
            _, ext = os.path.splitext(original_filename)
            custom_filename = f'{client_id}_address{ext}'
            if client.proof_of_address:
                client.proof_of_address.delete(save=False)
            client.proof_of_address.save(custom_filename, address_file, save=False)
            update_fields_list.append('proof_of_address')
            kyc_documents_review['proofOfAddress'] = 'pending'
            kyc_uploaded_labels.append("justificatif de domicile")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error uploading proof of address: {str(e)}")

    if 'selfiePhoto' in request.FILES:
        selfie_file = request.FILES['selfiePhoto']
        try:
            original_filename = selfie_file.name
            _, ext = os.path.splitext(original_filename)
            custom_filename = f'{client_id}_selfie{ext}'
            if client.selfie_photo:
                client.selfie_photo.delete(save=False)
            client.selfie_photo.save(custom_filename, selfie_file, save=False)
            update_fields_list.append('selfie_photo')
            kyc_documents_review['selfiePhoto'] = 'pending'
            kyc_uploaded_labels.append("selfie")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error uploading selfie photo: {str(e)}")

    # Handle profile photo upload (client self-service)
    if 'profilePhoto' in request.FILES:
        profile_photo_file = request.FILES['profilePhoto']
        try:
            original_filename = profile_photo_file.name
            _, ext = os.path.splitext(original_filename)
            custom_filename = f'{client_id}_profile{ext}'
            if client.profile_photo:
                client.profile_photo.delete(save=False)
            client.profile_photo.save(custom_filename, profile_photo_file, save=False)
            update_fields_list.append('profile_photo')
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error uploading profile photo: {str(e)}")

    # Update KYC status when documents are submitted
    if 'kycStatus' in request.data:
        client.kyc_status = request.data.get('kycStatus', 'pending') or 'pending'
        update_fields_list.append('kyc_status')
        if client.kyc_status == 'submitted' and not client.kyc_submitted_at:
            from django.utils import timezone
            client.kyc_submitted_at = timezone.now()
            update_fields_list.append('kyc_submitted_at')

    if kyc_uploaded_labels:
        client.kyc_documents_review = kyc_documents_review
        if 'kyc_documents_review' not in update_fields_list:
            update_fields_list.append('kyc_documents_review')

    # Notify assigned manager on any KYC document upload (Step 8)
    # Create a single notification per request even if multiple files are uploaded.
    if kyc_uploaded_labels:
        try:
            manager_user = _resolve_client_manager_user(client)
            if manager_user:
                client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
                uploaded_str = ", ".join(kyc_uploaded_labels)
                create_app_notification(
                    recipient_type=AppNotification.RECIPIENT_CRM_USER,
                    recipient_user=manager_user,
                    notification_type=AppNotification.TYPE_CLIENT_KYC_DOCUMENT_UPLOADED,
                    title="KYC — Pièce justificative",
                    message=f"{client_name} a importé : {uploaded_str}.",
                    payload={
                        "client_id": client.id,
                        "uploaded_fields": list(kyc_uploaded_labels),
                        "route": f"/admin/clients?clientId={client.id}&tab=verification",
                    },
                )
        except Exception as e:
            logger.warning("KYC upload notification failed: %s", str(e))

    # If no legal_name provided, try to derive it from name parts
    if not (client.legal_name or '').strip():
        derived = " ".join(
            p.strip()
            for p in [client.fname or '', client.middle_name or '', client.lname or '']
            if p and p.strip()
        ).strip()
        if derived:
            client.legal_name = derived

    # Verification status: consider verified only when ALL onboarding fields are complete
    prefs_complete = isinstance(getattr(client, 'preferences', None), list) and len(client.preferences) > 0
    compliance_complete = isinstance(getattr(client, 'compliance_family_flags', None), list) and len(client.compliance_family_flags) > 0
    sources_complete = isinstance(getattr(client, 'funds_sources', None), list) and len(client.funds_sources) > 0
    is_complete = (
        bool((client.legal_name or '').strip())
        and bool((client.fname or '').strip())
        and bool((client.lname or '').strip())
        and bool((client.sex or '').strip())
        and bool(client.birth_date)
        and bool((client.address or '').strip())
        and bool((client.postal_code or '').strip())
        and bool((client.city or '').strip())
        and prefs_complete
        and bool((client.trading_objective or '').strip())
        and bool((client.planned_investment_12m or '').strip())
        and compliance_complete
        and sources_complete
        and bool((client.primary_profession or '').strip())
        and bool((client.annual_net_income or '').strip())
        and bool((client.total_liquidities or '').strip())
    )
    client.account_verified = bool(is_complete)

    # Build update fields list
    base_update_fields = [
        'fname', 'middle_name', 'lname', 'legal_name', 'sex', 'birth_date',
        'address', 'postal_code', 'city', 'email',
        'phone', 'mobile', 'civility', 'birth_place', 'nationality', 'successor',
        'preferences',
        'trading_objective', 'planned_investment_12m', 'risk_reward_profile',
        'compliance_family_flags', 'funds_sources',
        'primary_profession', 'employer_name', 'annual_net_income', 'total_liquidities',
        'rib_bank_name', 'rib_account_holder', 'rib_bank_code', 'rib_branch_code',
        'rib_account_number', 'rib_key', 'rib_iban', 'rib_bic', 'rib_domiciliation',
        'account_verified'
    ]
    all_update_fields = base_update_fields + update_fields_list
    client.save(update_fields=all_update_fields)
    serializer = ClientSerializer(client, context={'request': request})
    return Response({'client': serializer.data, 'userType': 'client'})


def _get_client_from_token(request):
    """Extract and return client from client_ token. Returns (client, error_response) or (client, None)."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return None, Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return None, Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if not client.active:
        return None, Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    return client, None


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@authentication_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def client_successors_list(request):
    """List or create successors for the current client (client_ token)."""
    client, err = _get_client_from_token(request)
    if err:
        return err
    if request.method == 'POST':
        data = request.data
        successor_id = uuid.uuid4().hex[:12]
        while ClientSuccessor.objects.filter(id=successor_id).exists():
            successor_id = uuid.uuid4().hex[:12]
        order = ClientSuccessor.objects.filter(client=client).count()
        share_val = data.get('sharePercentage')
        try:
            share_pct = int(share_val) if share_val is not None and str(share_val).strip() != '' else 0
        except (ValueError, TypeError):
            return Response({'error': 'Le pourcentage des parts doit être un nombre entre 0 et 100'}, status=status.HTTP_400_BAD_REQUEST)
        successor = ClientSuccessor.objects.create(
            id=successor_id,
            client=client,
            first_name=(data.get('firstName') or '').strip(),
            last_name=(data.get('lastName') or '').strip(),
            email=(data.get('email') or '').strip(),
            phone=(data.get('phone') or '').strip(),
            address=(data.get('address') or '').strip(),
            postal_code=(data.get('postalCode') or '').strip(),
            city=(data.get('city') or '').strip(),
            country=(data.get('country') or '').strip(),
            share_percentage=min(100, max(0, share_pct)),
            order=order,
        )
        if 'identityDocument' in request.FILES:
            try:
                f = request.FILES['identityDocument']
                _, ext = os.path.splitext(f.name)
                successor.identity_document.save(f'{successor_id}_identity{ext}', f, save=True)
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.error(f"Error uploading successor identity document: {str(e)}")
                successor.delete()
                return Response(
                    {'error': "Impossible d'enregistrer la pièce d'identité. Vérifiez le format (PDF ou image) et la taille du fichier."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer = ClientSuccessorSerializer(successor, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    successors = ClientSuccessor.objects.filter(client=client).order_by('order', 'created_at')
    serializer = ClientSuccessorSerializer(successors, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['PATCH', 'DELETE'])
@permission_classes([AllowAny])
@authentication_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def client_successor_detail(request, successor_id):
    """Update or delete a successor for the current client (client_ token)."""
    client, err = _get_client_from_token(request)
    if err:
        return err
    try:
        successor = ClientSuccessor.objects.get(id=successor_id, client=client)
    except ClientSuccessor.DoesNotExist:
        return Response({'error': 'Successeur non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        successor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    data = request.data
    if 'firstName' in data:
        successor.first_name = data.get('firstName', '') or ''
    if 'lastName' in data:
        successor.last_name = data.get('lastName', '') or ''
    if 'email' in data:
        successor.email = data.get('email', '') or ''
    if 'phone' in data:
        successor.phone = data.get('phone', '') or ''
    if 'address' in data:
        successor.address = data.get('address', '') or ''
    if 'postalCode' in data:
        successor.postal_code = data.get('postalCode', '') or ''
    if 'city' in data:
        successor.city = data.get('city', '') or ''
    if 'country' in data:
        successor.country = data.get('country', '') or ''
    if 'sharePercentage' in data:
        val = data.get('sharePercentage')
        try:
            pct = int(val) if val is not None and val != '' else 0
            successor.share_percentage = min(100, max(0, pct))
        except (ValueError, TypeError):
            return Response({'error': 'Le pourcentage des parts doit être un nombre entre 0 et 100'}, status=status.HTTP_400_BAD_REQUEST)
    if 'identityDocument' in request.FILES:
        try:
            f = request.FILES['identityDocument']
            if successor.identity_document:
                successor.identity_document.delete(save=False)
            _, ext = os.path.splitext(f.name)
            successor.identity_document.save(f'{successor.id}_identity{ext}', f, save=False)
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Error uploading successor identity document: {str(e)}")
            return Response(
                {'error': "Impossible d'enregistrer la pièce d'identité. Vérifiez le format (PDF ou image) et la taille du fichier."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    successor.save()
    serializer = ClientSuccessorSerializer(successor, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    try:
        django_user = request.user
        try:
            # Try to get the user details profile
            user_details = UserDetails.objects.get(django_user=django_user)
            # Use UserDetailsSerializer to ensure consistent format with other endpoints
            serializer = UserDetailsSerializer(user_details, context={'request': request})
            return Response({
                **serializer.data,
                'userType': 'admin'  # admin, teamleader, or gestionnaire
            })
        except UserDetails.DoesNotExist:
            # If custom user doesn't exist, return Django user data with default role
            # Still include first_name and last_name from Django Auth
            return Response({
                'id': str(django_user.id),
                'username': django_user.username,
                'email': django_user.email or '',
                'firstName': django_user.first_name or '',
                'lastName': django_user.last_name or '',
                'role': '0',  # Default role
                'phone': '',
                'active': True,
                'status': 'offline',
                'availabilitySchedule': {},
                'userType': 'admin'
            })
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in get_current_user: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return Response(
            {'error': f'Error retrieving user: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    """List notifications for the current CRM user (paginated). Filter by client access."""
    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '20')
    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 20
        if limit > 100:
            limit = 100
    except (ValueError, TypeError):
        page = 1
        limit = 20
    qs = AppNotification.objects.filter(
        recipient_type=AppNotification.RECIPIENT_CRM_USER,
        recipient_user=request.user,
    ).order_by('-created_at')
    client_ids = _get_client_ids_user_has_access_to(request)
    if client_ids is not None:
        filtered = []
        for n in qs:
            cid = (n.payload or {}).get('client_id') if isinstance(n.payload, dict) else None
            if cid is None or cid in client_ids:
                filtered.append(n)
        total = len(filtered)
        unread_count = sum(1 for n in filtered if not n.read)
        offset = (page - 1) * limit
        items = filtered[offset:offset + limit]
    else:
        total = qs.count()
        unread_count = qs.filter(read=False).count()
        offset = (page - 1) * limit
        items = qs[offset:offset + limit]
    serializer = AppNotificationSerializer(items, many=True)
    return Response({
        'notifications': serializer.data,
        'unreadCount': unread_count,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total,
            'totalPages': (total + limit - 1) // limit if limit > 0 else 1,
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_unread_messages_count(request):
    """Count of unread message_from_client notifications for the current CRM user."""
    count = AppNotification.objects.filter(
        recipient_type=AppNotification.RECIPIENT_CRM_USER,
        recipient_user=request.user,
        notification_type=AppNotification.TYPE_MESSAGE_FROM_CLIENT,
        read=False,
    ).count()
    return Response({'unreadCount': count})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def notification_mark_all_read(request):
    """Mark all notifications as read for the current CRM user."""
    updated = AppNotification.objects.filter(
        recipient_type=AppNotification.RECIPIENT_CRM_USER,
        recipient_user=request.user,
        read=False,
    ).update(read=True)
    return Response({'ok': True, 'updated': updated})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, notification_id):
    """Mark a notification as read (CRM user)."""
    notification = get_object_or_404(
        AppNotification,
        id=notification_id,
        recipient_type=AppNotification.RECIPIENT_CRM_USER,
        recipient_user=request.user,
    )
    notification.read = True
    notification.save(update_fields=['read'])
    return Response({'ok': True})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_own_profile(request):
    """
    Allow authenticated user to update their own profile.
    Users can update: first_name, last_name, email, phone, profile_photo, status, availability_schedule
    """
    try:
        django_user = request.user
        try:
            user_details = UserDetails.objects.get(django_user=django_user)
        except UserDetails.DoesNotExist:
            return Response(
                {'error': 'User profile not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Update Django User fields
        if 'first_name' in request.data:
            django_user.first_name = request.data['first_name']
        if 'last_name' in request.data:
            django_user.last_name = request.data['last_name']
        if 'email' in request.data:
            email = request.data['email'].strip()
            # Check if email is already taken by another user
            if DjangoUser.objects.filter(email=email).exclude(id=django_user.id).exists():
                return Response(
                    {'error': 'Cet email est déjà utilisé par un autre utilisateur'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            django_user.email = email
            django_user.username = email  # Keep username in sync with email
        django_user.save()
        
        # Update UserDetails fields
        if 'phone' in request.data:
            user_details.phone = request.data['phone'] or ''
        if 'status' in request.data:
            status_value = request.data['status']
            if status_value in ['online', 'away', 'offline']:
                user_details.status = status_value
        if 'availabilitySchedule' in request.data:
            schedule = request.data['availabilitySchedule']
            # Parse JSON string if it's a string (when sent via FormData)
            if isinstance(schedule, str):
                try:
                    schedule = json.loads(schedule) if schedule else {}
                except (json.JSONDecodeError, TypeError):
                    schedule = {}
            user_details.availability_schedule = schedule or {}
        
        # Update profile photo if provided
        if 'profilePhoto' in request.FILES:
            try:
                profile_photo_file = request.FILES['profilePhoto']
                # Delete old photo if any
                if user_details.profile_photo:
                    user_details.profile_photo.delete(save=False)
                original_filename = profile_photo_file.name or 'photo'
                _, ext = os.path.splitext(original_filename)
                ext = ext.lower() if ext else '.jpg'
                custom_filename = f"user_{user_details.id}_{uuid.uuid4().hex[:8]}{ext}"
                user_details.profile_photo.save(custom_filename, profile_photo_file, save=False)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"User profile photo update failed: {str(e)}")
        
        user_details.save()
        
        # Return updated user data
        serializer = UserDetailsSerializer(user_details, context={'request': request})
        return Response({
            **serializer.data,
            'userType': 'admin'
        })
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in update_own_profile: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return Response(
            {'error': f'Error updating profile: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

# Teams endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def team_list(request):
    teams = Team.objects.all()
    try:
        requester_details = UserDetails.objects.get(django_user=request.user)
        role = (requester_details.role or '').lower().strip()
        if role == 'teamleader':
            team_memberships = requester_details.team_memberships.all()
            team_ids = [tm.team_id for tm in team_memberships if tm.team_id]
            if team_ids:
                teams = Team.objects.filter(id__in=team_ids)
            else:
                # Teamleader with no team: return no teams
                teams = Team.objects.none()
    except UserDetails.DoesNotExist:
        pass
    serializer = TeamSerializer(teams, many=True)
    return Response({'teams': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def team_create(request):
    serializer = TeamSerializer(data=request.data)
    if serializer.is_valid():
        # Generate team ID
        team_id = uuid.uuid4().hex[:12]
        while Team.objects.filter(id=team_id).exists():
            team_id = uuid.uuid4().hex[:12]
        team = serializer.save(id=team_id)
        
        # Create log entry
        new_value = get_team_data_for_log(team)
        create_log_entry(
            event_type='createTeam',
            user_id=request.user,
            request=request,
            old_value={},  # No old value for creation
            new_value=new_value
        )
        
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def team_delete(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    
    # Get old value before deletion for logging
    old_value = get_team_data_for_log(team)
    
    # Delete the team
    team.delete()
    
    # Create log entry
    create_log_entry(
        event_type='deleteTeam',
        user_id=request.user,
        request=request,
        old_value=old_value,
        new_value={}  # No new value for deletion
    )
    
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def team_detail(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    
    if request.method == 'PATCH':
        # Get old value before update for logging
        old_value = get_team_data_for_log(team)
        
        # Update team name
        if 'name' in request.data:
            team.name = request.data['name']
            team.save()
        
        # Refresh team to get updated timestamp
        team.refresh_from_db()
        
        # Get new value after update for logging
        new_value = get_team_data_for_log(team)
        
        # Create log entry
        create_log_entry(
            event_type='editTeam',
            user_id=request.user,
            request=request,
            old_value=old_value,
            new_value=new_value
        )
        
        serializer = TeamSerializer(team)
        return Response(serializer.data)
    
    serializer = TeamDetailSerializer({
        'team': team,
        'team_members': team.team_members.all()
    })
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_list(request):
    # Admin: return all users. Teamleader: return only users in their team(s).
    users = UserDetails.objects.all()
    try:
        requester_details = UserDetails.objects.get(django_user=request.user)
        role = (requester_details.role or '').lower().strip()
        if role == 'teamleader':
            team_memberships = requester_details.team_memberships.all()
            team_ids = [tm.team_id for tm in team_memberships if tm.team_id]
            if team_ids:
                # Only users who are in at least one of the teamleader's teams
                users = UserDetails.objects.filter(
                    team_memberships__team_id__in=team_ids
                ).distinct()
            else:
                # Teamleader with no team: only themselves
                users = UserDetails.objects.filter(django_user=request.user)
    except UserDetails.DoesNotExist:
        pass  # No UserDetails (e.g. superuser), return all
    serializer = UserDetailsSerializer(users, many=True, context={'request': request})
    return Response({'users': serializer.data})



@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def user_delete(request, user_id):
    user_details = get_object_or_404(UserDetails, id=user_id)
    
    # Get old value before deletion for logging
    old_value = {}
    if user_details.django_user:
        old_value = get_user_data_for_log(user_details.django_user, user_details)
    
    # Delete the user
    if user_details.django_user:
        user_details.django_user.delete()
    
    # Create log entry
    create_log_entry(
        event_type='deleteUser',
        user_id=request.user,
        request=request,
        old_value=old_value,
        new_value={}  # No new value for deletion
    )
    
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def user_toggle_active(request, user_id):
    user_details = get_object_or_404(UserDetails, id=user_id)
    # Toggle the active status
    user_details.active = not user_details.active
    user_details.save()
    return Response({'active': user_details.active})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def user_reset_password(request, user_id):
    """Reset password for a user"""
    user_details = get_object_or_404(UserDetails, id=user_id)
    django_user = user_details.django_user
    
    if not django_user:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get new password from request, or use default
    new_password = request.data.get('password', 'Access@123')
    
    # Validate password length
    if len(new_password) < 6:
        return Response({'error': 'Password must be at least 6 characters long'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get old value for logging (without password for security)
    old_value = get_user_data_for_log(django_user, user_details)
    
    # Reset password using Django's set_password which properly hashes it
    django_user.set_password(new_password)
    django_user.save()
    
    # Get new value for logging (password is not included in user data)
    new_value = get_user_data_for_log(django_user, user_details)
    # Add indicator that password was reset
    new_value['password_reset'] = True
    
    # Create log entry
    create_log_entry(
        event_type='resetPassword',
        user_id=request.user,
        request=request,
        old_value=old_value,
        new_value=new_value
    )
    
    return Response({'message': 'Password reset successfully'}, status=status.HTTP_200_OK)

@api_view(['PUT'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def user_update(request, user_id):
    user_details = get_object_or_404(UserDetails, id=user_id)
    django_user = user_details.django_user
    
    if not django_user:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get old value before update for logging
    old_value = get_user_data_for_log(django_user, user_details)
    
    # Update Django User fields
    if 'first_name' in request.data:
        django_user.first_name = request.data['first_name']
    if 'last_name' in request.data:
        django_user.last_name = request.data['last_name']
    if 'email' in request.data:
        new_email = (request.data['email'] or '').strip()
        if new_email:
            if DjangoUser.objects.filter(email__iexact=new_email).exclude(pk=django_user.pk).exists():
                return Response(
                    {'error': 'Cet email est déjà utilisé par un autre utilisateur'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if DjangoUser.objects.filter(username__iexact=new_email).exclude(pk=django_user.pk).exists():
                return Response(
                    {'error': 'Cet email est déjà utilisé par un autre utilisateur'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        django_user.email = new_email
        if new_email:
            django_user.username = new_email  # same as UserSerializer / update_own_profile
    elif 'username' in request.data:
        django_user.username = request.data['username']
    django_user.save()
    
    # Update UserDetails fields
    if 'role' in request.data:
        user_details.role = request.data['role']
    if 'phone' in request.data:
        user_details.phone = request.data['phone'] or ''

    # Optional: update profile photo
    if 'profilePhoto' in request.FILES:
        try:
            profile_photo_file = request.FILES['profilePhoto']
            # Delete old photo if any
            if user_details.profile_photo:
                user_details.profile_photo.delete(save=False)
            original_filename = profile_photo_file.name or 'photo'
            _, ext = os.path.splitext(original_filename)
            ext = ext.lower() if ext else '.jpg'
            custom_filename = f"user_{user_details.id}_{uuid.uuid4().hex[:8]}{ext}"
            user_details.profile_photo.save(custom_filename, profile_photo_file, save=False)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"User profile photo update failed: {str(e)}")
    
    # Update team membership using TeamMember table
    if 'teamId' in request.data:
        team_id = request.data['teamId']
        # Remove user from all teams first (using TeamMember relationship)
        TeamMember.objects.filter(user=user_details).delete()
        
        # If a team is specified, create a new TeamMember relationship
        if team_id:
            try:
                team = Team.objects.get(id=team_id)
                # Generate TeamMember ID
                team_member_id = uuid.uuid4().hex[:12]
                while TeamMember.objects.filter(id=team_member_id).exists():
                    team_member_id = uuid.uuid4().hex[:12]
                TeamMember.objects.create(
                    id=team_member_id,
                    user=user_details,
                    team=team
                )
            except Team.DoesNotExist:
                return Response({'error': 'Team not found'}, status=status.HTTP_400_BAD_REQUEST)
        # If team_id is None or empty, user is removed from all teams (already done above)
    
    user_details.save()
    
    # Refresh user_details to get updated team membership
    user_details.refresh_from_db()
    
    # Get new value after update for logging
    new_value = get_user_data_for_log(django_user, user_details)
    
    # Create log entry
    create_log_entry(
        event_type='editUser',
        user_id=request.user,
        request=request,
        old_value=old_value,
        new_value=new_value
    )
    
    # Return updated user data
    serializer = UserDetailsSerializer(user_details, context={'request': request})
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def team_add_member(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    user_id = request.data.get('userId')
    
    if not user_id:
        return Response({'error': 'userId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user_details = UserDetails.objects.get(id=user_id)
        
        # Check if user is already in the team
        if TeamMember.objects.filter(user=user_details, team=team).exists():
            return Response({'error': 'User is already in this team'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate TeamMember ID
        import uuid
        team_member_id = uuid.uuid4().hex[:12]
        while TeamMember.objects.filter(id=team_member_id).exists():
            team_member_id = uuid.uuid4().hex[:12]
        
        # Create TeamMember relationship
        team_member = TeamMember.objects.create(
            id=team_member_id,
            user=user_details,
            team=team
        )
        
        
        serializer = TeamMemberSerializer(team_member)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except UserDetails.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def team_remove_member(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    user_id = request.data.get('userId')
    
    if not user_id:
        return Response({'error': 'userId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user_details = UserDetails.objects.get(id=user_id)
        team_member = TeamMember.objects.get(user=user_details, team=team)
        
        # If user is teamleader, change role to something else (e.g., 'gestionnaire')
        if user_details.role == 'teamleader':
            user_details.role = 'gestionnaire'
            user_details.save()
        
        # Remove TeamMember relationship
        team_member.delete()
        
        
        return Response(status=status.HTTP_204_NO_CONTENT)
    except UserDetails.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    except TeamMember.DoesNotExist:
        return Response({'error': 'User not found in this team'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def team_set_leader(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    user_id = request.data.get('userId')
    
    if not user_id:
        return Response({'error': 'userId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Get team members through TeamMember
        team_members = TeamMember.objects.filter(team=team)
        user_ids_in_team = [tm.user.id for tm in team_members]
        
        # Remove leader status from all team members (change role from teamleader to gestionnaire)
        UserDetails.objects.filter(id__in=user_ids_in_team, role='teamleader').update(role='gestionnaire')
        
        # Set new leader (change role to teamleader)
        user_details = UserDetails.objects.get(id=user_id)
        
        # Verify user is in the team
        if not TeamMember.objects.filter(user=user_details, team=team).exists():
            return Response({'error': 'User not found in this team'}, status=status.HTTP_404_NOT_FOUND)
        
        user_details.role = 'teamleader'
        user_details.save()
        
        serializer = UserDetailsSerializer(user_details)
        return Response(serializer.data, status=status.HTTP_200_OK)
    except UserDetails.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

# Assets endpoints
@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def asset_list(request):
    """Liste tous les assets disponibles"""
    # Check authentication manually
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    # Validate client token if provided
    if token and token.startswith('client_'):
        client_id = token.replace('client_', '')
        try:
            client = Client.objects.get(id=client_id)
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    # Allow access if authenticated or if it's a client token
    elif auth_header.startswith('Bearer ') and not token.startswith('client_'):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    elif not token:
        # No token provided - allow public access to assets list
        # (This endpoint can be public for discover page)
        pass
    
    # Support search parameter
    search_query = request.GET.get('search', '').strip()
    assets = Asset.objects.all()
    
    if search_query:
        # Search in name, reference, and type
        assets = assets.filter(
            Q(name__icontains=search_query) |
            Q(reference__icontains=search_query) |
            Q(type__icontains=search_query)
        )
    
    assets = assets.order_by('type', 'name')
    serializer = AssetSerializer(assets, many=True, context={'request': request})
    return Response({'assets': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assets_positions_count(request):
    """
    Return number of positions linked to the given asset IDs.

    Body: { "assetIds": ["id1", "id2", ...] }
    Response: { "counts": { "id1": 3, "id2": 0, ... } }
    """
    asset_ids = request.data.get('assetIds', None)
    if asset_ids is None:
        return Response({'error': 'assetIds is required'}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(asset_ids, list):
        return Response({'error': 'assetIds must be a list'}, status=status.HTTP_400_BAD_REQUEST)

    normalized = [str(x) for x in asset_ids if x is not None and str(x).strip() != '']
    normalized = list(dict.fromkeys(normalized))  # stable dedupe
    if len(normalized) == 0:
        return Response({'counts': {}}, status=status.HTTP_200_OK)

    counts = {aid: 0 for aid in normalized}
    try:
        from django.db.models import Count
        qs = Position.objects.filter(asset_id__in=normalized).values('asset_id').annotate(c=Count('id'))
        for row in qs:
            aid = str(row.get('asset_id'))
            if aid in counts:
                counts[aid] = int(row.get('c') or 0)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("assets_positions_count failed")
        return Response({'error': f'Erreur lors du calcul des positions: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({'counts': counts}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asset_create(request):
    """Créer un nouvel asset"""
    serializer = AssetSerializer(data=request.data)
    if serializer.is_valid():
        # Generate asset ID
        asset_id = uuid.uuid4().hex[:12]
        while Asset.objects.filter(id=asset_id).exists():
            asset_id = uuid.uuid4().hex[:12]
        asset = serializer.save(id=asset_id)
        return Response(AssetSerializer(asset, context={'request': request}).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def asset_detail(request, asset_id):
    """Récupérer ou modifier un asset"""
    # Check authentication: either Django user or valid client token
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        # Validate client token
        client_id = token.replace('client_', '')
        try:
            client = Client.objects.get(id=client_id)
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    asset = get_object_or_404(Asset, id=asset_id)
    
    if request.method == 'GET':
        serializer = AssetSerializer(asset, context={'request': request})
        return Response({'asset': serializer.data}, status=status.HTTP_200_OK)
    
    # PUT/PATCH for updates (requires Django user authentication, not client tokens)
    if is_client_token:
        return Response({'error': 'Seuls les administrateurs peuvent modifier les actifs'}, status=status.HTTP_403_FORBIDDEN)
    
    if not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check if default is being changed from False to True
    old_default_value = asset.default
    
    serializer = AssetSerializer(asset, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        
        # Refresh asset from database to get the actual saved value
        asset.refresh_from_db()
        
        # If default changed from False to True, assign asset to all existing clients
        # Use asset.default (actual DB value) instead of parsed request value
        if not old_default_value and asset.default:
            existing_clients = Client.objects.all()
            for client in existing_clients:
                # Check if client already has this asset (avoid duplicates)
                if not ClientAsset.objects.filter(client=client, asset=asset).exists():
                    client_asset_id = uuid.uuid4().hex[:12]
                    while ClientAsset.objects.filter(id=client_asset_id).exists():
                        client_asset_id = uuid.uuid4().hex[:12]
                    ClientAsset.objects.create(
                        id=client_asset_id,
                        client=client,
                        asset=asset
                    )
        
        return Response(AssetSerializer(asset, context={'request': request}).data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def asset_delete(request, asset_id):
    """Supprimer un asset"""
    # Authorization: only admins (or Django superuser) can delete assets.
    if not getattr(request.user, 'is_superuser', False):
        try:
            user_details = UserDetails.objects.get(django_user=request.user)
            role = (user_details.role or '').lower().strip()
            if role != 'admin':
                return Response(
                    {'error': 'Seuls les administrateurs peuvent supprimer les actifs'},
                    status=status.HTTP_403_FORBIDDEN
                )
        except UserDetails.DoesNotExist:
            return Response(
                {'error': 'Seuls les administrateurs peuvent supprimer les actifs'},
                status=status.HTTP_403_FORBIDDEN
            )

    asset = get_object_or_404(Asset, id=asset_id)
    asset.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

def download_logo_to_storage(logo_url: str, asset_id: str) -> str:
    """
    Download a logo from an external URL and upload it to S3/MinIO storage.
    Returns the storage URL.
    """
    if not logo_url or not logo_url.startswith('http'):
        return logo_url  # Return as-is if not a valid HTTP URL
    
    try:
        import requests
        from api.storage import S3MediaStorage
        from django.core.files.base import ContentFile
        
        # Download the logo from the external URL (browser-like headers to avoid blocking)
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        response = requests.get(logo_url, timeout=15, stream=True, headers=headers)
        response.raise_for_status()
        
        # Get file extension from URL or Content-Type
        content_type = response.headers.get('Content-Type', '')
        if 'image/png' in content_type:
            ext = '.png'
        elif 'image/jpeg' in content_type or 'image/jpg' in content_type:
            ext = '.jpg'
        elif 'image/gif' in content_type:
            ext = '.gif'
        elif 'image/webp' in content_type:
            ext = '.webp'
        elif 'image/svg' in content_type:
            ext = '.svg'
        else:
            # Try to get extension from URL
            from urllib.parse import urlparse
            parsed = urlparse(logo_url)
            path = parsed.path
            _, ext = os.path.splitext(path)
            ext = ext.lower() if ext else '.png'
        
        # Create filename with asset ID: assets/{asset_id}{ext}
        custom_filename = f'assets/{asset_id}{ext}'
        
        # Read image content
        image_content = response.content
        
        # Upload to S3/MinIO storage
        storage = S3MediaStorage()
        content_file = ContentFile(image_content)
        content_file.name = custom_filename
        
        filename = storage.save(custom_filename, content_file)
        storage_url = storage.url(filename)
        
        print(f"Logo downloaded from {logo_url} and uploaded to storage: {storage_url}")
        return storage_url
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Error downloading logo from {logo_url} to storage: {error_msg}")
        print(traceback.format_exc())
        # Return original URL if download fails
        return logo_url

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def asset_upload_logo(request, asset_id):
    """Upload a logo file for an asset and return the URL"""
    asset = get_object_or_404(Asset, id=asset_id)
    
    if 'logo' not in request.FILES:
        return Response({'error': 'No logo file provided'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        logo_file = request.FILES['logo']
        
        # Validate file type
        if not logo_file.content_type.startswith('image/'):
            return Response({'error': 'File must be an image'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate file size (max 5MB)
        if logo_file.size > 5 * 1024 * 1024:
            return Response({'error': 'File size must be less than 5MB'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get file extension
        original_filename = logo_file.name
        _, ext = os.path.splitext(original_filename)
        ext = ext.lower() if ext else '.png'
        
        # Create filename with asset ID: assets/{asset_id}{ext}
        custom_filename = f'assets/{asset_id}{ext}'
        
        print(f"Uploading asset logo: {original_filename} as {custom_filename} for asset {asset_id}")
        
        # Upload to S3/MinIO using the storage backend
        from api.storage import S3MediaStorage
        from django.core.files.base import ContentFile
        
        storage = S3MediaStorage()
        
        # Read file content and create ContentFile
        logo_file.seek(0)
        file_content = logo_file.read()
        content_file = ContentFile(file_content)
        content_file.name = custom_filename
        
        # Upload to storage
        filename = storage.save(custom_filename, content_file)
        
        # Store raw URL in DB (AssetSerializer converts to proxy when serializing)
        raw_url = storage.url(filename)
        asset.logo_url = raw_url
        asset.save(update_fields=['logo_url'])
        
        # Return proxy URL to frontend (private MinIO bucket requires proxy)
        from .serializer import build_media_proxy_url
        logo_url = build_media_proxy_url(filename, request) or raw_url
        
        print(f"Logo uploaded successfully. Filename: {filename}")
        
        return Response({
            'logo_url': logo_url,
            'message': 'Logo uploaded successfully'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Error uploading logo: {error_msg}")
        print(traceback.format_exc())
        return Response({'error': f'Error uploading logo: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def client_assets(request, client_id):
    """Liste les assets d'un client"""
    from datetime import date
    from django.db.models import Q
    
    client = get_object_or_404(Client, id=client_id)
    
    # Check if it's a client accessing their own data
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    is_client_access = False
    if token and token.startswith('client_'):
        is_client_access = True
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    # Check if user is authenticated via JWT (validate manually to avoid DRF failing on invalid tokens)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if not is_client_access:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    # Get all client assets
    client_assets = ClientAsset.objects.filter(client=client).select_related('asset')
    
    # Filter by availability dates ONLY if it's a client accessing (not admin).
    # Clients always see assigned assets (including future start dates); hide only after availability_end.
    if is_client_access:
        today = date.today()
        client_assets = client_assets.filter(
            Q(availability_end__isnull=True) | Q(availability_end__gte=today)
        )
    
    serializer = ClientAssetSerializer(client_assets, many=True, context={'request': request})
    return Response({'assets': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_asset_add(request, client_id):
    """Ajouter un asset à un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    asset_id = request.data.get('assetId')
    
    if not asset_id:
        return Response({'error': 'assetId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        asset = Asset.objects.get(id=asset_id)
        
        # Check if client already has this asset
        if ClientAsset.objects.filter(client=client, asset=asset).exists():
            return Response({'error': 'Client already has this asset'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate ClientAsset ID
        client_asset_id = uuid.uuid4().hex[:12]
        while ClientAsset.objects.filter(id=client_asset_id).exists():
            client_asset_id = uuid.uuid4().hex[:12]
        
        # Create ClientAsset relationship
        client_asset = ClientAsset.objects.create(
            id=client_asset_id,
            client=client,
            asset=asset
        )
        
        serializer = ClientAssetSerializer(client_asset, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except Asset.DoesNotExist:
        return Response({'error': 'Asset not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_asset_remove(request, client_id, asset_id):
    """Retirer un asset d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    asset = get_object_or_404(Asset, id=asset_id)
    
    try:
        client_asset = ClientAsset.objects.get(client=client, asset=asset)
        client_asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ClientAsset.DoesNotExist:
        return Response({'error': 'Client asset relationship not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def client_asset_toggle_featured(request, client_id, asset_id):
    """Basculer le statut 'mis en avant' d'un asset pour un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    asset = get_object_or_404(Asset, id=asset_id)
    
    try:
        client_asset = ClientAsset.objects.get(client=client, asset=asset)
        client_asset.featured = not client_asset.featured
        client_asset.save()
        serializer = ClientAssetSerializer(client_asset, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
    except ClientAsset.DoesNotExist:
        return Response({'error': 'Client asset relationship not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def client_asset_update_availability(request, client_id, asset_id):
    """Mettre à jour les dates de disponibilité pour un actif d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    asset = get_object_or_404(Asset, id=asset_id)
    
    try:
        client_asset = ClientAsset.objects.get(client=client, asset=asset)
    except ClientAsset.DoesNotExist:
        return Response({'error': 'Client asset relationship not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Use serializer for validation
    serializer = ClientAssetSerializer(client_asset, data=request.data, partial=True, context={'request': request})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_assets_reset(request, client_id):
    """Réinitialiser les assets d'un client : retirer ceux qui ne sont pas default=True, ajouter ceux qui sont default=True"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    
    # Get all current client assets (convert to list to avoid query issues after deletion)
    current_client_assets = list(ClientAsset.objects.filter(client=client).select_related('asset'))
    current_asset_ids = {ca.asset.id for ca in current_client_assets}
    
    # Get all default assets
    default_assets = Asset.objects.filter(default=True)
    
    # Remove assets that are not default=True
    removed_count = 0
    for client_asset in current_client_assets:
        if not client_asset.asset.default:
            client_asset.delete()
            removed_count += 1
    
    # Add assets that are default=True and not already assigned
    added_count = 0
    for asset in default_assets:
        if asset.id not in current_asset_ids:
            # Generate ClientAsset ID
            client_asset_id = uuid.uuid4().hex[:12]
            while ClientAsset.objects.filter(id=client_asset_id).exists():
                client_asset_id = uuid.uuid4().hex[:12]
            
            # Create ClientAsset relationship
            ClientAsset.objects.create(
                id=client_asset_id,
                client=client,
                asset=asset
            )
            added_count += 1
    
    return Response({
        'message': 'Assets réinitialisés avec succès',
        'removed': removed_count,
        'added': added_count
    }, status=status.HTTP_200_OK)

# Client Products endpoints
@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def client_products(request, client_id):
    """Liste les produits d'un client"""
    client = get_object_or_404(Client, id=client_id)
    
    # Check if it's a client accessing their own data
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    is_client_access = False
    if token and token.startswith('client_'):
        is_client_access = True
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    # Check if user is authenticated via JWT (validate manually to avoid DRF failing on invalid tokens)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if not is_client_access:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    from datetime import date
    today = date.today()
    
    # Get all client products
    client_products = ClientProduct.objects.filter(
        client=client,
        product__isnull=False  # Exclude products that have been deleted
    ).select_related('product')
    
    # Filter by availability dates ONLY if it's a client accessing (not admin).
    # Clients always see assigned products (including future start dates); hide only after the effective end date.
    if is_client_access:
        client_products = client_products.filter(
            # End date: ClientProduct override if set, otherwise Product
            Q(availability_end__isnull=True, product__availability_end__isnull=True)
            | Q(availability_end__isnull=True, product__availability_end__gte=today)
            | Q(availability_end__gte=today)
        )
    
    serializer = ClientProductSerializer(client_products, many=True, context={'request': request})
    return Response({'products': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_product_add(request, client_id):
    """Ajouter un produit à un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    product_id = request.data.get('productId')
    
    if not product_id:
        return Response({'error': 'productId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        product = Product.objects.get(id=product_id)
        
        # Check if client already has this product
        if ClientProduct.objects.filter(client=client, product=product).exists():
            return Response({'error': 'Client already has this product'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate ClientProduct ID
        client_product_id = uuid.uuid4().hex[:12]
        while ClientProduct.objects.filter(id=client_product_id).exists():
            client_product_id = uuid.uuid4().hex[:12]
        
        # Create ClientProduct relationship
        # Handle potential race condition: if two concurrent requests try to add the same product,
        # the second one will hit the unique_together constraint and raise IntegrityError
        from .client_product_overrides import normalize_overrides_incoming
        ov_in = request.data.get('overrides', None) if request.data is not None else None
        if ov_in is None:
            clean_overrides = {}
        else:
            clean_overrides, oerr = normalize_overrides_incoming(ov_in)
            if oerr:
                return Response({'error': oerr}, status=status.HTTP_400_BAD_REQUEST)
            if clean_overrides is None:
                clean_overrides = {}
        try:
            client_product = ClientProduct.objects.create(
                id=client_product_id,
                client=client,
                product=product,
                overrides=clean_overrides,
            )
        except IntegrityError:
            # Another request created this relationship concurrently
            return Response({'error': 'Client already has this product'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = ClientProductSerializer(client_product, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except Product.DoesNotExist:
        return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_product_remove(request, client_id, product_id):
    """Retirer un produit d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    product = get_object_or_404(Product, id=product_id)
    
    try:
        client_product = ClientProduct.objects.get(client=client, product=product)
        client_product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ClientProduct.DoesNotExist:
        return Response({'error': 'Client product relationship not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def client_product_toggle_featured(request, client_id, product_id):
    """Basculer le statut 'mis en avant' d'un produit pour un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    product = get_object_or_404(Product, id=product_id)
    
    try:
        client_product = ClientProduct.objects.get(client=client, product=product)
        client_product.featured = not client_product.featured
        client_product.save()
        serializer = ClientProductSerializer(client_product, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
    except ClientProduct.DoesNotExist:
        return Response({'error': 'Client product relationship not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def client_product_update_availability(request, client_id, product_id):
    """Mettre à jour les dates de disponibilité pour un produit d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    product = get_object_or_404(Product, id=product_id)
    
    try:
        client_product = ClientProduct.objects.get(client=client, product=product)
    except ClientProduct.DoesNotExist:
        return Response({'error': 'Client product relationship not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Use serializer for validation
    serializer = ClientProductSerializer(client_product, data=request.data, partial=True, context={'request': request})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_products_reset(request, client_id):
    """Réinitialiser les produits d'un client : retirer ceux qui ne sont pas default=True, ajouter ceux qui sont default=True"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    
    # Get all current client products (convert to list to avoid query issues after deletion)
    # Filter out ClientProducts where the product has been deleted (product is None)
    current_client_products = [
        cp for cp in ClientProduct.objects.filter(client=client).select_related('product')
        if cp.product is not None
    ]
    current_product_ids = {cp.product.id for cp in current_client_products}
    
    # Get all default products
    default_products = Product.objects.filter(default=True)
    
    # Remove products that are not default=True
    removed_count = 0
    for client_product in current_client_products:
        if not client_product.product.default:
            client_product.delete()
            removed_count += 1
    
    # Add products that are default=True and not already assigned
    added_count = 0
    for product in default_products:
        if product.id not in current_product_ids:
            # Generate ClientProduct ID
            client_product_id = uuid.uuid4().hex[:12]
            while ClientProduct.objects.filter(id=client_product_id).exists():
                client_product_id = uuid.uuid4().hex[:12]
            
            # Create ClientProduct relationship
            # Handle potential race condition: if two concurrent requests try to add the same product,
            # the second one will hit the unique_together constraint and raise IntegrityError
            try:
                ClientProduct.objects.create(
                    id=client_product_id,
                    client=client,
                    product=product
                )
                added_count += 1
            except IntegrityError:
                # Another request created this relationship concurrently, skip it
                pass
    
    return Response({
        'message': 'Produits réinitialisés avec succès',
        'removed': removed_count,
        'added': added_count
    }, status=status.HTTP_200_OK)

# Alpha Vantage endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def alpha_vantage_search(request):
    """
    Search for symbols/companies using Alpha Vantage SYMBOL_SEARCH or Finnhub for cryptos
    This endpoint searches by keywords (company name or symbol) and returns multiple matches
    """
    keywords = request.GET.get('keywords', '').strip()
    asset_type = request.GET.get('type', '').strip().lower()  # 'crypto' or other types
    
    if not keywords:
        return Response({'error': 'Keywords parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Use Finnhub for crypto assets
    if asset_type == 'crypto' or asset_type == 'cryptocurrency':
        try:
            from api.alpha_vantage_service import search_crypto_finnhub
            results = search_crypto_finnhub(keywords)
            
            # Ensure logo_url is included in all results
            for result in results:
                if 'logo_url' not in result or not result.get('logo_url'):
                    # Try to get logo if missing
                    from api.alpha_vantage_service import get_crypto_logo
                    logo_url = get_crypto_logo(result.get('symbol', ''))
                    if logo_url:
                        result['logo_url'] = logo_url
            
            return Response({
                'results': results,
                'count': len(results)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error searching crypto: {str(e)}")
            return Response({'error': f'Error searching crypto: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Commodity "search" (best-effort): return curated symbols that work with our existing
    # quote/chart pipeline (i.e., tradable tickers like commodity ETFs).
    if asset_type in ['commodity', 'commodities', 'matiere_premiere', 'matiere-premiere', 'matiere premiere', 'matière première']:
        kw = keywords.lower()
        curated = [
            {
                'symbol': 'XAU',
                'name': 'Or spot (XAU/USD)',
                'type': 'Spot',
                'commodity_underlying': 'Or',
                'region': 'Global',
                'currency': 'USD',
                'exchange': 'FOREX',
                'aliases': ['xau', 'xauusd', 'gold', 'or', 'spot'],
            },
            {
                'symbol': 'XAU',
                'name': 'Or spot (XAU/EUR)',
                'type': 'Spot',
                'commodity_underlying': 'Or',
                'region': 'Global',
                'currency': 'EUR',
                'exchange': 'FOREX',
                'aliases': ['xau', 'xaueur', 'gold', 'or', 'spot', 'eur'],
            },
            {
                'symbol': 'XAG',
                'name': 'Argent spot (XAG/USD)',
                'type': 'Spot',
                'commodity_underlying': 'Argent',
                'region': 'Global',
                'currency': 'USD',
                'exchange': 'FOREX',
                'aliases': ['xag', 'xagusd', 'silver', 'argent', 'spot'],
            },
            {
                'symbol': 'XAG',
                'name': 'Argent spot (XAG/EUR)',
                'type': 'Spot',
                'commodity_underlying': 'Argent',
                'region': 'Global',
                'currency': 'EUR',
                'exchange': 'FOREX',
                'aliases': ['xag', 'xageur', 'silver', 'argent', 'spot', 'eur'],
            },
            {
                'symbol': 'GLD',
                'name': 'Or (ETF) - SPDR Gold Shares',
                'type': 'ETF',
                'commodity_underlying': 'Or',
                'region': 'United States',
                'currency': 'USD',
                'exchange': 'NYSEARCA',
                'aliases': ['gold', 'or', 'xau', 'gld'],
            },
            {
                'symbol': 'IAU',
                'name': 'Or (ETF) - iShares Gold Trust',
                'type': 'ETF',
                'commodity_underlying': 'Or',
                'region': 'United States',
                'currency': 'USD',
                'exchange': 'NYSEARCA',
                'aliases': ['gold', 'or', 'xau', 'iau'],
            },
            {
                'symbol': 'SLV',
                'name': 'Argent (ETF) - iShares Silver Trust',
                'type': 'ETF',
                'commodity_underlying': 'Argent',
                'region': 'United States',
                'currency': 'USD',
                'exchange': 'NYSEARCA',
                'aliases': ['silver', 'argent', 'xag', 'slv'],
            },
            {
                'symbol': 'USO',
                'name': 'Pétrole (ETF) - United States Oil Fund',
                'type': 'ETF',
                'commodity_underlying': 'Pétrole',
                'region': 'United States',
                'currency': 'USD',
                'exchange': 'NYSEARCA',
                'aliases': ['oil', 'petrole', 'pétrole', 'wti', 'uso'],
            },
            {
                'symbol': 'UNG',
                'name': 'Gaz naturel (ETF) - United States Natural Gas Fund',
                'type': 'ETF',
                'commodity_underlying': 'Gaz naturel',
                'region': 'United States',
                'currency': 'USD',
                'exchange': 'NYSEARCA',
                'aliases': ['gas', 'gaz', 'natural gas', 'ung'],
            },
            {
                'symbol': 'CPER',
                'name': 'Cuivre (ETN) - United States Copper Index Fund',
                'type': 'ETF',
                'commodity_underlying': 'Cuivre',
                'region': 'United States',
                'currency': 'USD',
                'exchange': 'NYSEARCA',
                'aliases': ['copper', 'cuivre', 'cper'],
            },
        ]

        matches = []
        for item in curated:
            hay = " ".join(
                [
                    item.get('name', ''),
                    item.get('symbol', ''),
                    " ".join(item.get('aliases', []) or []),
                ]
            ).lower()
            if kw in hay:
                result = {k: v for k, v in item.items() if k != 'aliases'}
                matches.append(result)

        # Optionally add prices if Alpha Vantage is configured.
        av_service = get_alpha_vantage_service()
        if av_service:
            for result in matches[:10]:
                try:
                    if result.get('type') == 'Spot' or result.get('exchange') == 'FOREX':
                        # Metals/forex via Finnhub (OANDA), because Alpha Vantage FX endpoints don't support XAU/XAG reliably
                        from api.alpha_vantage_service import get_oanda_quote_finnhub
                        fx_quote = get_oanda_quote_finnhub(result['symbol'], result.get('currency') or 'USD')
                        if fx_quote and fx_quote.get('exchange_rate'):
                            result['price'] = fx_quote['exchange_rate']
                            # change/change_percent are not provided by forex quote; keep empty
                    else:
                        quote = av_service.get_quote(result['symbol'])
                        if quote:
                            result['price'] = quote['price']
                            result['change'] = quote['change']
                            result['change_percent'] = quote['change_percent']
                except Exception:
                    pass

        return Response({'results': matches[:10], 'count': len(matches[:10])}, status=status.HTTP_200_OK)
    
    # Use Finnhub for stocks/ETFs (preferred, no rate limits) or Alpha Vantage as fallback
    from api.alpha_vantage_service import (
        search_stock_finnhub,
        FINNHUB_API_KEY,
    )
    
    if not FINNHUB_API_KEY and not get_alpha_vantage_service():
        return Response({'error': 'FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis pour la recherche'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    try:
        results = []
        if FINNHUB_API_KEY:
            results = search_stock_finnhub(keywords)
        if not results:
            av_service = get_alpha_vantage_service()
            if av_service:
                results = av_service.search_symbol(keywords)
        
        if not results:
            return Response({
                'results': [],
                'message': 'Aucun résultat trouvé. Vérifiez l\'orthographe ou essayez un autre terme de recherche.',
                'rate_limit_reached': False
            }, status=status.HTTP_200_OK)
        
        # Fetch current price for each result (tries Finnhub, Alpha Vantage, symbol variants)
        import time
        from api.alpha_vantage_service import get_stock_quote_with_fallback
        results_with_prices = []
        for i, result in enumerate(results[:10]):
            try:
                if i > 0:
                    time.sleep(1.0)  # 1 req/s to respect Alpha Vantage 75/min limit
                else:
                    time.sleep(0.3)  # Brief pause before first request (spacing from prior searches)
                quote = get_stock_quote_with_fallback(result['symbol'])
                if quote:
                    result['price'] = quote['price']
                    result['change'] = quote.get('change')
                    result['change_percent'] = quote.get('change_percent')
            except Exception:
                pass
            results_with_prices.append(result)
        
        return Response({
            'results': results_with_prices,
            'count': len(results_with_prices)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Erreur lors de la recherche: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def alpha_vantage_quote(request, symbol):
    """
    Get live quote for a symbol (Finnhub preferred, Alpha Vantage fallback)
    """
    symbol = symbol.strip().upper()
    
    from api.alpha_vantage_service import get_stock_quote_with_fallback, FMP_API_KEY, FINNHUB_API_KEY
    quote = get_stock_quote_with_fallback(symbol)

    if not FMP_API_KEY and not FINNHUB_API_KEY and not get_alpha_vantage_service():
        return Response({'error': 'FMP_API_KEY, FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    if not quote:
        return Response({'error': f'Symbol {symbol} not found'}, status=status.HTTP_404_NOT_FOUND)
    
    return Response(quote, status=status.HTTP_200_OK)

def _get_fx_rate(from_currency: str, to_currency: str) -> float | None:
    """Get FX rate from_currency -> to_currency. Returns None on failure."""
    from_ccy = (from_currency or '').strip().upper()
    to_ccy = (to_currency or '').strip().upper()
    if not from_ccy or not to_ccy:
        return None
    if from_ccy == to_ccy:
        return 1.0
    av_service = get_alpha_vantage_service()
    if av_service:
        try:
            quote = av_service.get_forex_quote(from_currency=from_ccy, to_currency=to_ccy)
            if quote and quote.get('exchange_rate'):
                return float(quote['exchange_rate'])
        except Exception:
            pass
    try:
        import requests
        r = requests.get(
            "https://api.frankfurter.app/latest",
            params={"from": from_ccy, "to": to_ccy},
            timeout=5,
        )
        if r.status_code == 200:
            payload = r.json() or {}
            rate = (payload.get("rates") or {}).get(to_ccy)
            if rate is not None:
                return float(rate)
    except Exception:
        pass
    return None


@api_view(['GET'])
@authentication_classes([])  # public endpoint (rate doesn't require auth)
@permission_classes([AllowAny])
def forex_quote(request):
    """
    Get a best-effort FX rate using Alpha Vantage.

    Query params:
      - from / from_currency (e.g. EUR)
      - to / to_currency (e.g. USD)
    """
    from_currency = (request.GET.get('from') or request.GET.get('from_currency') or '').strip().upper()
    to_currency = (request.GET.get('to') or request.GET.get('to_currency') or '').strip().upper()

    if not from_currency or not to_currency:
        return Response(
            {'error': 'Missing required query params: from, to'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if from_currency == to_currency:
        return Response(
            {
                'from_currency': from_currency,
                'to_currency': to_currency,
                'exchange_rate': 1.0,
                'bid_price': 1.0,
                'ask_price': 1.0,
                'last_refreshed': '',
            },
            status=status.HTTP_200_OK,
        )

    # Prefer Alpha Vantage if configured, but it can be rate-limited.
    av_service = get_alpha_vantage_service()
    if av_service:
        try:
            quote = av_service.get_forex_quote(from_currency=from_currency, to_currency=to_currency)
            if quote and quote.get('exchange_rate'):
                return Response(quote, status=status.HTTP_200_OK)
        except Exception:
            # Fall through to public fallback sources
            pass

    # Fallback: Frankfurter (ECB-based) - no API key required.
    # Docs: https://www.frankfurter.app/
    try:
        import requests
        r = requests.get(
            "https://api.frankfurter.app/latest",
            params={"from": from_currency, "to": to_currency},
            timeout=5,
        )
        if r.status_code == 200:
            payload = r.json() or {}
            rates = payload.get("rates") or {}
            rate = rates.get(to_currency)
            if rate:
                rate_f = float(rate)
                return Response(
                    {
                        "from_currency": from_currency,
                        "to_currency": to_currency,
                        "exchange_rate": rate_f,
                        "bid_price": rate_f,
                        "ask_price": rate_f,
                        "last_refreshed": payload.get("date", "") or "",
                        "source": "frankfurter",
                    },
                    status=status.HTTP_200_OK,
                )
    except Exception:
        pass

    return Response(
        {'error': f'Unable to fetch forex quote for {from_currency}/{to_currency}'},
        status=status.HTTP_502_BAD_GATEWAY,
    )

@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def asset_chart_data(request, asset_id):
    """
    Get historical chart data for an asset (stocks via Alpha Vantage, cryptos via Finnhub)
    """
    # Check authentication: either Django user via JWT or valid client token
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')

    if is_client_token:
        # Validate client token
        client_id = token.replace('client_', '')
        try:
            client = Client.objects.get(id=client_id)
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    asset = get_object_or_404(Asset, id=asset_id)
    
    if not asset.alpha_vantage_symbol:
        return Response({'error': 'Asset does not have a symbol configured'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get outputsize parameter (compact = last 100 days, full = 20+ years)
    outputsize = request.GET.get('outputsize', 'compact').lower()
    if outputsize not in ['compact', 'full']:
        outputsize = 'compact'
    
    try:
        # Use Alpha Vantage for cryptos and stocks/ETFs
        if asset.type.lower() == 'crypto':
            from api.alpha_vantage_service import get_crypto_candles_finnhub, FINNHUB_API_KEY
            av_service = get_alpha_vantage_service()
            if not FINNHUB_API_KEY and not av_service:
                return Response({'error': 'FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            # Finnhub first (60 req/min) to avoid Alpha Vantage rate limit (25/day)
            chart_data = None
            if FINNHUB_API_KEY:
                chart_data = get_crypto_candles_finnhub(
                    asset.alpha_vantage_symbol,
                    resolution='D',
                    days=365 if outputsize == 'full' else 120
                )
            if not chart_data and av_service:
                chart_data = av_service.get_crypto_daily_data(asset.alpha_vantage_symbol, market=(asset.currency or 'USD').strip().upper() or 'USD')
            if chart_data and chart_data.get('data'):
                # compact=100 days, full=keep all for 1Y/3Y/MAX
                if outputsize == 'compact':
                    chart_data['data'] = chart_data['data'][-100:]
            if not chart_data or not chart_data.get('data'):
                return Response({
                    'error': 'Données indisponibles pour le moment',
                    'rate_limit_reached': True
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            return Response(chart_data, status=status.HTTP_200_OK)
        else:
            # Use FMP, Finnhub, or Alpha Vantage for stocks/ETFs
            from api.alpha_vantage_service import get_stock_candles_finnhub, FINNHUB_API_KEY, FMP_API_KEY
            av_service = get_alpha_vantage_service()
            if not FMP_API_KEY and not FINNHUB_API_KEY and not av_service:
                return Response({'error': 'FMP_API_KEY, FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            # Spot commodities / FX pairs (e.g., XAU/USD, XAG/USD) use FX_DAILY.
            symbol_upper = (asset.alpha_vantage_symbol or '').strip().upper()
            if symbol_upper in ['XAU', 'XAG'] or (asset.exchange or '').strip().upper() == 'FOREX':
                to_ccy = (asset.currency or 'USD').strip().upper() or 'USD'
                from api.alpha_vantage_service import get_oanda_candles_finnhub
                # Try direct OANDA pair first (XAU_EUR, XAG_EUR, etc.)
                chart_data = get_oanda_candles_finnhub(symbol_upper, to_ccy, resolution='D', days=365 if outputsize == 'full' else 120)
                # Cross via USD if direct pair isn't available
                if not chart_data and to_ccy != 'USD':
                    metal_usd = get_oanda_candles_finnhub(symbol_upper, 'USD', resolution='D', days=365 if outputsize == 'full' else 120)
                    usd_to = get_oanda_candles_finnhub('USD', to_ccy, resolution='D', days=365 if outputsize == 'full' else 120)
                    if metal_usd and usd_to:
                        usd_to_by_date = {p['date']: p for p in (usd_to.get('data') or [])}
                        out = []
                        for p in (metal_usd.get('data') or []):
                            fx = usd_to_by_date.get(p.get('date'))
                            if not fx:
                                continue
                            out.append({
                                'date': p['date'],
                                'open': float(p.get('open', 0) or 0) * float(fx.get('open', 0) or 0),
                                'high': float(p.get('high', 0) or 0) * float(fx.get('high', 0) or 0),
                                'low': float(p.get('low', 0) or 0) * float(fx.get('low', 0) or 0),
                                'close': float(p.get('close', 0) or 0) * float(fx.get('close', 0) or 0),
                                'volume': 0,
                            })
                        out.sort(key=lambda x: x['date'])
                        chart_data = {'data': out, 'meta_data': {'from_symbol': symbol_upper, 'to_symbol': to_ccy}}
            else:
                from api.alpha_vantage_service import _get_symbol_variants_for_fallback, get_stock_candles_fmp, FMP_API_KEY
                chart_data = None
                days = 365 if outputsize == 'full' else 120
                for sym in _get_symbol_variants_for_fallback(asset.alpha_vantage_symbol):
                    if FMP_API_KEY:
                        chart_data = get_stock_candles_fmp(sym, days=days)
                    if not chart_data and FINNHUB_API_KEY:
                        chart_data = get_stock_candles_finnhub(sym, resolution='D', days=days)
                    if not chart_data and av_service:
                        chart_data = av_service.get_daily_data(sym, outputsize=outputsize)
                    if chart_data:
                        break
            
            if not chart_data:
                return Response({
                    'error': 'Données indisponibles pour le moment',
                    'rate_limit_reached': True
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            return Response(chart_data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching chart data for asset {asset_id}: {str(e)}")
        return Response({'error': f'Error fetching chart data: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def asset_get_logo(request):
    """
    Get logo URL for a symbol (works for both stocks and cryptos)
    """
    symbol = request.GET.get('symbol', '').strip().upper()
    asset_type = request.GET.get('type', '').strip().lower()
    
    if not symbol:
        return Response({'error': 'Symbol parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        logo_url = None
        
        if asset_type == 'crypto':
            from api.alpha_vantage_service import get_crypto_logo
            logo_url = get_crypto_logo(symbol)
        else:
            from api.alpha_vantage_service import get_company_logo
            logo_url = get_company_logo(symbol)
        
        if logo_url:
            return Response({'logo_url': logo_url}, status=status.HTTP_200_OK)
        else:
            return Response({'logo_url': None, 'message': 'Logo not found'}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching logo for {symbol}: {str(e)}")
        return Response({'error': f'Error fetching logo: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asset_create_from_alpha_vantage(request):
    """
    Create an asset from Alpha Vantage symbol data
    """
    symbol = request.data.get('symbol', '').strip().upper()
    reference_input = (request.data.get('reference', '') or '').strip()
    asset_type = request.data.get('type', 'Action')
    category = request.data.get('category', '')
    subcategory = request.data.get('subcategory', '')
    exchange = request.data.get('exchange', '')
    currency = (request.data.get('currency', '') or '').strip()
    region = request.data.get('region', '')
    # Accept both logo_url (snake_case) and logoUrl (camelCase) from frontend
    logo_url = request.data.get('logo_url', '') or request.data.get('logoUrl', '')
    default = request.data.get('default', False)
    manual_description = (request.data.get('description', '') or '').strip()
    
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)

    # Best-effort translation for country-like labels used in UI fields (category/region/country).
    # We want stored labels to be French on import.
    def _country_to_fr_import(value: str) -> str:
        v = (value or '').strip()
        if not v:
            return v
        mapping = {
            'Global': 'Monde',
            'World': 'Monde',
            'United States': 'États-Unis',
            'USA': 'États-Unis',
            'U.S.A.': 'États-Unis',
            'United Kingdom': 'Royaume-Uni',
            'UK': 'Royaume-Uni',
            'Great Britain': 'Royaume-Uni',
            'Germany': 'Allemagne',
            'France': 'France',
            'Spain': 'Espagne',
            'Italy': 'Italie',
            'Netherlands': 'Pays-Bas',
            'Switzerland': 'Suisse',
            'Sweden': 'Suède',
            'Norway': 'Norvège',
            'Denmark': 'Danemark',
            'Finland': 'Finlande',
            'Ireland': 'Irlande',
            'Belgium': 'Belgique',
            'Austria': 'Autriche',
            'Portugal': 'Portugal',
            'Canada': 'Canada',
            'Mexico': 'Mexique',
            'Brazil': 'Brésil',
            'China': 'Chine',
            'Hong Kong': 'Hong Kong',
            'Japan': 'Japon',
            'South Korea': 'Corée du Sud',
            'Korea': 'Corée',
            'India': 'Inde',
            'Singapore': 'Singapour',
            'Australia': 'Australie',
            'New Zealand': 'Nouvelle-Zélande',
            'South Africa': 'Afrique du Sud',
            'United Arab Emirates': 'Émirats arabes unis',
            'Saudi Arabia': 'Arabie saoudite',
            'Israel': 'Israël',
        }
        return mapping.get(v, v)

    # Translate UI-provided "category" immediately (it often contains a country like "United States")
    category = _country_to_fr_import(category)
    
    # Normalize spot metals symbol (allow XAUUSD/XAGUSD inputs)
    normalized_symbol = symbol
    if len(symbol) == 6 and symbol[:3] in ['XAU', 'XAG']:
        normalized_symbol = symbol[:3]
        if not currency:
            currency = symbol[3:]
    symbol = normalized_symbol

    # Check if asset with this symbol already exists
    # - Equities/ETFs: symbol is unique
    # - Spot FX-like assets (XAU/XAG): allow multiple assets per quote currency (USD vs EUR)
    if symbol in ['XAU', 'XAG'] or (exchange or '').strip().upper() == 'FOREX':
        existing_asset = Asset.objects.filter(
            alpha_vantage_symbol=symbol,
            exchange='FOREX',
            currency=(currency or 'USD').strip().upper() or 'USD',
        ).first()
    else:
        existing_asset = Asset.objects.filter(alpha_vantage_symbol=symbol).first()
    if existing_asset:
        return Response({
            'error': f'Asset with symbol {symbol} already exists',
            'asset': AssetSerializer(existing_asset, context={'request': request}).data
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Company overview fields are only available for equities/ETFs.
        # Initialize defaults so crypto creation doesn't crash with NameError.
        overview_name = ''
        overview_description = ''
        overview_sector = ''
        overview_industry = ''
        overview_address = ''
        overview_employees = None
        overview_website = ''
        overview_market_cap = None
        overview_currency = ''
        overview_country = ''

        # Use Alpha Vantage for cryptos, stocks/ETFs
        if asset_type.lower() == 'crypto':
            from api.alpha_vantage_service import get_crypto_quote_alpha_vantage, get_crypto_logo
            quote = get_crypto_quote_alpha_vantage(symbol)
            
            if not quote:
                return Response({'error': f'Crypto symbol {symbol} not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get logo URL if not provided
            if not logo_url:
                logo_url = get_crypto_logo(symbol) or ''

            # Alpha Vantage crypto quotes are USD-based; ensure we store a sensible default.
            if not currency:
                currency = 'USD'
        else:
            from api.alpha_vantage_service import (
                get_stock_profile_finnhub,
                get_company_logo,
                FINNHUB_API_KEY,
                FMP_API_KEY,
            )
            av_service = get_alpha_vantage_service()
            if not FMP_API_KEY and not FINNHUB_API_KEY and not av_service:
                return Response({'error': 'FMP_API_KEY, FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            # Spot metals / FX (XAU/XAG) use forex quote: Finnhub OANDA first, Alpha Vantage FX_DAILY fallback.
            if symbol in ['XAU', 'XAG'] or (exchange or '').strip().upper() == 'FOREX':
                if not currency:
                    currency = 'USD'
                if not exchange:
                    exchange = 'FOREX'
                if not region:
                    region = 'Global'

                from api.alpha_vantage_service import get_forex_metal_quote_with_fallback
                fx_quote = get_forex_metal_quote_with_fallback(symbol, currency)

                # If we can't fetch a quote, still allow import. Price will be updated later.
                quote_price = float(fx_quote['exchange_rate']) if (fx_quote and fx_quote.get('exchange_rate')) else None

                quote = {
                    'symbol': symbol,
                    'price': quote_price,
                    'change': fx_quote.get('change') if fx_quote else 0,
                    'change_percent': fx_quote.get('change_percent') if fx_quote else None,
                }

                # If no name provided, set a friendly one.
                if not request.data.get('name', '').strip():
                    request.data._mutable = True if hasattr(request.data, "_mutable") else False  # type: ignore
                    # Don't rely on mutability; we set name in create() below.
                    pass
            else:
                # Fetch quote (tries Finnhub, Alpha Vantage, and symbol variants like HAG.DE->HAG.DEX, RR.L->RR.LON)
                from api.alpha_vantage_service import get_stock_quote_with_fallback, get_stock_profile_finnhub, _get_symbol_variants_for_fallback
                quote = get_stock_quote_with_fallback(symbol)
                if not quote:
                    # Quote failed. If user selected from search (has name) or profile exists, allow creation without price.
                    has_name = bool((request.data.get('name') or '').strip())
                    profile = None
                    for sym in _get_symbol_variants_for_fallback(symbol):
                        profile = get_stock_profile_finnhub(sym)
                        if profile and profile.get('Name'):
                            break
                    if has_name or (profile and profile.get('Name')):
                        quote = {'symbol': symbol, 'price': None, 'change': None, 'change_percent': None}
                    else:
                        return Response({'error': f'Symbol {symbol} not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get logo URL if not provided (skip for spot FX)
            if not logo_url and symbol not in ['XAU', 'XAG'] and (exchange or '').strip().upper() != 'FOREX':
                logo_url = get_company_logo(symbol) or ''
                if not logo_url and av_service:
                    logo_url = av_service.get_company_logo(symbol) or ''

            # Best-effort company info (persisted on import) - equities/ETFs only.
            overview = {}
            overview_currency = ''
            overview_country = ''
            if symbol not in ['XAU', 'XAG'] and (exchange or '').strip().upper() != 'FOREX':
                overview = (get_stock_profile_finnhub(symbol) if FINNHUB_API_KEY else None) or (av_service.get_company_overview(symbol) if av_service else None) or {}
                overview_name = (overview.get('Name') or '').strip()
                overview_description = (overview.get('Description') or '').strip()
                overview_sector = (overview.get('Sector') or '').strip()
                overview_industry = (overview.get('Industry') or '').strip()
                overview_country = (overview.get('Country') or '').strip()
                overview_website = (overview.get('Website') or '').strip()
                overview_address = (overview.get('Address') or '').strip()
                overview_employees_raw = (overview.get('FullTimeEmployees') or '').strip()
                overview_market_cap_raw = (overview.get('MarketCapitalization') or '').strip()
                overview_currency = (overview.get('Currency') or '').strip()

                try:
                    overview_employees = int(overview_employees_raw) if overview_employees_raw else None
                except Exception:
                    overview_employees = None

                try:
                    overview_market_cap = int(overview_market_cap_raw) if overview_market_cap_raw else None
                except Exception:
                    overview_market_cap = None

            # If currency/exchange/region weren't passed from the UI, prefer OVERVIEW values.
            if not currency:
                currency = overview_currency or 'USD'
            if not exchange:
                exchange = (overview.get('Exchange') or '').strip() or exchange
            if not region:
                region = (overview.get('Country') or '').strip() or region

            # Translate imported informational fields to French (best-effort).
            # - Keep manual description as-is (assumed already curated by admin).
            # - Translate Alpha Vantage Overview fields (mostly English) when Gemini is configured.
            overview_country = _country_to_fr_import(overview_country)
            # region is often a country name in our UI; translate the common cases too.
            region = _country_to_fr_import(region)

            def _translate_to_fr_best_effort(payload: dict) -> dict:
                """
                Translate provided fields to French using Gemini, if configured.
                Returns the original payload on any failure.
                """
                try:
                    import json
                    import re
                    from google import genai

                    if not getattr(settings, 'GEMINI_API_KEY', None):
                        return payload

                    client = genai.Client(api_key=settings.GEMINI_API_KEY)

                    prompt = f"""Tu es un traducteur professionnel (FR).
Traduis en français les champs ci-dessous.

Règles:
- Ne traduis pas les noms propres (noms d’entreprise, marques), ni les tickers/symboles.
- Garde les URL inchangées.
- Ne rajoute pas d’informations.
- Retourne un JSON STRICT (pas de texte autour), avec EXACTEMENT ces clés: description, sector, industry, headquarters, country.

Entrée (JSON):
{json.dumps(payload, ensure_ascii=False)}
"""
                    resp = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
                    text = (resp.text or '').strip()

                    # Extract the first JSON object if the model wrapped it.
                    m = re.search(r'\{[\s\S]*\}\s*$', text)
                    if not m:
                        m = re.search(r'\{[\s\S]*\}', text)
                    if not m:
                        return payload

                    data = json.loads(m.group(0))
                    if not isinstance(data, dict):
                        return payload

                    out = {}
                    for k in ['description', 'sector', 'industry', 'headquarters', 'country']:
                        v = data.get(k)
                        out[k] = (v.strip() if isinstance(v, str) else payload.get(k, ''))
                    return out
                except Exception:
                    return payload

            # Only attempt Gemini translation when we actually have overview fields to translate.
            if any([overview_description, overview_sector, overview_industry, overview_address, overview_country]) and symbol not in ['XAU', 'XAG']:
                to_translate = {
                    'description': overview_description if not manual_description else manual_description,
                    'sector': overview_sector,
                    'industry': overview_industry,
                    'headquarters': overview_address,
                    'country': overview_country,
                }
                translated = _translate_to_fr_best_effort(to_translate)

                # Keep manual description untouched (admin-provided).
                if not manual_description:
                    overview_description = translated.get('description', overview_description) or overview_description
                overview_sector = translated.get('sector', overview_sector) or overview_sector
                overview_industry = translated.get('industry', overview_industry) or overview_industry
                overview_address = translated.get('headquarters', overview_address) or overview_address
                overview_country = translated.get('country', overview_country) or overview_country
                region = _country_to_fr_import(region)
        
        # Generate asset ID
        asset_id = uuid.uuid4().hex[:12]
        while Asset.objects.filter(id=asset_id).exists():
            asset_id = uuid.uuid4().hex[:12]
        
        # Create asset
        default_name = request.data.get('name', '').strip()
        if not default_name and symbol == 'XAU':
            default_name = f"Or spot ({(currency or 'USD').strip().upper()})"
        if not default_name and symbol == 'XAG':
            default_name = f"Argent spot ({(currency or 'USD').strip().upper()})"

        # Ensure final stored UI labels are French when they represent countries/regions.
        category = _country_to_fr_import(category)
        region = _country_to_fr_import(region)

        # Download logo from external API to storage if it's an external URL
        # This avoids making requests to external APIs on every page load
        if logo_url and logo_url.startswith('http') and not any(x in logo_url for x in ['s3.', 'minio']):
            try:
                logo_url = download_logo_to_storage(logo_url, asset_id)
            except Exception as e:
                # If download fails, keep original URL
                print(f"Warning: Could not download logo to storage, keeping original URL: {str(e)}")

        asset = Asset.objects.create(
            id=asset_id,
            type=asset_type,
            name=(default_name or overview_name or symbol),
            reference=(reference_input or symbol),
            category=category,
            subcategory=subcategory,
            default=default,
            alpha_vantage_symbol=symbol,
            exchange=exchange,
            currency=currency,
            region=region,
            logo_url=logo_url,
            last_price=quote.get('price'),
            last_price_update=timezone.now() if quote.get('price') is not None else None,
            price_change=quote.get('change') if quote.get('price') is not None else None,
            price_change_percent=float(quote['change_percent']) if (quote.get('price') is not None and quote.get('change_percent') is not None) else None,
            description=manual_description or overview_description,
            sector=overview_sector,
            industry=overview_industry,
            headquarters=overview_address,
            employees=overview_employees,
            website=overview_website,
            market_cap=overview_market_cap,
            market_cap_currency=overview_currency or currency or 'USD',
            country=overview_country,
        )
        
        # Refresh asset from database to ensure we have the actual saved value
        asset.refresh_from_db()
        
        # If asset is marked as default, assign it to all existing clients
        # Use asset.default (actual DB value) instead of request parameter
        if asset.default:
            existing_clients = Client.objects.all()
            for client in existing_clients:
                # Check if client already has this asset (avoid duplicates)
                if not ClientAsset.objects.filter(client=client, asset=asset).exists():
                    client_asset_id = uuid.uuid4().hex[:12]
                    while ClientAsset.objects.filter(id=client_asset_id).exists():
                        client_asset_id = uuid.uuid4().hex[:12]
                    ClientAsset.objects.create(
                        id=client_asset_id,
                        client=client,
                        asset=asset
                    )
        
        return Response(AssetSerializer(asset, context={'request': request}).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': f'Error creating asset: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asset_update_price(request, asset_id):
    """
    Update asset price and missing information from Alpha Vantage (for stocks) or Finnhub (for cryptos)
    Updates: prices, logos, descriptions, sectors, and other company details if missing
    """
    asset = get_object_or_404(Asset, id=asset_id)
    
    if not asset.alpha_vantage_symbol:
        return Response({'error': 'Asset does not have a symbol configured'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Use Alpha Vantage for cryptos and stocks/ETFs
        if asset.type.lower() == 'crypto':
            from api.alpha_vantage_service import get_crypto_quote_alpha_vantage, get_crypto_logo
            quote = get_crypto_quote_alpha_vantage(asset.alpha_vantage_symbol)
            
            if not quote:
                return Response({
                    'error': 'Données indisponibles pour le moment',
                    'rate_limit_reached': True
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            # Update asset price data
            asset.last_price = quote['price']
            asset.last_price_update = timezone.now()
            asset.price_change = quote['change']
            asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
            
            # Update logo if missing
            if not asset.logo_url:
                logo_url = get_crypto_logo(asset.alpha_vantage_symbol)
                if logo_url:
                    asset.logo_url = logo_url
            
            asset.save()
        else:
            from api.alpha_vantage_service import (
                get_stock_profile_finnhub,
                get_company_logo,
                FINNHUB_API_KEY,
                FMP_API_KEY,
            )
            av_service = get_alpha_vantage_service()
            if not FMP_API_KEY and not FINNHUB_API_KEY and not av_service:
                return Response({'error': 'FMP_API_KEY, FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            symbol_upper = (asset.alpha_vantage_symbol or '').strip().upper()
            from api.alpha_vantage_service import _normalize_metal_symbol, get_forex_metal_quote_with_fallback, get_oanda_candles_finnhub
            symbol_normalized = _normalize_metal_symbol(symbol_upper)
            if symbol_normalized in ['XAU', 'XAG'] or (asset.exchange or '').strip().upper() == 'FOREX':
                to_ccy = (asset.currency or 'USD').strip().upper() or 'USD'
                fx_quote = get_forex_metal_quote_with_fallback(symbol_normalized, to_ccy)
                if not fx_quote or not fx_quote.get('exchange_rate'):
                    return Response({
                        'error': 'Données indisponibles pour le moment',
                        'rate_limit_reached': True,
                        'symbol': symbol_upper,
                    }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

                asset.last_price = fx_quote['exchange_rate']
                asset.last_price_update = timezone.now()

                # Best-effort change from last 2 daily closes
                fx_daily = get_oanda_candles_finnhub(symbol_normalized, to_ccy, resolution='D', days=30)
                if not fx_daily and to_ccy != 'USD':
                    metal_usd = get_oanda_candles_finnhub(symbol_normalized, 'USD', resolution='D', days=30)
                    usd_to = get_oanda_candles_finnhub('USD', to_ccy, resolution='D', days=30)
                    if metal_usd and usd_to:
                        usd_to_by_date = {p['date']: p for p in (usd_to.get('data') or [])}
                        out = []
                        for p in (metal_usd.get('data') or []):
                            fx = usd_to_by_date.get(p.get('date'))
                            if not fx:
                                continue
                            out.append({'date': p['date'], 'close': float(p.get('close', 0) or 0) * float(fx.get('close', 0) or 0)})
                        out.sort(key=lambda x: x['date'])
                        fx_daily = {'data': out}
                try:
                    series = (fx_daily or {}).get('data') or []
                    if len(series) >= 2:
                        prev_close = float(series[-2]['close'])
                        last_close = float(series[-1]['close'])
                        delta = last_close - prev_close
                        asset.price_change = delta
                        asset.price_change_percent = (delta / prev_close * 100) if prev_close else None
                except Exception:
                    pass

                asset.save()
            else:
                from api.alpha_vantage_service import get_stock_quote_with_fallback
                quote = get_stock_quote_with_fallback(asset.alpha_vantage_symbol)
                
                if not quote:
                    return Response({
                        'error': 'Données indisponibles pour le moment',
                        'symbol': symbol_upper,
                    }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                
                # Update asset price data
                asset.last_price = quote['price']
                asset.last_price_update = timezone.now()
                asset.price_change = quote['change']
                asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
                
                # Check if we need to fetch additional details
                needs_details = (
                    not asset.logo_url or 
                    not asset.description or 
                    not asset.sector or 
                    not asset.industry or
                    not asset.exchange or
                    not asset.reference or
                    not asset.currency or
                    not asset.category or
                    not asset.subcategory
                )
                
                if needs_details:
                    overview = (get_stock_profile_finnhub(asset.alpha_vantage_symbol) if FINNHUB_API_KEY else None) or (av_service.get_company_overview(asset.alpha_vantage_symbol) if av_service else None)
                    
                    if overview:
                        if not asset.logo_url:
                            logo_url = get_company_logo(asset.alpha_vantage_symbol) or (av_service.get_company_logo(asset.alpha_vantage_symbol) if av_service else None)
                            if logo_url:
                                asset.logo_url = logo_url
                        
                        # Update exchange if missing
                        if not asset.exchange and overview.get('Exchange'):
                            asset.exchange = overview.get('Exchange', '').strip()
                        
                        # Update reference if missing (use symbol as fallback)
                        if not asset.reference:
                            asset.reference = asset.alpha_vantage_symbol
                        
                        # Update currency if missing
                        if not asset.currency and overview.get('Currency'):
                            asset.currency = overview.get('Currency', '').strip()
                        
                        # Update category if missing (use country from overview)
                        if not asset.category and overview.get('Country'):
                            # Translate country to French
                            country = overview.get('Country', '').strip()
                            country_mapping = {
                                'United States': 'États-Unis',
                                'USA': 'États-Unis',
                                'United Kingdom': 'Royaume-Uni',
                                'UK': 'Royaume-Uni',
                                'Germany': 'Allemagne',
                                'France': 'France',
                                'Spain': 'Espagne',
                                'Italy': 'Italie',
                                'Netherlands': 'Pays-Bas',
                                'Switzerland': 'Suisse',
                                'Canada': 'Canada',
                                'China': 'Chine',
                                'Japan': 'Japon',
                            }
                            asset.category = country_mapping.get(country, country)
                            updated = True
                        
                        # Update subcategory if missing (use asset type)
                        if not asset.subcategory:
                            # Use the AssetType from overview or infer from current type
                            asset_type_overview = overview.get('AssetType', '')
                            if asset_type_overview:
                                asset.subcategory = asset_type_overview
                            elif asset.type:
                                asset.subcategory = asset.type
                            updated = True
                        
                        # Update description if missing
                        if not asset.description and overview.get('Description'):
                            asset.description = overview.get('Description', '').strip()
                        
                        # Update sector if missing
                        if not asset.sector and overview.get('Sector'):
                            asset.sector = overview.get('Sector', '').strip()
                        
                        # Update industry if missing
                        if not asset.industry and overview.get('Industry'):
                            asset.industry = overview.get('Industry', '').strip()
                        
                        # Update other details if missing
                        if not asset.country and overview.get('Country'):
                            asset.country = overview.get('Country', '').strip()
                        
                        if not asset.website and overview.get('Website'):
                            asset.website = overview.get('Website', '').strip()
                        
                        if not asset.headquarters and overview.get('Address'):
                            asset.headquarters = overview.get('Address', '').strip()
                        
                        if not asset.employees and overview.get('FullTimeEmployees'):
                            try:
                                asset.employees = int(overview.get('FullTimeEmployees', ''))
                            except (ValueError, TypeError):
                                pass
                        
                        if not asset.market_cap and overview.get('MarketCapitalization'):
                            try:
                                asset.market_cap = int(overview.get('MarketCapitalization', ''))
                                asset.market_cap_currency = overview.get('Currency', 'USD')
                            except (ValueError, TypeError):
                                pass
                
                asset.save()
        
        return Response(AssetSerializer(asset, context={'request': request}).data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Error updating price: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assets_bulk_update_prices(request):
    """
    Update prices and missing information for multiple assets at once
    Uses Alpha Vantage for stocks/ETFs and Finnhub for cryptos
    Updates: prices, logos, descriptions, sectors, and other company details

    Either pass assetIds (legacy) or refreshScope:
    - default_prices: assets marked default=True
    - client_assigned_prices: assets linked via ClientAsset
    - stale_24h_prices: last_price_update null or older than 24 hours
    - all_prices: all assets with a symbol
    - all_logos: refresh logo URL for all assets with a symbol (no price update)
    """
    import time
    from api.alpha_vantage_service import get_crypto_quote_alpha_vantage, get_crypto_logo

    refresh_scope = (request.data.get('refreshScope') or request.data.get('refresh_scope') or '').strip()
    valid_scopes = frozenset({
        'default_prices',
        'client_assigned_prices',
        'stale_24h_prices',
        'all_prices',
        'all_logos',
    })
    logos_only = False

    if refresh_scope:
        if refresh_scope not in valid_scopes:
            return Response(
                {'error': f'Invalid refreshScope. Allowed: {", ".join(sorted(valid_scopes))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logos_only = refresh_scope == 'all_logos'
        qs = Asset.objects.filter(alpha_vantage_symbol__isnull=False).exclude(alpha_vantage_symbol='')
        if refresh_scope == 'default_prices':
            qs = qs.filter(default=True)
        elif refresh_scope == 'client_assigned_prices':
            qs = qs.filter(id__in=ClientAsset.objects.values_list('asset_id', flat=True).distinct())
        elif refresh_scope == 'stale_24h_prices':
            cutoff = timezone.now() - timedelta(hours=24)
            qs = qs.filter(Q(last_price_update__isnull=True) | Q(last_price_update__lt=cutoff))
        asset_ids = list(qs.values_list('id', flat=True))
    else:
        asset_ids = request.data.get('assetIds', [])

    if not asset_ids:
        if refresh_scope:
            return Response({'updated': 0, 'total': 0, 'errors': [], 'skipped': True}, status=status.HTTP_200_OK)
        return Response({'error': 'assetIds array is required'}, status=status.HTTP_400_BAD_REQUEST)

    assets = Asset.objects.filter(id__in=asset_ids, alpha_vantage_symbol__isnull=False).exclude(alpha_vantage_symbol='')

    if not assets.exists():
        return Response({'error': 'No valid assets found with symbols configured'}, status=status.HTTP_404_NOT_FOUND)
    
    from api.alpha_vantage_service import (
        get_stock_profile_finnhub,
        get_company_logo,
        FINNHUB_API_KEY,
        FMP_API_KEY,
    )
    av_service = get_alpha_vantage_service()
    
    updated_count = 0
    errors = []

    for idx, asset in enumerate(assets):
        try:
            # Delay only when using Alpha Vantage (Finnhub has no strict rate limits)
            if not FINNHUB_API_KEY and av_service and not logos_only and idx > 0 and idx % 5 == 0:
                time.sleep(12)

            if logos_only:
                logo_url = None
                if (asset.type or '').lower() == 'crypto':
                    logo_url = get_crypto_logo(asset.alpha_vantage_symbol)
                else:
                    sym = (asset.alpha_vantage_symbol or '').strip().upper()
                    from api.alpha_vantage_service import _normalize_metal_symbol
                    symbol_normalized = _normalize_metal_symbol(sym)
                    is_forex_metal = symbol_normalized in ['XAU', 'XAG'] or (asset.exchange or '').strip().upper() == 'FOREX'
                    if is_forex_metal:
                        logo_url = get_company_logo(sym) or None
                    else:
                        logo_url = get_company_logo(asset.alpha_vantage_symbol) or (
                            av_service.get_company_logo(asset.alpha_vantage_symbol) if av_service else None
                        )
                if logo_url:
                    asset.logo_url = logo_url
                    asset.save(update_fields=['logo_url'])
                    updated_count += 1
                else:
                    errors.append(f'{asset.alpha_vantage_symbol}: Logo introuvable')
                continue

            updated = False
            
            # Use Finnhub/Alpha Vantage for cryptos and stocks/ETFs
            if asset.type.lower() == 'crypto':
                quote = get_crypto_quote_alpha_vantage(asset.alpha_vantage_symbol)
                
                if quote:
                    asset.last_price = quote['price']
                    asset.last_price_update = timezone.now()
                    asset.price_change = quote['change']
                    asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
                    updated = True
                
                # Update logo if missing
                if not asset.logo_url:
                    logo_url = get_crypto_logo(asset.alpha_vantage_symbol)
                    if logo_url:
                        asset.logo_url = logo_url
                        updated = True
            else:
                symbol_upper = (asset.alpha_vantage_symbol or '').strip().upper()
                from api.alpha_vantage_service import _normalize_metal_symbol
                symbol_normalized = _normalize_metal_symbol(symbol_upper)
                is_forex_metal = symbol_normalized in ['XAU', 'XAG'] or (asset.exchange or '').strip().upper() == 'FOREX'

                if is_forex_metal:
                    # Metals/FOREX: Finnhub OANDA first, Metals-API second, Alpha Vantage for fiat only
                    to_ccy = (asset.currency or 'USD').strip().upper() or 'USD'
                    from api.alpha_vantage_service import get_forex_metal_quote_with_fallback
                    fx_quote = get_forex_metal_quote_with_fallback(symbol_normalized, to_ccy)
                    if fx_quote and fx_quote.get('exchange_rate'):
                        asset.last_price = fx_quote['exchange_rate']
                        asset.last_price_update = timezone.now()
                        asset.price_change = fx_quote.get('change')
                        asset.price_change_percent = float(fx_quote['change_percent']) if fx_quote.get('change_percent') is not None else None
                        updated = True
                else:
                    # Stocks/ETFs: FMP, Finnhub, Alpha Vantage fallback
                    if not FMP_API_KEY and not FINNHUB_API_KEY and not av_service:
                        errors.append(f'{asset.alpha_vantage_symbol}: FMP_API_KEY, FINNHUB_API_KEY ou ALPHA_VANTAGE_API_KEY requis')
                        continue

                    from api.alpha_vantage_service import get_stock_quote_with_fallback
                    quote = get_stock_quote_with_fallback(asset.alpha_vantage_symbol)

                    if quote:
                        asset.last_price = quote['price']
                        asset.last_price_update = timezone.now()
                        asset.price_change = quote['change']
                        asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
                        updated = True
                
                needs_details = (
                    not asset.logo_url or 
                    not asset.description or 
                    not asset.sector or 
                    not asset.industry or
                    not asset.exchange or
                    not asset.reference or
                    not asset.currency or
                    not asset.category or
                    not asset.subcategory
                )
                
                if needs_details:
                    overview = (get_stock_profile_finnhub(asset.alpha_vantage_symbol) if FINNHUB_API_KEY else None) or (av_service.get_company_overview(asset.alpha_vantage_symbol) if av_service else None)
                    
                    if overview:
                        if not asset.logo_url:
                            logo_url = get_company_logo(asset.alpha_vantage_symbol) or (av_service.get_company_logo(asset.alpha_vantage_symbol) if av_service else None)
                            if logo_url:
                                asset.logo_url = logo_url
                                updated = True
                        
                        # Update exchange if missing
                        if not asset.exchange and overview.get('Exchange'):
                            asset.exchange = overview.get('Exchange', '').strip()
                            updated = True
                        
                        # Update reference if missing (use symbol as fallback)
                        if not asset.reference:
                            asset.reference = asset.alpha_vantage_symbol
                            updated = True
                        
                        # Update currency if missing
                        if not asset.currency and overview.get('Currency'):
                            asset.currency = overview.get('Currency', '').strip()
                            updated = True
                        
                        # Update category if missing (use country from overview)
                        if not asset.category and overview.get('Country'):
                            # Translate country to French
                            country = overview.get('Country', '').strip()
                            country_mapping = {
                                'United States': 'États-Unis',
                                'USA': 'États-Unis',
                                'United Kingdom': 'Royaume-Uni',
                                'UK': 'Royaume-Uni',
                                'Germany': 'Allemagne',
                                'France': 'France',
                                'Spain': 'Espagne',
                                'Italy': 'Italie',
                                'Netherlands': 'Pays-Bas',
                                'Switzerland': 'Suisse',
                                'Canada': 'Canada',
                                'China': 'Chine',
                                'Japan': 'Japon',
                            }
                            asset.category = country_mapping.get(country, country)
                            updated = True
                        
                        # Update subcategory if missing (use asset type)
                        if not asset.subcategory:
                            # Use the AssetType from overview or infer from current type
                            asset_type_overview = overview.get('AssetType', '')
                            if asset_type_overview:
                                asset.subcategory = asset_type_overview
                            elif asset.type:
                                asset.subcategory = asset.type
                            updated = True
                        
                        # Update description if missing
                        if not asset.description and overview.get('Description'):
                            asset.description = overview.get('Description', '').strip()
                            updated = True
                        
                        # Update sector if missing
                        if not asset.sector and overview.get('Sector'):
                            asset.sector = overview.get('Sector', '').strip()
                            updated = True
                        
                        # Update industry if missing
                        if not asset.industry and overview.get('Industry'):
                            asset.industry = overview.get('Industry', '').strip()
                            updated = True
                        
                        # Update other details if missing
                        if not asset.country and overview.get('Country'):
                            asset.country = overview.get('Country', '').strip()
                            updated = True
                        
                        if not asset.website and overview.get('Website'):
                            asset.website = overview.get('Website', '').strip()
                            updated = True
                        
                        if not asset.headquarters and overview.get('Address'):
                            asset.headquarters = overview.get('Address', '').strip()
                            updated = True
                        
                        if not asset.employees and overview.get('FullTimeEmployees'):
                            try:
                                asset.employees = int(overview.get('FullTimeEmployees', ''))
                                updated = True
                            except (ValueError, TypeError):
                                pass
                        
                        if not asset.market_cap and overview.get('MarketCapitalization'):
                            try:
                                asset.market_cap = int(overview.get('MarketCapitalization', ''))
                                asset.market_cap_currency = overview.get('Currency', 'USD')
                                updated = True
                            except (ValueError, TypeError):
                                pass
            
            if updated:
                asset.save()
                updated_count += 1
            else:
                errors.append(f'{asset.alpha_vantage_symbol}: No data to update')
                
        except Exception as e:
            errors.append(f'{asset.alpha_vantage_symbol}: {str(e)}')
    
    return Response({
        'updated': updated_count,
        'total': len(assets),
        'errors': errors
    }, status=status.HTTP_200_OK)


def _base_symbol_for_duplicate_asset_import(symbol: str) -> str:
    """
    Strip exchange-style suffix (.PA, .DE, .L) for duplicate checks.
    Keep US share-class tickers intact (e.g. BRK.B, BF.B).
    """
    sym = (symbol or '').strip().upper()
    if '.' not in sym:
        return sym
    head, tail = sym.rsplit('.', 1)
    if len(tail) >= 2 and tail.isalpha() and tail.isupper():
        return head
    return sym


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assets_bulk_import_from_index(request):
    """
    Bulk import assets from a market index (NASDAQ, S&P 500, CAC 40, etc.)
    or from crypto lists (Binance spot, CoinGecko top 100 market cap).
    Fetches constituent symbols and creates assets with optional quotes / details.
    """
    import time
    from api.index_constituent_service import get_index_constituents
    from api.alpha_vantage_service import get_oanda_quote_finnhub
    
    logger = logging.getLogger(__name__)
    
    index_name = request.data.get('index', '').strip().lower()
    default_exchange = request.data.get('exchange', '').strip().upper()
    fetch_full_details = request.data.get('fetchFullDetails', True)
    skip_duplicates = request.data.get('skipDuplicates', True)
    crypto_bulk_indexes = frozenset({'binance_usdt_spot', 'binance_eur_spot', 'top100_crypto_mc'})
    is_crypto_index = index_name in crypto_bulk_indexes
    crypto_av_market = 'EUR' if index_name == 'binance_eur_spot' else 'USD'
    
    if not index_name:
        return Response({'error': 'index parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Fetch constituents from the index service
        logger.info(f"Fetching constituents for index: {index_name}")
        constituents = get_index_constituents(index_name)
        
        if not constituents:
            return Response({'error': f'No constituents found for index: {index_name}'}, status=status.HTTP_404_NOT_FOUND)
        
        total = len(constituents)
        imported = 0
        skipped = 0
        errors = []
        
        av_service = get_alpha_vantage_service()
        
        for idx, constituent in enumerate(constituents):
            symbol = constituent.get('symbol', '').strip().upper()
            name = constituent.get('name', '').strip()
            sector = constituent.get('sector', '').strip()
            
            if not symbol:
                errors.append({'symbol': 'Unknown', 'error': 'Missing symbol'})
                continue
            
            # Check if asset already exists (check both exact symbol and base symbol without exchange suffix)
            if skip_duplicates:
                base_symbol = _base_symbol_for_duplicate_asset_import(symbol)
                
                # Check for exact match or base symbol match
                from django.db.models import Q
                existing_asset = Asset.objects.filter(
                    Q(alpha_vantage_symbol=symbol) |  # Exact match
                    Q(alpha_vantage_symbol=base_symbol) |  # Base symbol match
                    Q(alpha_vantage_symbol__startswith=f"{base_symbol}.")  # Base with any suffix
                ).first()
                
                if existing_asset:
                    skipped += 1
                    logger.info(f"Skipping existing asset: {symbol} (found as {existing_asset.alpha_vantage_symbol})")
                    continue
            
            try:
                # Determine asset type (default to Action/Stock)
                asset_type = 'Action'
                
                # Set default currency, region, and exchange based on index
                if is_crypto_index:
                    asset_type = 'crypto'
                    currency = 'EUR' if index_name == 'binance_eur_spot' else 'USD'
                    region = 'Monde'
                    exchange = (default_exchange or 'BINANCE').strip().upper() or 'BINANCE'
                elif index_name in ['cac40', 'cacmid60']:
                    currency = 'EUR'
                    region = 'France'
                    exchange = default_exchange or 'EURONEXT'
                elif index_name == 'dax':
                    currency = 'EUR'
                    region = 'Allemagne'
                    exchange = default_exchange or 'XETR'
                elif index_name == 'ftse100':
                    currency = 'GBP'
                    region = 'Royaume-Uni'
                    exchange = default_exchange or 'LSE'
                else:
                    # US indices defaults
                    currency = 'USD'
                    region = 'États-Unis'
                    exchange = default_exchange or ''
                
                # Override with constituent data if available
                if not is_crypto_index and constituent.get('headQuarter'):
                    region = constituent.get('headQuarter', '')
                
                # Generate unique asset ID
                asset_id = uuid.uuid4().hex[:12]
                while Asset.objects.filter(id=asset_id).exists():
                    asset_id = uuid.uuid4().hex[:12]
                
                # Initialize asset data
                asset_data = {
                    'id': asset_id,
                    'type': asset_type,
                    'name': name or symbol,
                    'alpha_vantage_symbol': symbol,
                    'exchange': exchange,
                    'currency': currency,
                    'region': region,
                    'sector': sector,
                    'source_index': index_name,  # Store the source index for filtering
                    'default': False,  # As per requirements, not default
                    'reference': symbol,
                    'category': 'Monde' if is_crypto_index else region,
                    'subcategory': asset_type,
                }
                
                from api.alpha_vantage_service import (
                    get_stock_quote_finnhub,
                    get_stock_profile_finnhub,
                    get_company_logo,
                    FINNHUB_API_KEY,
                )
                if is_crypto_index and av_service:
                    if idx > 0 and idx % 5 == 0:
                        time.sleep(12)
                    try:
                        from api.alpha_vantage_service import get_crypto_quote_alpha_vantage, get_crypto_logo
                        quote = get_crypto_quote_alpha_vantage(symbol, crypto_av_market)
                        if quote:
                            asset_data['last_price'] = quote.get('price')
                            asset_data['last_price_update'] = timezone.now()
                            asset_data['price_change'] = quote.get('change')
                            asset_data['price_change_percent'] = float(quote.get('change_percent', 0)) if quote.get('change_percent') else None
                        else:
                            logger.warning(f"Could not fetch crypto quote for {symbol}, creating with basic info")
                        if fetch_full_details:
                            logo_crypto = get_crypto_logo(symbol) or ''
                            if logo_crypto:
                                asset_data['logo_url'] = logo_crypto
                    except Exception as e:
                        logger.warning(f"Error fetching crypto data for {symbol}: {str(e)}")
                        errors.append({'symbol': symbol, 'error': f'Crypto quote/logo failed: {str(e)}'})
                elif not is_crypto_index and (FINNHUB_API_KEY or av_service):
                    if not FINNHUB_API_KEY and av_service and imported > 0 and imported % 5 == 0:
                        time.sleep(12)
                    
                    try:
                        from api.alpha_vantage_service import get_stock_quote_with_fallback
                        quote = get_stock_quote_with_fallback(symbol)
                        
                        if quote:
                            asset_data['last_price'] = quote.get('price')
                            asset_data['last_price_update'] = timezone.now()
                            asset_data['price_change'] = quote.get('change')
                            asset_data['price_change_percent'] = float(quote.get('change_percent', 0)) if quote.get('change_percent') else None
                            
                            if fetch_full_details:
                                overview = (get_stock_profile_finnhub(symbol) if FINNHUB_API_KEY else None) or (av_service.get_company_overview(symbol) if av_service else None) or {}
                                if overview:
                                    asset_data['name'] = overview.get('Name') or name or symbol
                                    asset_data['description'] = overview.get('Description', '').strip()
                                    asset_data['sector'] = overview.get('Sector', sector).strip()
                                    asset_data['industry'] = overview.get('Industry', '').strip()
                                    asset_data['headquarters'] = overview.get('Address', '').strip()
                                    asset_data['country'] = overview.get('Country', '').strip()
                                    asset_data['website'] = overview.get('Website', '').strip()
                                    
                                    # For currency, prefer default from index over Alpha Vantage
                                    # Alpha Vantage often returns USD for non-US stocks
                                    av_currency = overview.get('Currency', '').strip()
                                    if av_currency and index_name in ['nasdaq', 'sp500', 'dowjones']:
                                        # For US indices, trust Alpha Vantage
                                        asset_data['currency'] = av_currency
                                    # For European indices, keep the default EUR/GBP we set earlier
                                    
                                    # Parse numeric fields
                                    try:
                                        employees = overview.get('FullTimeEmployees', '').strip()
                                        asset_data['employees'] = int(employees) if employees else None
                                    except Exception:
                                        pass
                                    
                                    try:
                                        market_cap = overview.get('MarketCapitalization', '').strip()
                                        asset_data['market_cap'] = int(market_cap) if market_cap else None
                                        asset_data['market_cap_currency'] = asset_data['currency']
                                    except Exception:
                                        pass
                                
                                logo_url = get_company_logo(symbol) or (av_service.get_company_logo(symbol) if av_service else '') or ''
                                if logo_url:
                                    asset_data['logo_url'] = logo_url
                                
                                # Set exchange if available from overview
                                if overview.get('Exchange'):
                                    asset_data['exchange'] = overview.get('Exchange', '').strip()
                                
                                # Set category based on country with French translation
                                if overview.get('Country'):
                                    country = overview.get('Country', '').strip()
                                    country_mapping = {
                                        'United States': 'États-Unis',
                                        'USA': 'États-Unis',
                                        'United Kingdom': 'Royaume-Uni',
                                        'UK': 'Royaume-Uni',
                                        'Germany': 'Allemagne',
                                        'France': 'France',
                                        'Spain': 'Espagne',
                                        'Italy': 'Italie',
                                        'Netherlands': 'Pays-Bas',
                                        'Switzerland': 'Suisse',
                                        'Canada': 'Canada',
                                        'China': 'Chine',
                                        'Japan': 'Japon',
                                    }
                                    asset_data['category'] = country_mapping.get(country, country)
                                
                                # Set subcategory based on asset type from overview
                                asset_type_overview = overview.get('AssetType', '')
                                if asset_type_overview:
                                    asset_data['subcategory'] = asset_type_overview
                        else:
                            # Quote fetch failed, but we can still create the asset with basic info
                            logger.warning(f"Could not fetch quote for {symbol}, creating with basic info")
                    
                    except Exception as e:
                        # Log error but continue with basic asset creation
                        logger.warning(f"Error fetching details for {symbol}: {str(e)}")
                        errors.append({'symbol': symbol, 'error': f'Details fetch failed: {str(e)}'})
                
                # Create the asset
                asset = Asset.objects.create(**asset_data)
                imported += 1
                logger.info(f"Imported asset {imported}/{total}: {symbol}")
            
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Error importing {symbol}: {error_msg}")
                errors.append({'symbol': symbol, 'error': error_msg})
        
        return Response({
            'total': total,
            'imported': imported,
            'skipped': skipped,
            'errors': errors,
            'index': index_name
        }, status=status.HTTP_200_OK)
    
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f"Error in bulk import: {str(e)}")
        return Response({'error': f'Bulk import failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def assets_supported_indices(request):
    """
    Get list of all supported indices for bulk import
    """
    from api.index_constituent_service import get_supported_indices
    
    logger = logging.getLogger(__name__)
    
    try:
        indices = get_supported_indices()
        return Response({'indices': indices}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching supported indices: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# RIBs endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rib_list(request):
    """Liste tous les RIBs disponibles"""
    ribs = RIB.objects.all().order_by('name')
    serializer = RIBSerializer(ribs, many=True)
    return Response({'ribs': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rib_create(request):
    """Créer un nouveau RIB"""
    serializer = RIBSerializer(data=request.data)
    if serializer.is_valid():
        # Generate RIB ID
        rib_id = uuid.uuid4().hex[:12]
        while RIB.objects.filter(id=rib_id).exists():
            rib_id = uuid.uuid4().hex[:12]
        rib = serializer.save(id=rib_id)
        return Response(RIBSerializer(rib).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def rib_update(request, rib_id):
    """Modifier un RIB"""
    rib = get_object_or_404(RIB, id=rib_id)
    serializer = RIBSerializer(rib, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(RIBSerializer(rib).data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def rib_delete(request, rib_id):
    """Supprimer un RIB"""
    rib = get_object_or_404(RIB, id=rib_id)
    rib.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to support client_ tokens
@permission_classes([AllowAny])
def client_ribs(request, client_id):
    """Liste les RIBs catalogue liés au client.

    Avec un jeton client (`client_`), au plus un RIB est renvoyé (le plus ancien par date de liaison).
    Avec un jeton CRM, la liste complète est renvoyée pour l'administration.
    """
    client = get_object_or_404(Client, id=client_id)
    
    # Check authentication manually - tokens must be in Authorization header only (not query params for security)
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    token = auth_header.replace('Bearer ', '')
    
    if token.startswith('client_'):
        # Client token validation
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    else:
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if not token.startswith('client_'):
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    client_ribs_qs = (
        ClientRIB.objects.filter(client=client)
        .select_related('rib')
        .order_by('created_at', 'id')
    )
    # Plateforme client : un seul RIB catalogue exposé (évite les doublons historiques).
    if token.startswith('client_'):
        client_ribs_qs = client_ribs_qs[:1]
    serializer = ClientRIBSerializer(client_ribs_qs, many=True)
    return Response({'ribs': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_rib_add(request, client_id):
    """Ajouter un RIB à un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    rib_id = request.data.get('ribId')
    
    if not rib_id:
        return Response({'error': 'ribId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        rib = RIB.objects.get(id=rib_id)
        
        # Check if client already has this RIB
        if ClientRIB.objects.filter(client=client, rib=rib).exists():
            return Response({'error': 'Client already has this RIB'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate ClientRIB ID
        client_rib_id = uuid.uuid4().hex[:12]
        while ClientRIB.objects.filter(id=client_rib_id).exists():
            client_rib_id = uuid.uuid4().hex[:12]
        
        # Create ClientRIB relationship
        client_rib = ClientRIB.objects.create(
            id=client_rib_id,
            client=client,
            rib=rib
        )
        # Un seul RIB catalogue par client : retirer les autres liaisons.
        ClientRIB.objects.filter(client=client).exclude(pk=client_rib.pk).delete()

        serializer = ClientRIBSerializer(client_rib)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except RIB.DoesNotExist:
        return Response({'error': 'RIB not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_rib_remove(request, client_id, rib_id):
    """Retirer un RIB d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    rib = get_object_or_404(RIB, id=rib_id)
    
    try:
        client_rib = ClientRIB.objects.get(client=client, rib=rib)
        client_rib.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ClientRIB.DoesNotExist:
        return Response({'error': 'Client RIB relationship not found'}, status=status.HTTP_404_NOT_FOUND)

# Client Documents endpoints
@api_view(['GET'])
@authentication_classes([])  # Manual auth to support both JWT and client_ tokens
@permission_classes([AllowAny])
def client_documents(request, client_id):
    """Liste tous les documents d'un client"""
    client = get_object_or_404(Client, id=client_id)
    transaction_id = request.GET.get('transactionId', None)
    product_id = request.GET.get('productId', None)
    document_type = (request.GET.get('documentType') or '').strip() or None

    # Authorization: allow client token for own data OR authenticated admin user
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')

    if token and token.startswith('client_'):
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif token:
        # Validate JWT manually for admin/staff sessions
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    elif not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if not (token and token.startswith('client_')):
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    # Filter documents
    documents = ClientDocument.objects.filter(client=client).select_related('transaction', 'product', 'uploaded_by')
    
    # If transactionId is provided, filter by transaction
    if transaction_id:
        documents = documents.filter(transaction_id=transaction_id)

    if product_id:
        documents = documents.filter(product_id=product_id)

    allowed_doc_types = {c[0] for c in ClientDocument.DOCUMENT_TYPES}
    if document_type and document_type in allowed_doc_types:
        documents = documents.filter(document_type=document_type)
    
    documents = documents.order_by(F('document_created_on').desc(nulls_last=True), '-created_at')
    serializer = ClientDocumentSerializer(documents, many=True, context={'request': request})
    return Response({'documents': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def client_document_create(request, client_id):
    """Créer un nouveau document pour un client"""
    from django.utils.dateparse import parse_datetime
    from django.utils import timezone

    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    
    # Generate document ID
    document_id = uuid.uuid4().hex[:12]
    while ClientDocument.objects.filter(id=document_id).exists():
        document_id = uuid.uuid4().hex[:12]
    
    # Get document data
    name = request.data.get('name', '')
    document_type = request.data.get('documentType', 'other')
    description = request.data.get('description', '')
    transaction_id = request.data.get('transactionId', None) or None
    product_id = request.data.get('productId', None) or None
    created_at_raw = request.data.get('createdAt', None)
    updated_at_raw = request.data.get('updatedAt', None)
    if isinstance(created_at_raw, str) and not str(created_at_raw).strip():
        created_at_raw = None
    if isinstance(updated_at_raw, str) and not str(updated_at_raw).strip():
        updated_at_raw = None
    if transaction_id == '':
        transaction_id = None
    if product_id == '':
        product_id = None
    file = request.FILES.get('file')
    
    if not name:
        return Response({'error': 'Le nom du document est requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    if not file:
        return Response({'error': 'Le fichier est requis'}, status=status.HTTP_400_BAD_REQUEST)

    if transaction_id and product_id:
        return Response(
            {'error': 'Choisir soit une transaction, soit un produit — pas les deux à la fois.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # Transaction is optional - documents are not necessarily linked to a transaction
    transaction = None
    if transaction_id:
        try:
            transaction = Transaction.objects.get(id=transaction_id, client=client)
        except Transaction.DoesNotExist:
            return Response({'error': 'Transaction introuvable ou n\'appartient pas au client'}, status=status.HTTP_404_NOT_FOUND)

    product = None
    if product_id:
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response({'error': 'Produit introuvable'}, status=status.HTTP_404_NOT_FOUND)
    
    # Create document
    document = ClientDocument.objects.create(
        id=document_id,
        client=client,
        transaction=transaction,
        product=product,
        name=name,
        document_type=document_type,
        description=description,
        uploaded_by=request.user
    )
    
    # Handle file upload
    try:
        # Get file extension
        original_filename = file.name
        _, ext = os.path.splitext(original_filename)
        # Create filename with document ID: {document_id}{ext}
        custom_filename = f'{document_id}{ext}'
        
        print(f"Uploading document: {original_filename} as {custom_filename}")
        
        # Save with custom filename - this will upload to cloud storage
        document.file.save(custom_filename, file, save=True)
        
        # Verify the file was saved
        if not document.file:
            document.delete()
            return Response({'error': 'Erreur lors de l\'upload du fichier'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        print(f"Document uploaded successfully: {document.file.name}")
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Error uploading document: {error_msg}")
        print(traceback.format_exc())
        document.delete()
        return Response({'error': f'Erreur lors de l\'upload du fichier: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _parse_dt(val):
        if val is None:
            return None
        if isinstance(val, str):
            val = val.strip()
            if not val:
                return None
        dt = parse_datetime(str(val))
        if not dt:
            return None
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    # Date de création du document (métier) : document_created_on. created_at n'est pas modifié (horodatage d'ajout en base).
    updates = {}
    if created_at_raw is not None:
        dt = _parse_dt(created_at_raw)
        if not dt:
            document.delete()
            return Response({'error': 'createdAt invalide (attendu ISO datetime)'}, status=status.HTTP_400_BAD_REQUEST)
        updates['document_created_on'] = dt.date()
    else:
        document.refresh_from_db()
        if document.created_at:
            updates['document_created_on'] = document.created_at.date()
    if updated_at_raw is not None:
        dt = _parse_dt(updated_at_raw)
        if not dt:
            document.delete()
            return Response({'error': 'updatedAt invalide (attendu ISO datetime)'}, status=status.HTTP_400_BAD_REQUEST)
        updates['updated_at'] = dt
    if updates:
        ClientDocument.objects.filter(id=document.id, client=client).update(**updates)
        document.refresh_from_db()
    
    serializer = ClientDocumentSerializer(document, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_document_delete(request, client_id, document_id):
    """Supprimer un document d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    document = get_object_or_404(ClientDocument, id=document_id, client=client)
    
    # Delete the file if it exists
    if document.file:
        try:
            document.file.delete(save=False)
        except Exception as e:
            print(f"Warning: Could not delete file: {str(e)}")
    
    document.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def client_document_update(request, client_id, document_id):
    """Mettre à jour un document client (métadonnées + dates)."""
    from django.utils.dateparse import parse_datetime
    from django.utils import timezone

    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    document = get_object_or_404(ClientDocument, id=document_id, client=client)

    name = request.data.get('name', None)
    document_type = request.data.get('documentType', None)
    description = request.data.get('description', None)
    transaction_id = request.data.get('transactionId', None)
    product_id = request.data.get('productId', None)
    created_at_raw = request.data.get('createdAt', None)
    updated_at_raw = request.data.get('updatedAt', None)

    if transaction_id == '' or transaction_id == 'none':
        transaction_id = None
    if product_id == '' or product_id == 'none':
        product_id = None

    if transaction_id and product_id:
        return Response(
            {'error': 'Choisir soit une transaction, soit un produit — pas les deux à la fois.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    updates = {}

    if name is not None:
        name = str(name).strip()
        if not name:
            return Response({'error': 'Le nom du document est requis'}, status=status.HTTP_400_BAD_REQUEST)
        updates['name'] = name

    if document_type is not None:
        allowed_doc_types = {c[0] for c in ClientDocument.DOCUMENT_TYPES}
        document_type = str(document_type).strip()
        if document_type not in allowed_doc_types:
            return Response({'error': 'Type de document invalide'}, status=status.HTTP_400_BAD_REQUEST)
        updates['document_type'] = document_type

    if description is not None:
        updates['description'] = str(description)

    if transaction_id is not None:
        if transaction_id:
            try:
                Transaction.objects.get(id=transaction_id, client=client)
            except Transaction.DoesNotExist:
                return Response({'error': 'Transaction introuvable ou n\'appartient pas au client'}, status=status.HTTP_404_NOT_FOUND)
            updates['transaction_id'] = transaction_id
            updates['product_id'] = None
        else:
            updates['transaction_id'] = None

    if product_id is not None:
        if product_id:
            try:
                Product.objects.get(id=product_id)
            except Product.DoesNotExist:
                return Response({'error': 'Produit introuvable'}, status=status.HTTP_404_NOT_FOUND)
            updates['product_id'] = product_id
            updates['transaction_id'] = None
        else:
            updates['product_id'] = None

    def _parse_dt(val):
        if val is None:
            return None
        if isinstance(val, str):
            val = val.strip()
            if not val:
                return None
        dt = parse_datetime(str(val))
        if not dt:
            return None
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    if created_at_raw is not None:
        dt = _parse_dt(created_at_raw)
        if not dt:
            return Response({'error': 'createdAt invalide (attendu ISO datetime)'}, status=status.HTTP_400_BAD_REQUEST)
        updates['document_created_on'] = dt.date()

    if updated_at_raw is not None:
        dt = _parse_dt(updated_at_raw)
        if not dt:
            return Response({'error': 'updatedAt invalide (attendu ISO datetime)'}, status=status.HTTP_400_BAD_REQUEST)
        updates['updated_at'] = dt

    if updates:
        ClientDocument.objects.filter(id=document.id, client=client).update(**updates)

    document = ClientDocument.objects.select_related('transaction', 'product', 'uploaded_by').get(id=document.id, client=client)
    serializer = ClientDocumentSerializer(document, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def client_document_replace(request, client_id, document_id):
    """Remplacer le fichier (et optionnellement le nom/description) d'un document client existant."""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    document = get_object_or_404(ClientDocument, id=document_id, client=client)
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'Le fichier est requis'}, status=status.HTTP_400_BAD_REQUEST)

    # Optional metadata updates
    name = request.data.get('name', None)
    description = request.data.get('description', None)
    if name is not None:
        name = str(name).strip()
        if not name:
            return Response({'error': 'Le nom du document ne peut pas être vide'}, status=status.HTTP_400_BAD_REQUEST)
        document.name = name
    if description is not None:
        document.description = str(description)

    # Replace file (keep same document id-based filename convention)
    try:
        if document.file:
            try:
                document.file.delete(save=False)
            except Exception as e:
                print(f"Warning: Could not delete previous file: {str(e)}")

        original_filename = file.name
        _, ext = os.path.splitext(original_filename)
        custom_filename = f'{document_id}{ext}'
        print(f"Replacing document file: {original_filename} as {custom_filename}")

        document.file.save(custom_filename, file, save=True)
        document.uploaded_by = request.user
        document.save()
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Error replacing document file: {error_msg}")
        print(traceback.format_exc())
        return Response({'error': f'Erreur lors du remplacement du fichier: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    serializer = ClientDocumentSerializer(document, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)

# Useful Links endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def useful_link_list(request):
    """Liste tous les liens utiles disponibles"""
    useful_links = UsefulLink.objects.all().order_by('name')
    serializer = UsefulLinkSerializer(useful_links, many=True, context={'request': request})
    return Response({'usefulLinks': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def useful_link_create(request):
    """Créer un nouveau lien utile"""
    serializer = UsefulLinkSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        # Generate UsefulLink ID
        useful_link_id = uuid.uuid4().hex[:12]
        while UsefulLink.objects.filter(id=useful_link_id).exists():
            useful_link_id = uuid.uuid4().hex[:12]
        useful_link = serializer.save(id=useful_link_id)
        
        # Handle image upload explicitly for storage
        if 'image' in request.FILES:
            try:
                image_file = request.FILES['image']
                # Get file extension
                original_filename = image_file.name
                _, ext = os.path.splitext(original_filename)
                # Create filename with useful link ID: {useful_link_id}.{ext}
                custom_filename = f'{useful_link_id}{ext}'
                
                print(f"Uploading useful link image: {original_filename} as {custom_filename}")
                
                # Save with custom filename - this will upload to cloud storage
                useful_link.image.save(custom_filename, image_file, save=True)
                
                # Verify the image was saved and uploaded to storage
                if not useful_link.image:
                    return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                # Verify storage upload
                try:
                    storage = useful_link.image.storage
                    from api.storage import S3MediaStorage
                    if isinstance(storage, S3MediaStorage):
                        image_url = useful_link.image.url
                        if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                            print(f"Image successfully uploaded to storage: {useful_link.image.name}")
                            print(f"S3 URL: {image_url[:100]}...")
                except Exception as verify_error:
                    print(f"Warning: Could not verify storage upload: {str(verify_error)}")
            except Exception as upload_error:
                print(f"Error uploading image: {str(upload_error)}")
                import traceback
                traceback.print_exc()
                return Response({'error': f'Image upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Create log entry
        new_value = get_useful_link_data_for_log(useful_link)
        create_log_entry(
            event_type='createUsefulLink',
            user_id=request.user,
            request=request,
            old_value={},  # No old value for creation
            new_value=new_value
        )
        
        return Response(UsefulLinkSerializer(useful_link, context={'request': request}).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def useful_link_update(request, useful_link_id):
    """Modifier un lien utile"""
    useful_link = get_object_or_404(UsefulLink, id=useful_link_id)
    
    # Get old value before update for logging
    old_value = get_useful_link_data_for_log(useful_link)
    
    # Check if image should be removed
    remove_image = request.data.get('removeImage', '').lower() == 'true'
    if remove_image and useful_link.image:
        useful_link.image.delete(save=False)
        useful_link.image = None
    
    # Handle image upload explicitly for storage
    if 'image' in request.FILES:
        try:
            image_file = request.FILES['image']
            # Get file extension
            original_filename = image_file.name
            _, ext = os.path.splitext(original_filename)
            # Create filename with useful link ID: {useful_link_id}.{ext}
            custom_filename = f'{useful_link_id}{ext}'
            
            print(f"Uploading useful link image: {original_filename} as {custom_filename}")
            
            # Delete old image if it exists
            if useful_link.image:
                print(f"Deleting old image: {useful_link.image.name}")
                old_image_name = useful_link.image.name
                useful_link.image.delete(save=False)
                # Clear the field reference
                useful_link.image = None
                # Save to clear the database field
                useful_link.save(update_fields=['image'])
                print(f"Cleared old image from database: {old_image_name}")
            
            # Save with custom filename - this will upload to cloud storage
            useful_link.image.save(custom_filename, image_file, save=True)
            
            # Verify the image was saved and uploaded to storage
            if not useful_link.image:
                return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Verify storage upload
            try:
                storage = useful_link.image.storage
                from api.storage import S3MediaStorage
                if isinstance(storage, S3MediaStorage):
                    image_url = useful_link.image.url
                    if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                        print(f"Image successfully uploaded to storage: {useful_link.image.name}")
                        print(f"S3 URL: {image_url[:100]}...")
            except Exception as verify_error:
                print(f"Warning: Could not verify storage upload: {str(verify_error)}")
        except Exception as upload_error:
            print(f"Error uploading image: {str(upload_error)}")
            import traceback
            traceback.print_exc()
            return Response({'error': f'Image upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    serializer = UsefulLinkSerializer(useful_link, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        useful_link = serializer.save()
        # If removeImage flag was set, ensure image is None
        if remove_image:
            useful_link.image = None
            useful_link.save()
        
        # Refresh useful_link to get updated timestamp
        useful_link.refresh_from_db()
        
        # Get new value after update for logging
        new_value = get_useful_link_data_for_log(useful_link)
        
        # Create log entry
        create_log_entry(
            event_type='editUsefulLink',
            user_id=request.user,
            request=request,
            old_value=old_value,
            new_value=new_value
        )
        
        return Response(UsefulLinkSerializer(useful_link, context={'request': request}).data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def useful_link_delete(request, useful_link_id):
    """Supprimer un lien utile"""
    useful_link = get_object_or_404(UsefulLink, id=useful_link_id)
    
    # Get old value before deletion for logging
    old_value = get_useful_link_data_for_log(useful_link)
    
    # Delete the useful link
    useful_link.delete()
    
    # Create log entry
    create_log_entry(
        event_type='deleteUsefulLink',
        user_id=request.user,
        request=request,
        old_value=old_value,
        new_value={}  # No new value for deletion
    )
    
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])  # Disable JWT auth; client_ tokens aren't JWTs
def client_useful_links_current(request):
    """Liste les liens utiles du client connecté (token client_ uniquement)."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if not token or not token.startswith('client_'):
        return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    client_id = token.replace('client_', '')
    try:
        client = Client.objects.get(id=client_id)
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    if not client.active:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    client_useful_links = ClientUsefulLink.objects.filter(client=client).select_related('useful_link')
    serializer = ClientUsefulLinkSerializer(client_useful_links, many=True, context={'request': request})
    return Response({'usefulLinks': serializer.data})


@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to support client_ tokens
@permission_classes([AllowAny])
def client_useful_links(request, client_id):
    """Liste les liens utiles d'un client (admin ou client plateforme)"""
    client = get_object_or_404(Client, id=client_id)

    # Check if it's a client accessing their own data
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')

    is_client_access = False
    if token and token.startswith('client_'):
        is_client_access = True
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif auth_header.startswith('Bearer '):
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    if not is_client_access:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err

    client_useful_links = ClientUsefulLink.objects.filter(client=client).select_related('useful_link')
    serializer = ClientUsefulLinkSerializer(client_useful_links, many=True, context={'request': request})
    return Response({'usefulLinks': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_useful_link_add(request, client_id):
    """Ajouter un lien utile à un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    useful_link_id = request.data.get('usefulLinkId')
    
    if not useful_link_id:
        return Response({'error': 'usefulLinkId is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        useful_link = UsefulLink.objects.get(id=useful_link_id)
        
        # Check if client already has this useful link
        if ClientUsefulLink.objects.filter(client=client, useful_link=useful_link).exists():
            return Response({'error': 'Client already has this useful link'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate ClientUsefulLink ID
        client_useful_link_id = uuid.uuid4().hex[:12]
        while ClientUsefulLink.objects.filter(id=client_useful_link_id).exists():
            client_useful_link_id = uuid.uuid4().hex[:12]
        
        # Create ClientUsefulLink relationship
        client_useful_link = ClientUsefulLink.objects.create(
            id=client_useful_link_id,
            client=client,
            useful_link=useful_link
        )
        
        serializer = ClientUsefulLinkSerializer(client_useful_link, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except UsefulLink.DoesNotExist:
        return Response({'error': 'Useful link not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_useful_link_remove(request, client_id, useful_link_id):
    """Retirer un lien utile d'un client"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    useful_link = get_object_or_404(UsefulLink, id=useful_link_id)
    
    try:
        client_useful_link = ClientUsefulLink.objects.get(client=client, useful_link=useful_link)
        client_useful_link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ClientUsefulLink.DoesNotExist:
        return Response({'error': 'Client useful link relationship not found'}, status=status.HTTP_404_NOT_FOUND)

# Stats endpoint
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stats(request):
    """Retourne les statistiques pour le dashboard admin"""
    from django.db.models import Sum, Q
    
    client_ids = _get_client_ids_user_has_access_to(request)
    tx_filter = Q(type='depot') | Q(type='vente')
    if client_ids is not None:
        tx_filter &= Q(client_id__in=client_ids)
    client_filter = {} if client_ids is None else {'id__in': client_ids}

    # Calculate total revenue (sum of all deposits and sales)
    total_revenue = Transaction.objects.filter(tx_filter).aggregate(total=Sum('amount'))['total'] or 0

    # Calculate pending revenue (transactions with status 'en_attente_paiement' or 'en_cours')
    pending_revenue = Transaction.objects.filter(
        tx_filter,
        Q(status='en_attente_paiement') | Q(status='en_cours')
    ).aggregate(total=Sum('amount'))['total'] or 0

    # Count total clients
    total_clients = Client.objects.filter(**client_filter).count()
    
    # Get recent transactions (last 10) - filter by client access
    recent_transactions = (
        Transaction.objects.annotate(positions_count=Count('positions'))
        .order_by('-datetime', '-created_at')
    )
    if client_ids is not None:
        recent_transactions = recent_transactions.filter(client_id__in=client_ids)
    recent_transactions = recent_transactions[:10]
    transaction_serializer = TransactionSerializer(recent_transactions, many=True)

    # Get recent received messages for admin dashboard - filter by client access
    recent_messages_qs = (
        ClientChatMessage.objects
        .filter(sender='client')
        .select_related('conversation', 'client', 'manager_user')
        .order_by('-created_at')
    )
    if client_ids is not None:
        recent_messages_qs = recent_messages_qs.filter(client_id__in=client_ids)
    recent_messages_qs = recent_messages_qs[:5]
    recent_messages = []
    for message in recent_messages_qs:
        client_name = f"{(message.client.fname or '').strip()} {(message.client.lname or '').strip()}".strip()
        if not client_name:
            client_name = (message.client.email or '').strip() or (message.client.id or '').strip()
        manager_name = ''
        if message.manager_user:
            manager_name = (message.manager_user.get_full_name() or '').strip() or (message.manager_user.username or '').strip()
        subject = ''
        if message.conversation and message.conversation.subject:
            subject = message.conversation.subject
        if not subject:
            subject = f"Message de {client_name}" if client_name else "Nouveau message"

        recent_messages.append({
            'id': message.id,
            'subject': subject,
            'message': message.message,
            'createdAt': message.created_at,
            'clientId': message.client_id,
            'clientName': client_name,
            'managerName': manager_name,
            'conversationId': message.conversation_id or 'legacy',
            'read': bool(message.read_by_manager),
            'read_by_manager': bool(message.read_by_manager),
        })
    
    return Response({
        'totalRevenue': float(total_revenue),
        'pendingRevenue': float(pending_revenue),
        'totalClients': total_clients,
        'recentTransactions': transaction_serializer.data,
        'recentMessages': recent_messages,
    })

# Transaction endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def all_transactions(request):
    """Liste toutes les transactions de tous les clients"""
    transactions = Transaction.objects.annotate(positions_count=Count('positions'))
    client_ids = _get_client_ids_user_has_access_to(request)
    if client_ids is not None:
        transactions = transactions.filter(client_id__in=client_ids)
    transactions = transactions.order_by('-datetime', '-created_at')
    serializer = TransactionSerializer(transactions, many=True)
    return Response({'transactions': serializer.data})


# Positions endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def positions_list(request):
    """Liste toutes les positions (admin)"""
    status_param = request.GET.get('status')
    qs = Position.objects.select_related('client', 'product', 'transaction', 'asset').all()
    client_ids = _get_client_ids_user_has_access_to(request)
    if client_ids is not None:
        qs = qs.filter(client_id__in=client_ids)

    if status_param:
        # Allow comma-separated list: ?status=pending,done
        statuses = [s.strip() for s in str(status_param).split(',') if s.strip()]
        if statuses:
            qs = qs.filter(status__in=statuses)
            # For pending positions only, sort ascending (sooner to later)
            # For other statuses, sort descending (most recent first)
            if 'pending' in statuses and len(statuses) == 1:
                # Only pending: sort ascending by opened_at or period_date (sooner first)
                qs = qs.order_by('opened_at', 'period_date', 'created_at')
            else:
                # Mixed or other statuses: sort descending
                qs = qs.order_by('-opened_at', '-period_date', '-created_at')
        else:
            # status_param provided but resulted in empty statuses list
            # Apply default descending order
            qs = qs.order_by('-opened_at', '-period_date', '-created_at')
    else:
        # No status filter: default descending order
        qs = qs.order_by('-opened_at', '-period_date', '-created_at')

    # Filter by product if requested
    product_id_param = request.GET.get('product_id')
    if product_id_param:
        qs = qs.filter(product_id=product_id_param)

    # Clients list for filter dropdown (unique clients in status+product filtered queryset, before client filter)
    client_ids_in_qs = qs.exclude(client_id__isnull=True).values_list('client_id', flat=True).distinct()
    clients_data = []
    for c in Client.objects.filter(id__in=client_ids_in_qs).values('id', 'fname', 'lname', 'email'):
        name = f"{(c.get('fname') or '').strip()} {(c.get('lname') or '').strip()}".strip() or (c.get('email') or '') or c.get('id')
        clients_data.append({'id': c.get('id'), 'name': name})
    clients_data.sort(key=lambda x: x['name'].lower())

    # Filter by client if requested
    client_id_param = request.GET.get('client_id')
    if client_id_param:
        qs = qs.filter(client_id=client_id_param)

    # Products list for filter dropdown (unique products in filtered queryset)
    product_ids = qs.exclude(product_id__isnull=True).values_list('product_id', flat=True).distinct()
    products_data = list(Product.objects.filter(id__in=product_ids).values('id', 'name').order_by('name'))

    # Counts per status for tab labels (same filters as list, but without status filter).
    from django.db.models import Count
    counts_base = Position.objects.all()
    if client_ids is not None:
        counts_base = counts_base.filter(client_id__in=client_ids)
    if product_id_param:
        counts_base = counts_base.filter(product_id=product_id_param)
    if client_id_param:
        counts_base = counts_base.filter(client_id=client_id_param)
    status_counts = dict(counts_base.values('status').annotate(c=Count('id')).values_list('status', 'c'))
    counts_data = {
        'pending': status_counts.get('pending', 0),
        'open': status_counts.get('open', 0),
        'closed': status_counts.get('done', 0) + status_counts.get('cancelled', 0),
    }

    # Pagination support
    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '50')

    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 50
        if limit > 500:  # Max limit to prevent abuse
            limit = 500
    except (ValueError, TypeError):
        page = 1
        limit = 50

    total_count = qs.count()
    offset = (page - 1) * limit
    paginated_qs = qs[offset:offset + limit]

    serializer = PositionSerializer(paginated_qs, many=True)
    return Response({
        'positions': serializer.data,
        'products': products_data,
        'clients': clients_data,
        'counts': counts_data,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_count,
            'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_position_cancel(request, client_id, position_id):
    """
    Annuler (soft-delete) une position: status -> 'cancelled'.
    Accessible uniquement aux utilisateurs authentifiés (admin/gestionnaire) ayant accès au client.
    """
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    pos = get_object_or_404(
        Position.objects.select_related('client', 'product', 'transaction', 'asset'),
        id=position_id,
        client=client,
    )

    if pos.status != 'cancelled':
        pos.status = 'cancelled'
        pos.save(update_fields=['status', 'updated_at'])

    serializer = PositionSerializer(pos)
    return Response({'position': serializer.data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_process_positions(request, client_id):
    """
    Exécute la même logique que ``manage.py process_positions`` pour ce client uniquement
    (mise à jour des statuts + intérêts de secours). CRM (JWT + droits gestionnaire).
    """
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    from .process_positions_runner import run_process_positions

    try:
        result = run_process_positions(
            client_id=client_id,
            dry_run=False,
            interest_trigger="process_positions_client_refresh",
        )
    except Exception as e:
        logger.exception("client_process_positions failed for client %s", client_id)
        return Response(
            {"status": "error", "message": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return Response({"status": "ok", **result})


@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to support client_ tokens
@permission_classes([AllowAny])
def client_positions(request, client_id):
    """Liste les positions d'un client (client token ou admin JWT)."""
    client = get_object_or_404(Client, id=client_id)
    status_param = request.GET.get('status')

    # Check authentication manually (same approach as client_transactions)
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')

    is_client_token = bool(token and token.startswith('client_'))
    if is_client_token:
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    # Admin JWT: check gestionnaire can only access assigned clients
    if getattr(request.user, 'is_authenticated', False):
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err

    # Align pending/open/done with real time so the portal stays correct if cron is late or missing.
    try:
        with db_transaction.atomic():
            sync_position_statuses_from_schedule(
                Position.objects.filter(client=client),
                run_interest_for_closed=True,
                interest_trigger='client_positions_view',
            )
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            'sync_position_statuses_from_schedule failed for client %s',
            client_id,
        )

    qs = Position.objects.select_related('client', 'product', 'transaction', 'asset').filter(client=client)
    # Platform client must never see cancelled positions (even if requested via status filter).
    if is_client_token:
        qs = qs.exclude(status='cancelled')

    # Determine sorting based on status filter
    statuses = []
    if status_param:
        statuses = [s.strip() for s in str(status_param).split(',') if s.strip()]
        if is_client_token and statuses:
            # Enforce: cancelled never returned to platform clients.
            statuses = [s for s in statuses if s != 'cancelled']
        if statuses:
            qs = qs.filter(status__in=statuses)
            # For pending positions only, sort ascending (sooner to later)
            # For other statuses, sort descending (most recent first)
            if 'pending' in statuses and len(statuses) == 1:
                # Only pending: sort ascending by opened_at or period_date (sooner first)
                qs = qs.order_by('opened_at', 'period_date', 'created_at')
            else:
                # Mixed or other statuses: sort descending
                qs = qs.order_by('-opened_at', '-period_date', '-created_at')
        else:
            # status_param provided but resulted in empty statuses list
            # Apply default descending order
            qs = qs.order_by('-opened_at', '-period_date', '-created_at')
    else:
        # No status filter: default descending order
        qs = qs.order_by('-opened_at', '-period_date', '-created_at')
    
    # Pagination support
    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '50')
    
    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 50
        if limit > 500:  # Max limit to prevent abuse
            limit = 500
    except (ValueError, TypeError):
        page = 1
        limit = 50
    
    total_count = qs.count()
    offset = (page - 1) * limit
    paginated_qs = qs[offset:offset + limit]
    
    serializer = PositionSerializer(paginated_qs, many=True)
    return Response({
        'positions': serializer.data,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_count,
            'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1
        }
    })


@api_view(['GET', 'POST'])
@authentication_classes([])  # Disable authentication - we'll check manually to support client_ tokens
@permission_classes([AllowAny])
def client_chat(request, client_id):
    """
    Simple chat between a client and their manager.
    - Client: uses Bearer client_<client_id>
    - Admin/manager: uses JWT Bearer token
    """
    client = get_object_or_404(Client, id=client_id)

    # Check authentication manually (same approach as client_transactions)
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')

    is_client_token = bool(token and token.startswith('client_'))
    is_admin_token = False

    if is_client_token:
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
                is_admin_token = True
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    # Admin JWT: check gestionnaire can only access assigned clients
    if is_admin_token:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err

    # Resolve manager user (from client.managed_by)
    manager_user = None
    if client.managed_by:
        try:
            manager_id = int(client.managed_by)
            manager_user = DjangoUser.objects.filter(id=manager_id).first()
        except (ValueError, TypeError):
            manager_user = DjangoUser.objects.filter(username=client.managed_by).first()

    if request.method == 'GET':
        qs = ClientChatMessage.objects.filter(client=client).order_by('created_at')
        serializer = ClientChatMessageSerializer(qs, many=True)
        manager_photo = _get_manager_profile_photo(manager_user, request) if manager_user else ''
        
        # Get manager status, availability schedule, and phone from UserDetails
        manager_status = 'offline'
        manager_availability_schedule = {}
        manager_phone = ''
        if manager_user:
            try:
                user_details = UserDetails.objects.get(django_user=manager_user)
                manager_status = user_details.status if user_details.status else 'offline'
                manager_availability_schedule = user_details.availability_schedule if user_details.availability_schedule else {}
                manager_phone = user_details.phone if user_details.phone else ''
            except UserDetails.DoesNotExist:
                pass
        
        return Response({
            'messages': serializer.data,
            'manager': {
                'id': str(manager_user.id) if manager_user else None,
                'name': (f"{manager_user.first_name} {manager_user.last_name}".strip() if manager_user else ''),
                'email': (manager_user.email if manager_user else ''),
                'phone': manager_phone,
                'profilePhoto': manager_photo,
                'status': manager_status,
                'availabilitySchedule': manager_availability_schedule,
            },
        })

    # POST: send message
    try:
        payload = request.data or {}
    except Exception:
        payload = {}

    message_text = str(payload.get('message', '') or '').strip()
    if not message_text:
        return Response({'error': 'Message requis'}, status=status.HTTP_400_BAD_REQUEST)

    message_id = uuid.uuid4().hex[:12]
    while ClientChatMessage.objects.filter(id=message_id).exists():
        message_id = uuid.uuid4().hex[:12]

    sender = 'client' if is_client_token else 'manager'
    msg = ClientChatMessage.objects.create(
        id=message_id,
        client=client,
        manager_user=manager_user,
        sender=sender,
        message=message_text,
        read_by_client=(sender == 'client'),
        read_by_manager=(sender == 'manager'),
    )

    if sender == 'client' and manager_user:
        client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=manager_user,
            notification_type=AppNotification.TYPE_MESSAGE_FROM_CLIENT,
            title="Nouveau message",
            message=f"{client_name} vous a envoyé un message.",
            payload={"client_id": client.id, "message_id": msg.id},
        )
    elif sender == 'manager':
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CLIENT,
            recipient_client=client,
            notification_type=AppNotification.TYPE_MESSAGE_FROM_MANAGER,
            title="Nouveau message",
            message="Votre gestionnaire vous a envoyé un message.",
            payload={"message_id": msg.id},
        )

    return Response({'message': ClientChatMessageSerializer(msg).data}, status=status.HTTP_201_CREATED)


def _resolve_client_manager_user(client: Client):
    """Best-effort resolve manager user from client.managed_by."""
    manager_user = None
    if client.managed_by:
        try:
            manager_id = int(client.managed_by)
            manager_user = DjangoUser.objects.filter(id=manager_id).first()
        except (ValueError, TypeError):
            manager_user = DjangoUser.objects.filter(username=client.managed_by).first()
    return manager_user


def _get_manager_profile_photo(manager_user: DjangoUser, request):
    """Return manager profile photo URL if available (UserDetails.profile_photo)."""
    if not manager_user:
        return ''
    try:
        user_details = getattr(manager_user, 'user_details', None)
        if not user_details or not getattr(user_details, 'profile_photo', None):
            return ''
        from .serializer import _get_media_url_for_field
        return _get_media_url_for_field(request, user_details.profile_photo) or ''
    except Exception:
        return ''


def _client_or_admin_auth(request, client: Client, client_id: str):
    """
    Manual auth used by client endpoints to support:
    - Client: Bearer client_<client_id>
    - Admin/manager: JWT Bearer token
    Returns tuple: (is_client_token: bool, is_admin_token: bool, token: str)
    Raises Response on failure (callers should return it).
    """
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')

    is_client_token = bool(token and token.startswith('client_'))
    is_admin_token = False

    if is_client_token:
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif auth_header.startswith('Bearer '):
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
                is_admin_token = True
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    return is_client_token, is_admin_token, token


@api_view(['GET', 'POST'])
@authentication_classes([])  # Disable authentication - we check manually
@permission_classes([AllowAny])
def client_conversations(request, client_id):
    """
    Conversation threads between a client and their manager.
    - GET: list conversations (includes a synthetic "legacy" thread for old chat messages).
    - POST: create a new request with {subject, message}.
    """
    client = get_object_or_404(Client, id=client_id)
    auth_res = _client_or_admin_auth(request, client, client_id)
    if isinstance(auth_res, Response):
        return auth_res
    is_client_token, is_admin_token, _token = auth_res

    if is_admin_token:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err

    manager_user = _resolve_client_manager_user(client)
    manager_photo = _get_manager_profile_photo(manager_user, request) if manager_user else ''

    if request.method == 'GET':
        conversations = ClientConversation.objects.filter(client=client).order_by('-updated_at', '-created_at')
        conv_data = ClientConversationSerializer(conversations, many=True).data

        # Include legacy chat as a synthetic conversation if there are messages without a conversation.
        legacy_qs = ClientChatMessage.objects.filter(client=client, conversation__isnull=True).order_by('created_at')
        if legacy_qs.exists():
            last_msg = legacy_qs.order_by('-created_at').first()
            first_msg = legacy_qs.first()
            preview = (last_msg.message or '').strip() if last_msg else ''
            if len(preview) > 120:
                preview = preview[:120] + '…'
            legacy_item = {
                'id': 'legacy',
                'client': client.id,
                'manager_user': str(manager_user.id) if manager_user else None,
                'subject': 'Conversation précédente',
                'closed': False,
                'createdAt': first_msg.created_at if first_msg else None,
                'updatedAt': last_msg.created_at if last_msg else None,
                'lastMessageAt': last_msg.created_at if last_msg else None,
                'lastMessagePreview': preview,
            }
            conv_data = [legacy_item] + list(conv_data)

        # Get manager status, availability schedule, and phone from UserDetails
        manager_status = 'offline'
        manager_availability_schedule = {}
        manager_phone = ''
        if manager_user:
            try:
                user_details = UserDetails.objects.get(django_user=manager_user)
                manager_status = user_details.status if user_details.status else 'offline'
                manager_availability_schedule = user_details.availability_schedule if user_details.availability_schedule else {}
                manager_phone = user_details.phone if user_details.phone else ''
            except UserDetails.DoesNotExist:
                pass
        
        return Response({
            'conversations': conv_data,
            'manager': {
                'id': str(manager_user.id) if manager_user else None,
                'name': (f"{manager_user.first_name} {manager_user.last_name}".strip() if manager_user else ''),
                'email': (manager_user.email if manager_user else ''),
                'phone': manager_phone,
                'profilePhoto': manager_photo,
                'status': manager_status,
                'availabilitySchedule': manager_availability_schedule,
            },
        })

    # POST: create a new conversation request
    try:
        payload = request.data or {}
    except Exception:
        payload = {}

    subject = str(payload.get('subject', '') or '').strip()
    message_text = str(payload.get('message', '') or '').strip()
    if not subject:
        return Response({'error': 'Sujet requis'}, status=status.HTTP_400_BAD_REQUEST)
    if not message_text:
        return Response({'error': 'Message requis'}, status=status.HTTP_400_BAD_REQUEST)

    conversation_id = uuid.uuid4().hex[:12]
    while ClientConversation.objects.filter(id=conversation_id).exists():
        conversation_id = uuid.uuid4().hex[:12]

    conversation = ClientConversation.objects.create(
        id=conversation_id,
        client=client,
        manager_user=manager_user,
        subject=subject,
        closed=False,
    )

    message_id = uuid.uuid4().hex[:12]
    while ClientChatMessage.objects.filter(id=message_id).exists():
        message_id = uuid.uuid4().hex[:12]

    sender = 'client' if is_client_token else 'manager'
    msg = ClientChatMessage.objects.create(
        id=message_id,
        client=client,
        conversation=conversation,
        manager_user=manager_user,
        sender=sender,
        message=message_text,
        read_by_client=(sender == 'client'),
        read_by_manager=(sender == 'manager'),
    )

    if sender == 'client' and manager_user:
        client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=manager_user,
            notification_type=AppNotification.TYPE_MESSAGE_FROM_CLIENT,
            title="Nouveau message",
            message=f"{client_name} vous a envoyé un message.",
            payload={"client_id": client.id, "message_id": msg.id, "conversation_id": conversation.id},
        )
    elif sender == 'manager':
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CLIENT,
            recipient_client=client,
            notification_type=AppNotification.TYPE_MESSAGE_FROM_MANAGER,
            title="Nouveau message",
            message="Votre gestionnaire vous a envoyé un message.",
            payload={"message_id": msg.id, "conversation_id": conversation.id},
        )

    return Response(
        {
            'conversation': ClientConversationSerializer(conversation).data,
            'message': ClientChatMessageSerializer(msg).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'POST'])
@authentication_classes([])  # Disable authentication - we check manually
@permission_classes([AllowAny])
def client_conversation_messages(request, client_id, conversation_id):
    """
    Messages for a given conversation.
    Special conversation_id "legacy" maps to old chat messages where conversation is NULL.
    """
    client = get_object_or_404(Client, id=client_id)
    auth_res = _client_or_admin_auth(request, client, client_id)
    if isinstance(auth_res, Response):
        return auth_res
    is_client_token, is_admin_token, _token = auth_res

    if is_admin_token:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err

    manager_user = _resolve_client_manager_user(client)
    manager_photo = _get_manager_profile_photo(manager_user, request) if manager_user else ''

    is_legacy = str(conversation_id) == 'legacy'
    conversation = None
    if not is_legacy:
        conversation = get_object_or_404(ClientConversation, id=conversation_id, client=client)

    if request.method == 'GET':
        if is_legacy:
            qs = ClientChatMessage.objects.filter(client=client, conversation__isnull=True).order_by('created_at')
        else:
            qs = ClientChatMessage.objects.filter(client=client, conversation=conversation).order_by('created_at')
        # Marquer les messages du gestionnaire comme lus quand le client consulte la conversation
        if is_client_token:
            ClientChatMessage.objects.filter(
                client=client,
                sender='manager',
                read_by_client=False,
                conversation=None if is_legacy else conversation,
            ).update(read_by_client=True)
        serializer = ClientChatMessageSerializer(qs, many=True)
        
        # Get manager status, availability schedule, and phone from UserDetails
        manager_status = 'offline'
        manager_availability_schedule = {}
        manager_phone = ''
        if manager_user:
            try:
                user_details = UserDetails.objects.get(django_user=manager_user)
                manager_status = user_details.status if user_details.status else 'offline'
                manager_availability_schedule = user_details.availability_schedule if user_details.availability_schedule else {}
                manager_phone = user_details.phone if user_details.phone else ''
            except UserDetails.DoesNotExist:
                pass
        
        return Response({
            'conversation': (ClientConversationSerializer(conversation).data if conversation else {'id': 'legacy', 'subject': 'Conversation précédente'}),
            'messages': serializer.data,
            'manager': {
                'id': str(manager_user.id) if manager_user else None,
                'name': (f"{manager_user.first_name} {manager_user.last_name}".strip() if manager_user else ''),
                'email': (manager_user.email if manager_user else ''),
                'phone': manager_phone,
                'profilePhoto': manager_photo,
                'status': manager_status,
                'availabilitySchedule': manager_availability_schedule,
            },
        })

    # POST: send message in a conversation
    try:
        payload = request.data or {}
    except Exception:
        payload = {}

    message_text = str(payload.get('message', '') or '').strip()
    if not message_text:
        return Response({'error': 'Message requis'}, status=status.HTTP_400_BAD_REQUEST)

    message_id = uuid.uuid4().hex[:12]
    while ClientChatMessage.objects.filter(id=message_id).exists():
        message_id = uuid.uuid4().hex[:12]

    sender = 'client' if is_client_token else 'manager'
    msg = ClientChatMessage.objects.create(
        id=message_id,
        client=client,
        conversation=None if is_legacy else conversation,
        manager_user=manager_user,
        sender=sender,
        message=message_text,
        read_by_client=(sender == 'client'),
        read_by_manager=(sender == 'manager'),
    )

    # Bump conversation updated_at so it sorts correctly in lists.
    if conversation:
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=['updated_at'])

    if sender == 'client' and manager_user:
        client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CRM_USER,
            recipient_user=manager_user,
            notification_type=AppNotification.TYPE_MESSAGE_FROM_CLIENT,
            title="Nouveau message",
            message=f"{client_name} vous a envoyé un message.",
            payload={
                "client_id": client.id,
                "message_id": msg.id,
                "conversation_id": conversation.id if conversation else None,
            },
        )
    elif sender == 'manager':
        create_app_notification(
            recipient_type=AppNotification.RECIPIENT_CLIENT,
            recipient_client=client,
            notification_type=AppNotification.TYPE_MESSAGE_FROM_MANAGER,
            title="Nouveau message",
            message="Votre gestionnaire vous a envoyé un message.",
            payload={
                "message_id": msg.id,
                "conversation_id": conversation.id if conversation else None,
            },
        )

    return Response({'message': ClientChatMessageSerializer(msg).data}, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def client_conversation_message_detail(request, client_id, conversation_id, message_id):
    """
    Edit (PATCH) or delete (DELETE) a chat message. Admin/manager only.
    """
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    is_legacy = str(conversation_id) == 'legacy'
    conversation = None
    if not is_legacy:
        conversation = get_object_or_404(ClientConversation, id=conversation_id, client=client)

    msg = get_object_or_404(
        ClientChatMessage,
        id=message_id,
        client=client,
        conversation=None if is_legacy else conversation,
    )

    if request.method == 'PATCH':
        try:
            payload = request.data or {}
        except Exception:
            payload = {}
        message_text = str(payload.get('message', '') or '').strip()
        if not message_text:
            return Response({'error': 'Message requis'}, status=status.HTTP_400_BAD_REQUEST)
        msg.message = message_text
        msg.save(update_fields=['message'])
        return Response({'message': ClientChatMessageSerializer(msg).data})

    if request.method == 'DELETE':
        msg.delete()
        if conversation:
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=['updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response({'error': 'Méthode non autorisée'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)


@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def client_transactions(request, client_id):
    """Liste les transactions d'un client"""
    client = get_object_or_404(Client, id=client_id)
    
    # Check authentication manually
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    if token and token.startswith('client_'):
        # Client token validation
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if getattr(request.user, 'is_authenticated', False):
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    transactions = (
        Transaction.objects.filter(client=client)
        .annotate(positions_count=Count('positions'))
        .order_by('-datetime', '-created_at')
    )

    # Pagination support
    page = request.GET.get('page', '1')
    limit = request.GET.get('limit', '50')
    
    try:
        page = int(page)
        limit = int(limit)
        if page < 1:
            page = 1
        if limit < 1:
            limit = 50
        if limit > 500:  # Max limit to prevent abuse
            limit = 500
    except (ValueError, TypeError):
        page = 1
        limit = 50
    
    total_count = transactions.count()
    offset = (page - 1) * limit
    paginated_transactions = transactions[offset:offset + limit]
    
    serializer = TransactionSerializer(paginated_transactions, many=True)
    return Response({
        'transactions': serializer.data,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_count,
            'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1
        }
    })

@api_view(['POST'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def client_transaction_create(request, client_id):
    """Créer une transaction pour un client"""
    try:
        return _client_transaction_create_impl(request, client_id)
    except Exception as e:
        logger.exception("client_transaction_create failed")
        return Response(
            {'error': str(e), 'detail': str(e), 'message': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def _client_transaction_create_impl(request, client_id):
    """Implementation of client transaction creation."""
    client = get_object_or_404(Client, id=client_id)
    
    # Check if it's a client accessing their own data
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    if token and token.startswith('client_'):
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    is_client_token = bool(token and token.startswith('client_'))
    if not is_client_token:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    # Validate required fields
    if not request.data.get('type'):
        return Response({'error': 'Le type de transaction est requis'}, status=status.HTTP_400_BAD_REQUEST)
    if request.data.get('type') != 'conversion' and not request.data.get('amount'):
        return Response({'error': 'Le montant est requis'}, status=status.HTTP_400_BAD_REQUEST)
    if not request.data.get('datetime'):
        return Response({'error': 'La date et heure sont requises'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Generate transaction ID
    transaction_id = uuid.uuid4().hex[:12]
    while Transaction.objects.filter(id=transaction_id).exists():
        transaction_id = uuid.uuid4().hex[:12]
    
    # Parse datetime
    from django.utils.dateparse import parse_datetime
    datetime_str = request.data.get('datetime')
    transaction_datetime = parse_datetime(datetime_str)
    if not transaction_datetime:
        return Response({'error': 'Format de date invalide'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Parse subscription details if provided
    subscription_details_data = request.data.get('subscription_details')
    if subscription_details_data:
        if isinstance(subscription_details_data, str):
            try:
                subscription_details_data = json.loads(subscription_details_data)
            except:
                subscription_details_data = {}
    elif subscription_details_data is None:
        subscription_details_data = {}

    # Normalize interest period keys for compatibility (interestPeriod <-> interest_period).
    if isinstance(subscription_details_data, dict):
        if not subscription_details_data.get('interestPeriod') and subscription_details_data.get('interest_period'):
            subscription_details_data['interestPeriod'] = subscription_details_data.get('interest_period')
        elif not subscription_details_data.get('interest_period') and subscription_details_data.get('interestPeriod'):
            subscription_details_data['interest_period'] = subscription_details_data.get('interestPeriod')

        # Extra tolerance: allow top-level interestPeriod when admin payload omits nested field.
        top_level_interest = request.data.get('interestPeriod') or request.data.get('interest_period')
        if top_level_interest and not subscription_details_data.get('interestPeriod'):
            subscription_details_data['interestPeriod'] = top_level_interest
            subscription_details_data['interest_period'] = top_level_interest
    
    # Get product (subscription productId preferred; otherwise infer from transfer_to)
    product = None
    if subscription_details_data and subscription_details_data.get('productId'):
        try:
            product = Product.objects.get(id=subscription_details_data.get('productId'))
        except Product.DoesNotExist:
            product = None
    
    # Validate solde for transfert transactions (solde → product)
    transaction_type = request.data.get('type')
    transfer_from = request.data.get('from_field') or request.data.get('transfer_from')
    transfer_to = request.data.get('to_field') or request.data.get('transfer_to')
    transaction_amount = float(request.data.get('amount', 0))
    
    # --- Conversion transaction: handle before main flow ---
    if transaction_type == 'conversion':
        to_currency = (request.data.get('to_currency') or (subscription_details_data or {}).get('to_currency') or '').strip().upper()
        if to_currency not in ('EUR', 'USD', 'CHF'):
            return Response({'error': 'Devise cible invalide (EUR, USD ou CHF requis)'}, status=status.HTTP_400_BAD_REQUEST)
        current_currency = (client.account_currency or 'EUR').strip().upper()
        if to_currency == current_currency:
            return Response({'error': 'La devise cible doit être différente de la devise actuelle du compte'}, status=status.HTTP_400_BAD_REQUEST)
        # Calculate current balance from completed transactions
        completed_txns = Transaction.objects.filter(client=client, status__in=COMPLETED_TRANSACTION_STATUSES).order_by('datetime')
        invested_cap = Decimal('0')
        trading_port = Decimal('0')
        for t in completed_txns:
            amt = Decimal(str(t.amount or 0))
            ccy = (getattr(t, 'amount_currency', None) or 'EUR').strip().upper()
            if ccy != current_currency:
                continue  # Skip txns in other currency (before/after conversion)
            if t.type == 'depot':
                invested_cap += amt
            elif t.type == 'retrait':
                invested_cap -= amt
            elif t.type == 'bonus':
                invested_cap += amt
            elif t.type == 'interets':
                invested_cap += amt
            elif t.type == 'conversion':
                invested_cap = amt  # Replace balance with converted amount
            elif t.type == 'achat':
                trading_port += amt
            elif t.type == 'vente':
                trading_port -= amt
            elif t.type == 'transfert':
                tf_to = t.transfer_to or ''
                if tf_to and tf_to != 'solde':
                    trading_port += amt
                elif tf_to == 'solde' or t.transfer_from and t.transfer_from != 'solde':
                    trading_port -= amt
        available = invested_cap - trading_port
        if available <= 0:
            return Response({'error': 'Solde insuffisant pour effectuer une conversion'}, status=status.HTTP_400_BAD_REQUEST)
        if trading_port > 0:
            return Response({'error': 'Impossible de convertir : des fonds sont investis dans des produits. Effectuez d\'abord un retrait vers le solde.'}, status=status.HTTP_400_BAD_REQUEST)
        fx_rate = _get_fx_rate(current_currency, to_currency)
        if fx_rate is None:
            return Response({'error': f'Impossible d\'obtenir le taux de change {current_currency}/{to_currency}'}, status=status.HTTP_502_BAD_GATEWAY)
        from_amount = float(available)
        to_amount = from_amount * fx_rate
        conv_subscription = {
            'from_currency': current_currency,
            'from_amount': from_amount,
            'to_currency': to_currency,
            'to_amount': round(to_amount, 2),
            'fx_rate': fx_rate,
        }
        subscription_details_data = (subscription_details_data or {}) | conv_subscription
        # Create conversion transaction and update client
        with db_transaction.atomic():
            conv_txn = Transaction(
                id=transaction_id,
                client=client,
                type='conversion',
                amount=round(to_amount, 2),
                amount_currency=to_currency,
                description=request.data.get('description') or f'Conversion {current_currency} → {to_currency}',
                status=request.data.get('status', 'valide'),
                datetime=transaction_datetime,
                subscription_details=subscription_details_data,
                validated_at=transaction_datetime if request.data.get('status') == 'valide' else None,
            )
            conv_txn.save()
            client.account_currency = to_currency
            client.save(update_fields=['account_currency'])
        return Response({'transaction': TransactionSerializer(conv_txn).data}, status=status.HTTP_201_CREATED)
    
    # --- Deposit/bonus: convert EUR to account currency if needed ---
    final_amount = transaction_amount
    amount_currency = (request.data.get('amount_currency') or (client.account_currency or 'EUR')).strip().upper()
    if amount_currency not in ('EUR', 'USD', 'CHF'):
        amount_currency = (client.account_currency or 'EUR').strip().upper()
    if transaction_type in ('depot', 'bonus') and amount_currency != 'EUR':
        # Deposits: amount is in EUR, convert to account currency
        # Use user-provided rate if present, else fetch from API
        fx_rate = None
        raw_fx = (
            request.data.get('fx_rate_eur_to_account')
            or (subscription_details_data or {}).get('fx_rate_eur_to_account')
        )
        if raw_fx is not None:
            try:
                fx_rate = float(raw_fx)
            except (TypeError, ValueError):
                pass
        if fx_rate is None or fx_rate <= 0:
            fx_rate = _get_fx_rate('EUR', amount_currency)
        if fx_rate is not None and fx_rate > 0:
            final_amount = round(float(transaction_amount) * fx_rate, 2)
            if isinstance(subscription_details_data, dict):
                subscription_details_data = dict(subscription_details_data)
            else:
                subscription_details_data = {}
            subscription_details_data['deposit_eur_amount'] = transaction_amount
            subscription_details_data['fx_rate_eur_to_account'] = fx_rate
        else:
            return Response({'error': f'Impossible d\'obtenir le taux de change EUR/{amount_currency} pour créditer le dépôt'}, status=status.HTTP_502_BAD_GATEWAY)
    
    # Auto-set transfer_to for subscription transactions (transfert with product)
    # We only need transfer_to: if it's a product ID, it's an investment (solde → product)
    if transaction_type == 'transfert' and product:
        # If transfer_to is not provided but product exists, assume it's a subscription (solde → product)
        if not transfer_to:
            transfer_to = product.id
        # Auto-set transfer_from to 'solde' for backward compatibility (but we mainly use transfer_to)
        if not transfer_from:
            transfer_from = 'solde'

    # If it's a transfert investment but product wasn't resolved yet, infer from transfer_to
    if transaction_type == 'transfert' and not product and transfer_to and transfer_to != 'solde':
        try:
            product = Product.objects.get(id=transfer_to)
        except Product.DoesNotExist:
            product = None
    
    # For withdrawals (transfert product -> solde), set product to source product (transfer_from)
    # This ensures recalculate_positions_for_product_withdrawal can identify the product correctly
    if transaction_type == 'transfert' and transfer_to == 'solde':
        # If transfer_from is a product ID (not 'solde'), set product to that product
        if transfer_from and transfer_from != 'solde':
            try:
                product = Product.objects.get(id=transfer_from)
            except Product.DoesNotExist:
                product = None  # Product doesn't exist, keep product as None

    # If admin created a transfert without subscription form, auto-fill all possible subscription details
    # Only for investments (solde → product), not for withdrawals (product → solde)
    if transaction_type == 'transfert' and product and transfer_to and transfer_to != 'solde':
        try:
            amount_dec = Decimal(str(request.data.get('amount') or 0))
        except Exception:
            amount_dec = Decimal('0')
        product_for_defaults = effective_product_for_client(client, product)
        defaults = _build_subscription_details_defaults(
            client=client,
            product=product_for_defaults,
            amount=amount_dec,
            transaction_datetime=transaction_datetime,
            request=request,
        )
        subscription_details_data = _merge_missing_fields(subscription_details_data, defaults)
    
    # Transfer transactions can be created even when solde is insufficient (e.g. pending deposits).
    
    # Client-only: block subscriptions / trading until the effective availability window (lists may show future starts).
    if is_client_token and transaction_type == 'transfert':
        today = date.today()
        is_trade_payload = (
            transfer_to == 'trading'
            or (isinstance(subscription_details_data, dict) and subscription_details_data.get('tradeType') == 'asset')
        )
        if is_trade_payload:
            trade_asset_id = None
            if isinstance(subscription_details_data, dict):
                trade_asset_id = subscription_details_data.get('assetId') or subscription_details_data.get('asset_id')
            if trade_asset_id:
                ca = ClientAsset.objects.filter(client=client, asset_id=str(trade_asset_id)).first()
                if not ca:
                    return Response(
                        {'error': 'Actif introuvable pour ce compte.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if ca.availability_start and today < ca.availability_start:
                    return Response(
                        {'error': "La période de disponibilité de cet actif n'a pas encore commencé."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if ca.availability_end and today > ca.availability_end:
                    return Response(
                        {'error': "La période de disponibilité de cet actif est terminée."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        elif transfer_to and transfer_to not in ('solde', 'trading') and product:
            cp = ClientProduct.objects.filter(client=client, product=product).first()
            eff_start = None
            eff_end = None
            if cp:
                if cp.availability_start is not None:
                    eff_start = cp.availability_start
                if cp.availability_end is not None:
                    eff_end = cp.availability_end
            if eff_start is None:
                eff_start = product.availability_start
            if eff_end is None:
                eff_end = product.availability_end
            if eff_start and today < eff_start:
                return Response(
                    {'error': "La souscription n'est pas encore ouverte pour ce produit."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if eff_end and today > eff_end:
                return Response(
                    {'error': 'La période de souscription pour ce produit est terminée.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
    
    # Check if this is an investment transaction that will be created with status 'valide'
    # If so, we need to generate positions BEFORE creating the transaction, then create both together atomically
    transaction_status = request.data.get('status', 'en_cours')
    skip_position_generation = request.data.get('skip_position_generation', False)
    is_investment_transfert = (
        transaction_type == 'transfert'
        and transfer_to
        and transfer_to not in ('solde', 'trading')
    )
    if is_investment_transfert:
        chosen_interest_period = (
            (subscription_details_data or {}).get('interestPeriod')
            or (subscription_details_data or {}).get('interest_period')
            or ''
        )
        if not str(chosen_interest_period).strip():
            return Response(
                {'error': "La période d'intérêt est obligatoire pour une transaction d'investissement."},
                status=status.HTTP_400_BAD_REQUEST
            )
    # IMPORTANT: For investment transactions with status 'valide', we MUST generate positions
    # even if skip_position_generation is True (which is set by frontend to show modal).
    # The frontend will handle showing the modal, but if the user closes it without completing,
    # the transaction should still have positions generated automatically.
    # Only skip if it's explicitly a withdrawal or non-investment transaction.
    should_generate_positions_before_create = (
        is_investment_transfert 
        and transaction_status == 'valide'
    )
    
    # Create transaction and generate positions together in an atomic transaction
    # This ensures that positions are generated BEFORE the transaction is committed,
    # and if position generation fails, the transaction is not created either
    with db_transaction.atomic():
        # Create transaction instance first (without saving)
        # Set skip flag BEFORE saving to prevent signal from generating positions
        transaction = Transaction(
            id=transaction_id,
            client=client,
            type=request.data.get('type'),
            amount=final_amount if transaction_type in ('depot', 'bonus') else request.data.get('amount'),
            amount_currency=amount_currency,
            description=request.data.get('description', ''),
            status=transaction_status,
            datetime=transaction_datetime,
            # Subscription details
            subscription_details=subscription_details_data or {},
            product=product,
            subscription_first_name=subscription_details_data.get('firstName', '') if subscription_details_data else '',
            subscription_last_name=subscription_details_data.get('lastName', '') if subscription_details_data else '',
            subscription_birth_date=subscription_details_data.get('birthDate', '') if subscription_details_data else '',
            subscription_city=subscription_details_data.get('city', '') if subscription_details_data else '',
            subscription_ip=subscription_details_data.get('ip', '') if subscription_details_data else '',
            subscription_date=subscription_details_data.get('subscriptionDate', '') if subscription_details_data else '',
            subscription_duration=subscription_details_data.get('duration', '') if subscription_details_data else '',
            subscription_interest_period=subscription_details_data.get('interestPeriod', '') if subscription_details_data else '',
            subscription_profitability=subscription_details_data.get('profitability', '') if subscription_details_data else '',
            subscription_investment=subscription_details_data.get('investment') if subscription_details_data else None,
            subscription_profits=subscription_details_data.get('profits') if subscription_details_data else None,
            subscription_total=subscription_details_data.get('total') if subscription_details_data else None,
            subscription_contract_end=subscription_details_data.get('contractEnd', '') if subscription_details_data else '',
            subscription_signature=subscription_details_data.get('signature', '') if subscription_details_data else '',
            # Transfer direction fields
            transfer_from=transfer_from,
            transfer_to=transfer_to,
        )
        
        # Set skip flag BEFORE saving (so signal doesn't try to regenerate positions)
        # This prevents the signal from running when transaction is saved
        # We always skip signal generation because we handle it manually in the atomic block
        if should_generate_positions_before_create:
            transaction._skip_auto_position_generation = True
        elif skip_position_generation:
            # If skip_position_generation is True but it's not an investment, still skip signal
            transaction._skip_auto_position_generation = True
        
        # If this is an investment transaction with status 'valide', set validated_at
        if should_generate_positions_before_create:
            transaction.validated_at = transaction_datetime
        
        # Now save the transaction (signal will see the skip flag)
        transaction.save()
        
        # Depot shortcut: create parallel bonus transaction when bonus_amount is provided
        if transaction_type == 'depot':
            bonus_amount_raw = request.data.get('bonus_amount')
            if bonus_amount_raw is not None:
                try:
                    bonus_amount_eur = float(bonus_amount_raw)
                except (TypeError, ValueError):
                    bonus_amount_eur = 0
                if bonus_amount_eur > 0:
                    bonus_final_amount = bonus_amount_eur
                    bonus_subscription = dict(subscription_details_data or {})
                    if amount_currency != 'EUR':
                        fx_rate = bonus_subscription.get('fx_rate_eur_to_account')
                        if fx_rate is None or fx_rate <= 0:
                            fx_rate = _get_fx_rate('EUR', amount_currency)
                        if fx_rate is not None and fx_rate > 0:
                            bonus_final_amount = round(bonus_amount_eur * fx_rate, 2)
                            bonus_subscription['deposit_eur_amount'] = bonus_amount_eur
                            bonus_subscription['fx_rate_eur_to_account'] = fx_rate
                        else:
                            bonus_final_amount = round(bonus_amount_eur, 2)
                    bonus_id = uuid.uuid4().hex[:12]
                    while Transaction.objects.filter(id=bonus_id).exists():
                        bonus_id = uuid.uuid4().hex[:12]
                    bonus_txn = Transaction(
                        id=bonus_id,
                        client=client,
                        type='bonus',
                        amount=bonus_final_amount,
                        amount_currency=amount_currency,
                        description=request.data.get('bonus_description', '') or 'Bonus (dépôt)',
                        status=transaction_status,
                        datetime=transaction_datetime,
                        subscription_details=bonus_subscription,
                    )
                    bonus_txn._skip_auto_position_generation = True
                    bonus_txn.save()
        
        # If this is an investment transaction with status 'valide', generate positions NOW
        # This happens BEFORE the transaction is committed, ensuring positions are ready
        # when the transaction becomes visible in the database
        if should_generate_positions_before_create:
            # Generate positions BEFORE transaction commit
            # This ensures positions are created in the same atomic transaction
            try:
                create_positions_for_investment(transaction, trigger="api_transaction_create")
            except Exception as pos_err:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to generate positions for transaction {transaction_id}: {str(pos_err)}")
                import traceback
                logger.error(traceback.format_exc())
                # Transaction will be rolled back automatically due to atomic block
                return Response({
                    'error': f'Erreur lors de la génération des positions: {str(pos_err)}'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # IMPORTANT: For investment transactions created with status 'valide',
    # positions are now generated BEFORE the transaction is committed (but after it's created in the atomic block).
    # This ensures positions are ready when the transaction becomes visible in the database.
    # The signal will be skipped because _skip_auto_position_generation is set.

    # For interets (superformance) transactions: link to product or asset from subscription_details
    if transaction_type == 'interets' and isinstance(subscription_details_data, dict):
        asset_id_for_interets = subscription_details_data.get('assetId') or subscription_details_data.get('asset_id')
        if asset_id_for_interets:
            try:
                asset_obj = Asset.objects.get(id=str(asset_id_for_interets))
                transaction.asset = asset_obj
                transaction.save(update_fields=['asset'])
            except Asset.DoesNotExist:
                pass

    # If this transfert is a client trading order (solde -> trading wallet), create a Position (ordre).
    # The trading order is represented by:
    # - a transfert transaction (keeps a trace of funds moved from available funds to trading portfolio)
    # - a Position linked to the Asset (the order itself)
    try:
        is_trade_order = (
            transaction.type == 'transfert'
            and (transaction.transfer_to == 'trading'
                 or (isinstance(subscription_details_data, dict) and subscription_details_data.get('tradeType') == 'asset'))
        )
        trade_asset_id = None
        if is_trade_order and isinstance(subscription_details_data, dict):
            trade_asset_id = subscription_details_data.get('assetId') or subscription_details_data.get('asset_id')

        if is_trade_order and trade_asset_id:
            asset_obj = Asset.objects.filter(id=str(trade_asset_id)).first()
            if not asset_obj:
                # Rollback best-effort (keep data consistent for clients)
                transaction.delete()
                return Response({'error': 'Asset not found'}, status=status.HTTP_400_BAD_REQUEST)

            # Store the purchased asset on the transaction (instead of TRADING_WALLET product).
            try:
                transaction.asset = asset_obj
                # Keep product empty for trades (product is for investment products).
                transaction.product = None
                # Save FX conversion snapshot when available
                fx_rate = None
                amount_asset_ccy = None
                try:
                    if isinstance(subscription_details_data, dict):
                        raw_fx = subscription_details_data.get('fxRateEurToAsset')
                        if raw_fx is not None and raw_fx != '':
                            fx_rate = Decimal(str(raw_fx))
                        asset_ccy = (subscription_details_data.get('assetCurrency') or '').strip().upper()
                        amount_eur = Decimal(str(request.data.get('amount') or 0))
                        if asset_ccy and asset_ccy != 'EUR' and fx_rate is not None:
                            amount_asset_ccy = (amount_eur * fx_rate).quantize(Decimal('0.00000001'))
                        else:
                            amount_asset_ccy = None
                except Exception:
                    fx_rate = None
                    amount_asset_ccy = None

                transaction.fx_rate_eur_to_asset = fx_rate
                transaction.amount_in_asset_currency = amount_asset_ccy
                transaction.save(update_fields=['asset', 'product', 'fx_rate_eur_to_asset', 'amount_in_asset_currency'])
            except Exception:
                # If migration isn't applied yet, ignore (trade still works, asset is in subscription_details).
                pass

            # Ensure a single Position per transaction (idempotency)
            if not Position.objects.filter(transaction_id=transaction.id).exists():
                position_id = uuid.uuid4().hex[:12]
                while Position.objects.filter(id=position_id).exists():
                    position_id = uuid.uuid4().hex[:12]

                # Capture entry price + quantity from payload (best effort).
                # Frontend sends: subscription_details.price and subscription_details.estimatedShares.
                entry_price = None
                quantity = None
                try:
                    if isinstance(subscription_details_data, dict):
                        raw_price = subscription_details_data.get('price')
                        if raw_price is not None and raw_price != '':
                            entry_price = Decimal(str(raw_price))
                        raw_qty = (
                            subscription_details_data.get('estimatedShares')
                            or subscription_details_data.get('quantity')
                        )
                        if raw_qty is not None and raw_qty != '':
                            quantity = Decimal(str(raw_qty))
                except Exception:
                    entry_price = None
                    quantity = None

                if entry_price is None:
                    try:
                        if getattr(asset_obj, 'last_price', None) is not None:
                            entry_price = Decimal(str(asset_obj.last_price))
                    except Exception:
                        entry_price = None

                # Conversion snapshot for the position
                fx_rate_eur_to_asset = None
                invested_amount_asset_currency = None
                try:
                    if isinstance(subscription_details_data, dict):
                        raw_fx = subscription_details_data.get('fxRateEurToAsset')
                        if raw_fx is not None and raw_fx != '':
                            fx_rate_eur_to_asset = Decimal(str(raw_fx))
                        asset_ccy = (subscription_details_data.get('assetCurrency') or '').strip().upper()
                        amount_eur = Decimal(str(request.data.get('amount') or 0))
                        if asset_ccy and asset_ccy != 'EUR' and fx_rate_eur_to_asset is not None:
                            invested_amount_asset_currency = (amount_eur * fx_rate_eur_to_asset).quantize(Decimal('0.00000001'))
                except Exception:
                    fx_rate_eur_to_asset = None
                    invested_amount_asset_currency = None

                # Create Position for manual trading order (product is NULL for asset-only trades)
                Position.objects.create(
                    id=position_id,
                    client=client,
                    product=None,
                    transaction=transaction,
                    asset=asset_obj,
                    # period_index and period_date are NULL for manual trading positions
                    # (we use opened_at/closed_at/created_at instead)
                    invested_amount=Decimal(str(request.data.get('amount') or 0)),
                    entry_price=entry_price,
                    quantity=quantity,
                    fx_rate_eur_to_asset=fx_rate_eur_to_asset,
                    invested_amount_asset_currency=invested_amount_asset_currency,
                    opened_at=transaction_datetime,
                    closed_at=None,
                    profit_loss=None,
                    status='pending',
                )
    except Exception as trade_err:
        # Don't silently succeed if we can't create the Position for a trade order.
        # Rollback the transaction so we don't debit funds without an order trace.
        try:
            transaction.delete()
        except Exception:
            pass
        return Response({'error': f'Erreur lors de la création de la position: {str(trade_err)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    # Log transaction creation
    # Determine user_id - could be Django user or None (if client token)
    user_id_for_log = None
    client_name_for_log = None
    if request.user.is_authenticated:
        user_id_for_log = request.user
    elif token and token.startswith('client_'):
        # For client tokens, we don't have a Django user, so user_id will be None
        # But we can store the client name in the log details
        user_id_for_log = None
        # Get client name for logging
        client_name_for_log = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or 'Client'
    
    # Always create log entry for transaction creation (wrap in try-except to prevent silent failures)
    try:
        transaction_data = get_transaction_data_for_log(transaction)
        create_log_entry(
            event_type='createTransaction',
            user_id=user_id_for_log,
            request=request,
            old_value={},
            new_value=transaction_data,
            transaction_id=transaction_id,
            client_name=client_name_for_log,
            client_id=client
        )
    except Exception as log_error:
        # Log the error but don't fail the transaction creation
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to create log entry for transaction {transaction_id}: {str(log_error)}")
        import traceback
        logger.error(traceback.format_exc())

    # Create notification when depot or retrait is made from the funds page (client-initiated)
    if token and token.startswith('client_') and transaction_type in ('depot', 'retrait'):
        manager_user = _resolve_client_manager_user(client)
        if manager_user:
            client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
            notif_ccy = (getattr(transaction, 'amount_currency', None) or client.account_currency or 'EUR').strip().upper()
            if notif_ccy not in ('EUR', 'USD', 'CHF'):
                notif_ccy = 'EUR'
            amount_str = _format_amount_for_contract(transaction_amount, notif_ccy)
            if transaction_type == 'depot':
                create_app_notification(
                    recipient_type=AppNotification.RECIPIENT_CRM_USER,
                    recipient_user=manager_user,
                    notification_type=AppNotification.TYPE_CLIENT_DEPOT,
                    title="Dépôt de fonds",
                    message=f"{client_name} a effectué un dépôt de {amount_str}.",
                    payload={"client_id": client.id, "transaction_id": transaction_id, "amount": transaction_amount},
                )
            else:
                create_app_notification(
                    recipient_type=AppNotification.RECIPIENT_CRM_USER,
                    recipient_user=manager_user,
                    notification_type=AppNotification.TYPE_CLIENT_RETRAIT,
                    title="Demande de retrait",
                    message=f"{client_name} a effectué une demande de retrait de {amount_str}.",
                    payload={"client_id": client.id, "transaction_id": transaction_id, "amount": transaction_amount},
                )
    
    # Auto-create contract document for product subscriptions.
    # A client subscription may occasionally arrive without explicit transfer_to
    # but still include a valid product in subscription_details.
    is_subscription_transfert = (
        transaction_type == 'transfert'
        and product is not None
        and transfer_to != 'solde'
    )
    if is_subscription_transfert:
        manager_user = _resolve_client_manager_user(client)
        if manager_user:
            client_name = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or client.id
            create_app_notification(
                recipient_type=AppNotification.RECIPIENT_CRM_USER,
                recipient_user=manager_user,
                notification_type=AppNotification.TYPE_CLIENT_SUBSCRIPTION,
                title="Nouvelle souscription",
                message=f"{client_name} a effectué une souscription.",
                payload={
                    "client_id": client.id,
                    "transaction_id": transaction_id,
                    "product_id": str(product.id) if product else None,
                },
            )
    # Use the same detailed contract generation logic as product_contract_pdf
    if is_subscription_transfert:
        import logging
        logger = logging.getLogger(__name__)
        try:
            product = effective_product_for_client(client, product)
            # Generate contract PDF using the same detailed logic as product_contract_pdf
            from io import BytesIO
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
            from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
            from reportlab.lib import colors
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
            from reportlab.lib.utils import ImageReader
            import requests
            from PIL import Image as PILImage
            
            # Get client info from subscription details or client object
            investor_first_name = subscription_details_data.get('firstName', '') if subscription_details_data else (client.fname or '')
            investor_last_name = subscription_details_data.get('lastName', '') if subscription_details_data else (client.lname or '')
            investor_email = client.email or ''
            investor_phone = client.phone or client.mobile or ''
            investor_birth_date = subscription_details_data.get('birthDate', '') if subscription_details_data else (client.birth_date.strftime('%d/%m/%Y') if client.birth_date else '')
            investor_city = subscription_details_data.get('city', '') if subscription_details_data else (client.city or '')
            investor_name = f"{investor_first_name} {investor_last_name}".strip()
            
            # Get AppSettings for logo and company info
            try:
                app_settings = AppSettings.objects.get(id='settings001')
                platform_name = app_settings.platform_name or 'Panorama'
                platform_address = app_settings.address or ''
                platform_website = app_settings.website or ''
                platform_email = app_settings.email or ''
                logo_url = None
                if app_settings.logo:
                    try:
                        logo_url = app_settings.logo.url
                        # If it's a storage URL, use it directly
                        if not (logo_url.startswith('http://') or logo_url.startswith('https://')):
                            # Build absolute URL if needed
                            logo_url = request.build_absolute_uri(logo_url)
                    except Exception:
                        logo_url = None
            except AppSettings.DoesNotExist:
                platform_name = 'Panorama'
                platform_address = ''
                platform_website = ''
                platform_email = ''
                logo_url = None
            
            # Company info (fallback to defaults if not in settings)
            company_name = platform_name or 'CIM Banque SA'
            company_address = platform_address or '16 rue Merle d\'Aubigné, 1207 Genève - SUISSE'
            company_website = platform_website or 'web.interface-cim.fr'
            company_email = platform_email or 'contact@interface-cim.fr'
            
            # Product data
            product_name = product.name or ''
            duration = subscription_details_data.get('duration', '') if subscription_details_data else (product.duration or '30')
            duration_days = _parse_days_from_duration(duration)
            
            # Amount and currency (for contract display)
            amount = float(transaction.amount)
            contract_currency = (
                getattr(transaction, 'amount_currency', None) or client.account_currency or 'EUR'
            ).strip().upper()
            if contract_currency not in ('EUR', 'USD', 'CHF'):
                contract_currency = 'EUR'
            
            # Profitability
            is_variable = str(product.is_variable_profitability or '').lower() == 'oui'
            profitability_period = product.profitability_period or 'mensuel'
            period_label = (profitability_period or '').strip().lower()
            prorata = (Decimal(duration_days) / Decimal('365')) if duration_days else Decimal('0')

            # If profitability is expressed "Fin de contrat", rate is over the contract duration.
            if 'fin' in period_label and 'contrat' in period_label:
                if is_variable and product.variable_profitability:
                    min_profit = float(product.profitability or 0)
                    max_profit = float(product.variable_profitability)
                    profitability_text = f"{min_profit:.2f}% NET variable jusqu'à {max_profit:.2f}% NET {profitability_period}"
                elif product.profitability is not None:
                    profit = float(product.profitability)
                    profitability_text = f"{profit:.2f}% NET {profitability_period}"
                else:
                    profitability_text = ''
            else:
                # Otherwise treat the product rate as annualized and prorate for display consistency.
                if is_variable and product.variable_profitability:
                    min_profit = float(product.profitability or 0)
                    max_profit = float(product.variable_profitability)
                    min_period = float((Decimal(str(min_profit)) * prorata).quantize(Decimal('0.01')))
                    max_period = float((Decimal(str(max_profit)) * prorata).quantize(Decimal('0.01')))
                    profitability_text = f"{min_period:.2f}% NET variable jusqu'à {max_period:.2f}% NET {profitability_period}"
                elif product.profitability is not None:
                    profit = float(product.profitability)
                    period_profit = float((Decimal(str(profit)) * prorata).quantize(Decimal('0.01')))
                    profitability_text = f"{period_profit:.2f}% NET {profitability_period}"
                else:
                    profitability_text = ''
            
            # Calculate contract dates
            contract_start_date = transaction_datetime.date()
            contract_end_date = contract_start_date + timedelta(days=duration_days)
            contract_end_date_str = contract_end_date.strftime('%d/%m/%Y')
            
            # Calculate interest
            rate = _profitability_rate_for_calc(product)
            if 'fin' in period_label and 'contrat' in period_label:
                interest_amount = Decimal(str(amount)) * (rate / Decimal('100'))
                profitability_rate = float(rate)
            else:
                interest_amount = Decimal(str(amount)) * (rate / Decimal('100')) * (Decimal(duration_days) / Decimal('365'))
                profitability_rate = float((rate * prorata).quantize(Decimal('0.01'))) if duration_days else 0.0
            interest_amount = float(interest_amount.quantize(Decimal('0.01')))
            
            # Interest period
            interest_period = subscription_details_data.get('interestPeriod', '') if subscription_details_data else (product.interest_period or 'Fin de contrat')
            
            # Auto-renewal (derived from the chosen interest period)
            auto_renewal = 'OUI' if 'fin' in str(interest_period or '').strip().lower() else 'NON'
            
            # Today's date formatted
            today_formatted = contract_start_date.strftime('%A %d %B %Y').replace('Monday', 'lundi').replace('Tuesday', 'mardi').replace('Wednesday', 'mercredi').replace('Thursday', 'jeudi').replace('Friday', 'vendredi').replace('Saturday', 'samedi').replace('Sunday', 'dimanche').replace('January', 'janvier').replace('February', 'février').replace('March', 'mars').replace('April', 'avril').replace('May', 'mai').replace('June', 'juin').replace('July', 'juillet').replace('August', 'août').replace('September', 'septembre').replace('October', 'octobre').replace('November', 'novembre').replace('December', 'décembre')
            
            # Subscription signature
            subscription_signature = subscription_details_data.get('signature', '') if subscription_details_data else ''
            
            # Create PDF with header and footer
            buffer = BytesIO()
            
            # Download logo if available
            logo_data_bytes = None
            logo_width_mm = None
            logo_height_mm = None
            if logo_url:
                try:
                    logo_response = requests.get(logo_url, timeout=10)
                    if logo_response.status_code == 200:
                        logo_data_bytes = BytesIO(logo_response.content)
                        # Get image dimensions using PIL and handle transparency
                        try:
                            logo_data_bytes.seek(0)
                            img = PILImage.open(logo_data_bytes)
                            img_width, img_height = img.size
                            
                            # Handle all transparency modes: RGBA, LA, P (palette with transparency)
                            if img.mode in ('RGBA', 'LA', 'P'):
                                # Convert palette images with transparency to RGBA first
                                if img.mode == 'P':
                                    # Check if palette has transparency
                                    if 'transparency' in img.info:
                                        img = img.convert('RGBA')
                                    else:
                                        img = img.convert('RGB')
                                
                                # If still RGBA or LA, convert to RGB with white background
                                if img.mode in ('RGBA', 'LA'):
                                    # Create a white background
                                    rgb_img = PILImage.new('RGB', img.size, (255, 255, 255))
                                    if img.mode == 'RGBA':
                                        # Paste the RGBA image onto the white background using alpha channel as mask
                                        rgb_img.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                                    else:  # LA mode
                                        # LA mode: L is luminance, A is alpha
                                        rgb_img.paste(img.convert('RGB'), mask=img.split()[1])  # Use alpha channel
                                    img = rgb_img
                                
                                # Save to BytesIO
                                logo_data_bytes = BytesIO()
                                img.save(logo_data_bytes, format='PNG')
                                logo_data_bytes.seek(0)
                            elif img.mode != 'RGB':
                                # Convert other modes to RGB
                                img = img.convert('RGB')
                                logo_data_bytes = BytesIO()
                                img.save(logo_data_bytes, format='PNG')
                                logo_data_bytes.seek(0)
                            
                            # Calculate size to fit in header (max 15mm height)
                            # Convert pixels to mm at 72 DPI (1 inch = 25.4mm, 72 px = 1 inch)
                            max_height_mm = 15
                            px_to_mm = 25.4 / 72
                            img_height_mm = img_height * px_to_mm
                            logo_height_mm = min(img_height_mm, max_height_mm)
                            logo_width_mm = logo_height_mm * (img_width / img_height)
                            logo_data_bytes.seek(0)  # Reset for use
                        except Exception as e:
                            logger.warning(f"Error processing logo image: {str(e)}")
                            # If PIL fails, use default size
                            logo_width_mm = 30
                            logo_height_mm = 15
                            logo_data_bytes.seek(0)
                except Exception:
                    logo_data_bytes = None
            
            # Define header function
            def header(canvas, doc):
                canvas.saveState()
                # Header area
                header_height = 30*mm
                canvas.setFillColor(colors.white)
                canvas.rect(0, A4[1] - header_height, A4[0], header_height, fill=1, stroke=0)
                
                # Logo (if available)
                if logo_data_bytes:
                    try:
                        logo_data_bytes.seek(0)  # Reset to beginning
                        # Use ImageReader to convert BytesIO to something reportlab can use
                        img_reader = ImageReader(logo_data_bytes)
                        # Center logo horizontally, align vertically in header
                        x = (A4[0] - logo_width_mm*mm) / 2
                        y = A4[1] - header_height + (header_height - logo_height_mm*mm) / 2
                        # Draw image - mask=None to avoid green background, image already converted to RGB with white background
                        canvas.drawImage(img_reader, x, y, width=logo_width_mm*mm, height=logo_height_mm*mm, preserveAspectRatio=True, mask=None)
                        logo_data_bytes.seek(0)  # Reset for next page
                    except Exception as e:
                        logger.warning(f"Error drawing logo in PDF header: {str(e)}")
                
                canvas.restoreState()
            
            # Define footer function
            def footer(canvas, doc):
                canvas.saveState()
                footer_height = 25*mm  # Increased height
                footer_margin = 5*mm  # Margin from bottom
                
                # Footer background
                canvas.setFillColor(colors.white)
                canvas.rect(0, footer_margin, A4[0], footer_height - footer_margin, fill=1, stroke=0)
                
                # Footer text
                canvas.setFont('Helvetica', 9)
                canvas.setFillColor(colors.black)
                
                footer_lines = []
                if company_name:
                    footer_lines.append(company_name)
                if company_address:
                    footer_lines.append(company_address)
                if company_website or company_email:
                    contact_info = []
                    if company_website:
                        contact_info.append(company_website)
                    if company_email:
                        contact_info.append(company_email)
                    footer_lines.append(' - '.join(contact_info))
                
                # Center footer text vertically within footer area
                line_height = 11
                total_height = len(footer_lines) * line_height
                footer_top = footer_margin + footer_height - footer_margin
                start_y = footer_margin + (footer_height - footer_margin - total_height) / 2 + line_height
                
                for i, line in enumerate(footer_lines):
                    text_width = canvas.stringWidth(line, 'Helvetica', 9)
                    x = (A4[0] - text_width) / 2
                    y = start_y - (i * line_height)
                    canvas.drawString(x, y, line)
                
                canvas.restoreState()
            
            # Create BaseDocTemplate with header and footer space
            doc = BaseDocTemplate(
                buffer,
                pagesize=A4,
                rightMargin=20*mm,
                leftMargin=20*mm,
                topMargin=35*mm,  # Extra space for header
                bottomMargin=30*mm,  # Increased space for footer to prevent clipping
            )
            
            # Create frame for content
            frame = Frame(
                doc.leftMargin,
                doc.bottomMargin,
                doc.width,
                doc.height,
                leftPadding=0,
                bottomPadding=0,
                rightPadding=0,
                topPadding=0,
            )
            
            # Create page template with header and footer
            template = PageTemplate(id='contract_page', frames=[frame], onPage=header, onPageEnd=footer)
            doc.addPageTemplates([template])
            
            # Styles
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=18,
                textColor=colors.black,
                alignment=TA_CENTER,
                spaceAfter=12,
            )
            heading_style = ParagraphStyle(
                'CustomHeading',
                parent=styles['Heading2'],
                fontSize=14,
                textColor=colors.black,
                spaceAfter=6,
                spaceBefore=12,
            )
            normal_style = ParagraphStyle(
                'CustomNormal',
                parent=styles['Normal'],
                fontSize=11,
                textColor=colors.black,
                alignment=TA_JUSTIFY,
                spaceAfter=6,
            )
            center_style = ParagraphStyle(
                'CustomCenter',
                parent=styles['Normal'],
                fontSize=11,
                textColor=colors.black,
                alignment=TA_CENTER,
            )
            
            # Build PDF content
            story = []
            
            # Document title (in body, not header)
            story.append(Paragraph(product_name, title_style))
            story.append(Spacer(1, 10*mm))
            
            # Parties
            story.append(Paragraph("La société : <b>" + company_name + "</b>", normal_style))
            story.append(Paragraph("Exerçant sous l'enseigne : <b>" + company_website + "</b>", normal_style))
            story.append(Paragraph("Ayant son siège social : <b>" + company_address + "</b>", normal_style))
            story.append(Paragraph("Représentée à l'acte par son représentant légal domicilié en cette qualité au dit siège.", normal_style))
            story.append(Paragraph("Ci-après dénommée « LA SOCIÉTÉ » d'une part et,", normal_style))
            story.append(Spacer(1, 5*mm))
            
            story.append(Paragraph("Nom : <b>" + investor_name + "</b>", normal_style))
            story.append(Paragraph("Mail : <b>" + investor_email + "</b>", normal_style))
            story.append(Paragraph("Tél : <b>" + investor_phone + "</b>", normal_style))
            story.append(Paragraph("Date de naissance : <b>" + investor_birth_date + "</b>", normal_style))
            story.append(Paragraph("Ci-après dénommée « L'INVESTISSEUR » d'autre part.", normal_style))
            story.append(Spacer(1, 3*mm))
            
            italic_style = ParagraphStyle('Italic', parent=normal_style, fontName='Helvetica-Oblique')
            story.append(Paragraph("CI-APRÈS DÉSIGNÉES ENSEMBLE « LES PARTIES » ET INDIVIDUELLEMENT « LA PARTIE »", italic_style))
            story.append(Spacer(1, 5*mm))
            
            story.append(Paragraph(f"<b>{company_name}</b> est un groupe spécialisé dans l'investissement de produit financier.", normal_style))
            story.append(Paragraph("À cet égard, LA SOCIÉTÉ entend proposer à ses clients qui investissent, une garantie contractuelle de capital initial dans les conditions prévues ci-après.", normal_style))
            story.append(Spacer(1, 5*mm))
            
            # Transition phrase
            story.append(Paragraph("<b>CECI EXPOSÉ, IL EST CONVENU CE QUI SUIT</b>", ParagraphStyle('Transition', parent=normal_style, alignment=TA_CENTER, fontSize=12, spaceAfter=10)))
            story.append(Spacer(1, 5*mm))
            
            # Object
            story.append(Paragraph("1/ OBJET DU PROTOCOLE", heading_style))
            story.append(Paragraph(f"a. Le protocole de garantie « <b>{product_name}</b> » est une garantie contractuelle permettant au souscripteur de l'épargne de récupérer, à la fin du placement, le montant du versement effectué à la souscription ainsi que les intérêts.", normal_style))
            story.append(Spacer(1, 5*mm))
            
            # Duration
            story.append(Paragraph("2/ DURÉE DU CONTRAT", heading_style))
            story.append(Paragraph(f"a. Le présent contrat prend effet à compter du jour de la signature des présentes et ce pour une durée de :<br/><b>{duration_days} {'jours' if duration_days > 1 else 'jour'}</b> avec une rentabilité garantie de <b>{profitability_text}</b>.", normal_style))
            story.append(Paragraph(f"b. La date d'échéance est donc fixée au <b>{contract_end_date_str}</b>.", normal_style))
            story.append(Spacer(1, 5*mm))
            
            # Payment - start on new page to avoid heading isolated at bottom of previous page
            story.append(PageBreak())
            story.append(Paragraph("3/ MODALITÉS DE PAIEMENT", heading_style))
            story.append(Paragraph("a. LA SOCIÉTÉ reconnaîtra la validité du versement comptant et en consentira quittance régulière dès réception du versement.", normal_style))
            story.append(Paragraph(f"b. L'INVESTISSEUR percevra ses intérêts en « <b>{interest_period}</b> ».", normal_style))
            story.append(Spacer(1, 5*mm))
            
            # Summary box
            # Format duration to add "Jours" if it's just a number
            duration_display = duration
            if duration and duration.strip().isdigit():
                duration_display = f"{duration.strip()} Jours"
            elif duration and not any(word.lower() in duration.lower() for word in ['mois', 'jour', 'an', 'année', 'semaine']):
                match = re.search(r'(\d+)', duration)
                if match:
                    duration_display = f"{match.group(1)} Jours"
            
            summary_data = [
                ['TITRE', product_name],
                ['DURÉE', duration_display],
                ['RENTABILITÉ', profitability_text],
                ['TOTAL NET', _format_amount_for_contract(amount, contract_currency)],
            ]
            summary_table = Table(summary_data, colWidths=[50*mm, 120*mm])
            summary_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),  # Make dynamic data bold
                ('FONTSIZE', (0, 0), (-1, -1), 11),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            story.append(Paragraph("RÉCAPITULATIF DE VOTRE SOUSCRIPTION", ParagraphStyle('SummaryTitle', parent=heading_style, alignment=TA_CENTER)))
            story.append(Spacer(1, 3*mm))
            story.append(summary_table)
            story.append(Spacer(1, 5*mm))
            story.append(Paragraph("<b>SIGNATURE DE L'INVESTISSEUR :</b>", normal_style))
            story.append(Spacer(1, 3*mm))
            
            # Add signature image if available
            if subscription_signature:
                try:
                    # Decode base64 signature
                    import base64
                    # Remove data URL prefix if present (data:image/png;base64,...)
                    signature_data = subscription_signature
                    if ',' in signature_data:
                        signature_data = signature_data.split(',')[1]
                    
                    signature_bytes = base64.b64decode(signature_data)
                    signature_io = BytesIO(signature_bytes)
                    
                    # Get signature dimensions
                    sig_img = PILImage.open(signature_io)
                    sig_width, sig_height = sig_img.size
                    # Resize signature to fit (max width 120mm, maintain aspect ratio)
                    max_width_mm = 120
                    aspect_ratio = sig_width / sig_height
                    if sig_width > max_width_mm * 3.779527559:  # Convert mm to pixels (approx)
                        sig_width_mm = max_width_mm
                        sig_height_mm = sig_width_mm / aspect_ratio
                    else:
                        sig_width_mm = sig_width / 3.779527559
                        sig_height_mm = sig_height / 3.779527559
                    
                    # Convert to RGB if needed
                    if sig_img.mode != 'RGB':
                        sig_rgb = PILImage.new('RGB', sig_img.size, (255, 255, 255))
                        if sig_img.mode == 'RGBA':
                            sig_rgb.paste(sig_img, mask=sig_img.split()[3])
                        else:
                            sig_rgb.paste(sig_img)
                        sig_img = sig_rgb
                    
                    # Save image to a new BytesIO for ImageReader
                    signature_io_final = BytesIO()
                    sig_img.save(signature_io_final, format='PNG')
                    signature_io_final.seek(0)
                    
                    # platypus.Image expects a filename/path or a file-like object.
                    # Passing ImageReader here raises:
                    # "expected str, bytes or os.PathLike object, not ImageReader"
                    signature_io_final.seek(0)
                    story.append(Image(signature_io_final, width=sig_width_mm*mm, height=sig_height_mm*mm))
                    story.append(Spacer(1, 3*mm))
                except Exception as e:
                    # If signature processing fails, continue without it
                    logger.warning(f"Error processing signature image: {str(e)}")
            
            story.append(Paragraph("\" Bon pour accord \"<br/>\" J'accepte les Termes et Conditions \"", normal_style))
            story.append(Spacer(1, 3*mm))
            story.append(Paragraph(f"Fait le <b>{today_formatted}</b><br/>À : <b>{investor_city}</b>", normal_style))
            story.append(Spacer(1, 5*mm))
            
            # Interest table
            interest_data = [
                ['Date', 'Intérêts payés', 'Performance'],
                [contract_end_date_str, _format_amount_for_contract(interest_amount, contract_currency), f"{profitability_rate:.2f} %"],
            ]
            interest_table = Table(interest_data, colWidths=[60*mm, 60*mm, 50*mm])
            interest_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica-Bold'),  # Make dynamic data bold
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(Paragraph("RÉCAPITULATIF DE VOTRE SOUSCRIPTION", ParagraphStyle('InterestTitle', parent=heading_style, alignment=TA_CENTER)))
            story.append(Spacer(1, 3*mm))
            story.append(interest_table)
            story.append(Spacer(1, 5*mm))
            
            # Terms & Conditions
            if product.cgv:
                story.append(PageBreak())
                story.append(Paragraph("TERMES & CONDITIONS", heading_style))
                # Clean CGV text and convert to paragraphs
                cgv_text = product.cgv.replace('\n\n', '<br/><br/>').replace('\n', '<br/>')
                story.append(Paragraph(cgv_text, ParagraphStyle('CGV', parent=normal_style, fontSize=10)))
            
            # Build PDF
            doc.build(story)
            pdf_content = buffer.getvalue()
            buffer.close()
            
            # Create document
            document_id = uuid.uuid4().hex[:12]
            while ClientDocument.objects.filter(id=document_id).exists():
                document_id = uuid.uuid4().hex[:12]
            
            # Save PDF to a temporary file-like object
            from django.core.files.base import ContentFile
            import re
            # Clean product name for filename (remove special characters)
            clean_product_name = re.sub(r'[^a-zA-Z0-9_-]', '_', product_name)[:50]  # Limit length
            pdf_file = ContentFile(pdf_content)
            pdf_file.name = f'contrat_{clean_product_name}_{transaction_id}.pdf'
            
            document = ClientDocument.objects.create(
                id=document_id,
                client=client,
                transaction=transaction,
                product=product,
                name=f"Contrat - {product_name}",
                document_type='contract',
                description=f"Contrat de souscription généré automatiquement pour la transaction {transaction_id}",
                uploaded_by=None  # Auto-generated, no user
            )
            
            # Save PDF file
            document.file.save(pdf_file.name, pdf_file, save=True)
            
            logger.info(f"Auto-created contract document {document_id} for transaction {transaction_id}")
        except Exception as contract_err:
            # Log error but don't fail transaction creation
            import logging
            import traceback
            contract_logger = logging.getLogger(__name__)
            contract_logger.error(f"Failed to auto-create contract document for transaction {transaction_id}: {str(contract_err)}")
            contract_logger.error(traceback.format_exc())
            # Fallback: create a minimal contract file so subscription always has a linked contract document.
            try:
                if not ClientDocument.objects.filter(transaction=transaction, document_type='contract').exists():
                    from io import BytesIO
                    from django.core.files.base import ContentFile
                    fallback_doc_id = uuid.uuid4().hex[:12]
                    while ClientDocument.objects.filter(id=fallback_doc_id).exists():
                        fallback_doc_id = uuid.uuid4().hex[:12]

                    safe_product_name = (getattr(product, 'name', None) or 'Produit')
                    safe_client_name = f"{client.fname or ''} {client.lname or ''}".strip() or (client.email or 'Client')
                    dt_display = (
                        transaction.datetime.strftime('%d/%m/%Y %H:%M')
                        if getattr(transaction, 'datetime', None)
                        else datetime.now().strftime('%d/%m/%Y %H:%M')
                    )
                    fb_ccy = (getattr(transaction, 'amount_currency', None) or getattr(client, 'account_currency', None) or 'EUR').strip().upper()
                    if fb_ccy not in ('EUR', 'USD', 'CHF'):
                        fb_ccy = 'EUR'
                    amount_display = _format_amount_for_contract(float(transaction.amount), fb_ccy)

                    fallback_content = None
                    fallback_filename = f"contrat_{re.sub(r'[^a-zA-Z0-9_-]', '_', safe_product_name)[:50]}_{transaction_id}.pdf"

                    try:
                        from reportlab.lib.pagesizes import A4
                        from reportlab.pdfgen import canvas

                        pdf_buffer = BytesIO()
                        pdf = canvas.Canvas(pdf_buffer, pagesize=A4)
                        y = 800
                        pdf.setFont('Helvetica-Bold', 14)
                        pdf.drawString(50, y, "Contrat de souscription (version de secours)")
                        y -= 36
                        pdf.setFont('Helvetica', 11)
                        for line in [
                            f"Transaction: {transaction_id}",
                            f"Client: {safe_client_name}",
                            f"Produit: {safe_product_name}",
                            f"Montant: {amount_display}",
                            f"Date: {dt_display}",
                            "",
                            "Ce document est genere automatiquement en mode secours.",
                            "Le contrat detaille peut etre regenere depuis l'administration si necessaire.",
                        ]:
                            pdf.drawString(50, y, line)
                            y -= 20
                        pdf.showPage()
                        pdf.save()
                        fallback_content = pdf_buffer.getvalue()
                        pdf_buffer.close()
                    except Exception:
                        # Last-resort fallback if PDF rendering is unavailable.
                        fallback_filename = f"contrat_{re.sub(r'[^a-zA-Z0-9_-]', '_', safe_product_name)[:50]}_{transaction_id}.txt"
                        fallback_text = (
                            "Contrat de souscription (fallback)\n"
                            f"Transaction: {transaction_id}\n"
                            f"Client: {safe_client_name}\n"
                            f"Produit: {safe_product_name}\n"
                            f"Montant: {amount_display}\n"
                            f"Date: {dt_display}\n"
                        )
                        fallback_content = fallback_text.encode('utf-8')

                    fallback_document = ClientDocument.objects.create(
                        id=fallback_doc_id,
                        client=client,
                        transaction=transaction,
                        product=product,
                        name=f"Contrat - {safe_product_name}",
                        document_type='contract',
                        description=(
                            f"Contrat de souscription (fallback) pour la transaction {transaction_id}. "
                            "Le PDF detaille n'a pas pu etre genere automatiquement."
                        ),
                        uploaded_by=None
                    )
                    fallback_document.file.save(fallback_filename, ContentFile(fallback_content), save=True)
                    contract_logger.warning(
                        f"Fallback contract created for transaction {transaction_id} (document {fallback_doc_id})."
                    )
            except Exception as fallback_err:
                contract_logger.error(
                    f"Fallback contract creation also failed for transaction {transaction_id}: {str(fallback_err)}"
                )
    
    serializer = TransactionSerializer(transaction)
    return Response(serializer.data, status=status.HTTP_201_CREATED)

@api_view(['PUT', 'PATCH'])
@permission_classes([AllowAny])
def client_transaction_update(request, client_id, transaction_id):
    """Mettre à jour une transaction"""
    client = get_object_or_404(Client, id=client_id)
    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)
    previous_status = transaction.status
    # Capture original investment state BEFORE any modifications.
    # This avoids mixing partially-updated fields (e.g. type changed but transfer_to not yet updated).
    original_type = transaction.type
    original_transfer_to = transaction.transfer_to
    was_investment = (
        original_type == 'transfert'
        and original_transfer_to
        and original_transfer_to != 'solde'
    )
    
    # Authorization check: Only allow client accessing their own data OR authenticated users
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        # Client token: verify it matches the client_id
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif not request.user.is_authenticated:
        # No authentication: deny access
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Admin JWT: check gestionnaire can only access assigned clients
    if not is_client_token:
        err = _check_gestionnaire_client_access(request, client)
        if err:
            return err
    
    # Store old values for logging
    old_transaction_data = get_transaction_data_for_log(transaction)
    
    # Update fields
    if 'type' in request.data:
        transaction.type = request.data.get('type')
    if 'amount' in request.data:
        transaction.amount = request.data.get('amount')
    if 'description' in request.data:
        transaction.description = request.data.get('description', '')
    if 'status' in request.data:
        transaction.status = request.data.get('status')
    if 'datetime' in request.data:
        import logging
        from django.utils.dateparse import parse_datetime
        from django.utils import timezone as dj_timezone
        from datetime import datetime
        
        logger = logging.getLogger(__name__)
        datetime_str = request.data.get('datetime')
        
        if datetime_str:
            # Try Django's parse_datetime first (handles ISO 8601 format: YYYY-MM-DDTHH:MM:SS)
            transaction_datetime = parse_datetime(datetime_str)
            
            # If parse_datetime returns a naive datetime, make it aware in local timezone
            if transaction_datetime and dj_timezone.is_naive(transaction_datetime):
                transaction_datetime = dj_timezone.make_aware(transaction_datetime, dj_timezone.get_current_timezone())
                logger.info(f"Made naive datetime timezone-aware: {transaction_datetime}")
            
            # If that fails, try common European date formats
            if not transaction_datetime:
                # List of common European datetime formats
                european_formats = [
                    '%d/%m/%Y %H:%M:%S',  # DD/MM/YYYY HH:MM:SS
                    '%d/%m/%Y %H:%M',     # DD/MM/YYYY HH:MM
                    '%d-%m-%Y %H:%M:%S',  # DD-MM-YYYY HH:MM:SS
                    '%d-%m-%Y %H:%M',     # DD-MM-YYYY HH:MM
                    '%d.%m.%Y %H:%M:%S',  # DD.MM.YYYY HH:MM:SS
                    '%d.%m.%Y %H:%M',     # DD.MM.YYYY HH:MM
                ]
                
                for fmt in european_formats:
                    try:
                        naive_dt = datetime.strptime(datetime_str, fmt)
                        # Make it timezone-aware
                        transaction_datetime = dj_timezone.make_aware(naive_dt, dj_timezone.get_current_timezone())
                        logger.info(f"Parsed datetime using format {fmt}: {transaction_datetime}")
                        break
                    except ValueError:
                        continue
            
            # If still not parsed, try parsing as timestamp
            if not transaction_datetime:
                try:
                    # Try parsing as float/int timestamp (milliseconds)
                    if isinstance(datetime_str, (int, float)) or (isinstance(datetime_str, str) and datetime_str.replace('.', '', 1).isdigit()):
                        timestamp = float(datetime_str)
                        # If timestamp is in milliseconds (> year 2100 in seconds), convert to seconds
                        if timestamp > 4102444800:  # Jan 1, 2100 in seconds
                            timestamp = timestamp / 1000
                        transaction_datetime = datetime.fromtimestamp(timestamp, tz=dj_timezone.utc)
                        logger.info(f"Parsed datetime as timestamp: {transaction_datetime}")
                except Exception as e:
                    logger.warning(f"Failed to parse datetime as timestamp '{datetime_str}': {str(e)}")
            
            if transaction_datetime:
                transaction.datetime = transaction_datetime
                logger.info(f"Updated transaction {transaction.id} datetime to {transaction_datetime} (ISO: {transaction_datetime.isoformat()})")
            else:
                # Log if we received a datetime but couldn't parse it
                logger.error(f"Unable to parse datetime value: {datetime_str}")

    # Allow explicit admin update of subscription details (including interest period) from edit modal.
    if 'subscription_details' in request.data:
        incoming_details = request.data.get('subscription_details') or {}
        if isinstance(incoming_details, str):
            try:
                incoming_details = json.loads(incoming_details)
            except Exception:
                incoming_details = {}
        if isinstance(incoming_details, dict):
            merged_details = dict(transaction.subscription_details or {})
            merged_details.update(incoming_details)
            if merged_details.get('interest_period') and not merged_details.get('interestPeriod'):
                merged_details['interestPeriod'] = merged_details.get('interest_period')
            if merged_details.get('interestPeriod') and not merged_details.get('interest_period'):
                merged_details['interest_period'] = merged_details.get('interestPeriod')
            transaction.subscription_details = merged_details
            if str(merged_details.get('interestPeriod') or '').strip():
                transaction.subscription_interest_period = str(merged_details.get('interestPeriod')).strip()

    # Additional compatibility for top-level keys.
    if 'interestPeriod' in request.data or 'interest_period' in request.data:
        chosen_interest = request.data.get('interestPeriod') or request.data.get('interest_period') or ''
        details = dict(transaction.subscription_details or {})
        details['interestPeriod'] = chosen_interest
        details['interest_period'] = chosen_interest
        transaction.subscription_details = details
        transaction.subscription_interest_period = str(chosen_interest or '').strip()
    
    # Update transfer_to field (accept both to_field and transfer_to)
    # We mainly use transfer_to: product ID = investment, 'solde' = withdrawal
    if 'to_field' in request.data or 'transfer_to' in request.data:
        transaction.transfer_to = request.data.get('to_field') or request.data.get('transfer_to')
    
    # Update transfer_from for backward compatibility (but we mainly use transfer_to)
    if 'from_field' in request.data or 'transfer_from' in request.data:
        transaction.transfer_from = request.data.get('from_field') or request.data.get('transfer_from')
    
    # Auto-set transfer_to for transfert transactions with product if missing
    if transaction.type == 'transfert' and transaction.product:
        if not transaction.transfer_to:
            transaction.transfer_to = transaction.product.id
        # Auto-set transfer_from to 'solde' for backward compatibility
        if not transaction.transfer_from:
            transaction.transfer_from = 'solde'
    
    # For withdrawals (transfert product -> solde), set product field to point to source product
    # This ensures recalculate_positions_for_product_withdrawal can identify the product correctly
    if transaction.type == 'transfert' and transaction.transfer_to == 'solde':
        # If transfer_from is a product ID (not 'solde'), set product field to that product
        if transaction.transfer_from and transaction.transfer_from != 'solde':
            try:
                source_product = Product.objects.get(id=transaction.transfer_from)
                transaction.product = source_product
            except Product.DoesNotExist:
                pass  # Product doesn't exist, keep product field as is
    
    # Set skip flag BEFORE saving if needed (so signal can check it)
    skip_position_generation = request.data.get('skip_position_generation', False)
    if skip_position_generation:
        transaction._skip_auto_position_generation = True
    
    transaction.save()

    is_investment = (transaction.type == 'transfert' and transaction.transfer_to and transaction.transfer_to != 'solde')

    # Ensure transaction has subscription details even if created/edited by admin without subscription form
    if is_investment:
        # Try to resolve product and persist it on transaction for consistency
        product = transaction.product
        if not product and transaction.transfer_to and transaction.transfer_to != 'solde':
            try:
                product = Product.objects.get(id=transaction.transfer_to)
                transaction.product = product
            except Product.DoesNotExist:
                product = None

        if product:
            try:
                amount_dec = Decimal(str(transaction.amount or 0))
            except Exception:
                amount_dec = Decimal('0')
            product_for_defaults = effective_product_for_client(client, product)
            defaults = _build_subscription_details_defaults(
                client=client,
                product=product_for_defaults,
                amount=amount_dec,
                transaction_datetime=transaction.datetime or timezone.now(),
                request=request,
            )
            merged = _merge_missing_fields(transaction.subscription_details or {}, defaults)
            transaction.subscription_details = merged
            # Mirror key fields into explicit columns (only fill empties)
            if not transaction.subscription_first_name:
                transaction.subscription_first_name = merged.get('firstName', '') or ''
            if not transaction.subscription_last_name:
                transaction.subscription_last_name = merged.get('lastName', '') or ''
            if not transaction.subscription_birth_date:
                transaction.subscription_birth_date = merged.get('birthDate', '') or ''
            if not transaction.subscription_city:
                transaction.subscription_city = merged.get('city', '') or ''
            if not transaction.subscription_ip:
                transaction.subscription_ip = merged.get('ip', '') or ''
            if not transaction.subscription_date:
                transaction.subscription_date = merged.get('subscriptionDate', '') or ''
            if not transaction.subscription_duration:
                transaction.subscription_duration = merged.get('duration', '') or ''
            if not transaction.subscription_interest_period:
                transaction.subscription_interest_period = merged.get('interestPeriod', '') or ''
            if not transaction.subscription_profitability:
                transaction.subscription_profitability = merged.get('profitability', '') or ''
            if transaction.subscription_investment is None:
                transaction.subscription_investment = merged.get('investment')
            if transaction.subscription_profits is None:
                transaction.subscription_profits = merged.get('profits')
            if transaction.subscription_total is None:
                transaction.subscription_total = merged.get('total')
            if not transaction.subscription_contract_end:
                transaction.subscription_contract_end = merged.get('contractEnd', '') or ''
            transaction.save()
    # If an investment becomes "valide", this is the moment it starts: create monthly positions.
    # Also backfill if it's already valide but positions are missing (idempotent).
    # Skip automatic generation if skip_position_generation flag is set (for staged modal flow)
    # Note: skip_position_generation flag is already set above before transaction.save()
    if is_investment and transaction.status in COMPLETED_TRANSACTION_STATUSES and not skip_position_generation:
        if previous_status not in COMPLETED_TRANSACTION_STATUSES or not Position.objects.filter(transaction=transaction).exists():
            try:
                create_positions_for_investment(transaction, trigger="api_transaction_update")
            except Exception as pos_err:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create positions for transaction {transaction.id} on status valide: {str(pos_err)}")
                import traceback
                logger.error(traceback.format_exc())
    
    # If a withdrawal becomes "valide", recalculate positions for all investment transactions on the same product
    # A withdrawal is specifically when transfer_to == 'solde'
    is_withdrawal = (
        transaction.type == 'transfert' and
        transaction.transfer_to == 'solde'
    )
    if is_withdrawal and transaction.status in COMPLETED_TRANSACTION_STATUSES and not skip_position_generation:
        if previous_status not in COMPLETED_TRANSACTION_STATUSES:
            try:
                recalculate_positions_for_product_withdrawal(transaction)
            except Exception as pos_err:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to recalculate positions after withdrawal transaction {transaction.id}: {str(pos_err)}")
                import traceback
                logger.error(traceback.format_exc())
    
    if is_investment and not was_investment:
        # Transaction now represents an investment start: create positions
        try:
            create_positions_for_investment(transaction, trigger="api_transaction_update")
        except Exception as pos_err:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create positions for updated transaction {transaction.id}: {str(pos_err)}")
            import traceback
            logger.error(traceback.format_exc())
    
    # Log transaction update
    # Determine user_id - could be Django user or None (if client token)
    user_id_for_log = None
    client_name_for_log = None
    if request.user.is_authenticated:
        user_id_for_log = request.user
    elif token and token.startswith('client_'):
        # For client tokens, we don't have a Django user, so user_id will be None
        # But we can store the client name in the log details
        user_id_for_log = None
        # Get client name for logging
        client_name_for_log = f"{client.fname or ''} {client.lname or ''}".strip() or client.email or 'Client'
    
    new_transaction_data = get_transaction_data_for_log(transaction)
    
    # Only log if something actually changed
    if old_transaction_data != new_transaction_data:
        create_log_entry(
            event_type='editTransaction',
            user_id=user_id_for_log,
            request=request,
            old_value=old_transaction_data,
            new_value=new_transaction_data,
            transaction_id=transaction_id,
            client_name=client_name_for_log,
            client_id=client
        )
    
    # Refresh transaction from database to ensure we return the latest saved values
    transaction.refresh_from_db()
    serializer = TransactionSerializer(transaction)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([AllowAny])
def transaction_generate_rates(request, client_id, transaction_id):
    """Generate profitability rates for an investment transaction without creating positions."""
    client = get_object_or_404(Client, id=client_id)
    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)
    
    # Authorization check
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check if this is an investment or withdrawal transaction
    is_investment = (
        transaction.type == 'transfert'
        and transaction.transfer_to
        and transaction.transfer_to != 'solde'
    )
    
    is_withdrawal = (
        transaction.type == 'transfert'
        and transaction.transfer_to == 'solde'
    )
    
    # Check if this investment requires recalculation (existing pending positions on same product)
    requires_addition_recalculation = False
    if is_investment:
        product_id = transaction.transfer_to
        if product_id and product_id != 'solde':
            from .models import Position
            pending_count = Position.objects.filter(
                product_id=product_id,
                client_id=transaction.client_id,
                status='pending'
            ).count()
            requires_addition_recalculation = pending_count > 0
    
    if not is_investment and not is_withdrawal:
        return Response({'error': 'Cette transaction n\'est pas un investissement ou un retrait'}, status=status.HTTP_400_BAD_REQUEST)

    generation_horizon_days, gh_err = _parse_generation_horizon_days_from_request(request.data)
    if gh_err is not None:
        return gh_err
    
    try:
        withdrawal_metadata = None
        addition_metadata = None
        # For withdrawals, we need to generate rates for the product source
        # Create a temporary transaction-like object pointing to the source product
        if is_withdrawal:
            # Determine the product from which capital is being withdrawn
            product = None
            if transaction.transfer_from and transaction.transfer_from != 'solde':
                try:
                    from .models import Product
                    product = Product.objects.get(id=transaction.transfer_from)
                except Product.DoesNotExist:
                    pass
            
            if product is None and transaction.product:
                product = transaction.product
            
            if product is None:
                return Response({'error': 'Impossible de déterminer le produit source pour ce retrait'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Create a temporary transaction object for rate generation
            # This simulates an investment transaction on the source product
            # We mark it as a withdrawal by keeping the original description which contains "vers Solde"
            temp_transaction = Transaction(
                id=transaction.id,
                client_id=transaction.client_id,
                type='transfert',
                amount=transaction.amount,
                description=transaction.description,  # Keep original description to detect withdrawal
                status=transaction.status,
                datetime=transaction.datetime,
                transfer_to=product.id,  # Point to source product
                transfer_from='solde',  # This helps identify it as a temp transaction for withdrawal
                product=product,
                subscription_details=transaction.subscription_details or {}
            )
            # Mark this as a withdrawal temp transaction so build_investment_context can handle it correctly
            temp_transaction._is_withdrawal_temp = True
            withdrawal_metadata = calculate_withdrawal_recalculation_metadata(
                withdrawal_txn=transaction,
                product=product,
            )
            temp_transaction._capital_cutoff_datetime = transaction.datetime or timezone.now()
            temp_transaction._withdrawal_recalc_metadata = withdrawal_metadata
            rates = generate_rates_for_investment(
                temp_transaction,
                generation_horizon_days=generation_horizon_days,
            )
        elif requires_addition_recalculation:
            # For additions with recalculation, get the product and calculate metadata
            product = None
            if transaction.transfer_to and transaction.transfer_to != 'solde':
                try:
                    from .models import Product
                    product = Product.objects.get(id=transaction.transfer_to)
                except Product.DoesNotExist:
                    pass
            
            if product is None and transaction.product:
                product = transaction.product
            
            if product:
                from .position_service import calculate_addition_recalculation_metadata
                addition_metadata = calculate_addition_recalculation_metadata(
                    addition_txn=transaction,
                    product=product,
                )
                # Attach metadata to transaction so build_investment_context can use it
                transaction._capital_cutoff_datetime = transaction.datetime or timezone.now()
                transaction._withdrawal_recalc_metadata = addition_metadata  # Reuse same attribute name for consistency
            rates = generate_rates_for_investment(
                transaction,
                generation_horizon_days=generation_horizon_days,
            )
        else:
            rates = generate_rates_for_investment(
                transaction,
                generation_horizon_days=generation_horizon_days,
            )

        if not rates:
            # `generate_rates_for_investment` returns [] for several distinct reasons.
            # Previously the API returned an empty list without an error key, which made the UI
            # fall back to a generic "no periods" message even when the root cause was known
            # (e.g. invested capital parsed as 0, product not resolved, empty trading window).
            from .position_service import (
                build_investment_context,
                _position_generation_window_start_dt,
                _trading_days_between,
            )

            txn_for_ctx = transaction
            if is_withdrawal:
                # Rebuild the same temp txn used above (best-effort) for diagnostics only.
                product = None
                if transaction.transfer_from and transaction.transfer_from != 'solde':
                    try:
                        from .models import Product

                        product = Product.objects.get(id=transaction.transfer_from)
                    except Exception:
                        product = None

                if product is None and transaction.product:
                    product = transaction.product

                if product is not None:
                    txn_for_ctx = Transaction(
                        id=transaction.id,
                        client_id=transaction.client_id,
                        type='transfert',
                        amount=transaction.amount,
                        description=transaction.description,
                        status=transaction.status,
                        datetime=transaction.datetime,
                        transfer_to=product.id,
                        transfer_from='solde',
                        product=product,
                        subscription_details=transaction.subscription_details or {},
                    )
                    txn_for_ctx._is_withdrawal_temp = True
                    if withdrawal_metadata:
                        txn_for_ctx._withdrawal_recalc_metadata = withdrawal_metadata
                        txn_for_ctx._capital_cutoff_datetime = transaction.datetime or timezone.now()

            ctx = build_investment_context(txn_for_ctx, generation_horizon_days=generation_horizon_days)
            if ctx is None:
                return Response(
                    {
                        'rates': [],
                        'error': (
                            "Impossible de générer des périodes : le contexte d'investissement n'a pas pu être "
                            f"construit pour la transaction {transaction.id} (produit introuvable ou transfert invalide)."
                        ),
                    },
                    status=status.HTTP_200_OK,
                )

            if ctx.invested_amount is None or ctx.invested_amount <= 0:
                return Response(
                    {
                        'rates': [],
                        'error': (
                            "Impossible de générer des périodes : le capital investi calculé est nul ou négatif "
                            f"({ctx.invested_amount}). Vérifiez le montant de la transaction, le sens du transfert "
                            "(investissement vs retrait) et le format du montant."
                        ),
                    },
                    status=status.HTTP_200_OK,
                )

            start_dt = _position_generation_window_start_dt(txn_for_ctx)
            end_dt = start_dt + timezone.timedelta(days=int(ctx.duration_days or 0))
            trading_days = _trading_days_between(start_dt, end_dt)
            if not trading_days:
                return Response(
                    {
                        'rates': [],
                        'error': (
                            "Impossible de générer des périodes : aucun jour ouvré (lun-ven) trouvé entre "
                            f"{start_dt.date().isoformat()} et {end_dt.date().isoformat()} "
                            f"(duration_days={ctx.duration_days}). Vérifiez la date/heure de la transaction et l'horizon."
                        ),
                    },
                    status=status.HTTP_200_OK,
                )

            return Response(
                {
                    'rates': [],
                    'error': (
                        "Impossible de générer des périodes : aucune période n'a pu être construite malgré un capital "
                        f"positif ({ctx.invested_amount}) et {len(trading_days)} jour(s) ouvré(s). "
                        "Vérifiez la périodicité de rentabilité du produit et les dates."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        response_payload = {'rates': rates}
        if withdrawal_metadata:
            response_payload['withdrawal_recalculation'] = withdrawal_metadata
        if addition_metadata:
            response_payload['addition_recalculation'] = addition_metadata
        return Response(response_payload)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to generate rates for transaction {transaction.id}: {str(e)}", exc_info=True)
        return Response({'error': f'Erreur lors de la génération des taux: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def transaction_generate_positions(request, client_id, transaction_id):
    """Generate positions using custom rates without saving to database."""
    client = get_object_or_404(Client, id=client_id)
    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)
    
    # Authorization check
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check if this is an investment or withdrawal transaction
    is_investment = (
        transaction.type == 'transfert'
        and transaction.transfer_to
        and transaction.transfer_to != 'solde'
    )
    
    is_withdrawal = (
        transaction.type == 'transfert'
        and transaction.transfer_to == 'solde'
    )
    
    # Check if this investment requires recalculation (existing pending positions on same product)
    requires_addition_recalculation = False
    if is_investment:
        product_id = transaction.transfer_to
        if product_id and product_id != 'solde':
            from .models import Position
            pending_count = Position.objects.filter(
                product_id=product_id,
                client_id=transaction.client_id,
                status='pending'
            ).count()
            requires_addition_recalculation = pending_count > 0
    
    if not is_investment and not is_withdrawal:
        return Response({'error': 'Cette transaction n\'est pas un investissement ou un retrait'}, status=status.HTTP_400_BAD_REQUEST)

    generation_horizon_days, gh_err = _parse_generation_horizon_days_from_request(request.data)
    if gh_err is not None:
        return gh_err
    
    # Parse custom rates from request
    custom_rates_data = request.data.get('rates', {})
    if not isinstance(custom_rates_data, dict):
        return Response({'error': 'Les taux doivent être un objet'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        custom_rates = {
            int(period_idx): Decimal(str(rate))
            for period_idx, rate in custom_rates_data.items()
        }
        # Debug: log received rates
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Received custom rates for transaction {transaction.id}: {custom_rates}")
        logger.info(f"Raw rates data from request: {custom_rates_data}")
    except (ValueError, InvalidOperation) as e:
        return Response({'error': f'Format de taux invalide: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Parse avoid_losses option
    avoid_losses = request.data.get('avoid_losses', False)
    if not isinstance(avoid_losses, bool):
        avoid_losses = str(avoid_losses).lower() in ('true', '1', 'yes', 'on')

    # Parse positive_only: each trade strictly winning (no 0€ P&L); implies avoid_losses in backend
    positive_only = request.data.get('positive_only', False)
    if not isinstance(positive_only, bool):
        positive_only = str(positive_only).lower() in ('true', '1', 'yes', 'on')
    if positive_only:
        avoid_losses = True

    # Manual UI regeneration: include the transaction from the URL in addition recalculation loop
    manual_regeneration = request.data.get('manual_regeneration', False)
    if not isinstance(manual_regeneration, bool):
        manual_regeneration = str(manual_regeneration).lower() in ('true', '1', 'yes', 'on')
    include_focus_transaction = manual_regeneration

    # Parse positions per month override (optional)
    positions_per_month_min = request.data.get('positions_per_month_min')
    positions_per_month_max = request.data.get('positions_per_month_max')
    
    # Update transaction subscription_details with override if provided
    # This allows the override to be used during position generation
    # IMPORTANT: Both min and max must be provided together, or neither
    if positions_per_month_min is not None or positions_per_month_max is not None:
        # Validate that both are provided together
        if positions_per_month_min is None:
            return Response({
                'error': 'positions_per_month_min est requis lorsque positions_per_month_max est fourni'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if positions_per_month_max is None:
            return Response({
                'error': 'positions_per_month_max est requis lorsque positions_per_month_min est fourni'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        subscription_details = transaction.subscription_details or {}
        if not isinstance(subscription_details, dict):
            subscription_details = {}
        
        # Both are provided, parse them
        try:
            min_val = int(positions_per_month_min)
        except (ValueError, TypeError):
            return Response({'error': 'positions_per_month_min doit être un nombre entier'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            max_val = int(positions_per_month_max)
        except (ValueError, TypeError):
            return Response({'error': 'positions_per_month_max doit être un nombre entier'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate range
        if min_val < 0 or max_val < min_val:
            return Response({
                'error': f'Fourchette invalide: min ({min_val}) doit être >= 0 et <= max ({max_val})'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Store both values
        subscription_details['positionsPerMonthMin'] = min_val
        subscription_details['positionsPerMonthMax'] = max_val
        
        # Temporarily update transaction subscription_details for this generation
        # We don't save it to DB, just use it for this generation
        transaction.subscription_details = subscription_details
    
    try:
        if requires_addition_recalculation:
            # Use the same recalculation engine for additions, in dry-run mode.
            from .position_service import recalculate_positions_for_product_addition, calculate_addition_recalculation_metadata
            recalculation_preview = recalculate_positions_for_product_addition(
                transaction,
                force_recalculate=True,
                strict=False,
                dry_run=True,
                positions_per_month_min=min_val if positions_per_month_min is not None else None,
                positions_per_month_max=max_val if positions_per_month_max is not None else None,
                include_focus_transaction=include_focus_transaction,
            )

            deleted_total_expected = int(recalculation_preview.get('deleted_total') or 0)
            regenerated_total_expected = int(recalculation_preview.get('regenerated_total') or 0)
            per_txn_expected = recalculation_preview.get('per_transaction') or []

            deleted_positions_preview = None
            deleted_by_transaction = recalculation_preview.get('deleted_by_transaction') or {}
            if deleted_total_expected > 0:
                deleted_positions_preview = {
                    'total_count': deleted_total_expected,
                    'deleted_by_transaction': deleted_by_transaction,
                    'positions': [],
                    'note': 'Previsualisation dry-run basee sur execution reelle (sans ecriture base).',
                }

            product = None
            if transaction.transfer_to and transaction.transfer_to != 'solde':
                try:
                    from .models import Product
                    product = Product.objects.get(id=transaction.transfer_to)
                except Product.DoesNotExist:
                    product = None
            if product is None and transaction.product:
                product = transaction.product

            addition_metadata = (
                calculate_addition_recalculation_metadata(addition_txn=transaction, product=product)
                if product is not None else None
            )

            response_data = {
                'positions': recalculation_preview.get('generated_positions_preview') or [],
                'recalculation_execution_preview': {
                    'deleted_total_expected': deleted_total_expected,
                    'regenerated_total_expected': regenerated_total_expected,
                    'per_transaction_expected': per_txn_expected,
                    'status': recalculation_preview.get('status'),
                    'errors': recalculation_preview.get('errors') or [],
                    'generated_positions_preview_note': recalculation_preview.get('generated_positions_preview_note'),
                    'source': 'recalculate_positions_for_product_addition_dry_run',
                },
            }
            if deleted_positions_preview:
                response_data['deleted_positions'] = deleted_positions_preview
            if addition_metadata:
                response_data['addition_recalculation'] = addition_metadata
            return Response(response_data)

        if is_withdrawal:
            # Use the same recalculation engine as save-positions, but in dry-run mode.
            recalculation_preview = recalculate_positions_for_product_withdrawal(
                transaction,
                force_recalculate=True,
                strict=False,
                dry_run=True,
                positions_per_month_min=min_val if positions_per_month_min is not None else None,
                positions_per_month_max=max_val if positions_per_month_max is not None else None,
            )

            deleted_total_expected = int(recalculation_preview.get('deleted_total') or 0)
            regenerated_total_expected = int(recalculation_preview.get('regenerated_total') or 0)
            per_txn_expected = recalculation_preview.get('per_transaction') or []

            deleted_positions_preview = None
            deleted_by_transaction = recalculation_preview.get('deleted_by_transaction') or {}
            if deleted_total_expected > 0:
                deleted_positions_preview = {
                    'total_count': deleted_total_expected,
                    'deleted_by_transaction': deleted_by_transaction,
                    'positions': [],
                    'note': 'Prévisualisation dry-run basée sur l’exécution réelle (sans écriture base).',
                }

            product = None
            if transaction.transfer_from and transaction.transfer_from != 'solde':
                try:
                    from .models import Product
                    product = Product.objects.get(id=transaction.transfer_from)
                except Product.DoesNotExist:
                    product = None
            if product is None and transaction.product:
                product = transaction.product

            withdrawal_metadata = (
                calculate_withdrawal_recalculation_metadata(withdrawal_txn=transaction, product=product)
                if product is not None else None
            )

            response_data = {
                'positions': recalculation_preview.get('generated_positions_preview') or [],
                'recalculation_execution_preview': {
                    'deleted_total_expected': deleted_total_expected,
                    'regenerated_total_expected': regenerated_total_expected,
                    'per_transaction_expected': per_txn_expected,
                    'status': recalculation_preview.get('status'),
                    'errors': recalculation_preview.get('errors') or [],
                    'generated_positions_preview_note': recalculation_preview.get('generated_positions_preview_note'),
                    'source': 'recalculate_positions_for_product_withdrawal_dry_run',
                },
            }
            if deleted_positions_preview:
                response_data['deleted_positions'] = deleted_positions_preview
            if withdrawal_metadata:
                response_data['withdrawal_recalculation'] = withdrawal_metadata
            return Response(response_data)

        withdrawal_metadata = None
        # For withdrawals, create a temporary transaction pointing to source product
        txn_to_use = transaction
        if is_withdrawal:
            # Determine the product from which capital is being withdrawn
            product = None
            if transaction.transfer_from and transaction.transfer_from != 'solde':
                try:
                    from .models import Product
                    product = Product.objects.get(id=transaction.transfer_from)
                except Product.DoesNotExist:
                    pass
            
            if product is None and transaction.product:
                product = transaction.product
            
            if product is None:
                return Response({'error': 'Impossible de déterminer le produit source pour ce retrait'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Create a temporary transaction object for position generation
            # This simulates an investment transaction on the source product
            # Use updated subscription_details if override was provided
            temp_subscription_details = transaction.subscription_details or {}
            if isinstance(temp_subscription_details, dict) and (positions_per_month_min is not None or positions_per_month_max is not None):
                temp_subscription_details = temp_subscription_details.copy()
                if positions_per_month_min is not None:
                    temp_subscription_details['positionsPerMonthMin'] = int(positions_per_month_min)
                if positions_per_month_max is not None:
                    temp_subscription_details['positionsPerMonthMax'] = int(positions_per_month_max)
            
            txn_to_use = Transaction(
                id=transaction.id,
                client_id=transaction.client_id,
                type='transfert',
                amount=transaction.amount,
                description=transaction.description,  # Keep original description to detect withdrawal
                status=transaction.status,
                datetime=transaction.datetime,
                transfer_to=product.id,  # Point to source product
                transfer_from='solde',  # This helps identify it as a temp transaction for withdrawal
                product=product,
                subscription_details=temp_subscription_details
            )
            # Mark this as a withdrawal temp transaction so build_investment_context can handle it correctly
            txn_to_use._is_withdrawal_temp = True
            withdrawal_metadata = calculate_withdrawal_recalculation_metadata(
                withdrawal_txn=transaction,
                product=product,
            )
            txn_to_use._capital_cutoff_datetime = transaction.datetime or timezone.now()
            txn_to_use._withdrawal_recalc_metadata = withdrawal_metadata
        
        try:
            positions = generate_positions_with_rates(
                txn_to_use,
                custom_rates=custom_rates,
                save_to_db=False,
                avoid_losses=avoid_losses,
                positive_only=positive_only,
                generation_horizon_days=generation_horizon_days,
            )
        except ValueError as e:
            # Catch validation errors from position generation (e.g., range too high)
            return Response({
                'error': str(e),
                'error_type': 'positions_range_too_high'
            }, status=status.HTTP_400_BAD_REQUEST)
        # Convert Position objects to dicts if needed
        positions_data = []
        for p in positions:
            if isinstance(p, dict):
                pos_data = {
                    'id': p.get('id'),
                    'client_id': p.get('client_id'),
                    'product_id': p.get('product_id'),
                    'transaction_id': p.get('transaction_id'),
                    'asset_id': p.get('asset_id'),
                    'asset_name': p.get('asset_name', ''),
                    'asset_reference': p.get('asset_reference', ''),
                    'asset_type': p.get('asset_type', ''),
                    'opened_at': p.get('opened_at'),
                    'closed_at': p.get('closed_at'),
                    'invested_amount': p.get('invested_amount'),
                    'fx_rate_eur_to_asset': p.get('fx_rate_eur_to_asset'),
                    'invested_amount_asset_currency': p.get('invested_amount_asset_currency'),
                    'profit_loss': p.get('profit_loss'),
                    'period_index': p.get('period_index'),
                    'period_date': p.get('period_date'),
                    'status': p.get('status'),
                }
            else:
                # Position object - need to fetch asset info
                asset_name = ''
                asset_reference = ''
                asset_type = ''
                if hasattr(p, 'asset') and p.asset:
                    asset_name = p.asset.name or ''
                    asset_reference = p.asset.reference or ''
                    asset_type = p.asset.type or ''
                elif p.asset_id:
                    try:
                        from .models import Asset
                        asset = Asset.objects.filter(id=p.asset_id).first()
                        if asset:
                            asset_name = asset.name or ''
                            asset_reference = asset.reference or ''
                            asset_type = asset.type or ''
                    except Exception:
                        pass
                
                pos_data = {
                    'id': p.id,
                    'client_id': p.client_id,
                    'product_id': p.product_id,
                    'transaction_id': p.transaction_id,
                    'asset_id': p.asset_id if hasattr(p, 'asset_id') else None,
                    'asset_name': asset_name,
                    'asset_reference': asset_reference,
                    'asset_type': asset_type,
                    'opened_at': p.opened_at.isoformat() if hasattr(p, 'opened_at') and p.opened_at else None,
                    'closed_at': p.closed_at.isoformat() if hasattr(p, 'closed_at') and p.closed_at else None,
                    'invested_amount': str(p.invested_amount),
                    'fx_rate_eur_to_asset': str(p.fx_rate_eur_to_asset) if p.fx_rate_eur_to_asset else None,
                    'invested_amount_asset_currency': str(p.invested_amount_asset_currency) if p.invested_amount_asset_currency else None,
                    'profit_loss': str(p.profit_loss),
                    'period_index': p.period_index,
                    'period_date': p.period_date.isoformat() if hasattr(p, 'period_date') and p.period_date else None,
                    'status': p.status,
                }
            positions_data.append(pos_data)
        
        # Get information about pending positions that will be deleted when saving
        # This allows the frontend to display them before validation
        deleted_positions_preview = None
        try:
            # Determine product ID
            product_id = None
            if is_investment and transaction.transfer_to:
                product_id = transaction.transfer_to
            elif is_withdrawal:
                # For withdrawals, get product from transfer_from
                if transaction.transfer_from and transaction.transfer_from != 'solde':
                    product_id = transaction.transfer_from
                elif transaction.product:
                    product_id = transaction.product.id
            
            if product_id:
                from .models import Position
                from django.db.models import Count
                
                all_pending_positions = Position.objects.filter(
                    product_id=product_id,
                    client_id=transaction.client_id,
                    status='pending'
                ).select_related('transaction', 'asset')
                
                total_pending_count = all_pending_positions.count()
                deleted_by_transaction = {}
                deleted_positions_list = []
                
                if total_pending_count > 0:
                    # Get breakdown by transaction
                    pending_by_transaction = all_pending_positions.values('transaction_id').annotate(
                        count=Count('id')
                    )
                    for item in pending_by_transaction:
                        txn_id = item['transaction_id']
                        count = item['count']
                        deleted_by_transaction[txn_id] = count
                    
                    # Get detailed position information (limit to first 100)
                    positions_to_delete = list(all_pending_positions[:100])
                    for pos in positions_to_delete:
                        deleted_positions_list.append({
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
                    
                    deleted_positions_preview = {
                        'total_count': total_pending_count,
                        'deleted_by_transaction': deleted_by_transaction,
                        'positions': deleted_positions_list,
                        'note': f'{len(deleted_positions_list)} positions shown (out of {total_pending_count} total)' if total_pending_count > len(deleted_positions_list) else None
                    }
        except Exception as preview_err:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to get pending positions preview for transaction {transaction.id}: {str(preview_err)}", exc_info=True)
            # Don't fail the request if preview fails
        
        response_data = {'positions': positions_data}
        if deleted_positions_preview:
            response_data['deleted_positions'] = deleted_positions_preview
        if withdrawal_metadata:
            response_data['withdrawal_recalculation'] = withdrawal_metadata
        
        return Response(response_data)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to generate positions for transaction {transaction.id}: {str(e)}", exc_info=True)
        return Response({'error': f'Erreur lors de la génération des positions: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def transaction_recover_positions(request, client_id, transaction_id):
    """
    Staff/gestionnaire only: persist positions for a validated investment transaction
    that has none (recovery when auto-generation failed to save).
    Rejects client_ tokens.
    """
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    if token and token.startswith('client_'):
        return Response({'error': 'Action réservée au personnel'}, status=status.HTTP_403_FORBIDDEN)
    if not getattr(request.user, 'is_authenticated', False):
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)

    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)

    is_investment = (
        transaction.type == 'transfert'
        and transaction.transfer_to
        and transaction.transfer_to != 'solde'
    )
    if not is_investment:
        return Response(
            {'error': "Cette transaction n'est pas un investissement (transfert vers un produit)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if transaction.status not in COMPLETED_TRANSACTION_STATUSES:
        return Response({'error': 'La transaction doit être validée.'}, status=status.HTTP_400_BAD_REQUEST)
    if Position.objects.filter(transaction=transaction).exists():
        return Response(
            {'error': 'Des positions existent déjà pour cette transaction.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        created = create_positions_for_investment(transaction, trigger='manual_recovery')
    except Exception as e:
        logger.exception('transaction_recover_positions failed for %s', transaction_id)
        return Response(
            {'error': f'Échec de la création des positions: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    transaction.refresh_from_db()
    positions_count = Position.objects.filter(transaction=transaction).count()
    payload = {
        'created': len(created),
        'positionsCount': positions_count,
        'transaction': TransactionSerializer(transaction, context={'request': request}).data,
    }
    if len(created) == 0:
        payload['detail'] = (
            'Aucune position créée. Vérifiez que le produit a des allocations d’actifs et que la transaction est éligible.'
        )
    return Response(payload, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def transaction_save_positions(request, client_id, transaction_id):
    """Save previously generated positions to database."""
    client = get_object_or_404(Client, id=client_id)
    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)
    
    # Authorization check
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif not request.user.is_authenticated:
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check if this is an investment or withdrawal transaction
    is_investment = (
        transaction.type == 'transfert'
        and transaction.transfer_to
        and transaction.transfer_to != 'solde'
    )
    
    is_withdrawal = (
        transaction.type == 'transfert'
        and transaction.transfer_to == 'solde'
    )
    
    # Check if this investment requires recalculation (existing pending positions on same product)
    requires_addition_recalculation = False
    if is_investment:
        product_id = transaction.transfer_to
        if product_id and product_id != 'solde':
            from .models import Position
            pending_count = Position.objects.filter(
                product_id=product_id,
                client_id=transaction.client_id,
                status='pending'
            ).count()
            requires_addition_recalculation = pending_count > 0
    
    if not is_investment and not is_withdrawal:
        return Response({'error': 'Cette transaction n\'est pas un investissement ou un retrait'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Parse positions data from request
    positions_data = request.data.get('positions', [])
    if not isinstance(positions_data, list):
        return Response({'error': 'Les positions doivent être un tableau'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Parse rates and period summaries if provided (for history)
    rates_used = request.data.get('rates_used')
    if rates_used and isinstance(rates_used, dict):
        try:
            rates_used = {int(k): Decimal(str(v)) for k, v in rates_used.items()}
        except (ValueError, InvalidOperation):
            rates_used = None
    else:
        rates_used = None
    
    period_summaries = request.data.get('period_summaries')
    if not isinstance(period_summaries, list):
        period_summaries = None

    manual_regeneration = request.data.get('manual_regeneration', False)
    if not isinstance(manual_regeneration, bool):
        manual_regeneration = str(manual_regeneration).lower() in ('true', '1', 'yes', 'on')
    include_focus_transaction = manual_regeneration

    skip_positions = request.data.get('skip_positions', False)
    if not isinstance(skip_positions, bool):
        skip_positions = str(skip_positions).lower() in ('true', '1', 'yes', 'on')
    
    try:
        if skip_positions:
            # "History-only" path: persist a durable marker so signals don't regenerate positions later.
            with db_transaction.atomic():
                save_position_generation_history(
                    transaction,
                    rates_used=rates_used,
                    period_summaries=period_summaries,
                    positions_data=positions_data,
                )

                subscription_details = transaction.subscription_details or {}
                if not isinstance(subscription_details, dict):
                    subscription_details = {}
                subscription_details['skipPositions'] = True
                transaction.subscription_details = subscription_details
                transaction.save(update_fields=['subscription_details'])

            return Response(
                {
                    'positions': [],
                    'count': 0,
                    'message': 'Historique de génération enregistré (positions ignorées)',
                }
            )

        if requires_addition_recalculation:
            # Handle addition with recalculation (existing pending positions)
            from .position_service import recalculate_positions_for_product_addition, calculate_addition_recalculation_metadata
            
            with db_transaction.atomic():
                # Save the generation history
                save_position_generation_history(
                    transaction,
                    rates_used=rates_used,
                    period_summaries=period_summaries,
                    positions_data=positions_data,
                )

                # Collect information about positions that are expected to be deleted
                deleted_positions_info = None
                addition_metadata = None
                product = None
                if transaction.transfer_to and transaction.transfer_to != 'solde':
                    from .models import Product
                    try:
                        product = Product.objects.get(id=transaction.transfer_to)
                    except Product.DoesNotExist:
                        product = None

                if product is None and transaction.product:
                    product = transaction.product

                if product:
                    addition_metadata = calculate_addition_recalculation_metadata(
                        addition_txn=transaction,
                        product=product,
                    )
                    from .models import Position
                    from django.db.models import Count

                    all_pending_positions = Position.objects.filter(
                        product_id=product.id,
                        client_id=transaction.client_id,
                        status='pending'
                    ).select_related('transaction', 'asset')

                    total_pending_count = all_pending_positions.count()
                    deleted_by_transaction = {}
                    deleted_positions_list = []

                    if total_pending_count > 0:
                        pending_by_transaction = all_pending_positions.values('transaction_id').annotate(
                            count=Count('id')
                        )
                        for item in pending_by_transaction:
                            txn_id = item['transaction_id']
                            count = item['count']
                            deleted_by_transaction[txn_id] = count

                        positions_to_delete = list(all_pending_positions[:100])
                        for pos in positions_to_delete:
                            deleted_positions_list.append({
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

                        deleted_positions_info = {
                            'total_count': total_pending_count,
                            'deleted_by_transaction': deleted_by_transaction,
                            'positions': deleted_positions_list,
                            'note': f'{len(deleted_positions_list)} positions shown (out of {total_pending_count} total)' if total_pending_count > len(deleted_positions_list) else None
                        }

                # STRICT execution mode: if recalculation is partial/inconsistent, it raises and this request fails.
                save_positions_per_month_min = request.data.get('positions_per_month_min')
                save_positions_per_month_max = request.data.get('positions_per_month_max')
                save_min_val = None
                save_max_val = None
                if save_positions_per_month_min is not None or save_positions_per_month_max is not None:
                    if save_positions_per_month_min is None or save_positions_per_month_max is None:
                        raise ValueError('positions_per_month_min et positions_per_month_max doivent être fournis ensemble')
                    try:
                        save_min_val = int(save_positions_per_month_min)
                        save_max_val = int(save_positions_per_month_max)
                    except (ValueError, TypeError):
                        raise ValueError('positions_per_month_min et positions_per_month_max doivent être des entiers')
                    if save_min_val < 0 or save_max_val < save_min_val:
                        raise ValueError(f'Fourchette invalide: min ({save_min_val}) doit être >= 0 et <= max ({save_max_val})')

                recalculation_execution = recalculate_positions_for_product_addition(
                    transaction,
                    force_recalculate=True,
                    strict=True,
                    positions_per_month_min=save_min_val,
                    positions_per_month_max=save_max_val,
                    include_focus_transaction=include_focus_transaction,
                )

            response_data = {
                'positions': [], 
                'count': 0, 
                'message': 'Historique de génération enregistré pour l\'ajout avec recalcul'
            }
            
            if deleted_positions_info:
                response_data['deleted_positions'] = deleted_positions_info
            if addition_metadata:
                response_data['addition_recalculation'] = addition_metadata
            response_data['recalculation_execution'] = recalculation_execution
            
            return Response(response_data)
        
        if is_withdrawal:
            with db_transaction.atomic():
                # For withdrawals, only save the generation history (no positions are created for the withdrawal itself)
                save_position_generation_history(
                    transaction,
                    rates_used=rates_used,
                    period_summaries=period_summaries,
                    positions_data=positions_data,
                )

                # Collect information about positions that are expected to be deleted (preview)
                deleted_positions_info = None
                withdrawal_metadata = None
                product = None
                if transaction.transfer_from and transaction.transfer_from != 'solde':
                    from .models import Product
                    try:
                        product = Product.objects.get(id=transaction.transfer_from)
                    except Product.DoesNotExist:
                        product = None

                if product is None and transaction.product:
                    product = transaction.product

                if product:
                    withdrawal_metadata = calculate_withdrawal_recalculation_metadata(
                        withdrawal_txn=transaction,
                        product=product,
                    )
                    from .models import Position
                    from django.db.models import Count

                    all_pending_positions = Position.objects.filter(
                        product_id=product.id,
                        client_id=transaction.client_id,
                        status='pending'
                    ).select_related('transaction', 'asset')

                    total_pending_count = all_pending_positions.count()
                    deleted_by_transaction = {}
                    deleted_positions_list = []

                    if total_pending_count > 0:
                        pending_by_transaction = all_pending_positions.values('transaction_id').annotate(
                            count=Count('id')
                        )
                        for item in pending_by_transaction:
                            txn_id = item['transaction_id']
                            count = item['count']
                            deleted_by_transaction[txn_id] = count

                        positions_to_delete = list(all_pending_positions[:100])
                        for pos in positions_to_delete:
                            deleted_positions_list.append({
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

                        deleted_positions_info = {
                            'total_count': total_pending_count,
                            'deleted_by_transaction': deleted_by_transaction,
                            'positions': deleted_positions_list,
                            'note': f'{len(deleted_positions_list)} positions shown (out of {total_pending_count} total)' if total_pending_count > len(deleted_positions_list) else None
                        }

                # STRICT execution mode: if recalculation is partial/inconsistent, it raises and this request fails.
                save_positions_per_month_min = request.data.get('positions_per_month_min')
                save_positions_per_month_max = request.data.get('positions_per_month_max')
                save_min_val = None
                save_max_val = None
                if save_positions_per_month_min is not None or save_positions_per_month_max is not None:
                    if save_positions_per_month_min is None or save_positions_per_month_max is None:
                        raise ValueError('positions_per_month_min et positions_per_month_max doivent être fournis ensemble')
                    try:
                        save_min_val = int(save_positions_per_month_min)
                        save_max_val = int(save_positions_per_month_max)
                    except (ValueError, TypeError):
                        raise ValueError('positions_per_month_min et positions_per_month_max doivent être des entiers')
                    if save_min_val < 0 or save_max_val < save_min_val:
                        raise ValueError(f'Fourchette invalide: min ({save_min_val}) doit être >= 0 et <= max ({save_max_val})')

                recalculation_execution = recalculate_positions_for_product_withdrawal(
                    transaction,
                    force_recalculate=True,
                    strict=True,
                    positions_per_month_min=save_min_val,
                    positions_per_month_max=save_max_val,
                )

            response_data = {
                'positions': [], 
                'count': 0, 
                'message': 'Historique de génération enregistré pour le retrait'
            }
            
            if deleted_positions_info:
                response_data['deleted_positions'] = deleted_positions_info
            if withdrawal_metadata:
                response_data['withdrawal_recalculation'] = withdrawal_metadata
            response_data['recalculation_execution'] = recalculation_execution
            
            return Response(response_data)
        else:
            # For investments, save positions and history
            created_positions, deletion_info = save_generated_positions(
                transaction, 
                positions_data,
                rates_used=rates_used,
                period_summaries=period_summaries,
            )
            serializer = PositionSerializer(created_positions, many=True)
            
            response_data = {
                'positions': serializer.data, 
                'count': len(created_positions)
            }
            
            # Add deletion info if there were positions deleted
            if deletion_info['total_count'] > 0:
                response_data['deleted_positions'] = deletion_info
            
            return Response(response_data)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to save positions/history for transaction {transaction.id}: {str(e)}", exc_info=True)
        return Response({'error': f'Erreur lors de l\'enregistrement des positions: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_transaction_delete(request, client_id, transaction_id):
    """Supprimer une transaction"""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err
    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)
    transaction.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def transaction_logs(request, client_id, transaction_id):
    """Récupérer les logs d'une transaction"""
    client = get_object_or_404(Client, id=client_id)
    transaction = get_object_or_404(Transaction, id=transaction_id, client=client)
    
    # Get logs for this transaction (filter by transaction_id in details)
    # Use a more reliable filtering approach that works across all database backends
    # First, try JSONField lookup (works on PostgreSQL, MySQL 5.7+, etc.)
    try:
        logs = Log.objects.filter(
            details__transaction_id=transaction_id
        ).order_by('-created_at')
    except Exception:
        # Fallback: fetch all logs and filter in Python (more reliable but less efficient)
        # This ensures compatibility with all database backends
        all_logs = Log.objects.all().order_by('-created_at')
        logs = [
            log for log in all_logs 
            if log.details and log.details.get('transaction_id') == transaction_id
        ]
    
    serializer = LogSerializer(logs, many=True)
    return Response({'logs': serializer.data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def position_deletion_records_list(request, client_id):
    """Historique des suppressions de positions pour un client (audit / debug)."""
    client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, client)
    if err:
        return err

    qs = PositionDeletionRecord.objects.filter(client_id=client_id).order_by('-created_at')
    transaction_id = request.GET.get('transaction_id')
    position_id = request.GET.get('position_id')
    if transaction_id:
        qs = qs.filter(transaction_id=transaction_id)
    if position_id:
        qs = qs.filter(position_id=position_id)

    try:
        limit = int(request.GET.get('limit', 100))
    except (TypeError, ValueError):
        limit = 100
    limit = max(1, min(limit, 500))
    try:
        offset = int(request.GET.get('offset', 0))
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)

    total = qs.count()
    rows = qs[offset : offset + limit]
    serializer = PositionDeletionRecordSerializer(rows, many=True)
    return Response(
        {'records': serializer.data, 'total': total, 'limit': limit, 'offset': offset}
    )


# Product Categories endpoints
@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def category_list(request):
    """Liste toutes les catégories de produits"""
    # Check authentication manually
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    # Validate client token if provided
    if token and token.startswith('client_'):
        client_id = token.replace('client_', '')
        try:
            client = Client.objects.get(id=client_id)
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    # Allow access if authenticated or if it's a client token
    elif auth_header.startswith('Bearer ') and not token.startswith('client_'):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    elif not token:
        # No token provided - allow public access to categories list
        pass
    
    categories = ProductCategory.objects.all().order_by('title')
    serializer = ProductCategorySerializer(categories, many=True)
    return Response({'categories': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def category_create(request):
    """Créer une nouvelle catégorie"""
    # Generate category ID
    category_id = uuid.uuid4().hex[:12]
    while ProductCategory.objects.filter(id=category_id).exists():
        category_id = uuid.uuid4().hex[:12]
    
    category = ProductCategory.objects.create(
        id=category_id,
        title=request.data.get('title', ''),
        url=request.data.get('url', ''),
        subcategories=request.data.get('subcategories', [])
    )
    
    serializer = ProductCategorySerializer(category)
    return Response(serializer.data, status=status.HTTP_201_CREATED)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def category_update(request, category_id):
    """Mettre à jour une catégorie"""
    category = get_object_or_404(ProductCategory, id=category_id)
    
    if 'title' in request.data:
        category.title = request.data['title']
    if 'url' in request.data:
        category.url = request.data['url']
    if 'subcategories' in request.data:
        category.subcategories = request.data['subcategories']
    
    category.save()
    serializer = ProductCategorySerializer(category)
    return Response(serializer.data)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def category_delete(request, category_id):
    """Supprimer une catégorie"""
    category = get_object_or_404(ProductCategory, id=category_id)
    category.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

# Products endpoints
@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def product_list(request):
    """Liste tous les produits financiers"""
    # Check authentication manually
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    # Validate client token if provided
    if token and token.startswith('client_'):
        client_id = token.replace('client_', '')
        try:
            client = Client.objects.get(id=client_id)
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    # Allow access if authenticated or if it's a client token
    elif auth_header.startswith('Bearer ') and not token.startswith('client_'):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    elif not token:
        # No token provided - allow public access to products list
        pass
    
    products = Product.objects.all().order_by('-created_at')
    serializer = ProductSerializer(products, many=True, context={'request': request})
    return Response({'products': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_create(request):
    """Créer un nouveau produit financier"""
    from datetime import datetime
    
    # Generate product ID
    product_id = uuid.uuid4().hex[:12]
    while Product.objects.filter(id=product_id).exists():
        product_id = uuid.uuid4().hex[:12]
    
    # Get category if provided
    category = None
    if request.data.get('categoryId'):
        try:
            category = ProductCategory.objects.get(id=request.data['categoryId'])
        except ProductCategory.DoesNotExist:
            return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Parse dates if provided
    availability_start = None
    availability_end = None
    if request.data.get('availabilityStart'):
        try:
            availability_start = datetime.strptime(request.data['availabilityStart'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    if request.data.get('availabilityEnd'):
        try:
            availability_end = datetime.strptime(request.data['availabilityEnd'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    
    # Handle profitability - can be None if noProfitability is True
    profitability = request.data.get('profitability')
    if profitability is not None:
        try:
            profitability = float(profitability)
        except (ValueError, TypeError):
            profitability = None
    
    # Handle no_profitability boolean conversion
    # Support both string ('Oui'/'Non') and boolean values from frontend
    if 'noProfitability' in request.data:
        no_profitability_value = request.data['noProfitability']
        # Handle both string ('Oui'/'Non') and boolean values
        if isinstance(no_profitability_value, str):
            no_profitability_value = no_profitability_value.lower() in ['oui', 'true', '1']
        else:
            no_profitability_value = bool(no_profitability_value)
    else:
        # Default to True if not provided
        no_profitability_value = True

    try:
        duration_value = _normalize_duration_value(request.data.get('duration', ''))
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    # Handle subcategory: sanitize to remove invalid characters
    raw_sub = request.data.get('subcategory', '')
    subcategory_value = _sanitize_product_subcategory(raw_sub)
    
    # Handle default field - support both string and boolean
    default_value_raw = request.data.get('default', False)
    default_value_final = (
        (str(default_value_raw).strip().lower() in ['oui', 'true', '1', 'yes'])
        if isinstance(default_value_raw, str)
        else bool(default_value_raw)
    )
    
    product = Product.objects.create(
        id=product_id,
        name=request.data.get('name', ''),
        reference=request.data.get('reference', ''),
        type=request.data.get('type', ''),
        category=category,
        subcategory=subcategory_value,
        status=request.data.get('status', 'Brouillon'),
        profitability=profitability,
        duration=duration_value,
        description=request.data.get('description', ''),
        cgv=request.data.get('cgv', ''),
        # Gestion de la rentabilité
        no_profitability=no_profitability_value,
        is_variable_profitability=request.data.get('isVariableProfitability', 'Non'),
        variable_profitability=request.data.get('variableProfitability', ''),
        profitability_period=request.data.get('profitabilityPeriod', ''),
        interest_period=request.data.get('interestPeriod', ''),
        # Gestion du produit
        availability_start=availability_start,
        availability_end=availability_end,
        link_to_assets=request.data.get('linkToAssets', 'Non'),
        # Handle default field - support both string and boolean
        default=default_value_final,
        # Handle available_funds field - support both string and boolean
        available_funds=(
            (str(request.data.get('availableFunds', False)).strip().lower() in ['oui', 'true', '1', 'yes'])
            if isinstance(request.data.get('availableFunds', False), str)
            else bool(request.data.get('availableFunds', False))
        ),
        # Gestion des prix
        min_entry_value=request.data.get('minEntryValue'),
        max_entry_value=request.data.get('maxEntryValue')
    )

    # Handle product-asset allocations (assetAllocations) when linkToAssets is "Oui"
    try:
        link_to_assets_value = request.data.get('linkToAssets', 'Non')
        raw_allocations = request.data.get('assetAllocations', None)

        def _parse_allocations(raw):
            if raw is None or raw == '':
                return None
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except Exception:
                    raise ValueError("assetAllocations doit être un JSON valide (liste).")
            if not isinstance(raw, list):
                raise ValueError("assetAllocations doit être une liste.")
            cleaned = []
            for idx, item in enumerate(raw):
                if not isinstance(item, dict):
                    raise ValueError(f"assetAllocations[{idx}] doit être un objet.")
                asset_id = (item.get('assetId') or item.get('asset_id') or '').strip() if item.get('assetId') or item.get('asset_id') else ''
                if not asset_id:
                    raise ValueError(f"assetAllocations[{idx}].assetId est requis.")
                proportion_raw = item.get('proportion', None)
                if proportion_raw is None or proportion_raw == '':
                    raise ValueError(f"assetAllocations[{idx}].proportion est requis.")
                try:
                    proportion = Decimal(str(proportion_raw))
                except (InvalidOperation, ValueError, TypeError):
                    raise ValueError(f"assetAllocations[{idx}].proportion invalide.")
                cleaned.append((asset_id, proportion))
            return cleaned

        def _validate_and_normalize(cleaned):
            if not cleaned:
                raise ValueError("Veuillez ajouter au moins un actif et une proportion.")
            asset_ids = [a for a, _ in cleaned]
            if len(set(asset_ids)) != len(asset_ids):
                raise ValueError("Un actif ne peut être sélectionné qu'une seule fois.")
            total = Decimal('0')
            normalized = []
            for asset_id, proportion in cleaned:
                if proportion < 0 or proportion > 100:
                    raise ValueError("La proportion doit être comprise entre 0 et 100.")
                total += proportion
                # store with 2 decimals
                normalized.append((asset_id, proportion.quantize(Decimal('0.01'))))
            # Require ~100%
            if (total - Decimal('100')).copy_abs() > Decimal('0.01'):
                raise ValueError("La somme des proportions doit être égale à 100%.")

            existing_assets = set(Asset.objects.filter(id__in=asset_ids).values_list('id', flat=True))
            missing = [a for a in asset_ids if a not in existing_assets]
            if missing:
                raise ValueError("Actif(s) introuvable(s): " + ", ".join(missing))
            return normalized

        if link_to_assets_value == 'Oui':
            cleaned = _parse_allocations(raw_allocations)
            normalized = _validate_and_normalize(cleaned or [])

            # Replace any existing allocations (should be none on create)
            ProductAssetAllocation.objects.filter(product=product).delete()
            for asset_id, proportion in normalized:
                alloc_id = uuid.uuid4().hex[:12]
                while ProductAssetAllocation.objects.filter(id=alloc_id).exists():
                    alloc_id = uuid.uuid4().hex[:12]
                ProductAssetAllocation.objects.create(
                    id=alloc_id,
                    product=product,
                    asset=Asset.objects.get(id=asset_id),
                    proportion=proportion,
                )
        else:
            # If not linked, ensure no allocations
            ProductAssetAllocation.objects.filter(product=product).delete()
    except ValueError as e:
        # Rollback product if allocations invalid
        from .position_audit import position_deletion_audit

        with position_deletion_audit('orm_rollback_product_create_invalid_allocations'):
            product.delete()
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    # Handle image upload
    if 'image' in request.FILES:
        try:
            image_file = request.FILES['image']
            # Get file extension
            original_filename = image_file.name
            _, ext = os.path.splitext(original_filename)
            # Create filename with product ID: {product_id}.{ext}
            # Note: upload_to='products/' in model will add the 'products/' prefix automatically
            custom_filename = f'{product_id}{ext}'
            
            print(f"Uploading image: {original_filename} as {custom_filename} for product {product_id}")
            
            # Delete old image if it exists
            if product.image:
                print(f"Deleting old image: {product.image.name}")
                product.image.delete(save=False)
            
            # Save with custom filename - this will upload to cloud storage
            product.image.save(custom_filename, image_file, save=True)
            
            # Verify the image was saved and uploaded to storage
            if not product.image:
                return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Verify the file exists in S3 storage
            try:
                storage = product.image.storage
                
                # Check if storage backend is S3
                from api.storage import S3MediaStorage
                if isinstance(storage, S3MediaStorage):
                    # S3 handles uploads automatically and provides URLs
                    # Verify the image URL is accessible
                    try:
                        image_url = product.image.url
                        if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                            print(f"Image successfully uploaded to storage: {product.image.name}")
                            print(f"S3 URL: {image_url[:100]}...")
                        else:
                            print(f"WARNING: Image URL not generated properly: {image_url}")
                    except Exception as url_error:
                        print(f"WARNING: Could not verify storage URL: {str(url_error)}")
                else:
                    print(f"INFO: Storage backend is {type(storage).__name__}")
                    print(f"Image path: {product.image.name}")
                    if product.image:
                        print(f"Image URL: {product.image.url}")
            except Exception as verify_error:
                import traceback
                print(f"Warning: Could not verify image in storage: {str(verify_error)}")
                print(traceback.format_exc())
            
            # Refresh the image field to ensure the URL is updated
            product.refresh_from_db(fields=['image'])
            
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Error uploading image: {error_msg}")
            print(traceback.format_exc())
            return Response({'error': f'Error uploading image: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Handle fiche technique (PDF) upload
    if 'technicalSheet' in request.FILES:
        try:
            ts_file = _validate_product_technical_sheet_upload(request.FILES['technicalSheet'])
            custom_ts_name = f'{product_id}_fiche_technique.pdf'
            if product.technical_sheet:
                product.technical_sheet.delete(save=False)
            product.technical_sheet.save(custom_ts_name, ts_file, save=True)
            product.refresh_from_db(fields=['technical_sheet'])
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Error uploading technical sheet: {error_msg}")
            print(traceback.format_exc())
            return Response({'error': f'Erreur lors de l\'upload de la fiche technique: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    # If product is marked as default, add it to all existing clients
    if product.default:
        from django.db import IntegrityError
        all_clients = Client.objects.all()
        for client in all_clients:
            # Check if client already has this product (safety check)
            if not ClientProduct.objects.filter(client=client, product=product).exists():
                client_product_id = uuid.uuid4().hex[:12]
                while ClientProduct.objects.filter(id=client_product_id).exists():
                    client_product_id = uuid.uuid4().hex[:12]
                try:
                    ClientProduct.objects.create(
                        id=client_product_id,
                        client=client,
                        product=product
                    )
                except IntegrityError:
                    # Another request created this relationship concurrently, skip it
                    pass
    
    serializer = ProductSerializer(product, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def product_detail(request, product_id):
    """Récupérer un produit"""
    # Check authentication: either Django user or valid client token
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        # Validate client token
        client_id = token.replace('client_', '')
        try:
            client = Client.objects.get(id=client_id)
            if not client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    elif auth_header.startswith('Bearer '):
        # Try to validate JWT token manually
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            if user and user.is_authenticated:
                request.user = user
            else:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    product = get_object_or_404(Product, id=product_id)
    serializer = ProductSerializer(product, context={'request': request})
    pdata = dict(serializer.data)
    if is_client_token and client and client.active:
        try:
            cp = ClientProduct.objects.select_related("product").get(client=client, product=product)
            ovr = cp.overrides or {}
            if ovr:
                pdata = merge_serialized_product_with_overrides(pdata, ovr)
            pdata['showRates'] = bool(cp.show_rates)
        except ClientProduct.DoesNotExist:
            pass
    return Response({'product': pdata}, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def product_contract_pdf(request, product_id):
    """Générer le PDF du contrat produit"""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
    from reportlab.lib.utils import ImageReader
    from django.http import HttpResponse
    import requests
    from PIL import Image as PILImage
    
    # Check authentication: either Django user or valid client token
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    current_user = None
    current_client = None
    
    if is_client_token:
        # Validate client token
        client_id = token.replace('client_', '')
        try:
            current_client = Client.objects.get(id=client_id)
            if not current_client.active:
                return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        except Client.DoesNotExist:
            return Response({'error': 'Token invalide'}, status=status.HTTP_401_UNAUTHORIZED)
    elif token:
        # Try to validate JWT token manually (token can come from header or query params)
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        try:
            validated_token = jwt_auth.get_validated_token(token)
            current_user = jwt_auth.get_user(validated_token)
            if not current_user or not current_user.is_authenticated:
                return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            # Invalid token - require authentication
            return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        # No token provided
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
    product = get_object_or_404(Product, id=product_id)
    if current_client:
        product = effective_product_for_client(current_client, product)
    
    # Get subscription data from body (POST) or querystring (GET).
    payload = request.data if request.method == 'POST' else request.GET
    subscription_first_name = (payload.get('firstName') or '').strip()
    subscription_last_name = (payload.get('lastName') or '').strip()
    subscription_birth_date = (payload.get('birthDate') or '').strip()
    subscription_city = (payload.get('city') or '').strip()
    subscription_amount = (payload.get('amount') or '').strip()
    subscription_interest_period = (payload.get('interestPeriod') or '').strip()
    # Base64 encoded signature image (often a data URL) - keep out of URL to avoid 414/Request-Line-too-large.
    subscription_signature = (payload.get('signature') or '').strip()
    # Currency for contract amounts (EUR, USD, CHF)
    contract_currency_raw = (payload.get('currency') or '').strip().upper()
    if not contract_currency_raw and current_client:
        contract_currency_raw = (getattr(current_client, 'account_currency', None) or '').strip().upper()
    contract_currency = contract_currency_raw if contract_currency_raw in ('EUR', 'USD', 'CHF') else 'EUR'
    
    # Get user/client data for defaults
    if current_client:
        investor_first_name = subscription_first_name or (current_client.fname or '')
        investor_last_name = subscription_last_name or (current_client.lname or '')
        investor_email = current_client.email or ''
        investor_phone = current_client.phone or current_client.mobile or ''
        investor_birth_date = subscription_birth_date or (current_client.birth_date.strftime('%d/%m/%Y') if current_client.birth_date else '')
        investor_city = subscription_city or (current_client.city or '')
    elif current_user:
        # Try to get user details if available
        try:
            user_details = UserDetails.objects.get(user=current_user)
            investor_first_name = subscription_first_name or (user_details.fname or getattr(current_user, 'first_name', None) or '')
            investor_last_name = subscription_last_name or (user_details.lname or getattr(current_user, 'last_name', None) or '')
            investor_email = current_user.email or ''
            investor_phone = user_details.phone or user_details.mobile or ''
            investor_birth_date = subscription_birth_date or (user_details.birth_date.strftime('%d/%m/%Y') if user_details.birth_date else '')
            investor_city = subscription_city or (user_details.city or '')
        except UserDetails.DoesNotExist:
            investor_first_name = subscription_first_name or (getattr(current_user, 'first_name', None) or '')
            investor_last_name = subscription_last_name or (getattr(current_user, 'last_name', None) or '')
            investor_email = current_user.email or ''
            investor_phone = ''
            investor_birth_date = subscription_birth_date or ''
            investor_city = subscription_city or ''
    else:
        investor_first_name = subscription_first_name
        investor_last_name = subscription_last_name
        investor_email = ''
        investor_phone = ''
        investor_birth_date = subscription_birth_date
        investor_city = subscription_city
    
    investor_name = f"{investor_first_name} {investor_last_name}".strip()
    
    # Get AppSettings for logo and company info
    try:
        app_settings = AppSettings.objects.get(id='settings001')
        platform_name = app_settings.platform_name or 'Panorama'
        platform_address = app_settings.address or ''
        platform_website = app_settings.website or ''
        platform_email = app_settings.email or ''
        logo_url = None
        if app_settings.logo:
            try:
                logo_url = app_settings.logo.url
                # If it's a storage URL, use it directly
                if not (logo_url.startswith('http://') or logo_url.startswith('https://')):
                    # Build absolute URL if needed
                    logo_url = request.build_absolute_uri(logo_url)
            except Exception:
                logo_url = None
    except AppSettings.DoesNotExist:
        platform_name = 'Panorama'
        platform_address = ''
        platform_website = ''
        platform_email = ''
        logo_url = None
    
    # Company info (fallback to defaults if not in settings)
    company_name = platform_name or 'CIM Banque SA'
    company_address = platform_address or '16 rue Merle d\'Aubigné, 1207 Genève - SUISSE'
    company_website = platform_website or 'web.interface-cim.fr'
    company_email = platform_email or 'contact@interface-cim.fr'
    
    # Product data
    product_name = product.name or ''
    duration = product.duration or '30'
    duration_days = _parse_days_from_duration(duration)
    
    # Amount
    try:
        amount = float(subscription_amount) if subscription_amount else float(product.min_entry_value or 10000)
    except (ValueError, TypeError):
        amount = float(product.min_entry_value or 10000)
    
    # Profitability
    is_variable = str(product.is_variable_profitability or '').lower() == 'oui'
    profitability_period = product.profitability_period or 'mensuel'
    period_label = (profitability_period or '').strip().lower()
    prorata = (Decimal(duration_days) / Decimal('365')) if duration_days else Decimal('0')

    if 'fin' in period_label and 'contrat' in period_label:
        # Rate is already for the contract duration.
        if is_variable and product.variable_profitability:
            min_profit = float(product.profitability or 0)
            max_profit = float(product.variable_profitability)
            profitability_text = f"{min_profit:.2f}% NET variable jusqu'à {max_profit:.2f}% NET {profitability_period}"
        elif product.profitability is not None:
            profit = float(product.profitability)
            profitability_text = f"{profit:.2f}% NET {profitability_period}"
        else:
            profitability_text = ''
    else:
        # Annualized -> prorated display.
        if is_variable and product.variable_profitability:
            min_profit = float(product.profitability or 0)
            max_profit = float(product.variable_profitability)
            min_period = float((Decimal(str(min_profit)) * prorata).quantize(Decimal('0.01')))
            max_period = float((Decimal(str(max_profit)) * prorata).quantize(Decimal('0.01')))
            profitability_text = f"{min_period:.2f}% NET variable jusqu'à {max_period:.2f}% NET {profitability_period}"
        elif product.profitability is not None:
            profit = float(product.profitability)
            period_profit = float((Decimal(str(profit)) * prorata).quantize(Decimal('0.01')))
            profitability_text = f"{period_profit:.2f}% NET {profitability_period}"
        else:
            profitability_text = ''
    
    # Calculate contract dates
    contract_start_date = date.today()
    contract_end_date = contract_start_date + timedelta(days=duration_days)
    contract_end_date_str = contract_end_date.strftime('%d/%m/%Y')
    
    # Calculate interest
    rate = _profitability_rate_for_calc(product)
    if 'fin' in period_label and 'contrat' in period_label:
        interest_amount = Decimal(str(amount)) * (rate / Decimal('100'))
        profitability_rate = float(rate)
    else:
        interest_amount = Decimal(str(amount)) * (rate / Decimal('100')) * (Decimal(duration_days) / Decimal('365'))
        profitability_rate = float((rate * prorata).quantize(Decimal('0.01'))) if duration_days else 0.0
    interest_amount = float(interest_amount.quantize(Decimal('0.01')))
    
    # Interest period
    interest_period = subscription_interest_period or product.interest_period or 'Fin de contrat'
    
    # Auto-renewal (derived from the chosen interest period)
    auto_renewal = 'OUI' if 'fin' in str(interest_period or '').strip().lower() else 'NON'
    
    # Today's date formatted
    today_formatted = contract_start_date.strftime('%A %d %B %Y').replace('Monday', 'lundi').replace('Tuesday', 'mardi').replace('Wednesday', 'mercredi').replace('Thursday', 'jeudi').replace('Friday', 'vendredi').replace('Saturday', 'samedi').replace('Sunday', 'dimanche').replace('January', 'janvier').replace('February', 'février').replace('March', 'mars').replace('April', 'avril').replace('May', 'mai').replace('June', 'juin').replace('July', 'juillet').replace('August', 'août').replace('September', 'septembre').replace('October', 'octobre').replace('November', 'novembre').replace('December', 'décembre')
    
    # Create PDF with header and footer
    buffer = BytesIO()
    
    # Download logo if available
    logo_data_bytes = None
    logo_width_mm = None
    logo_height_mm = None
    if logo_url:
        try:
            logo_response = requests.get(logo_url, timeout=10)
            if logo_response.status_code == 200:
                logo_data_bytes = BytesIO(logo_response.content)
                # Get image dimensions using PIL and handle transparency
                try:
                    logo_data_bytes.seek(0)
                    img = PILImage.open(logo_data_bytes)
                    img_width, img_height = img.size
                    
                    # Handle all transparency modes: RGBA, LA, P (palette with transparency)
                    if img.mode in ('RGBA', 'LA', 'P'):
                        # Convert palette images with transparency to RGBA first
                        if img.mode == 'P':
                            # Check if palette has transparency
                            if 'transparency' in img.info:
                                img = img.convert('RGBA')
                            else:
                                img = img.convert('RGB')
                        
                        # If still RGBA or LA, convert to RGB with white background
                        if img.mode in ('RGBA', 'LA'):
                            # Create a white background
                            rgb_img = PILImage.new('RGB', img.size, (255, 255, 255))
                            if img.mode == 'RGBA':
                                # Paste the RGBA image onto the white background using alpha channel as mask
                                rgb_img.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                            else:  # LA mode
                                # LA mode: L is luminance, A is alpha
                                rgb_img.paste(img.convert('RGB'), mask=img.split()[1])  # Use alpha channel
                            img = rgb_img
                        
                        # Save to BytesIO
                        logo_data_bytes = BytesIO()
                        img.save(logo_data_bytes, format='PNG')
                        logo_data_bytes.seek(0)
                    elif img.mode != 'RGB':
                        # Convert other modes to RGB
                        img = img.convert('RGB')
                        logo_data_bytes = BytesIO()
                        img.save(logo_data_bytes, format='PNG')
                        logo_data_bytes.seek(0)
                    
                    # Calculate size to fit in header (max 15mm height)
                    # Convert pixels to mm at 72 DPI (1 inch = 25.4mm, 72 px = 1 inch)
                    max_height_mm = 15
                    px_to_mm = 25.4 / 72
                    img_height_mm = img_height * px_to_mm
                    logo_height_mm = min(img_height_mm, max_height_mm)
                    logo_width_mm = logo_height_mm * (img_width / img_height)
                    logo_data_bytes.seek(0)  # Reset for use
                except Exception as e:
                    # Log error but continue with default size
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Error processing logo image: {str(e)}")
                    # If PIL fails, use default size
                    logo_width_mm = 30
                    logo_height_mm = 15
                    logo_data_bytes.seek(0)
        except Exception:
            logo_data_bytes = None
    
    # Define header function
    def header(canvas, doc):
        canvas.saveState()
        # Header area
        header_height = 30*mm
        canvas.setFillColor(colors.white)
        canvas.rect(0, A4[1] - header_height, A4[0], header_height, fill=1, stroke=0)
        
        # Logo (if available)
        if logo_data_bytes:
            try:
                logo_data_bytes.seek(0)  # Reset to beginning
                # Use ImageReader to convert BytesIO to something reportlab can use
                img_reader = ImageReader(logo_data_bytes)
                # Center logo horizontally, align vertically in header
                x = (A4[0] - logo_width_mm*mm) / 2
                y = A4[1] - header_height + (header_height - logo_height_mm*mm) / 2
                # Draw image - mask=None to avoid green background, image already converted to RGB with white background
                canvas.drawImage(img_reader, x, y, width=logo_width_mm*mm, height=logo_height_mm*mm, preserveAspectRatio=True, mask=None)
                logo_data_bytes.seek(0)  # Reset for next page
            except Exception as e:
                # Log error but continue without logo
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Error drawing logo in PDF header: {str(e)}")
        
        canvas.restoreState()
    
    # Define footer function
    def footer(canvas, doc):
        canvas.saveState()
        footer_height = 25*mm  # Increased height
        footer_margin = 5*mm  # Margin from bottom
        
        # Footer background
        canvas.setFillColor(colors.white)
        canvas.rect(0, footer_margin, A4[0], footer_height - footer_margin, fill=1, stroke=0)
        
        # Footer text
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.black)
        
        footer_lines = []
        if company_name:
            footer_lines.append(company_name)
        if company_address:
            footer_lines.append(company_address)
        if company_website or company_email:
            contact_info = []
            if company_website:
                contact_info.append(company_website)
            if company_email:
                contact_info.append(company_email)
            footer_lines.append(' - '.join(contact_info))
        
        # Center footer text vertically within footer area
        line_height = 11
        total_height = len(footer_lines) * line_height
        footer_top = footer_margin + footer_height - footer_margin
        start_y = footer_margin + (footer_height - footer_margin - total_height) / 2 + line_height
        
        for i, line in enumerate(footer_lines):
            text_width = canvas.stringWidth(line, 'Helvetica', 9)
            x = (A4[0] - text_width) / 2
            y = start_y - (i * line_height)
            canvas.drawString(x, y, line)
        
        canvas.restoreState()
    
    # Create BaseDocTemplate with header and footer space
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=35*mm,  # Extra space for header
        bottomMargin=30*mm,  # Increased space for footer to prevent clipping
    )
    
    # Create frame for content
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        leftPadding=0,
        bottomPadding=0,
        rightPadding=0,
        topPadding=0,
    )
    
    # Create page template with header and footer
    template = PageTemplate(id='contract_page', frames=[frame], onPage=header, onPageEnd=footer)
    doc.addPageTemplates([template])
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.black,
        alignment=TA_CENTER,
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.black,
        spaceAfter=6,
        spaceBefore=12,
    )
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.black,
        alignment=TA_JUSTIFY,
        spaceAfter=6,
    )
    center_style = ParagraphStyle(
        'CustomCenter',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.black,
        alignment=TA_CENTER,
    )
    
    # Build PDF content
    story = []
    
    # Document title (in body, not header)
    story.append(Paragraph(product_name, title_style))
    story.append(Spacer(1, 10*mm))
    
    # Parties
    story.append(Paragraph("La société : <b>" + company_name + "</b>", normal_style))
    story.append(Paragraph("Exerçant sous l'enseigne : <b>" + company_website + "</b>", normal_style))
    story.append(Paragraph("Ayant son siège social : <b>" + company_address + "</b>", normal_style))
    story.append(Paragraph("Représentée à l'acte par son représentant légal domicilié en cette qualité au dit siège.", normal_style))
    story.append(Paragraph("Ci-après dénommée « LA SOCIÉTÉ » d'une part et,", normal_style))
    story.append(Spacer(1, 5*mm))
    
    story.append(Paragraph("Nom : <b>" + investor_name + "</b>", normal_style))
    story.append(Paragraph("Mail : <b>" + investor_email + "</b>", normal_style))
    story.append(Paragraph("Tél : <b>" + investor_phone + "</b>", normal_style))
    story.append(Paragraph("Date de naissance : <b>" + investor_birth_date + "</b>", normal_style))
    story.append(Paragraph("Ci-après dénommée « L'INVESTISSEUR » d'autre part.", normal_style))
    story.append(Spacer(1, 3*mm))
    
    italic_style = ParagraphStyle('Italic', parent=normal_style, fontName='Helvetica-Oblique')
    story.append(Paragraph("CI-APRÈS DÉSIGNÉES ENSEMBLE « LES PARTIES » ET INDIVIDUELLEMENT « LA PARTIE »", italic_style))
    story.append(Spacer(1, 5*mm))
    
    story.append(Paragraph(f"<b>{company_name}</b> est un groupe spécialisé dans l'investissement de produit financier.", normal_style))
    story.append(Paragraph("À cet égard, LA SOCIÉTÉ entend proposer à ses clients qui investissent, une garantie contractuelle de capital initial dans les conditions prévues ci-après.", normal_style))
    story.append(Spacer(1, 5*mm))
    
    # Transition phrase
    story.append(Paragraph("<b>CECI EXPOSÉ, IL EST CONVENU CE QUI SUIT</b>", ParagraphStyle('Transition', parent=normal_style, alignment=TA_CENTER, fontSize=12, spaceAfter=10)))
    story.append(Spacer(1, 5*mm))
    
    # Object
    story.append(Paragraph("1/ OBJET DU PROTOCOLE", heading_style))
    story.append(Paragraph(f"a. Le protocole de garantie « <b>{product_name}</b> » est une garantie contractuelle permettant au souscripteur de l'épargne de récupérer, à la fin du placement, le montant du versement effectué à la souscription ainsi que les intérêts.", normal_style))
    story.append(Spacer(1, 5*mm))
    
    # Duration
    story.append(Paragraph("2/ DURÉE DU CONTRAT", heading_style))
    story.append(Paragraph(f"a. Le présent contrat prend effet à compter du jour de la signature des présentes et ce pour une durée de :<br/><b>{duration_days} {'jours' if duration_days > 1 else 'jour'}</b> avec une rentabilité garantie de <b>{profitability_text}</b>.", normal_style))
    story.append(Paragraph(f"b. La date d'échéance est donc fixée au <b>{contract_end_date_str}</b>.", normal_style))
    story.append(Spacer(1, 5*mm))
    
    # Payment - start on new page to avoid heading isolated at bottom of previous page
    story.append(PageBreak())
    story.append(Paragraph("3/ MODALITÉS DE PAIEMENT", heading_style))
    story.append(Paragraph("a. LA SOCIÉTÉ reconnaîtra la validité du versement comptant et en consentira quittance régulière dès réception du versement.", normal_style))
    story.append(Paragraph(f"b. L'INVESTISSEUR percevra ses intérêts en « <b>{interest_period}</b> ».", normal_style))
    story.append(Spacer(1, 5*mm))
    
    # Summary box
    # Format duration to add "Jours" if it's just a number
    duration_display = duration
    if duration and duration.strip().isdigit():
        duration_display = f"{duration.strip()} Jours"
    elif duration and not any(word.lower() in duration.lower() for word in ['mois', 'jour', 'an', 'année', 'semaine']):
        match = re.search(r'(\d+)', duration)
        if match:
            duration_display = f"{match.group(1)} Jours"
    
    summary_data = [
        ['TITRE', product_name],
        ['DURÉE', duration_display],
        ['RENTABILITÉ', profitability_text],
        ['TOTAL NET', _format_amount_for_contract(amount, contract_currency)],
    ]
    summary_table = Table(summary_data, colWidths=[50*mm, 120*mm])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),  # Make dynamic data bold
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(Paragraph("RÉCAPITULATIF DE VOTRE SOUSCRIPTION", ParagraphStyle('SummaryTitle', parent=heading_style, alignment=TA_CENTER)))
    story.append(Spacer(1, 3*mm))
    story.append(summary_table)
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph("<b>SIGNATURE DE L'INVESTISSEUR :</b>", normal_style))
    story.append(Spacer(1, 3*mm))
    
    # Add signature image if available
    if subscription_signature:
        try:
            # Decode base64 signature
            import base64
            # Remove data URL prefix if present (data:image/png;base64,...)
            signature_data = subscription_signature
            if ',' in signature_data:
                signature_data = signature_data.split(',')[1]
            
            signature_bytes = base64.b64decode(signature_data)
            signature_io = BytesIO(signature_bytes)
            
            # Get signature dimensions
            sig_img = PILImage.open(signature_io)
            sig_width, sig_height = sig_img.size
            # Resize signature to fit (max width 120mm, maintain aspect ratio)
            max_width_mm = 120
            aspect_ratio = sig_width / sig_height
            if sig_width > max_width_mm * 3.779527559:  # Convert mm to pixels (approx)
                sig_width_mm = max_width_mm
                sig_height_mm = sig_width_mm / aspect_ratio
            else:
                sig_width_mm = sig_width / 3.779527559
                sig_height_mm = sig_height / 3.779527559
            
            # Convert to RGB if needed
            if sig_img.mode != 'RGB':
                sig_rgb = PILImage.new('RGB', sig_img.size, (255, 255, 255))
                if sig_img.mode == 'RGBA':
                    sig_rgb.paste(sig_img, mask=sig_img.split()[3])
                else:
                    sig_rgb.paste(sig_img)
                sig_img = sig_rgb
            
            # Save image to a new BytesIO for ImageReader
            signature_io_final = BytesIO()
            sig_img.save(signature_io_final, format='PNG')
            signature_io_final.seek(0)
            
            # Create ImageReader and add to PDF
            sig_img_reader = ImageReader(signature_io_final)
            story.append(Image(sig_img_reader, width=sig_width_mm*mm, height=sig_height_mm*mm))
            story.append(Spacer(1, 3*mm))
        except Exception as e:
            # If signature processing fails, continue without it
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error processing signature image: {str(e)}")
    
    story.append(Paragraph("\" Bon pour accord \"<br/>\" J'accepte les Termes et Conditions \"", normal_style))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(f"Fait le <b>{today_formatted}</b><br/>À : <b>{investor_city}</b>", normal_style))
    story.append(Spacer(1, 5*mm))
    
    # Interest table
    interest_data = [
        ['Date', 'Intérêts payés', 'Performance'],
        [contract_end_date_str, _format_amount_for_contract(interest_amount, contract_currency), f"{profitability_rate:.2f} %"],
    ]
    interest_table = Table(interest_data, colWidths=[60*mm, 60*mm, 50*mm])
    interest_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica-Bold'),  # Make dynamic data bold
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(Paragraph("RÉCAPITULATIF DE VOTRE SOUSCRIPTION", ParagraphStyle('InterestTitle', parent=heading_style, alignment=TA_CENTER)))
    story.append(Spacer(1, 3*mm))
    story.append(interest_table)
    story.append(Spacer(1, 5*mm))
    
    # Terms & Conditions
    if product.cgv:
        story.append(PageBreak())
        story.append(Paragraph("TERMES & CONDITIONS", heading_style))
        # Clean CGV text and convert to paragraphs
        cgv_text = product.cgv.replace('\n\n', '<br/><br/>').replace('\n', '<br/>')
        story.append(Paragraph(cgv_text, ParagraphStyle('CGV', parent=normal_style, fontSize=10)))
    
    # Build PDF
    doc.build(story)
    
    # Get PDF content
    pdf_content = buffer.getvalue()
    buffer.close()
    
    # Create HTTP response
    response = HttpResponse(pdf_content, content_type='application/pdf')
    response['Content-Disposition'] = 'inline; filename="contrat_' + product_name.replace(' ', '_') + '.pdf"'
    return response

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def product_update(request, product_id):
    """Mettre à jour un produit"""
    from datetime import datetime
    
    product = get_object_or_404(Product, id=product_id)
    
    # Store original default value to detect changes
    original_default_value = product.default
    
    if 'name' in request.data:
        product.name = request.data['name']
    if 'reference' in request.data:
        product.reference = request.data['reference']
    if 'type' in request.data:
        # Always update type, even if empty string
        product.type = request.data['type'] or ''
    
    # Handle subcategory: sanitize to remove invalid characters
    if 'subcategory' in request.data:
        product.subcategory = _sanitize_product_subcategory(request.data['subcategory'])
    if 'status' in request.data:
        product.status = request.data['status']
    if 'categoryId' in request.data:
        if request.data['categoryId']:
            try:
                product.category = ProductCategory.objects.get(id=request.data['categoryId'])
            except ProductCategory.DoesNotExist:
                return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            product.category = None
    if 'profitability' in request.data:
        profitability = request.data['profitability']
        # Sauvegarder profitability si une valeur valide est fournie
        # Ne pas écraser avec None sauf si explicitement demandé
        if profitability is not None and profitability != '':
            try:
                profit_float = float(profitability)
                # Sauvegarder même si c'est 0, pour préserver la valeur
                product.profitability = profit_float
            except (ValueError, TypeError):
                # Si la conversion échoue, ne pas modifier la valeur existante
                pass
        # Si profitability est explicitement null/undefined et noProfitability est True, mettre à None
        elif profitability is None:
            no_prof_value = request.data.get('noProfitability', True)
            # Handle both string ('Oui'/'Non') and boolean values
            if isinstance(no_prof_value, str):
                no_prof_value = no_prof_value.lower() in ['oui', 'true', '1']
            else:
                no_prof_value = bool(no_prof_value)
            if no_prof_value:
                product.profitability = None
    if 'duration' in request.data:
        try:
            product.duration = _normalize_duration_value(request.data['duration'])
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    if 'description' in request.data:
        product.description = request.data['description']
    if 'cgv' in request.data:
        product.cgv = request.data['cgv']
    # Handle image upload or removal
    if 'image' in request.FILES:
        try:
            image_file = request.FILES['image']
            # Get file extension
            original_filename = image_file.name
            _, ext = os.path.splitext(original_filename)
            # Create filename with product ID: {product_id}.{ext}
            # Note: upload_to='products/' in model will add the 'products/' prefix automatically
            custom_filename = f'{product_id}{ext}'
            
            print(f"Uploading image: {original_filename} as {custom_filename} for product {product_id}")
            
            # Delete old image if it exists (this clears the field in memory)
            if product.image:
                print(f"Deleting old image: {product.image.name}")
                old_image_name = product.image.name
                product.image.delete(save=False)
                # Clear the field reference
                product.image = None
                # Save to clear the database field
                product.save(update_fields=['image'])
                print(f"Cleared old image from database: {old_image_name}")
            
            # Now save the new image with custom filename - file is uploaded to cloud storage immediately
            # Use save=True to immediately update the database with the new image filename
            # This ensures the image field in the database has the correct filename with extension
            product.image.save(custom_filename, image_file, save=True)
            
            # Log the actual filename stored in the database after save
            print(f"Image saved. Database filename: {product.image.name}")
            print(f"Expected filename: products/{custom_filename}")
            
            # Verify the image was saved and uploaded to storage
            if not product.image:
                return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Verify the file exists in S3 storage
            try:
                storage = product.image.storage
                
                # Check if storage backend is S3
                from api.storage import S3MediaStorage
                if isinstance(storage, S3MediaStorage):
                    # S3 handles uploads automatically and provides URLs
                    # Verify the image URL is accessible
                    try:
                        image_url = product.image.url
                        if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                            print(f"Image successfully uploaded to storage: {product.image.name}")
                            print(f"S3 URL: {image_url[:100]}...")
                        else:
                            print(f"WARNING: Image URL not generated properly: {image_url}")
                    except Exception as url_error:
                        print(f"WARNING: Could not verify storage URL: {str(url_error)}")
                else:
                    print(f"INFO: Storage backend is {type(storage).__name__}")
                    print(f"Image path: {product.image.name}")
                    if product.image:
                        print(f"Image URL: {product.image.url}")
            except Exception as verify_error:
                import traceback
                print(f"Warning: Could not verify image in storage: {str(verify_error)}")
                print(traceback.format_exc())
            
            # Refresh the image field to ensure the URL is updated
            product.refresh_from_db(fields=['image'])
            
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Error uploading image: {error_msg}")
            print(traceback.format_exc())
            return Response({'error': f'Error uploading image: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    elif 'removeImage' in request.data:
        # Handle both string and boolean values
        remove_image = request.data.get('removeImage')
        if isinstance(remove_image, str):
            remove_image = remove_image.lower() == 'true'
        if remove_image:
            # Delete the file if it exists
            if product.image:
                product.image.delete(save=False)
            product.image = None

    # Handle fiche technique (PDF) upload or removal
    if 'technicalSheet' in request.FILES:
        try:
            ts_file = _validate_product_technical_sheet_upload(request.FILES['technicalSheet'])
            custom_ts_name = f'{product_id}_fiche_technique.pdf'
            if product.technical_sheet:
                product.technical_sheet.delete(save=False)
                product.technical_sheet = None
                product.save(update_fields=['technical_sheet'])
            product.technical_sheet.save(custom_ts_name, ts_file, save=True)
            product.refresh_from_db(fields=['technical_sheet'])
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Error uploading technical sheet: {error_msg}")
            print(traceback.format_exc())
            return Response({'error': f'Erreur lors de l\'upload de la fiche technique: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    elif 'removeTechnicalSheet' in request.data:
        remove_ts = request.data.get('removeTechnicalSheet')
        if isinstance(remove_ts, str):
            remove_ts = remove_ts.lower() == 'true'
        if remove_ts:
            if product.technical_sheet:
                product.technical_sheet.delete(save=False)
            product.technical_sheet = None
    
    # Gestion de la rentabilité
    if 'noProfitability' in request.data:
        no_prof_value = request.data['noProfitability']
        # Handle both string ('Oui'/'Non') and boolean values
        if isinstance(no_prof_value, str):
            product.no_profitability = no_prof_value.lower() in ['oui', 'true', '1']
        else:
            product.no_profitability = bool(no_prof_value)
    if 'isVariableProfitability' in request.data:
        is_var_prof = request.data['isVariableProfitability']
        # Ensure it's always 'Oui' or 'Non', default to 'Non' if empty or invalid
        if is_var_prof and is_var_prof.strip() in ['Oui', 'Non']:
            product.is_variable_profitability = is_var_prof.strip()
        else:
            product.is_variable_profitability = 'Non'
    if 'variableProfitability' in request.data:
        product.variable_profitability = request.data['variableProfitability']
    if 'profitabilityPeriod' in request.data:
        product.profitability_period = request.data['profitabilityPeriod'] if request.data['profitabilityPeriod'] else ''
    if 'interestPeriod' in request.data:
        interest_period_value = request.data['interestPeriod']
        # Trim whitespace and save, or empty string if None/empty
        if interest_period_value:
            product.interest_period = str(interest_period_value).strip()
        else:
            product.interest_period = ''
    # Gestion du produit
    if 'availabilityStart' in request.data:
        if request.data['availabilityStart']:
            try:
                product.availability_start = datetime.strptime(request.data['availabilityStart'], '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass
        else:
            product.availability_start = None
    if 'availabilityEnd' in request.data:
        if request.data['availabilityEnd']:
            try:
                product.availability_end = datetime.strptime(request.data['availabilityEnd'], '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass
        else:
            product.availability_end = None
    if 'linkToAssets' in request.data:
        product.link_to_assets = request.data['linkToAssets']
    
    # Gestion des prix
    if 'minEntryValue' in request.data:
        min_entry = request.data['minEntryValue']
        product.min_entry_value = float(min_entry) if min_entry is not None and min_entry != '' else None
    if 'maxEntryValue' in request.data:
        max_entry = request.data['maxEntryValue']
        product.max_entry_value = float(max_entry) if max_entry is not None and max_entry != '' else None
    if 'default' in request.data:
        # Handle default field - support both string and boolean
        default_value = request.data['default']
        if isinstance(default_value, str):
            product.default = default_value.strip().lower() in ['oui', 'true', '1', 'yes']
        else:
            product.default = bool(default_value)
    if 'availableFunds' in request.data:
        # Handle available_funds field - support both string and boolean
        v = request.data['availableFunds']
        if isinstance(v, str):
            product.available_funds = v.strip().lower() in ['oui', 'true', '1', 'yes']
        else:
            product.available_funds = bool(v)
    
    # Handle product-asset allocations (assetAllocations)
    try:
        final_link_to_assets = product.link_to_assets
        raw_allocations = request.data.get('assetAllocations', None)

        def _parse_allocations(raw):
            if raw is None or raw == '':
                return None
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except Exception:
                    raise ValueError("assetAllocations doit être un JSON valide (liste).")
            if not isinstance(raw, list):
                raise ValueError("assetAllocations doit être une liste.")
            cleaned = []
            for idx, item in enumerate(raw):
                if not isinstance(item, dict):
                    raise ValueError(f"assetAllocations[{idx}] doit être un objet.")
                asset_id = (item.get('assetId') or item.get('asset_id') or '').strip() if item.get('assetId') or item.get('asset_id') else ''
                if not asset_id:
                    raise ValueError(f"assetAllocations[{idx}].assetId est requis.")
                proportion_raw = item.get('proportion', None)
                if proportion_raw is None or proportion_raw == '':
                    raise ValueError(f"assetAllocations[{idx}].proportion est requis.")
                try:
                    proportion = Decimal(str(proportion_raw))
                except (InvalidOperation, ValueError, TypeError):
                    raise ValueError(f"assetAllocations[{idx}].proportion invalide.")
                cleaned.append((asset_id, proportion))
            return cleaned

        def _validate_and_normalize(cleaned):
            if not cleaned:
                raise ValueError("Veuillez ajouter au moins un actif et une proportion.")
            asset_ids = [a for a, _ in cleaned]
            if len(set(asset_ids)) != len(asset_ids):
                raise ValueError("Un actif ne peut être sélectionné qu'une seule fois.")
            total = Decimal('0')
            normalized = []
            for asset_id, proportion in cleaned:
                if proportion < 0 or proportion > 100:
                    raise ValueError("La proportion doit être comprise entre 0 et 100.")
                total += proportion
                normalized.append((asset_id, proportion.quantize(Decimal('0.01'))))
            if (total - Decimal('100')).copy_abs() > Decimal('0.01'):
                raise ValueError("La somme des proportions doit être égale à 100%.")

            existing_assets = set(Asset.objects.filter(id__in=asset_ids).values_list('id', flat=True))
            missing = [a for a in asset_ids if a not in existing_assets]
            if missing:
                raise ValueError("Actif(s) introuvable(s): " + ", ".join(missing))
            return normalized

        if final_link_to_assets != 'Oui':
            # If not linked, force-clear allocations
            ProductAssetAllocation.objects.filter(product=product).delete()
        else:
            parsed = _parse_allocations(raw_allocations)
            if parsed is None:
                # If linking is enabled but allocations aren't provided, keep existing if any;
                # otherwise require them (e.g., toggled from Non -> Oui)
                if not ProductAssetAllocation.objects.filter(product=product).exists():
                    raise ValueError("assetAllocations est requis quand 'Lie le produit à des actifs' = Oui.")
            else:
                normalized = _validate_and_normalize(parsed)
                ProductAssetAllocation.objects.filter(product=product).delete()
                assets_by_id = {a.id: a for a in Asset.objects.filter(id__in=[aid for aid, _ in normalized])}
                for asset_id, proportion in normalized:
                    alloc_id = uuid.uuid4().hex[:12]
                    while ProductAssetAllocation.objects.filter(id=alloc_id).exists():
                        alloc_id = uuid.uuid4().hex[:12]
                    ProductAssetAllocation.objects.create(
                        id=alloc_id,
                        product=product,
                        asset=assets_by_id[asset_id],
                        proportion=proportion,
                    )
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # Save the product with all updates
    # Note: If image was uploaded, it was already saved with save=True above
    product.save()
    
    # Refresh from database to get auto-updated fields (like updated_at timestamp)
    # and ensure we have the latest state including any database-level defaults or triggers
    product.refresh_from_db()
    
    # Handle default field changes: add/remove product from all clients accordingly
    # Check if default field was updated in this request
    default_was_updated = 'default' in request.data
    if default_was_updated:
        from django.db import IntegrityError
        
        # If product changed from default=True to default=False, remove from all clients
        if original_default_value and not product.default:
            # Remove ClientProducts for this product from all clients
            ClientProduct.objects.filter(product=product).delete()
        
        # If product is now default=True, ensure it's added to all existing clients
        elif product.default:
            all_clients = Client.objects.all()
            for client in all_clients:
                # Check if client already has this product (safety check)
                if not ClientProduct.objects.filter(client=client, product=product).exists():
                    client_product_id = uuid.uuid4().hex[:12]
                    while ClientProduct.objects.filter(id=client_product_id).exists():
                        client_product_id = uuid.uuid4().hex[:12]
                    try:
                        ClientProduct.objects.create(
                            id=client_product_id,
                            client=client,
                            product=product
                        )
                    except IntegrityError:
                        # Another request created this relationship concurrently, skip it
                        pass
    elif product.default:
        # If default field wasn't updated but product is still default=True,
        # ensure it's added to all existing clients (for new clients or if it was missed before)
        from django.db import IntegrityError
        all_clients = Client.objects.all()
        for client in all_clients:
            # Check if client already has this product (safety check)
            if not ClientProduct.objects.filter(client=client, product=product).exists():
                client_product_id = uuid.uuid4().hex[:12]
                while ClientProduct.objects.filter(id=client_product_id).exists():
                    client_product_id = uuid.uuid4().hex[:12]
                try:
                    ClientProduct.objects.create(
                        id=client_product_id,
                        client=client,
                        product=product
                    )
                except IntegrityError:
                    # Another request created this relationship concurrently, skip it
                    pass
    
    serializer = ProductSerializer(product, context={'request': request})
    return Response(serializer.data)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def product_delete(request, product_id):
    """Supprimer un produit"""
    from .position_audit import position_deletion_audit

    product = get_object_or_404(Product, id=product_id)
    with position_deletion_audit('orm_cascade_product'):
        product.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_toggle_active(request, product_id):
    """Activer/Désactiver un produit"""
    product = get_object_or_404(Product, id=product_id)
    # Toggle between 'Actif' and 'Inactif' status
    if product.status == 'Actif':
        product.status = 'Inactif'
    elif product.status == 'Inactif':
        product.status = 'Actif'
    # If status is 'Brouillon', set to 'Actif'
    else:
        product.status = 'Actif'
    product.save()
    serializer = ProductSerializer(product)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_duplicate(request, product_id):
    """Dupliquer un produit"""
    original_product = get_object_or_404(Product, id=product_id)
    
    # Generate new product ID
    new_product_id = uuid.uuid4().hex[:12]
    while Product.objects.filter(id=new_product_id).exists():
        new_product_id = uuid.uuid4().hex[:12]
    
    # Create new product with copied fields
    # Append " (Copie)" to the name
    new_name = f"{original_product.name} (Copie)"
    
    # Create the duplicated product
    duplicated_product = Product.objects.create(
        id=new_product_id,
        name=new_name,
        reference=original_product.reference,
        type=original_product.type,
        category=original_product.category,
        subcategory=original_product.subcategory,
        status='Brouillon',  # Set to draft status
        profitability=original_product.profitability,
        duration=original_product.duration,
        description=original_product.description,
        cgv=original_product.cgv,
        # Gestion de la rentabilité
        no_profitability=original_product.no_profitability,
        is_variable_profitability=original_product.is_variable_profitability,
        variable_profitability=original_product.variable_profitability,
        profitability_period=original_product.profitability_period,
        interest_period=original_product.interest_period,
        # Gestion du produit
        availability_start=original_product.availability_start,
        availability_end=original_product.availability_end,
        link_to_assets=original_product.link_to_assets,
        # Gestion des prix
        min_entry_value=original_product.min_entry_value,
        max_entry_value=original_product.max_entry_value,
        default=False,
        available_funds=original_product.available_funds,
    )
    
    # Copy image if it exists
    if original_product.image:
        try:
            # Get the original image file
            original_image = original_product.image
            # Get file extension from original filename
            original_filename = original_image.name
            _, ext = os.path.splitext(original_filename)
            
            # Create new filename with new product ID
            new_filename = f'{new_product_id}{ext}'
            
            # Copy the image file
            # For S3 storage, we need to read the original and save it as new
            if original_image.storage.exists(original_image.name):
                # Open the original image file
                with original_image.open('rb') as original_file:
                    # Save it with the new filename
                    duplicated_product.image.save(new_filename, original_file, save=True)
        except Exception as e:
            # Log error but don't fail the duplication
            print(f"Warning: Could not copy image for product {new_product_id}: {str(e)}")
            import traceback
            print(traceback.format_exc())

    # Copy technical sheet (PDF) if it exists
    if original_product.technical_sheet:
        try:
            original_ts = original_product.technical_sheet
            new_ts_name = f'{new_product_id}_fiche_technique.pdf'
            if original_ts.storage.exists(original_ts.name):
                with original_ts.open('rb') as original_file:
                    duplicated_product.technical_sheet.save(new_ts_name, original_file, save=True)
        except Exception as e:
            print(f"Warning: Could not copy technical sheet for product {new_product_id}: {str(e)}")
            import traceback
            print(traceback.format_exc())

    # Copy ProductAssetAllocation entries if link_to_assets is 'Oui'
    if original_product.link_to_assets == 'Oui':
        try:
            original_allocations = ProductAssetAllocation.objects.filter(product=original_product)
            for original_alloc in original_allocations:
                alloc_id = uuid.uuid4().hex[:12]
                while ProductAssetAllocation.objects.filter(id=alloc_id).exists():
                    alloc_id = uuid.uuid4().hex[:12]
                ProductAssetAllocation.objects.create(
                    id=alloc_id,
                    product=duplicated_product,
                    asset=original_alloc.asset,
                    proportion=original_alloc.proportion,
                )
        except Exception as e:
            # Log error but don't fail the duplication
            print(f"Warning: Could not copy asset allocations for product {new_product_id}: {str(e)}")
            import traceback
            print(traceback.format_exc())
    
    # Refresh from database to get auto-updated fields
    duplicated_product.refresh_from_db()
    
    serializer = ProductSerializer(duplicated_product, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)

# AI Generation endpoints
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_generate_description(request):
    """Générer une description de produit avec l'IA Gemini"""
    try:
        from google import genai
        
        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        
        name = request.data.get('name', '')
        category_id = request.data.get('categoryId', '')
        product_type = request.data.get('type', '')
        reference = request.data.get('reference', '')
        subcategory = request.data.get('subcategory', [])
        min_entry_value = request.data.get('minEntryValue', '')
        max_entry_value = request.data.get('maxEntryValue', '')
        profitability = request.data.get('profitability', '')
        no_profitability = request.data.get('noProfitability', True)
        if isinstance(no_profitability, str):
            no_profitability = no_profitability.lower() in ('oui', 'true', '1', 'yes')
        is_variable_profitability = request.data.get('isVariableProfitability', 'Non').strip()
        profitability_rate = request.data.get('profitabilityRate', '')
        profitability_min = request.data.get('profitabilityMin', '')
        profitability_max = request.data.get('profitabilityMax', '')
        duration = request.data.get('duration', '')
        profitability_period = request.data.get('profitabilityPeriod', '')
        interest_period = request.data.get('interestPeriod', [])
        available_funds = request.data.get('availableFunds', False)
        if isinstance(available_funds, str):
            available_funds = available_funds.lower() in ('oui', 'true', '1', 'yes')
        availability_start = request.data.get('availabilityStart', '')
        availability_end = request.data.get('availabilityEnd', '')
        existing_description = (request.data.get('existingDescription') or request.data.get('description') or '').strip()
        is_improve_mode = bool(existing_description)
        user_prompt_raw = (request.data.get('userPrompt') or request.data.get('aiUserPrompt') or '').strip()
        if len(user_prompt_raw) > 6000:
            user_prompt_raw = user_prompt_raw[:6000]
        
        # Get category name if available
        category_name = ''
        if category_id:
            try:
                category = ProductCategory.objects.get(id=category_id)
                category_name = category.title
            except ProductCategory.DoesNotExist:
                pass
        
        # Format interest period (périodes de rentabilité disponibles)
        interest_period_str = ', '.join(interest_period) if isinstance(interest_period, list) and interest_period else (interest_period if isinstance(interest_period, str) else '')
        
        # Format duration (vide = durée indéterminée) — jours seuls si ≤ 30, sinon jours + équivalent mois
        duration_clean = (str(duration) or '').strip()
        if not duration_clean:
            duration_str = 'durée indéterminée'
        elif duration_clean.isdigit():
            d_int = int(duration_clean)
            if d_int <= 30:
                duration_str = f'{d_int} jour{"s" if d_int != 1 else ""}'
            else:
                months_equiv = max(1, round(d_int / 30))
                duration_str = f'{d_int} jours (soit environ {months_equiv} mois)'
        else:
            duration_str = duration_clean
        
        # Rentabilité: variable ou fixe
        if no_profitability:
            rentability_str = "non applicable"
        elif is_variable_profitability == 'Oui' and profitability_min and profitability_max:
            rentability_str = f"{profitability_min}% à {profitability_max}%"
        elif profitability_rate:
            rentability_str = f"{profitability_rate}%"
        else:
            rentability_str = profitability or "à définir"
        
        subcategory_str = ', '.join(subcategory) if isinstance(subcategory, list) and subcategory else (subcategory if isinstance(subcategory, str) else '')
        max_invest_str = f"{max_entry_value}€" if max_entry_value else "sans plafond"
        funds_str = "Oui" if available_funds else "Non"
        availability_str = ""
        if availability_start or availability_end:
            availability_str = f"Disponible du {availability_start or 'Aucun'} au {availability_end or 'Aucun'}"
        
        user_prompt_block = ''
        if user_prompt_raw:
            user_prompt_block = f"""

--- INSTRUCTIONS / CONTEXTE FOURNI PAR LE RÉDACTEUR (à intégrer fidèlement dans le fond, sans inventer de chiffres) ---
{user_prompt_raw}
--- FIN DU CONTEXTE RÉDACTEUR ---"""

        product_info_block = f"""- Nom: {name or 'Non spécifié'}
- Type: {product_type or 'Non spécifié'}
- Référence: {reference or 'Non spécifiée'}
- Catégorie: {category_name or 'Non spécifiée'}
- Sous-catégories: {subcategory_str or 'Non spécifiées'}
- Investissement minimum: {min_entry_value or 'Non spécifié'}€
- Plafond de souscription: {max_invest_str}
- Durée: {duration_str}
- Rentabilité: {rentability_str}
- Période de rentabilité: {profitability_period or 'Non spécifiée'}
- Périodes d'intérêt disponibles: {interest_period_str or 'Non spécifiées'}
- Fonds disponibles: {funds_str}
{f'- Période de disponibilité: {availability_str}' if availability_str else ''}{user_prompt_block}"""

        length_guidance = """- Longueur: développe le texte sur plusieurs paragraphes courts (viser environ 8 à 15 phrases au total, ou plus si le contexte rédacteur est riche). Ne te limite pas à quelques phrases: reste clair, sans répétitions inutiles.
- Si un contexte rédacteur est fourni, exploite-le pour enrichir le propos (cible, risques, garanties, secteur, modalités) tout en restant cohérent avec les données chiffrées ci-dessus."""

        if is_improve_mode:
            prompt = f"""Tu dois AMÉLIORER la description de produit existante ci-dessous en utilisant TOUTES les informations produit fournies. Mets à jour les valeurs (durée, rentabilité, plafonds, etc.) avec les données exactes. Conserve le ton professionnel. Pas de #, *, - ou puces. Texte pur.

{product_info_block}

--- DESCRIPTION EXISTANTE À AMÉLIORER ---

{existing_description}

--- FIN DE LA DESCRIPTION EXISTANTE ---

{length_guidance}

Génère la description améliorée (remplace entièrement par la version améliorée):"""
        else:
            prompt = f"""Génère une description professionnelle et attrayante en français pour un produit d'investissement financier avec les caractéristiques suivantes:

{product_info_block}

La description doit être:
- Professionnelle et rassurante
- Mise en avant des avantages pour l'investisseur
{length_guidance}
- En français
- Sans caractères spéciaux de formatage (pas de markdown)
- INTERDICTION ABSOLUE d'utiliser des symboles spéciaux:
  * PAS de # (dièse/hashtag)
  * PAS de * (astérisque) - JAMAIS utiliser le symbole * dans le texte
  * PAS de - utilisé comme puce ou séparateur
  * PAS de symboles décoratifs ou de formatage
- Texte pur, sans puces ni listes à puces

Description:"""
        
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        description = (response.text or '').strip()
        
        # Nettoyer les symboles spéciaux indésirables
        import re
        # Supprimer TOUS les symboles "*" du texte (peu importe leur position)
        description = re.sub(r'\*+', '', description)  # Supprimer tous les astérisques
        # Supprimer les # restants
        description = re.sub(r'#+', '', description)
        # Supprimer les lignes de séparation ---
        description = re.sub(r'^---+$', '', description, flags=re.MULTILINE)
        # Nettoyer les espaces multiples créés par la suppression
        description = re.sub(r' {2,}', ' ', description)
        # Nettoyer les lignes vides multiples
        description = re.sub(r'\n{3,}', '\n\n', description).strip()
        
        return Response({'description': description, 'text': description})
    
    except ImportError:
        return Response(
            {'error': 'google-genai package not installed. Run: pip install google-genai'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Error generating description: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_generate_banner_message(request, client_id):
    """Proposer un texte de bannière (plateforme client) avec Gemini — réservé aux gestionnaires."""
    crm_client = get_object_or_404(Client, id=client_id)
    err = _check_gestionnaire_client_access(request, crm_client)
    if err:
        return err
    try:
        from google import genai

        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        genai_client = genai.Client(api_key=settings.GEMINI_API_KEY)

        user_prompt_raw = (request.data.get('userPrompt') or request.data.get('aiUserPrompt') or '').strip()
        if len(user_prompt_raw) > 4000:
            user_prompt_raw = user_prompt_raw[:4000]

        existing = (
            (request.data.get('existingMessage') or request.data.get('bannerMessage') or '')
            .strip()
        )

        display_name = f'{crm_client.fname or ""} {crm_client.lname or ""}'.strip() or 'Client'
        civility = (crm_client.civility or '').strip()
        account_currency = getattr(crm_client, 'account_currency', '') or 'EUR'

        user_block = ''
        if user_prompt_raw:
            user_block = f"""

--- Consignes / contexte fourni par le gestionnaire ---
{user_prompt_raw}
--- Fin du contexte ---"""

        improve_block = ''
        if existing:
            improve_block = f"""

--- Message actuel (à améliorer ou remplacer; conserve l’esprit si pertinent) ---
{existing}
--- Fin du message actuel ---"""

        prompt = f"""Tu rédiges un court message en français pour une bannière informative en haut de l’espace client d’une plateforme d’investissement / gestion de patrimoine.

Informations sur le destinataire (ne pas citer de données sensibles inutilement; ton professionnel et bienveillant):
- Identité affichée (référence): {civility or '—'} {display_name}
- Devise du compte: {account_currency}
{user_block}{improve_block}

Contraintes:
- Texte court adapté à une bannière lisible en un coup d’œil: viser 2 à 4 phrases courtes OU environ 250 à 450 caractères au total (pas de pavé).
- Ton: clair, rassurant, professionnel; vouvoiement « vous ».
- Pas de markdown, pas de #, pas d’astérisques *, pas de listes à puces ni numérotation.
- Pas de guillemets englobant tout le message.
- Une seule idée principale par phrase si possible.

Génère uniquement le texte de la bannière, rien d’autre:"""

        response = genai_client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        text = (response.text or '').strip()

        import re

        text = re.sub(r'\*+', '', text)
        text = re.sub(r'#+', '', text)
        text = re.sub(r'^---+$', '', text, flags=re.MULTILINE)
        text = re.sub(r' {2,}', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text).strip()
        if len(text) > 2000:
            text = text[:2000].rstrip()

        return Response({'description': text, 'text': text})
    except ImportError:
        return Response(
            {'error': 'google-genai package not installed. Run: pip install google-genai'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception as e:
        return Response(
            {'error': f'Error generating banner text: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asset_generate_description(request):
    """Générer une description d'actif (entreprise/crypto) avec l'IA Gemini"""
    try:
        from google import genai

        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        name = request.data.get('name', '')
        symbol = request.data.get('symbol', '')
        asset_type = request.data.get('type', '')
        exchange = request.data.get('exchange', '')
        currency = request.data.get('currency', '')
        region = request.data.get('region', '')
        sector = request.data.get('sector', '')
        industry = request.data.get('industry', '')
        country = request.data.get('country', '')

        prompt = f"""Rédige une description professionnelle et attrayante en français pour un actif financier (action/ETF/crypto), destinée à une plateforme d'investissement.

Contexte:
- Nom: {name or 'Non spécifié'}
- Symbole: {symbol or 'Non spécifié'}
- Type: {asset_type or 'Non spécifié'}
- Marché/Exchange: {exchange or 'Non spécifié'}
- Devise: {currency or 'Non spécifiée'}
- Région: {region or 'Non spécifiée'}
- Pays: {country or 'Non spécifié'}
- Secteur: {sector or 'Non spécifié'}
- Industrie: {industry or 'Non spécifiée'}

Contraintes:
- 3 à 5 phrases
- Ton clair, pédagogique et rassurant
- En français
- Sans markdown ni puces
- Ne pas inventer de chiffres précis (ex: CA, bénéfices) si non fournis
- INTERDICTION ABSOLUE d'utiliser des symboles spéciaux:
  * PAS de # (dièse/hashtag)
  * PAS de * (astérisque) - JAMAIS utiliser le symbole * dans le texte
  * PAS de - utilisé comme puce ou séparateur
  * PAS de symboles décoratifs ou de formatage
- Texte pur, sans puces ni listes à puces

Description:"""

        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        description = (response.text or '').strip()

        # Nettoyer les symboles spéciaux indésirables
        import re
        # Supprimer TOUS les symboles "*" du texte (peu importe leur position)
        description = re.sub(r'\*+', '', description)  # Supprimer tous les astérisques
        # Supprimer les # restants
        description = re.sub(r'#+', '', description)
        # Supprimer les lignes de séparation ---
        description = re.sub(r'^---+$', '', description, flags=re.MULTILINE)
        # Nettoyer les espaces multiples créés par la suppression
        description = re.sub(r' {2,}', ' ', description)
        # Nettoyer les lignes vides multiples
        description = re.sub(r'\n{3,}', '\n\n', description).strip()

        return Response({'description': description, 'text': description})

    except ImportError:
        return Response(
            {'error': 'google-genai package not installed. Run: pip install google-genai'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Error generating description: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def message_reformulate(request):
    """Reformuler et corriger un message avant envoi avec l'IA Gemini"""
    try:
        from google import genai

        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        message = (request.data.get('message') or '').strip()
        if not message:
            return Response({'error': 'Message requis'}, status=status.HTTP_400_BAD_REQUEST)

        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        prompt = f"""Tu es un assistant qui aide à reformuler et corriger des messages professionnels en français.

Le message suivant doit être reformulé et corrigé (orthographe, grammaire, ponctuation, clarté).
Conserve le sens et le ton du message. Garde un style professionnel et courtois adapté à une messagerie client/gestionnaire.

Message à reformuler:
---
{message}
---

Réponds UNIQUEMENT avec le texte reformulé, sans introduction ni commentaire. Pas de guillemets autour du résultat."""

        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        text = (response.text or '').strip()

        # Nettoyer les guillemets éventuels autour du résultat
        if text.startswith('"') and text.endswith('"'):
            text = text[1:-1]
        if text.startswith("'") and text.endswith("'"):
            text = text[1:-1]

        return Response({'text': text})

    except ImportError:
        return Response(
            {'error': 'google-genai package not installed. Run: pip install google-genai'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Erreur lors de la reformulation: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_generate_cgv(request):
    """Générer des CGV (Conditions Générales de Vente) avec l'IA Gemini"""
    try:
        from google import genai
        
        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        
        # Récupérer les champs essentiels
        name = request.data.get('name', '').strip() or 'd\'investissement'
        min_entry_value = request.data.get('minEntryValue', '').strip()
        max_entry_value = request.data.get('maxEntryValue', '').strip()
        duration = request.data.get('duration', '').strip()
        no_profitability = request.data.get('noProfitability', True)
        if isinstance(no_profitability, str):
            no_profitability = no_profitability.lower() in ('oui', 'true', '1', 'yes')
        profitability_rate = request.data.get('profitabilityRate', '').strip()
        profitability_min = request.data.get('profitabilityMin', '').strip()
        profitability_max = request.data.get('profitabilityMax', '').strip()
        is_variable_profitability = request.data.get('isVariableProfitability', 'Non').strip()
        profitability_period = request.data.get('profitabilityPeriod', '').strip()
        interest_period = request.data.get('interestPeriod', [])
        available_funds = request.data.get('availableFunds', False)
        if isinstance(available_funds, str):
            available_funds = available_funds.lower() in ('oui', 'true', '1', 'yes')
        availability_start = request.data.get('availabilityStart', '').strip()
        availability_end = request.data.get('availabilityEnd', '').strip()
        
        # Construire le texte de rentabilité
        if no_profitability:
            rentability_text = "non applicable"
        elif is_variable_profitability == 'Oui' and profitability_min and profitability_max:
            rentability_text = f"{profitability_min}% à {profitability_max}%"
        elif profitability_rate:
            rentability_text = f"{profitability_rate}%"
        else:
            rentability_text = "à définir"
        
        # Format duration with months (vide = durée indéterminée)
        duration_clean = (str(duration) or '').strip()
        duration_str = 'durée indéterminée' if not duration_clean else (
            f"{int(duration_clean)} jours ({round(int(duration_clean) / 30)} mois)" if duration_clean.isdigit() else duration_clean
        )
        
        # Format interest period (périodes de rentabilité disponibles)
        interest_period_str = ', '.join(interest_period) if isinstance(interest_period, list) and interest_period else (interest_period if isinstance(interest_period, str) else 'à définir')
        
        funds_str = "Oui" if available_funds else "Non"
        availability_str = ""
        if availability_start or availability_end:
            availability_str = f"Du {availability_start or 'Aucun'} au {availability_end or 'Aucun'}"
        
        existing_cgv = (request.data.get('existingCgv') or request.data.get('cgv') or '').strip()
        is_improve_mode = bool(existing_cgv)
        
        product_info_block = f"""Informations du produit:
- Investissement minimum: {min_entry_value or 'à définir'}€
- Plafond de souscription (investissement maximum): {max_entry_value or 'à définir'}€ (ou "sans plafond" si vide)
- Durée du contrat: {duration_str}
- Rentabilité: {rentability_text}
- Période de rentabilité: {profitability_period or 'à définir'}
- Périodes d'intérêt disponibles (versement des intérêts): {interest_period_str}
- Fonds disponibles: {funds_str}
{f'- Période de disponibilité du produit: {availability_str}' if availability_str else ''}

Structure (14 sections obligatoires, toutes complètes):
1. Objet
2. Versement (2.1 Montant min/max, 2.2 Modalités)
3. Durée (3.1 Engagement, 3.2 Blocage, 3.3 Retrait)
4. Rémunération (4.1 Taux, 4.2 Période, 4.3 Versement)
5. Frais de Gestion (5.1 Frais, 5.2 Prélèvement)
6. Clôture (6.1 Échéance, 6.2 Transfert)
7. Fiscalité (7.1 Applicable, 7.2 Responsabilité)
8. Risques (8.1 Description, 8.2 Garanties)
9. Modification (9.1 Droit, 9.2 Notification)
10. Loi applicable (10.1 Droit français, 10.2 Juridiction)
11. Décès (11.1 Modalités, 11.2 Ayants droit)
12. Confidentialité (12.1 Engagement, 12.2 RGPD)
13. LCB/FT (13.1 Obligations, 13.2 Engagement titulaire)
14. Réclamations (14.1 Procédure, 14.2 Médiation)

Règles:
- Utiliser EXACTEMENT les valeurs fournies ci-dessus (durée, rentabilité, périodes, fonds disponibles, plafond) dans les sections concernées
- Section 3 Durée: si "durée indéterminée", préciser que la durée du contrat est indéterminée; sinon mentionner la durée en jours et mois
- Section 4 Rémunération: intégrer la période de rentabilité et les périodes d'intérêt disponibles
- Mentionner si les fonds sont disponibles ou non selon l'information fournie
- Chaque sous-section: 2-3 phrases minimum
- Pas de placeholders [ ], pas de symboles #, *, -
- Texte professionnel et juridique français
- Document complet et utilisable directement
- Environ 500-700 mots au total"""

        if is_improve_mode:
            prompt = f"""Tu dois AMÉLIORER et COMPLÉTER le texte de Conditions Générales de Vente existant ci-dessous pour le produit "{name}".

Utilise les informations produit fournies pour corriger, enrichir et aligner le texte existant. Conserve la structure et le style du document, mais mets à jour toutes les valeurs (durée, rentabilité, plafonds, etc.) avec les données exactes fournies. Ajoute les sections manquantes si nécessaire.

{product_info_block}

--- TEXTE EXISTANT À AMÉLIORER ---

{existing_cgv}

--- FIN DU TEXTE EXISTANT ---

Génère le document CGV complet et amélioré (remplace entièrement le texte existant par la version améliorée):"""
        else:
            prompt = f"""Génère des Conditions Générales de Vente en français pour le produit "{name}".

{product_info_block}

Génère le document complet:"""
        
        # Génération simple
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        
        cgv = (response.text or '').strip()
        
        # Nettoyage simplifié
        import re
        cgv = re.sub(r'\[.*?\]', '', cgv)  # Supprimer placeholders
        cgv = re.sub(r'\*+', '', cgv)  # Supprimer astérisques
        cgv = re.sub(r'#+', '', cgv)  # Supprimer dièses
        cgv = re.sub(r'^---+$', '', cgv, flags=re.MULTILINE)  # Supprimer lignes de séparation
        cgv = re.sub(r' {2,}', ' ', cgv)  # Nettoyer espaces multiples
        cgv = re.sub(r'\n{3,}', '\n\n', cgv).strip()  # Nettoyer lignes vides
        
        return Response({'cgv': cgv, 'text': cgv})
    
    except ImportError:
        return Response(
            {'error': 'google-genai package not installed. Run: pip install google-genai'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Error generating CGV: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

# App Settings endpoints
@api_view(['GET', 'POST', 'PUT'])
@authentication_classes([])  # Disable authentication - avoid 401 on non-JWT Bearer tokens (e.g. client tokens)
@permission_classes([AllowAny])  # Allow public access, we'll check auth manually for POST/PUT
@parser_classes([MultiPartParser, FormParser, JSONParser])
def app_settings(request):
    """Get or update app settings (logo and colors)"""
    media_key_prefix = (getattr(settings, 'MEDIA_KEY_PREFIX', '') or '').strip('/')

    def app_settings_object_key(filename: str) -> str:
        base_path = f'app_settings/{filename.lstrip("/")}'
        return f'{media_key_prefix}/{base_path}' if media_key_prefix else base_path

    def save_app_settings_image(field_name: str, uploaded_file, target_filename: str) -> None:
        from django.core.files.base import ContentFile

        field_file = getattr(settings_obj, field_name)

        if field_file:
            field_file.delete(save=False)

        try:
            uploaded_file.seek(0)
        except Exception:
            pass

        object_key = app_settings_object_key(target_filename)
        saved_name = field_file.storage.save(object_key, ContentFile(uploaded_file.read()))
        setattr(settings_obj, field_name, saved_name)
        settings_obj.save(update_fields=[field_name, 'updated_at'])

    # Require authentication for POST/PUT, but allow GET without authentication
    if request.method in ['POST', 'PUT']:
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

        # Clients should not update global app settings
        if token.startswith('client_'):
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

        # Validate JWT manually
        if auth_header.startswith('Bearer ') and token:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            jwt_auth = JWTAuthentication()
            try:
                validated_token = jwt_auth.get_validated_token(token)
                user = jwt_auth.get_user(validated_token)
                if user and user.is_authenticated:
                    request.user = user
            except Exception:
                return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        if not getattr(request, 'user', None) or not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        # Get or create settings (singleton pattern)
        settings_obj, created = AppSettings.objects.get_or_create(
            id='settings001',  # Single settings instance
            defaults={
                'platform_name': 'Panorama',
                'address': '',
                'website': '',
                'email': '',
                'primary_color': '#030213',
                'secondary_color': '',
                'accent_color': '',
                'otp_email_enabled': True,
                'otp_sms_enabled': True,
            }
        )
        
        if request.method == 'GET':
            try:
                serializer = AppSettingsSerializer(settings_obj, context={'request': request})
                return Response(serializer.data)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error serializing app settings: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                # Return basic settings even if serialization fails
                return Response({
                    'id': settings_obj.id,
                    'platform_name': getattr(settings_obj, 'platform_name', 'Panorama'),
                    'address': getattr(settings_obj, 'address', ''),
                    'website': getattr(settings_obj, 'website', ''),
                    'email': getattr(settings_obj, 'email', ''),
                    'legal_form': getattr(settings_obj, 'legal_form', ''),
                    'share_capital': getattr(settings_obj, 'share_capital', ''),
                    'siren': getattr(settings_obj, 'siren', ''),
                    'siret': getattr(settings_obj, 'siret', ''),
                    'rcs': getattr(settings_obj, 'rcs', ''),
                    'vat_number': getattr(settings_obj, 'vat_number', ''),
                    'publication_director': getattr(settings_obj, 'publication_director', ''),
                    'hosting_provider': getattr(settings_obj, 'hosting_provider', ''),
                    'dpo_contact': getattr(settings_obj, 'dpo_contact', ''),
                    'consumer_mediator': getattr(settings_obj, 'consumer_mediator', ''),
                    'regulatory_mentions': getattr(settings_obj, 'regulatory_mentions', ''),
                    'company_country': getattr(settings_obj, 'company_country', 'FR') or 'FR',
                    'logo': None,
                    'logo_url': None,
                    'favicon': None,
                    'favicon_url': None,
                    'login_background_image': None,
                    'login_background_image_url': None,
                    'platform_banner_image': None,
                    'platform_banner_image_url': None,
                    'primary_color': settings_obj.primary_color or '#030213',
                    'secondary_color': settings_obj.secondary_color or '',
                    'accent_color': settings_obj.accent_color or '',
                    'otp_email_enabled': getattr(settings_obj, 'otp_email_enabled', True),
                    'otp_sms_enabled': getattr(settings_obj, 'otp_sms_enabled', True),
                    'created_at': settings_obj.created_at,
                    'updated_at': settings_obj.updated_at,
                    'error': f'Error loading logo: {str(e)}'
                })
        
        elif request.method in ['POST', 'PUT']:
            # Handle FormData for file uploads
            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            
            # Track which file fields were uploaded so we can include them in update_fields
            uploaded_file_fields = []
            
            # Handle logo removal
            if data.get('remove_logo') == 'true':
                if settings_obj.logo:
                    settings_obj.logo.delete(save=False)
                settings_obj.logo = None
                settings_obj.save()

            # Handle favicon removal
            if data.get('remove_favicon') == 'true':
                if settings_obj.favicon:
                    settings_obj.favicon.delete(save=False)
                settings_obj.favicon = None
                settings_obj.save()

            # Handle login background removal
            if data.get('remove_login_background_image') == 'true':
                if settings_obj.login_background_image:
                    settings_obj.login_background_image.delete(save=False)
                settings_obj.login_background_image = None
                settings_obj.save()

            # Handle platform banner image removal
            if data.get('remove_platform_banner_image') == 'true':
                if settings_obj.platform_banner_image:
                    settings_obj.platform_banner_image.delete(save=False)
                settings_obj.platform_banner_image = None
                settings_obj.save()
            
            # Handle logo file upload
            if 'logo' in request.FILES:
                try:
                    logo_file = request.FILES['logo']
                    # Get file extension
                    original_filename = logo_file.name
                    _, ext = os.path.splitext(original_filename)
                    # Create filename: logo{ext}
                    custom_filename = f'logo{ext}'

                    # Save with custom filename and deployment namespace prefix when configured
                    save_app_settings_image('logo', logo_file, custom_filename)
                    uploaded_file_fields.append('logo')
                    
                    # Verify the logo was saved and uploaded to storage
                    if not settings_obj.logo:
                        return Response({'error': 'Logo upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    
                    # Verify storage upload
                    try:
                        storage = settings_obj.logo.storage
                        from api.storage import S3MediaStorage
                        if isinstance(storage, S3MediaStorage):
                            logo_url = settings_obj.logo.url
                            if not logo_url or not (logo_url.startswith('http://') or logo_url.startswith('https://')):
                                return Response({'error': 'Logo upload failed - storage URL not available'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    except Exception:
                        # storage verification failed, but file was saved - continue
                        pass
                except Exception as upload_error:
                    import traceback
                    traceback.print_exc()
                    return Response({'error': f'Logo upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Handle favicon file upload
            if 'favicon' in request.FILES:
                try:
                    favicon_file = request.FILES['favicon']
                    # Get file extension
                    original_filename = favicon_file.name
                    _, ext = os.path.splitext(original_filename)
                    # Create filename: favicon{ext}
                    custom_filename = f'favicon{ext}'

                    # Save with custom filename and deployment namespace prefix when configured
                    save_app_settings_image('favicon', favicon_file, custom_filename)
                    uploaded_file_fields.append('favicon')
                    
                    # Verify the favicon was saved and uploaded to storage
                    if not settings_obj.favicon:
                        return Response({'error': 'Favicon upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    
                    # Verify storage upload
                    try:
                        storage = settings_obj.favicon.storage
                        from api.storage import S3MediaStorage
                        if isinstance(storage, S3MediaStorage):
                            favicon_url = settings_obj.favicon.url
                            if not favicon_url or not (favicon_url.startswith('http://') or favicon_url.startswith('https://')):
                                return Response({'error': 'Favicon upload failed - storage URL not available'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    except Exception:
                        # storage verification failed, but file was saved - continue
                        pass
                except Exception as upload_error:
                    import traceback
                    traceback.print_exc()
                    return Response({'error': f'Favicon upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Handle login background image upload
            if 'login_background_image' in request.FILES:
                try:
                    bg_file = request.FILES['login_background_image']
                    original_filename = bg_file.name
                    _, ext = os.path.splitext(original_filename)
                    custom_filename = f'login_background{ext}'

                    save_app_settings_image('login_background_image', bg_file, custom_filename)
                    uploaded_file_fields.append('login_background_image')

                    if not settings_obj.login_background_image:
                        return Response({'error': 'Background upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                except Exception as upload_error:
                    import traceback
                    traceback.print_exc()
                    return Response({'error': f'Background upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Handle platform banner image upload
            if 'platform_banner_image' in request.FILES:
                try:
                    banner_file = request.FILES['platform_banner_image']
                    original_filename = banner_file.name
                    _, ext = os.path.splitext(original_filename)
                    custom_filename = f'platform_banner{ext}'

                    save_app_settings_image('platform_banner_image', banner_file, custom_filename)
                    uploaded_file_fields.append('platform_banner_image')

                    if not settings_obj.platform_banner_image:
                        return Response({'error': 'Platform banner upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                except Exception as upload_error:
                    import traceback
                    traceback.print_exc()
                    return Response({'error': f'Platform banner upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Update platform info from request data
            update_fields = []
            if 'platform_name' in data:
                settings_obj.platform_name = (data.get('platform_name') or 'Panorama').strip()[:80]
                update_fields.append('platform_name')
            if 'address' in data:
                settings_obj.address = (data.get('address') or '').strip()[:200]
                update_fields.append('address')
            if 'website' in data:
                settings_obj.website = (data.get('website') or '').strip()[:200]
                update_fields.append('website')
            if 'email' in data:
                settings_obj.email = (data.get('email') or '').strip()[:100]
                update_fields.append('email')
            text_legal_fields = [
                ('legal_form', 'legal_form', 120),
                ('share_capital', 'share_capital', 120),
                ('siren', 'siren', 20),
                ('siret', 'siret', 20),
                ('rcs', 'rcs', 200),
                ('vat_number', 'vat_number', 30),
                ('publication_director', 'publication_director', 200),
            ]
            for req_key, attr, max_len in text_legal_fields:
                if req_key in data:
                    val = (data.get(req_key) or '').strip()[:max_len]
                    setattr(settings_obj, attr, val)
                    update_fields.append(attr)
            for req_key, attr in (
                ('hosting_provider', 'hosting_provider'),
                ('dpo_contact', 'dpo_contact'),
                ('consumer_mediator', 'consumer_mediator'),
                ('regulatory_mentions', 'regulatory_mentions'),
            ):
                if req_key in data:
                    val = (data.get(req_key) or '').strip()
                    if len(val) > 8000:
                        val = val[:8000]
                    setattr(settings_obj, attr, val)
                    update_fields.append(attr)
            if 'company_country' in data:
                cc = (data.get('company_country') or 'FR').strip().upper()[:2]
                if cc not in ('FR', 'BE', 'LU', 'CH', 'GR'):
                    cc = 'FR'
                settings_obj.company_country = cc
                update_fields.append('company_country')
            # Update colors from request data
            if 'primary_color' in data:
                settings_obj.primary_color = data.get('primary_color', '#030213')
                update_fields.append('primary_color')
            if 'secondary_color' in data:
                settings_obj.secondary_color = data.get('secondary_color', '')
                update_fields.append('secondary_color')
            if 'accent_color' in data:
                settings_obj.accent_color = data.get('accent_color', '')
                update_fields.append('accent_color')
            if 'otp_email_enabled' in data:
                val = data.get('otp_email_enabled')
                settings_obj.otp_email_enabled = val in (True, 'true', '1', 1)
                update_fields.append('otp_email_enabled')
            if 'otp_sms_enabled' in data:
                val = data.get('otp_sms_enabled')
                settings_obj.otp_sms_enabled = val in (True, 'true', '1', 1)
                update_fields.append('otp_sms_enabled')
            
            # Save the model
            # If file fields were uploaded, save without update_fields to ensure file fields are properly persisted
            # File fields need special handling and may not work correctly with update_fields
            if uploaded_file_fields:
                # File fields were uploaded - save without update_fields to ensure they're persisted
                settings_obj.save()
            elif update_fields:
                # Only text fields were updated - use update_fields for efficiency
                settings_obj.save(update_fields=update_fields)
            else:
                # No fields to update, but save anyway to ensure any previous changes are persisted
                settings_obj.save()
            
            # Refresh from database to ensure all changes (including file uploads) are loaded
            settings_obj.refresh_from_db()
            
            serializer = AppSettingsSerializer(settings_obj, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# News endpoints
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def news_list(request):
    """List published news posts (public endpoint for platform dashboard)"""
    posts = NewsPost.objects.filter(published=True).order_by('-created_at')
    serializer = NewsPostSerializer(posts, many=True, context={'request': request})
    return Response({'news': serializer.data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def news_list_all(request):
    """List all news posts (admin - includes unpublished)"""
    posts = NewsPost.objects.all().order_by('-created_at')
    serializer = NewsPostSerializer(posts, many=True, context={'request': request})
    return Response({'news': serializer.data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def news_create(request):
    """Create a new news post"""
    news_id = uuid.uuid4().hex[:12]
    while NewsPost.objects.filter(id=news_id).exists():
        news_id = uuid.uuid4().hex[:12]

    data = request.data
    if hasattr(data, 'get'):
        title = (data.get('title') or '').strip()
        content = (data.get('content') or '').strip()
        source_name = (data.get('sourceName') or data.get('source_name') or '').strip()
        article_url = (data.get('articleUrl') or data.get('article_url') or '').strip()
        published = data.get('published', True)
        if isinstance(published, str):
            published = published.lower() in ('true', '1', 'yes')
    else:
        title = content = source_name = article_url = ''
        published = True

    post = NewsPost.objects.create(
        id=news_id,
        title=title or 'Sans titre',
        content=content,
        source_name=source_name,
        article_url=article_url,
        author=request.user if request.user.is_authenticated else None,
        published=published,
    )
    if 'image' in request.FILES:
        post.image = request.FILES['image']
        post.save()
    serializer = NewsPostSerializer(post, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# RSS feeds gratuits pour actualités financières (pas de clé API requise)
_NEWS_RSS_FEEDS = [
    ('https://www.lesechos.fr/rss.xml', 'Les Echos'),
    ('https://www.lemonde.fr/economie/rss_full.xml', 'Le Monde Économie'),
    ('https://www.latribune.fr/rss.xml', 'La Tribune'),
    ('https://www.investir.lesechos.fr/rss.xml', 'Investir Les Echos'),
    ('https://www.lefigaro.fr/rss/figaro_finance-marches.xml', 'Le Figaro Finance'),
]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def news_fetch_from_api(request):
    """Fetch news articles from free RSS feeds (no API key required)"""
    try:
        import requests
        import feedparser
        from html import unescape
        import re

        articles = []
        seen_urls = set()
        try:
            limit = int(request.GET.get('pageSize', 30))
            if limit < 1:
                limit = 30
            limit = min(limit, 50)
        except (ValueError, TypeError):
            limit = 30
        headers = {'User-Agent': 'Panorama/1.0 (News aggregator)'}

        for feed_url, source_name in _NEWS_RSS_FEEDS:
            if len(articles) >= limit:
                break
            try:
                resp = requests.get(feed_url, headers=headers, timeout=10)
                resp.raise_for_status()
                feed = feedparser.parse(resp.content)
            except Exception:
                continue
            for entry in feed.entries:
                if len(articles) >= limit:
                    break
                link = (entry.get('link') or '').strip()
                if not link or link in seen_urls:
                    continue
                title = (entry.get('title') or '').strip()
                if not title:
                    continue
                seen_urls.add(link)
                # Nettoyer le HTML du summary/description
                raw_desc = entry.get('summary') or entry.get('description') or ''
                if raw_desc:
                    raw_desc = re.sub(r'<[^>]+>', '', raw_desc)
                    raw_desc = unescape(raw_desc).strip()[:500]
                # Image: media_content, media_thumbnail, ou première img dans summary
                img = ''
                if hasattr(entry, 'media_content') and entry.media_content:
                    img = entry.media_content[0].get('url', '') or ''
                if not img and hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
                    img = entry.media_thumbnail[0].get('url', '') or ''
                if not img and 'src="' in str(entry.get('summary', '')):
                    m = re.search(r'src="([^"]+)"', str(entry.get('summary', '')))
                    if m:
                        img = m.group(1)
                published = getattr(entry, 'published', '') or getattr(entry, 'updated', '') or ''
                articles.append({
                    'title': title[:200],
                    'description': raw_desc,
                    'content': raw_desc,
                    'url': link[:500],
                    'urlToImage': img[:500] if img else '',
                    'publishedAt': published,
                    'author': (entry.get('author') or '')[:200],
                    'source_name': source_name[:200],
                })
        return Response({'articles': articles})
    except Exception as e:
        logging.exception('news_fetch_from_api error')
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def _download_and_save_news_image(post, image_url):
    """Download image from URL and save to NewsPost.image"""
    if not image_url or not str(image_url).startswith('http'):
        return
    try:
        import requests
        from django.core.files.base import ContentFile
        resp = requests.get(image_url, timeout=10, stream=True, headers={'User-Agent': 'Panorama/1.0'})
        resp.raise_for_status()
        content_type = resp.headers.get('Content-Type', '')
        if 'image/png' in content_type:
            ext = '.png'
        elif 'image/jpeg' in content_type or 'image/jpg' in content_type:
            ext = '.jpg'
        elif 'image/gif' in content_type:
            ext = '.gif'
        elif 'image/webp' in content_type:
            ext = '.webp'
        else:
            from urllib.parse import urlparse
            path = urlparse(image_url).path
            _, ext = os.path.splitext(path)
            ext = ext.lower() if ext and ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp') else '.jpg'
        custom_filename = f'news/{post.id}{ext}'
        post.image.save(custom_filename, ContentFile(resp.content), save=True)
    except Exception as e:
        logging.warning('Could not download news image from %s: %s', image_url[:80], e)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def news_import_from_api(request):
    """Import a single article from external API into NewsPost"""
    article = request.data.get('article') or request.data
    if not article:
        return Response({'error': 'Article data required'}, status=status.HTTP_400_BAD_REQUEST)
    news_id = uuid.uuid4().hex[:12]
    while NewsPost.objects.filter(id=news_id).exists():
        news_id = uuid.uuid4().hex[:12]
    title = (article.get('title') or article.get('headline') or 'Sans titre')[:200]
    content = (article.get('content') or article.get('description') or article.get('summary') or '')[:10000]
    src = article.get('source')
    if isinstance(src, dict):
        source_name = (src.get('name') or src.get('id') or '')[:200]
    else:
        source_name = (article.get('source_name') or (src if isinstance(src, str) else '') or article.get('author') or '')[:200]
    article_url = (article.get('url') or article.get('article_url') or article.get('link') or '')[:500]
    post = NewsPost.objects.create(
        id=news_id,
        title=title,
        content=content,
        source_name=source_name,
        article_url=article_url,
        author=request.user if request.user.is_authenticated else None,
        published=True,
    )
    img_url = article.get('urlToImage') or article.get('url_to_image') or article.get('image')
    if img_url:
        _download_and_save_news_image(post, img_url)
    serializer = NewsPostSerializer(post, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def news_bulk_import_from_api(request):
    """Bulk import articles from external API into NewsPost"""
    articles = request.data.get('articles') or []
    success_count = 0
    error_count = 0
    for article in articles:
        try:
            news_id = uuid.uuid4().hex[:12]
            while NewsPost.objects.filter(id=news_id).exists():
                news_id = uuid.uuid4().hex[:12]
            title = (article.get('title') or article.get('headline') or 'Sans titre')[:200]
            content = (article.get('content') or article.get('description') or article.get('summary') or '')[:10000]
            src = article.get('source')
            if isinstance(src, dict):
                source_name = (src.get('name') or src.get('id') or '')[:200]
            else:
                source_name = (article.get('source_name') or (src if isinstance(src, str) else '') or article.get('author') or '')[:200]
            article_url = (article.get('url') or article.get('article_url') or article.get('link') or '')[:500]
            post = NewsPost.objects.create(
                id=news_id,
                title=title,
                content=content,
                source_name=source_name,
                article_url=article_url,
                author=request.user if request.user.is_authenticated else None,
                published=True,
            )
            img_url = article.get('urlToImage') or article.get('url_to_image') or article.get('image')
            if img_url:
                _download_and_save_news_image(post, img_url)
            success_count += 1
        except Exception:
            error_count += 1
    return Response({'success_count': success_count, 'error_count': error_count})


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def news_update(request, news_id):
    """Update a news post"""
    post = get_object_or_404(NewsPost, id=news_id)
    data = request.data
    if hasattr(data, 'get'):
        if 'title' in data:
            post.title = (data.get('title') or '').strip()[:200] or 'Sans titre'
        if 'content' in data:
            post.content = (data.get('content') or '').strip()
        if 'sourceName' in data or 'source_name' in data:
            post.source_name = (data.get('sourceName') or data.get('source_name') or '').strip()[:200]
        if 'articleUrl' in data or 'article_url' in data:
            post.article_url = (data.get('articleUrl') or data.get('article_url') or '').strip()[:500]
        if 'published' in data:
            val = data.get('published')
            post.published = val in (True, 'true', '1', 1) if not isinstance(val, bool) else val
    if data.get('removeImage') in ('true', True, '1', 1) or data.get('remove_image') in ('true', True, '1', 1):
        if post.image:
            post.image.delete(save=False)
        post.image = None
    if 'image' in request.FILES:
        if post.image:
            post.image.delete(save=False)
        post.image = request.FILES['image']
    post.save()
    serializer = NewsPostSerializer(post, context={'request': request})
    return Response(serializer.data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def news_delete(request, news_id):
    """Delete a news post"""
    post = get_object_or_404(NewsPost, id=news_id)
    post.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _proxy_fetch_external_url(url: str):
    """Fetch external URL and return (content, content_type) or raise."""
    import requests
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    resp = requests.get(url, timeout=15, stream=True, headers=headers)
    resp.raise_for_status()
    content_type = resp.headers.get('Content-Type', 'application/octet-stream')
    if 'application/pdf' in content_type or url.lower().endswith('.pdf'):
        content_type = 'application/pdf'
    return resp.content, content_type


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def media_proxy(request):
    """Proxy external URLs via ?url= param. Use for asset logos (Clearbit, CoinGecko, etc.) and presigned URLs."""
    from django.http import HttpResponse
    from urllib.parse import unquote

    url = request.GET.get('url')
    if not url:
        return HttpResponse(status=400)
    try:
        decoded = unquote(url)
        if not (decoded.startswith('http://') or decoded.startswith('https://')):
            return HttpResponse(status=400)
        content, content_type = _proxy_fetch_external_url(decoded)
        response = HttpResponse(content, content_type=content_type)
        response['Content-Disposition'] = 'inline'
        response['Access-Control-Allow-Origin'] = '*'
        return response
    except Exception as e:
        logging.getLogger(__name__).warning(f"media_proxy ?url= error: {e}")
        return HttpResponse(status=404)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def media_proxy_path(request, file_path):
    """Proxy storage paths (news/, media/, etc.) from S3/MinIO or local."""
    from django.http import HttpResponse
    from urllib.parse import unquote
    from django.conf import settings

    decoded_path = unquote(file_path)
    try:
        if decoded_path.startswith('http://') or decoded_path.startswith('https://'):
            content, content_type = _proxy_fetch_external_url(decoded_path)
            response = HttpResponse(content, content_type=content_type)
            response['Content-Disposition'] = 'inline'
            response['Access-Control-Allow-Origin'] = '*'
            return response
        if getattr(settings, 'S3_CONFIGURED', False):
            from django.core.files.storage import default_storage
            if not default_storage.exists(decoded_path):
                return HttpResponse(status=404)
            f = default_storage.open(decoded_path, 'rb')
            try:
                content = f.read()
            finally:
                f.close()
            content_type = 'application/octet-stream'
            if decoded_path.lower().endswith(('.jpg', '.jpeg')):
                content_type = 'image/jpeg'
            elif decoded_path.lower().endswith('.png'):
                content_type = 'image/png'
            elif decoded_path.lower().endswith('.ico'):
                content_type = 'image/x-icon'
            elif decoded_path.lower().endswith('.gif'):
                content_type = 'image/gif'
            elif decoded_path.lower().endswith('.webp'):
                content_type = 'image/webp'
            elif decoded_path.lower().endswith('.pdf'):
                content_type = 'application/pdf'
            response = HttpResponse(content, content_type=content_type)
            response['Content-Disposition'] = 'inline'
            response['Access-Control-Allow-Origin'] = '*'
            return response
        from django.views.static import serve
        return serve(request, decoded_path, document_root=settings.MEDIA_ROOT)
    except Exception as e:
        logging.getLogger(__name__).warning(f"media_proxy_path error for {file_path[:80]}: {e}")
        return HttpResponse(status=404)


# Custom Token Refresh Serializer that handles missing users