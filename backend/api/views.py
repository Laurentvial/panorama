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
from .models import ClientChatMessage
from .models import Note
from .models import UserDetails
from .models import Team
from .models import Event
from .models import TeamMember
from .models import Log
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
from .models import Position
from .models import AppSettings
from .models import NewsPost
from .serializer import (
    UserSerializer, ClientSerializer, NoteSerializer,
    TeamSerializer, TeamDetailSerializer, UserDetailsSerializer, EventSerializer, TeamMemberSerializer,
    AssetSerializer, ClientAssetSerializer, RIBSerializer, ClientRIBSerializer, UsefulLinkSerializer, ClientUsefulLinkSerializer,
    TransactionSerializer, ProductCategorySerializer, ProductSerializer, PositionSerializer, AppSettingsSerializer, NewsPostSerializer, LogSerializer,
    ClientChatMessageSerializer
)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.authentication import SessionAuthentication
import uuid
import json
import os
import re
import calendar
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta
from django.utils import timezone
from django.db.models import Q
from .alpha_vantage_service import get_alpha_vantage_service
from .position_service import create_positions_for_investment


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
        and bool((getattr(client, 'employer_name', '') or '').strip())
        and bool((getattr(client, 'annual_net_income', '') or '').strip())
        and bool((getattr(client, 'total_liquidities', '') or '').strip())
    )

    new_verified = bool(is_complete)
    if bool(getattr(client, 'account_verified', False)) != new_verified:
        client.account_verified = new_verified
        changed.append('account_verified')

    return changed


_DURATION_RE = re.compile(r"(\d+)")


def _parse_months_from_duration(duration_str: str | None) -> int:
    if not duration_str:
        return 1
    m = _DURATION_RE.search(str(duration_str))
    if not m:
        return 1
    try:
        v = int(m.group(1))
        return v if v > 0 else 1
    except Exception:
        return 1


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
    duration_months = _parse_months_from_duration(duration_str)

    # Profit estimation (best effort, consistent with current frontend calc: annual rate prorated by months/12)
    rate = _profitability_rate_for_calc(product)
    profits = (amount * (rate / Decimal('100')) * (Decimal(duration_months) / Decimal('12'))).quantize(Decimal('0.01'))
    total = (amount + profits).quantize(Decimal('0.01'))

    try:
        birth_date = client.birth_date.isoformat() if client.birth_date else ''
    except Exception:
        birth_date = ''

    # Contract end
    try:
        end_date = _add_months_keep_day(transaction_datetime.date(), duration_months)
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
        'profitability': _profitability_text_for_product(product),
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


def create_log_entry(event_type, user_id, request, old_value=None, new_value=None, transaction_id=None, client_name=None):
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


class UserCreateView(generics.CreateAPIView):
    queryset = DjangoUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    
    def perform_create(self, serializer):
        # Save the user (this will trigger the serializer's create method)
        user = serializer.save()
        
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

class ClientView(generics.ListAPIView):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]  # Explicitly set permission
    
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return Response({'clients': response.data})

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
        'platform_access': request.data.get('platformAccess', True),
        'active': request.data.get('active', True),
        'template': request.data.get('template', '') or '',
        'support': request.data.get('support', '') or '',
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
    
    # Convert platformAccess and active from string to boolean if needed (FormData sends strings)
    if isinstance(client_data.get('platform_access'), str):
        client_data['platform_access'] = client_data['platform_access'].lower() == 'true'
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
    
    client_data.update({
        # Fiche patrimoniale
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
    })
    
    try:
        client = Client.objects.create(**client_data)
        
        # Handle profile photo upload explicitly for Cloudinary
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
                
                # Verify the photo was saved and uploaded to Cloudinary
                if not client.profile_photo:
                    print("Warning: Profile photo upload failed - file was not saved")
                else:
                    # Verify Cloudinary upload
                    try:
                        storage = client.profile_photo.storage
                        from api.storage import CloudinaryMediaStorage
                        if isinstance(storage, CloudinaryMediaStorage):
                            photo_url = client.profile_photo.url
                            if photo_url and (photo_url.startswith('http://') or photo_url.startswith('https://')):
                                print(f"Profile photo successfully uploaded to Cloudinary: {client.profile_photo.name}")
                                print(f"Cloudinary URL: {photo_url[:100]}...")
                    except Exception as verify_error:
                        print(f"Warning: Could not verify Cloudinary upload: {str(verify_error)}")
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
        
        # Assign default RIBs
        default_ribs = RIB.objects.filter(default=True)
        for rib in default_ribs:
            # Check if client already has this RIB (shouldn't happen for new client, but safety check)
            if not ClientRIB.objects.filter(client=client, rib=rib).exists():
                client_rib_id = uuid.uuid4().hex[:12]
                while ClientRIB.objects.filter(id=client_rib_id).exists():
                    client_rib_id = uuid.uuid4().hex[:12]
                ClientRIB.objects.create(
                    id=client_rib_id,
                    client=client,
                    rib=rib
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
        if 'template' in request.data:
            client.template = request.data.get('template', '') or ''
        if 'support' in request.data:
            client.support = request.data.get('support', '') or ''
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
                
                # Verify the photo was saved and uploaded to Cloudinary
                if not client.profile_photo:
                    return Response({'error': 'Profile photo upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                # Verify Cloudinary upload
                try:
                    storage = client.profile_photo.storage
                    from api.storage import CloudinaryMediaStorage
                    if isinstance(storage, CloudinaryMediaStorage):
                        photo_url = client.profile_photo.url
                        if photo_url and (photo_url.startswith('http://') or photo_url.startswith('https://')):
                            print(f"Profile photo successfully uploaded to Cloudinary: {client.profile_photo.name}")
                            print(f"Cloudinary URL: {photo_url[:100]}...")
                except Exception as verify_error:
                    print(f"Warning: Could not verify Cloudinary upload: {str(verify_error)}")
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
        
        # Update platform_access if provided
        if 'platformAccess' in request.data:
            platform_access = request.data.get('platformAccess')
            # Handle both boolean and string values
            if isinstance(platform_access, str):
                client.platform_access = platform_access.lower() == 'true'
            else:
                client.platform_access = bool(platform_access)
        
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
        
        client.save()
        serializer = ClientSerializer(client, context={'request': request})
        return Response({'client': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_toggle_active(request, client_id):
    client = get_object_or_404(Client, id=client_id)
    client.active = not client.active
    client.save()
    return Response({'active': client.active})

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_delete(request, client_id):
    client = get_object_or_404(Client, id=client_id)
    client.delete()
    return Response({'message': 'Client supprimé avec succès'}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([AllowAny])
def client_login(request):
    """Client login endpoint - authenticates clients using email/password"""
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')
    
    if not email or not password:
        return Response({'error': 'Email et mot de passe requis'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        client = Client.objects.get(email=email)
    except Client.DoesNotExist:
        return Response({'error': 'Email ou mot de passe incorrect'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check if client has platform access
    if not client.platform_access:
        return Response({'error': 'Accès à la plateforme désactivé'}, status=status.HTTP_403_FORBIDDEN)
    
    # Check if client is active
    if not client.active:
        return Response({'error': 'Compte désactivé'}, status=status.HTTP_403_FORBIDDEN)
    
    # Verify password (simple string comparison for now - in production, use hashing)
    if client.password != password:
        return Response({'error': 'Email ou mot de passe incorrect'}, status=status.HTTP_401_UNAUTHORIZED)

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
        if not client.platform_access or not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

        # Ensure account_verified is consistent with required fields
        changed_fields = _recompute_client_account_verified(client)
        if changed_fields:
            client.save(update_fields=changed_fields)

        serializer = ClientSerializer(client, context={'request': request})
        return Response({
            'client': serializer.data,
            'userType': 'client'
        })
    except Client.DoesNotExist:
        return Response({'error': 'Client non trouvé'}, status=status.HTTP_404_NOT_FOUND)


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

    if not client.platform_access or not client.active:
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
    if 'birthDate' in request.data:
        client.birth_date = parse_birth_date(request.data.get('birthDate'))
    if 'address' in request.data:
        client.address = request.data.get('address', '') or ''
    if 'postalCode' in request.data:
        client.postal_code = request.data.get('postalCode', '') or ''
    if 'city' in request.data:
        client.city = request.data.get('city', '') or ''
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
        and bool((client.employer_name or '').strip())
        and bool((client.annual_net_income or '').strip())
        and bool((client.total_liquidities or '').strip())
    )
    client.account_verified = bool(is_complete)

    client.save(update_fields=[
        'fname', 'middle_name', 'lname', 'legal_name', 'sex', 'birth_date',
        'address', 'postal_code', 'city',
        'preferences',
        'trading_objective', 'planned_investment_12m', 'risk_reward_profile',
        'compliance_family_flags', 'funds_sources',
        'primary_profession', 'employer_name', 'annual_net_income', 'total_liquidities',
        'account_verified'
    ])
    serializer = ClientSerializer(client, context={'request': request})
    return Response({'client': serializer.data, 'userType': 'client'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    try:
        django_user = request.user
        try:
            # Try to get the user details profile
            user_details = UserDetails.objects.get(django_user=django_user)
            # Use UserDetailsSerializer to ensure consistent format with other endpoints
            serializer = UserDetailsSerializer(user_details)
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

# Teams endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def team_list(request):
    teams = Team.objects.all()
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
    users = UserDetails.objects.all()
    serializer = UserDetailsSerializer(users, many=True)
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
    if 'username' in request.data:
        django_user.username = request.data['username']
    if 'email' in request.data:
        django_user.email = request.data['email']
    django_user.save()
    
    # Update UserDetails fields
    if 'role' in request.data:
        user_details.role = request.data['role']
    if 'phone' in request.data:
        user_details.phone = request.data['phone'] or ''
    
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
    serializer = UserDetailsSerializer(user_details)
    return Response(serializer.data)

# Events endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def event_list(request):
    events = Event.objects.filter(userId=request.user).order_by('datetime')
    serializer = EventSerializer(events, many=True)
    return Response({'events': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def event_create(request):
    serializer = EventSerializer(data=request.data)
    if serializer.is_valid():
        # Generate event ID
        event_id = uuid.uuid4().hex[:12]
        while Event.objects.filter(id=event_id).exists():
            event_id = uuid.uuid4().hex[:12]
        
        # Get client if clientId provided
        client = None
        if request.data.get('clientId'):
            try:
                client = Client.objects.get(id=request.data['clientId'])
            except Client.DoesNotExist:
                pass
        
        event = serializer.save(
            id=event_id,
            userId=request.user,
            clientId=client
        )
        return Response(EventSerializer(event).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def event_update(request, event_id):
    event = get_object_or_404(Event, id=event_id, userId=request.user)
    serializer = EventSerializer(event, data=request.data, partial=True)
    if serializer.is_valid():
        # Get client if clientId provided
        client = None
        if request.data.get('clientId'):
            try:
                client = Client.objects.get(id=request.data['clientId'])
            except Client.DoesNotExist:
                pass
        elif request.data.get('clientId') == '' or request.data.get('clientId') is None:
            client = None
        
        # Update event with new data
        event = serializer.save(clientId=client)
        return Response(EventSerializer(event).data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def event_delete(request, event_id):
    event = get_object_or_404(Event, id=event_id, userId=request.user)
    event.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

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
            if not client.platform_access or not client.active:
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
    
    assets = Asset.objects.all().order_by('type', 'name')
    serializer = AssetSerializer(assets, many=True)
    return Response({'assets': serializer.data})

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
        return Response(AssetSerializer(asset).data, status=status.HTTP_201_CREATED)
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
            if not client.platform_access or not client.active:
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
    
    serializer = AssetSerializer(asset, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(AssetSerializer(asset, context={'request': request}).data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def asset_delete(request, asset_id):
    """Supprimer un asset"""
    asset = get_object_or_404(Asset, id=asset_id)
    asset.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def client_assets(request, client_id):
    """Liste les assets d'un client"""
    client = get_object_or_404(Client, id=client_id)
    
    # Check if it's a client accessing their own data
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    if token and token.startswith('client_'):
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.platform_access or not client.active:
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
    
    client_assets = ClientAsset.objects.filter(client=client).select_related('asset')
    serializer = ClientAssetSerializer(client_assets, many=True)
    return Response({'assets': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_asset_add(request, client_id):
    """Ajouter un asset à un client"""
    client = get_object_or_404(Client, id=client_id)
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
        
        serializer = ClientAssetSerializer(client_asset)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except Asset.DoesNotExist:
        return Response({'error': 'Asset not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_asset_remove(request, client_id, asset_id):
    """Retirer un asset d'un client"""
    client = get_object_or_404(Client, id=client_id)
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
    asset = get_object_or_404(Asset, id=asset_id)
    
    try:
        client_asset = ClientAsset.objects.get(client=client, asset=asset)
        client_asset.featured = not client_asset.featured
        client_asset.save()
        serializer = ClientAssetSerializer(client_asset)
        return Response(serializer.data, status=status.HTTP_200_OK)
    except ClientAsset.DoesNotExist:
        return Response({'error': 'Client asset relationship not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_assets_reset(request, client_id):
    """Réinitialiser les assets d'un client : retirer ceux qui ne sont pas default=True, ajouter ceux qui sont default=True"""
    client = get_object_or_404(Client, id=client_id)
    
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
    
    # Use Alpha Vantage for stocks, ETFs, etc.
    av_service = get_alpha_vantage_service()
    if not av_service:
        return Response({'error': 'Alpha Vantage API key not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    try:
        # Use SYMBOL_SEARCH to find multiple matches by name or symbol
        results = av_service.search_symbol(keywords)
        
        if not results:
            # Check if it's actually a rate limit by making a test call
            # Only return rate_limit_reached if we're certain it's a rate limit
            # For now, return empty results without assuming it's a rate limit
            # The user might just have searched for something that doesn't exist
            return Response({
                'results': [], 
                'message': 'Aucun résultat trouvé. Vérifiez l\'orthographe ou essayez un autre terme de recherche.',
                'rate_limit_reached': False
            }, status=status.HTTP_200_OK)
        
        # Optionally fetch current price for each result
        results_with_prices = []
        for result in results[:10]:  # Limit to first 10 results
            try:
                quote = av_service.get_quote(result['symbol'])
                if quote:
                    result['price'] = quote['price']
                    result['change'] = quote['change']
                    result['change_percent'] = quote['change_percent']
            except:
                pass  # If quote fails, just include the search result without price
            
            results_with_prices.append(result)
        
        return Response({
            'results': results_with_prices,
            'count': len(results_with_prices)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        error_str = str(e).lower()
        # Only treat as rate limit if the error message explicitly mentions rate limit
        # Don't treat generic "Information" messages as rate limits
        if ("rate limit" in error_str or "api call frequency" in error_str) and "information" not in error_str:
            return Response({
                'error': 'Limite de requêtes API Alpha Vantage atteinte (25/jour pour le plan gratuit). Veuillez réessayer demain ou passer à un plan premium.',
                'rate_limit_reached': True
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'error': f'Erreur lors de la recherche: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def alpha_vantage_quote(request, symbol):
    """
    Get live quote for a symbol
    """
    symbol = symbol.strip().upper()
    
    av_service = get_alpha_vantage_service()
    if not av_service:
        return Response({'error': 'Alpha Vantage API key not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    try:
        quote = av_service.get_quote(symbol)
        
        if not quote:
            return Response({'error': f'Symbol {symbol} not found'}, status=status.HTTP_404_NOT_FOUND)
        
        return Response(quote, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Error fetching quote: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
            if not client.platform_access or not client.active:
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
        # Use Finnhub for cryptos, Alpha Vantage for stocks/ETFs
        if asset.type.lower() == 'crypto':
            from api.alpha_vantage_service import get_crypto_candles_finnhub
            chart_data = get_crypto_candles_finnhub(asset.alpha_vantage_symbol, resolution='D', days=100 if outputsize == 'compact' else 730)
            
            if not chart_data:
                return Response({
                    'error': f'Crypto symbol {asset.alpha_vantage_symbol} not found or API rate limit reached',
                    'rate_limit_reached': True
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            return Response(chart_data, status=status.HTTP_200_OK)
        else:
            # Use Alpha Vantage for stocks/ETFs
            av_service = get_alpha_vantage_service()
            if not av_service:
                return Response({'error': 'Alpha Vantage API key not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            chart_data = av_service.get_daily_data(asset.alpha_vantage_symbol, outputsize=outputsize)
            
            if not chart_data:
                return Response({
                    'error': f'Symbol {asset.alpha_vantage_symbol} not found or API rate limit reached',
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
        
        # Use crypto logo function for cryptos, company logo for stocks
        if asset_type == 'crypto':
            from api.alpha_vantage_service import get_crypto_logo
            logo_url = get_crypto_logo(symbol)
        else:
            av_service = get_alpha_vantage_service()
            if av_service:
                logo_url = av_service.get_company_logo(symbol)
        
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
    asset_type = request.data.get('type', 'Action')
    category = request.data.get('category', '')
    subcategory = request.data.get('subcategory', '')
    exchange = request.data.get('exchange', '')
    currency = request.data.get('currency', 'USD')
    region = request.data.get('region', '')
    # Accept both logo_url (snake_case) and logoUrl (camelCase) from frontend
    logo_url = request.data.get('logo_url', '') or request.data.get('logoUrl', '')
    default = request.data.get('default', False)
    
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if asset with this symbol already exists
    existing_asset = Asset.objects.filter(alpha_vantage_symbol=symbol).first()
    if existing_asset:
        return Response({
            'error': f'Asset with symbol {symbol} already exists',
            'asset': AssetSerializer(existing_asset).data
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Use Finnhub for cryptos, Alpha Vantage for stocks/ETFs
        if asset_type.lower() == 'crypto':
            from api.alpha_vantage_service import get_crypto_quote_finnhub, get_crypto_logo
            quote = get_crypto_quote_finnhub(symbol)
            
            if not quote:
                return Response({'error': f'Crypto symbol {symbol} not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get logo URL if not provided
            if not logo_url:
                logo_url = get_crypto_logo(symbol) or ''
        else:
            av_service = get_alpha_vantage_service()
            if not av_service:
                return Response({'error': 'Alpha Vantage API key not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            # Fetch quote to get current price and validate symbol
            quote = av_service.get_quote(symbol)
            
            if not quote:
                return Response({'error': f'Symbol {symbol} not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get logo URL if not provided
            if not logo_url:
                logo_url = av_service.get_company_logo(symbol) or ''
        
        # Generate asset ID
        asset_id = uuid.uuid4().hex[:12]
        while Asset.objects.filter(id=asset_id).exists():
            asset_id = uuid.uuid4().hex[:12]
        
        # Create asset
        asset = Asset.objects.create(
            id=asset_id,
            type=asset_type,
            name=request.data.get('name', symbol),
            reference=symbol,
            category=category,
            subcategory=subcategory,
            default=default,
            alpha_vantage_symbol=symbol,
            exchange=exchange,
            currency=currency,
            region=region,
            logo_url=logo_url,
            last_price=quote['price'],
            last_price_update=timezone.now(),
            price_change=quote['change'],
            price_change_percent=float(quote['change_percent']) if quote['change_percent'] else None
        )
        
        return Response(AssetSerializer(asset).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': f'Error creating asset: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asset_update_price(request, asset_id):
    """
    Update asset price from Alpha Vantage (for stocks) or Finnhub (for cryptos)
    """
    asset = get_object_or_404(Asset, id=asset_id)
    
    if not asset.alpha_vantage_symbol:
        return Response({'error': 'Asset does not have a symbol configured'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Use Finnhub for cryptos, Alpha Vantage for stocks/ETFs
        if asset.type.lower() == 'crypto':
            from api.alpha_vantage_service import get_crypto_quote_finnhub
            quote = get_crypto_quote_finnhub(asset.alpha_vantage_symbol)
            
            if not quote:
                return Response({
                    'error': f'Crypto symbol {asset.alpha_vantage_symbol} not found or API rate limit reached',
                    'rate_limit_reached': True
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            # Update asset price data
            asset.last_price = quote['price']
            asset.last_price_update = timezone.now()
            asset.price_change = quote['change']
            asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
            asset.save()
        else:
            # Use Alpha Vantage for stocks/ETFs
            av_service = get_alpha_vantage_service()
            if not av_service:
                return Response({'error': 'Alpha Vantage API key not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            quote = av_service.get_quote(asset.alpha_vantage_symbol)
            
            if not quote:
                return Response({
                    'error': f'Symbol {asset.alpha_vantage_symbol} not found or API rate limit reached',
                    'rate_limit_reached': True
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
            # Update asset price data
            asset.last_price = quote['price']
            asset.last_price_update = timezone.now()
            asset.price_change = quote['change']
            asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
            asset.save()
        
        return Response(AssetSerializer(asset).data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Error updating price: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assets_bulk_update_prices(request):
    """
    Update prices for multiple assets at once
    Uses Alpha Vantage for stocks/ETFs and Finnhub for cryptos
    """
    asset_ids = request.data.get('assetIds', [])
    
    if not asset_ids:
        return Response({'error': 'assetIds array is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    assets = Asset.objects.filter(id__in=asset_ids, alpha_vantage_symbol__isnull=False).exclude(alpha_vantage_symbol='')
    
    if not assets.exists():
        return Response({'error': 'No valid assets found with symbols configured'}, status=status.HTTP_404_NOT_FOUND)
    
    from api.alpha_vantage_service import get_crypto_quote_finnhub
    av_service = get_alpha_vantage_service()
    
    updated_count = 0
    errors = []
    
    for asset in assets:
        try:
            # Use Finnhub for cryptos, Alpha Vantage for stocks/ETFs
            if asset.type.lower() == 'crypto':
                quote = get_crypto_quote_finnhub(asset.alpha_vantage_symbol)
            else:
                if not av_service:
                    errors.append(f'{asset.alpha_vantage_symbol}: Alpha Vantage API key not configured')
                    continue
                quote = av_service.get_quote(asset.alpha_vantage_symbol)
            
            if quote:
                asset.last_price = quote['price']
                asset.last_price_update = timezone.now()
                asset.price_change = quote['change']
                asset.price_change_percent = float(quote['change_percent']) if quote['change_percent'] else None
                asset.save()
                updated_count += 1
            else:
                errors.append(f'{asset.alpha_vantage_symbol}: Symbol not found')
        except Exception as e:
            errors.append(f'{asset.alpha_vantage_symbol}: {str(e)}')
    
    return Response({
        'updated': updated_count,
        'total': len(assets),
        'errors': errors
    }, status=status.HTTP_200_OK)

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
@permission_classes([IsAuthenticated])
def client_ribs(request, client_id):
    """Liste les RIBs d'un client"""
    client = get_object_or_404(Client, id=client_id)
    client_ribs = ClientRIB.objects.filter(client=client).select_related('rib')
    serializer = ClientRIBSerializer(client_ribs, many=True)
    return Response({'ribs': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_rib_add(request, client_id):
    """Ajouter un RIB à un client"""
    client = get_object_or_404(Client, id=client_id)
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
        
        serializer = ClientRIBSerializer(client_rib)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except RIB.DoesNotExist:
        return Response({'error': 'RIB not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_rib_remove(request, client_id, rib_id):
    """Retirer un RIB d'un client"""
    client = get_object_or_404(Client, id=client_id)
    rib = get_object_or_404(RIB, id=rib_id)
    
    try:
        client_rib = ClientRIB.objects.get(client=client, rib=rib)
        client_rib.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ClientRIB.DoesNotExist:
        return Response({'error': 'Client RIB relationship not found'}, status=status.HTTP_404_NOT_FOUND)

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
        
        # Handle image upload explicitly for Cloudinary
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
                
                # Verify the image was saved and uploaded to Cloudinary
                if not useful_link.image:
                    return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                # Verify Cloudinary upload
                try:
                    storage = useful_link.image.storage
                    from api.storage import CloudinaryMediaStorage
                    if isinstance(storage, CloudinaryMediaStorage):
                        image_url = useful_link.image.url
                        if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                            print(f"Image successfully uploaded to Cloudinary: {useful_link.image.name}")
                            print(f"Cloudinary URL: {image_url[:100]}...")
                except Exception as verify_error:
                    print(f"Warning: Could not verify Cloudinary upload: {str(verify_error)}")
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
    
    # Handle image upload explicitly for Cloudinary
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
            
            # Verify the image was saved and uploaded to Cloudinary
            if not useful_link.image:
                return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Verify Cloudinary upload
            try:
                storage = useful_link.image.storage
                from api.storage import CloudinaryMediaStorage
                if isinstance(storage, CloudinaryMediaStorage):
                    image_url = useful_link.image.url
                    if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                        print(f"Image successfully uploaded to Cloudinary: {useful_link.image.name}")
                        print(f"Cloudinary URL: {image_url[:100]}...")
            except Exception as verify_error:
                print(f"Warning: Could not verify Cloudinary upload: {str(verify_error)}")
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
@permission_classes([IsAuthenticated])
def client_useful_links(request, client_id):
    """Liste les liens utiles d'un client"""
    client = get_object_or_404(Client, id=client_id)
    client_useful_links = ClientUsefulLink.objects.filter(client=client).select_related('useful_link')
    serializer = ClientUsefulLinkSerializer(client_useful_links, many=True, context={'request': request})
    return Response({'usefulLinks': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_useful_link_add(request, client_id):
    """Ajouter un lien utile à un client"""
    client = get_object_or_404(Client, id=client_id)
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
    
    # Calculate total revenue (sum of all deposits and sales)
    total_revenue = Transaction.objects.filter(
        Q(type='depot') | Q(type='vente')
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Calculate pending revenue (transactions with status 'en_attente_paiement' or 'en_cours')
    pending_revenue = Transaction.objects.filter(
        Q(type='depot') | Q(type='vente'),
        Q(status='en_attente_paiement') | Q(status='en_cours')
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Count total clients
    total_clients = Client.objects.count()
    
    # Count total appointments (events)
    total_appointments = Event.objects.count()
    
    # Get recent transactions (last 10)
    recent_transactions = Transaction.objects.all().order_by('-datetime', '-created_at')[:10]
    transaction_serializer = TransactionSerializer(recent_transactions, many=True)
    
    return Response({
        'totalRevenue': float(total_revenue),
        'pendingRevenue': float(pending_revenue),
        'totalClients': total_clients,
        'totalAppointments': total_appointments,
        'recentTransactions': transaction_serializer.data
    })

# Transaction endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def all_transactions(request):
    """Liste toutes les transactions de tous les clients"""
    transactions = Transaction.objects.all().order_by('-datetime', '-created_at')
    serializer = TransactionSerializer(transactions, many=True)
    return Response({'transactions': serializer.data})


def _sync_positions_statuses(qs):
    """
    Update Position.status in DB based on opened_at/closed_at:
    - pending: not opened yet (opened_at in future)
    - open: opened_at <= now < closed_at (or closed_at is null)
    - done: closed_at <= now
    cancelled is never touched.
    """
    now = timezone.now()

    # Close positions whose close time has passed
    qs.filter(
        ~Q(status='cancelled'),
        closed_at__isnull=False,
        closed_at__lte=now,
    ).exclude(status='done').update(status='done')

    # Open positions that reached opened_at and are not yet closed
    qs.filter(
        ~Q(status='cancelled'),
        opened_at__isnull=False,
        opened_at__lte=now,
    ).filter(Q(closed_at__isnull=True) | Q(closed_at__gt=now)).exclude(status='open').update(status='open')

    # Upcoming positions (opened_at in the future) should be pending
    qs.filter(
        ~Q(status='cancelled'),
        opened_at__isnull=False,
        opened_at__gt=now,
    ).exclude(status='pending').update(status='pending')


# Positions endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def positions_list(request):
    """Liste toutes les positions (admin)"""
    status_param = request.GET.get('status')
    qs = Position.objects.select_related('client', 'product', 'transaction', 'asset').all()

    # Keep statuses in sync for UI tabs (à venir / ouvertes / fermées)
    _sync_positions_statuses(qs)

    if status_param:
        # Allow comma-separated list: ?status=pending,done
        statuses = [s.strip() for s in str(status_param).split(',') if s.strip()]
        if statuses:
            qs = qs.filter(status__in=statuses)
    qs = qs.order_by('-period_date', '-created_at')
    serializer = PositionSerializer(qs, many=True)
    return Response({'positions': serializer.data})


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

    if token and token.startswith('client_'):
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.platform_access or not client.active:
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

    qs = Position.objects.select_related('client', 'product', 'transaction', 'asset').filter(client=client)

    # Keep statuses in sync for UI tabs (à venir / ouvertes / fermées)
    _sync_positions_statuses(qs)

    if status_param:
        statuses = [s.strip() for s in str(status_param).split(',') if s.strip()]
        if statuses:
            qs = qs.filter(status__in=statuses)

    qs = qs.order_by('-opened_at', '-period_date', '-created_at')
    serializer = PositionSerializer(qs, many=True)
    return Response({'positions': serializer.data})


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
        if not client.platform_access or not client.active:
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
        return Response({
            'messages': serializer.data,
            'manager': {
                'id': str(manager_user.id) if manager_user else None,
                'name': (f"{manager_user.first_name} {manager_user.last_name}".strip() if manager_user else ''),
                'email': (manager_user.email if manager_user else ''),
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

    return Response({'message': ClientChatMessageSerializer(msg).data}, status=status.HTTP_201_CREATED)


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
        if not client.platform_access or not client.active:
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
    
    transactions = Transaction.objects.filter(client=client).order_by('-datetime', '-created_at')
    serializer = TransactionSerializer(transactions, many=True)
    return Response({'transactions': serializer.data})

@api_view(['POST'])
@authentication_classes([])  # Disable authentication - we'll check manually to avoid 401 on invalid tokens
@permission_classes([AllowAny])
def client_transaction_create(request, client_id):
    """Créer une transaction pour un client"""
    client = get_object_or_404(Client, id=client_id)
    
    # Check if it's a client accessing their own data
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else request.GET.get('token', '')
    
    if token and token.startswith('client_'):
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.platform_access or not client.active:
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
    
    # Validate required fields
    if not request.data.get('type'):
        return Response({'error': 'Le type de transaction est requis'}, status=status.HTTP_400_BAD_REQUEST)
    if not request.data.get('amount'):
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
    
    # Get product (subscription productId preferred; otherwise infer from transfer_to)
    product = None
    if subscription_details_data and subscription_details_data.get('productId'):
        try:
            product = Product.objects.get(id=subscription_details_data.get('productId'))
        except Product.DoesNotExist:
            product = None
    
    # Validate balance for transfert transactions (balance → product)
    transaction_type = request.data.get('type')
    transfer_from = request.data.get('from_field') or request.data.get('transfer_from')
    transfer_to = request.data.get('to_field') or request.data.get('transfer_to')
    transaction_amount = float(request.data.get('amount', 0))
    
    # Auto-set transfer_to for subscription transactions (transfert with product)
    # We only need transfer_to: if it's a product ID, it's an investment (balance → product)
    if transaction_type == 'transfert' and product:
        # If transfer_to is not provided but product exists, assume it's a subscription (balance → product)
        if not transfer_to:
            transfer_to = product.id
        # Auto-set transfer_from to 'balance' for backward compatibility (but we mainly use transfer_to)
        if not transfer_from:
            transfer_from = 'balance'

    # If it's a transfert investment but product wasn't resolved yet, infer from transfer_to
    if transaction_type == 'transfert' and not product and transfer_to and transfer_to != 'balance':
        try:
            product = Product.objects.get(id=transfer_to)
        except Product.DoesNotExist:
            product = None

    # If admin created a transfert without subscription form, auto-fill all possible subscription details
    if transaction_type == 'transfert' and product:
        try:
            amount_dec = Decimal(str(request.data.get('amount') or 0))
        except Exception:
            amount_dec = Decimal('0')
        defaults = _build_subscription_details_defaults(
            client=client,
            product=product,
            amount=amount_dec,
            transaction_datetime=transaction_datetime,
            request=request,
        )
        subscription_details_data = _merge_missing_fields(subscription_details_data, defaults)
    
    # Check if it's an investment (transfer_to is a product ID, not 'balance')
    if transaction_type == 'transfert' and transfer_to and transfer_to != 'balance':
        # Calculate available balance from completed transactions
        completed_transactions = Transaction.objects.filter(
            client=client,
            status='termine'
        )
        
        calculated_invested_capital = 0
        calculated_trading_portfolio = 0
        calculated_bonus = 0
        
        for txn in completed_transactions:
            amount = float(txn.amount)
            if txn.type == 'depot':
                calculated_invested_capital += amount
            elif txn.type == 'retrait':
                calculated_invested_capital -= amount
            elif txn.type == 'bonus':
                calculated_bonus += amount
                calculated_invested_capital += amount
            elif txn.type in ['achat', 'investissement']:
                calculated_trading_portfolio += amount
            elif txn.type == 'vente':
                calculated_trading_portfolio -= amount
            elif txn.type == 'transfert':
                txn_to = txn.transfer_to
                if txn_to and txn_to != 'balance':
                    # Investment: balance → product (transfer_to is product ID)
                    calculated_trading_portfolio += amount
                elif txn_to == 'balance':
                    # Withdrawal: product → balance
                    calculated_trading_portfolio -= amount
        
        # Always use calculated values from transactions (not client object values)
        # This ensures we get fresh data even if client.invested_capital/trading_portfolio are stale
        invested_capital = calculated_invested_capital
        trading_portfolio = calculated_trading_portfolio
        bonus = calculated_bonus
        
        # Available funds = invested_capital - trading_portfolio (bonus is included in invested_capital and available)
        available_funds = invested_capital - trading_portfolio
        
        if transaction_amount > available_funds:
            return Response({
                'error': f'Fonds insuffisants. Solde disponible: {available_funds:.2f} EUR, montant demandé: {transaction_amount:.2f} EUR'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    # Create transaction
    transaction = Transaction.objects.create(
        id=transaction_id,
        client=client,
        type=request.data.get('type'),
        amount=request.data.get('amount'),
        description=request.data.get('description', ''),
        status=request.data.get('status', 'en_cours'),
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

    # If this transfert starts an investment (to -> product), create monthly positions immediately.
    if transaction.type == 'transfert' and transaction.transfer_to and transaction.transfer_to != 'balance':
        try:
            create_positions_for_investment(transaction)
        except Exception as pos_err:
            # Don't fail transaction creation if positions generation fails
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create positions for transaction {transaction.id}: {str(pos_err)}")
            import traceback
            logger.error(traceback.format_exc())
    
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
            client_name=client_name_for_log
        )
    except Exception as log_error:
        # Log the error but don't fail the transaction creation
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to create log entry for transaction {transaction_id}: {str(log_error)}")
        import traceback
        logger.error(traceback.format_exc())
    
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
        and original_transfer_to != 'balance'
    )
    
    # Authorization check: Only allow client accessing their own data OR authenticated users
    token = request.headers.get('Authorization', '').replace('Bearer ', '') or request.GET.get('token', '')
    is_client_token = token and token.startswith('client_')
    
    if is_client_token:
        # Client token: verify it matches the client_id
        token_client_id = token.replace('client_', '')
        if token_client_id != client_id:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
        if not client.platform_access or not client.active:
            return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)
    elif not request.user.is_authenticated:
        # No authentication: deny access
        return Response({'error': 'Authentification requise'}, status=status.HTTP_401_UNAUTHORIZED)
    
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
        from django.utils.dateparse import parse_datetime
        datetime_str = request.data.get('datetime')
        transaction_datetime = parse_datetime(datetime_str)
        if transaction_datetime:
            transaction.datetime = transaction_datetime
    
    # Update transfer_to field (accept both to_field and transfer_to)
    # We mainly use transfer_to: product ID = investment, 'balance' = withdrawal
    if 'to_field' in request.data or 'transfer_to' in request.data:
        transaction.transfer_to = request.data.get('to_field') or request.data.get('transfer_to')
    
    # Update transfer_from for backward compatibility (but we mainly use transfer_to)
    if 'from_field' in request.data or 'transfer_from' in request.data:
        transaction.transfer_from = request.data.get('from_field') or request.data.get('transfer_from')
    
    # Auto-set transfer_to for transfert transactions with product if missing
    if transaction.type == 'transfert' and transaction.product:
        if not transaction.transfer_to:
            transaction.transfer_to = transaction.product.id
        # Auto-set transfer_from to 'balance' for backward compatibility
        if not transaction.transfer_from:
            transaction.transfer_from = 'balance'
    
    transaction.save()

    is_investment = (transaction.type == 'transfert' and transaction.transfer_to and transaction.transfer_to != 'balance')

    # Ensure transaction has subscription details even if created/edited by admin without subscription form
    if is_investment:
        # Try to resolve product and persist it on transaction for consistency
        product = transaction.product
        if not product and transaction.transfer_to and transaction.transfer_to != 'balance':
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
            defaults = _build_subscription_details_defaults(
                client=client,
                product=product,
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
    # If an investment becomes "termine", this is the moment it starts: create monthly positions.
    # Also backfill if it's already termine but positions are missing (idempotent).
    if is_investment and transaction.status == 'termine':
        if previous_status != 'termine' or not Position.objects.filter(transaction=transaction).exists():
            try:
                create_positions_for_investment(transaction)
            except Exception as pos_err:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create positions for transaction {transaction.id} on status termine: {str(pos_err)}")
                import traceback
                logger.error(traceback.format_exc())
    if is_investment and not was_investment:
        # Transaction now represents an investment start: create positions
        try:
            create_positions_for_investment(transaction)
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
            client_name=client_name_for_log
        )
    
    serializer = TransactionSerializer(transaction)
    return Response(serializer.data)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_transaction_delete(request, client_id, transaction_id):
    """Supprimer une transaction"""
    client = get_object_or_404(Client, id=client_id)
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
            if not client.platform_access or not client.active:
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
            if not client.platform_access or not client.active:
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
    
    # Handle profitability - can be None if noProfitability is 'Oui'
    profitability = request.data.get('profitability')
    if profitability is not None:
        try:
            profitability = float(profitability)
        except (ValueError, TypeError):
            profitability = None
    
    # Handle boolean conversion from FormData (FormData sends strings)
    active_value = request.data.get('active', True)
    if isinstance(active_value, str):
        active_value = active_value.lower() == 'true'
    else:
        active_value = bool(active_value)
    
    is_savings_value = request.data.get('isSavings', False)
    if isinstance(is_savings_value, str):
        is_savings_value = is_savings_value.lower() == 'true'
    else:
        is_savings_value = bool(is_savings_value)
    
    # Handle subcategory: use subcategory if provided, otherwise fallback to type for backward compatibility
    subcategory_value = request.data.get('subcategory', '') or request.data.get('type', '')
    
    product = Product.objects.create(
        id=product_id,
        name=request.data.get('name', ''),
        reference=request.data.get('reference', ''),
        type=request.data.get('type', ''),
        category=category,
        subcategory=subcategory_value,
        status=request.data.get('status', 'Brouillon'),
        price=request.data.get('price', 0),
        profitability=profitability,
        duration=request.data.get('duration', ''),
        description=request.data.get('description', ''),
        cgv=request.data.get('cgv', ''),
        active=active_value,
        # Gestion de la rentabilité
        no_profitability=request.data.get('noProfitability', 'Oui'),
        is_variable_profitability=request.data.get('isVariableProfitability', 'Non'),
        variable_profitability=request.data.get('variableProfitability', ''),
        profitability_period=request.data.get('profitabilityPeriod', ''),
        show_min_profitability=request.data.get('showMinProfitability', 'Non'),
        interest_period=request.data.get('interestPeriod', ''),
        capitalisation_fonds=request.data.get('capitalisationFonds', 'Non'),
        # Gestion du produit
        show_on_launch=request.data.get('showOnLaunch', 'Non'),
        availability_start=availability_start,
        availability_end=availability_end,
        is_savings=is_savings_value,
        link_to_assets=request.data.get('linkToAssets', 'Non'),
        # Gestion des prix
        enable_price_variation=request.data.get('enablePriceVariation', 'Non'),
        min_entry_value=request.data.get('minEntryValue'),
        max_entry_value=request.data.get('maxEntryValue'),
        min_price_variation=request.data.get('minPriceVariation'),
        max_price_variation=request.data.get('maxPriceVariation'),
        current_price_variation=request.data.get('currentPriceVariation')
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
            
            # Verify the image was saved and uploaded to Cloudinary
            if not product.image:
                return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Get the actual Cloudinary URL to extract the real public_id
            # Cloudinary may add suffixes (like _vlhlvf) to filenames, so we need to use the actual public_id
            try:
                storage = product.image.storage
                from api.storage import CloudinaryMediaStorage
                if isinstance(storage, CloudinaryMediaStorage):
                    # Get the actual Cloudinary URL
                    cloudinary_url = product.image.url
                    print(f"Cloudinary URL: {cloudinary_url}")
                    
                    # Extract public_id from Cloudinary URL
                    # Format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}
                    if cloudinary_url and 'res.cloudinary.com' in cloudinary_url and '/image/upload/' in cloudinary_url:
                        # Extract the public_id from the URL
                        url_parts = cloudinary_url.split('/image/upload/')
                        if len(url_parts) == 2:
                            # Remove version prefix (v1/, v2/, etc.) if present
                            public_id_part = url_parts[1]
                            if public_id_part.startswith('v') and '/' in public_id_part:
                                # Skip version: v1/media/products/... -> media/products/...
                                public_id_part = public_id_part.split('/', 1)[1]
                            
                            # This is the actual public_id in Cloudinary
                            actual_public_id = public_id_part
                            print(f"Actual Cloudinary public_id: {actual_public_id}")
                            
                            # Update the database with the actual public_id if it's different
                            if product.image.name != actual_public_id:
                                print(f"Updating database filename from '{product.image.name}' to '{actual_public_id}'")
                                # Update the image field directly
                                product.image.name = actual_public_id
                                product.save(update_fields=['image'])
                                # Refresh to verify
                                product.refresh_from_db(fields=['image'])
                                print(f"Updated database filename: {product.image.name}")
            except Exception as url_error:
                print(f"Warning: Could not extract Cloudinary public_id: {str(url_error)}")
                import traceback
                print(traceback.format_exc())
            
            # Verify the file exists in Cloudinary storage
            try:
                storage = product.image.storage
                
                # Check if storage is Cloudinary storage
                from api.storage import CloudinaryMediaStorage
                if isinstance(storage, CloudinaryMediaStorage):
                    # Cloudinary handles uploads automatically and provides URLs
                    # Verify the image URL is accessible
                    try:
                        image_url = product.image.url
                        if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                            print(f"Image successfully uploaded to Cloudinary: {product.image.name}")
                            print(f"Cloudinary URL: {image_url[:100]}...")
                        else:
                            print(f"WARNING: Image URL not generated properly: {image_url}")
                    except Exception as url_error:
                        print(f"WARNING: Could not verify Cloudinary URL: {str(url_error)}")
                else:
                    print(f"INFO: Storage backend is {type(storage).__name__}")
                    print(f"Image path: {product.image.name}")
                    if product.image:
                        print(f"Image URL: {product.image.url}")
            except Exception as verify_error:
                import traceback
                print(f"Warning: Could not verify image in Cloudinary: {str(verify_error)}")
                print(traceback.format_exc())
            
            # Refresh the image field to ensure the URL is updated
            product.refresh_from_db(fields=['image'])
            
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Error uploading image: {error_msg}")
            print(traceback.format_exc())
            return Response({'error': f'Error uploading image: {error_msg}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
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
            if not client.platform_access or not client.active:
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
    return Response({'product': serializer.data}, status=status.HTTP_200_OK)

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def product_update(request, product_id):
    """Mettre à jour un produit"""
    from datetime import datetime
    
    product = get_object_or_404(Product, id=product_id)
    
    if 'name' in request.data:
        product.name = request.data['name']
    if 'reference' in request.data:
        product.reference = request.data['reference']
    if 'type' in request.data:
        # Always update type, even if empty string
        product.type = request.data['type'] or ''
    
    # Handle subcategory: use subcategory if provided, otherwise fallback to type for backward compatibility
    if 'subcategory' in request.data:
        # Always update subcategory, even if empty string
        product.subcategory = request.data['subcategory'] or ''
    elif 'type' in request.data:
        # Fallback: use type as subcategory if subcategory is not provided (backward compatibility)
        product.subcategory = request.data['type'] or ''
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
    if 'price' in request.data:
        product.price = request.data['price']
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
        # Si profitability est explicitement null/undefined et noProfitability est 'Oui', mettre à None
        elif profitability is None and request.data.get('noProfitability') == 'Oui':
            product.profitability = None
    if 'duration' in request.data:
        product.duration = request.data['duration']
    if 'description' in request.data:
        product.description = request.data['description']
    if 'cgv' in request.data:
        product.cgv = request.data['cgv']
    if 'active' in request.data:
        active_value = request.data['active']
        # Handle both string and boolean values (FormData sends strings)
        if isinstance(active_value, str):
            product.active = active_value.lower() == 'true'
        else:
            product.active = bool(active_value)
    
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
            
            # Verify the image was saved and uploaded to Cloudinary
            if not product.image:
                return Response({'error': 'Image upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Get the actual Cloudinary URL to extract the real public_id
            # Cloudinary may add suffixes (like _vlhlvf) to filenames, so we need to use the actual public_id
            try:
                storage = product.image.storage
                from api.storage import CloudinaryMediaStorage
                if isinstance(storage, CloudinaryMediaStorage):
                    # Get the actual Cloudinary URL
                    cloudinary_url = product.image.url
                    print(f"Cloudinary URL: {cloudinary_url}")
                    
                    # Extract public_id from Cloudinary URL
                    # Format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}
                    if cloudinary_url and 'res.cloudinary.com' in cloudinary_url and '/image/upload/' in cloudinary_url:
                        # Extract the public_id from the URL
                        url_parts = cloudinary_url.split('/image/upload/')
                        if len(url_parts) == 2:
                            # Remove version prefix (v1/, v2/, etc.) if present
                            public_id_part = url_parts[1]
                            if public_id_part.startswith('v') and '/' in public_id_part:
                                # Skip version: v1/media/products/... -> media/products/...
                                public_id_part = public_id_part.split('/', 1)[1]
                            
                            # This is the actual public_id in Cloudinary
                            actual_public_id = public_id_part
                            print(f"Actual Cloudinary public_id: {actual_public_id}")
                            
                            # Update the database with the actual public_id if it's different
                            if product.image.name != actual_public_id:
                                print(f"Updating database filename from '{product.image.name}' to '{actual_public_id}'")
                                # Update the image field directly
                                product.image.name = actual_public_id
                                product.save(update_fields=['image'])
                                # Refresh to verify
                                product.refresh_from_db(fields=['image'])
                                print(f"Updated database filename: {product.image.name}")
            except Exception as url_error:
                print(f"Warning: Could not extract Cloudinary public_id: {str(url_error)}")
                import traceback
                print(traceback.format_exc())
            
            # Verify the file exists in Cloudinary storage
            try:
                storage = product.image.storage
                
                # Check if storage is Cloudinary storage
                from api.storage import CloudinaryMediaStorage
                if isinstance(storage, CloudinaryMediaStorage):
                    # Cloudinary handles uploads automatically and provides URLs
                    # Verify the image URL is accessible
                    try:
                        image_url = product.image.url
                        if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                            print(f"Image successfully uploaded to Cloudinary: {product.image.name}")
                            print(f"Cloudinary URL: {image_url[:100]}...")
                        else:
                            print(f"WARNING: Image URL not generated properly: {image_url}")
                    except Exception as url_error:
                        print(f"WARNING: Could not verify Cloudinary URL: {str(url_error)}")
                else:
                    print(f"INFO: Storage backend is {type(storage).__name__}")
                    print(f"Image path: {product.image.name}")
                    if product.image:
                        print(f"Image URL: {product.image.url}")
            except Exception as verify_error:
                import traceback
                print(f"Warning: Could not verify image in Cloudinary: {str(verify_error)}")
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
    
    # Gestion de la rentabilité
    if 'noProfitability' in request.data:
        product.no_profitability = request.data['noProfitability']
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
    if 'showMinProfitability' in request.data:
        product.show_min_profitability = request.data['showMinProfitability']
    if 'interestPeriod' in request.data:
        interest_period_value = request.data['interestPeriod']
        # Trim whitespace and save, or empty string if None/empty
        if interest_period_value:
            product.interest_period = str(interest_period_value).strip()
        else:
            product.interest_period = ''
    if 'capitalisationFonds' in request.data:
        product.capitalisation_fonds = request.data['capitalisationFonds']
    
    # Gestion du produit
    if 'showOnLaunch' in request.data:
        product.show_on_launch = request.data['showOnLaunch']
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
    if 'isSavings' in request.data:
        is_savings_value = request.data['isSavings']
        # Handle both string and boolean values (FormData sends strings)
        if isinstance(is_savings_value, str):
            product.is_savings = is_savings_value.lower() == 'true'
        else:
            product.is_savings = bool(is_savings_value)
    if 'linkToAssets' in request.data:
        product.link_to_assets = request.data['linkToAssets']
    
    # Gestion des prix
    if 'enablePriceVariation' in request.data:
        product.enable_price_variation = request.data['enablePriceVariation']
    if 'minEntryValue' in request.data:
        min_entry = request.data['minEntryValue']
        product.min_entry_value = float(min_entry) if min_entry is not None and min_entry != '' else None
    if 'maxEntryValue' in request.data:
        max_entry = request.data['maxEntryValue']
        product.max_entry_value = float(max_entry) if max_entry is not None and max_entry != '' else None
    if 'minPriceVariation' in request.data:
        min_var = request.data['minPriceVariation']
        product.min_price_variation = float(min_var) if min_var is not None and min_var != '' else None
    if 'maxPriceVariation' in request.data:
        max_var = request.data['maxPriceVariation']
        product.max_price_variation = float(max_var) if max_var is not None and max_var != '' else None
    if 'currentPriceVariation' in request.data:
        current_var = request.data['currentPriceVariation']
        product.current_price_variation = float(current_var) if current_var is not None and current_var != '' else None
    
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
    
    serializer = ProductSerializer(product, context={'request': request})
    return Response(serializer.data)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def product_delete(request, product_id):
    """Supprimer un produit"""
    product = get_object_or_404(Product, id=product_id)
    product.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_toggle_active(request, product_id):
    """Activer/Désactiver un produit"""
    product = get_object_or_404(Product, id=product_id)
    product.active = not product.active
    product.save()
    serializer = ProductSerializer(product)
    return Response(serializer.data)

# AI Generation endpoints
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_generate_description(request):
    """Générer une description de produit avec l'IA Gemini"""
    try:
        import google.generativeai as genai
        
        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-pro')
        
        name = request.data.get('name', '')
        category_id = request.data.get('categoryId', '')
        price = request.data.get('price', '')
        profitability = request.data.get('profitability', '')
        
        # Get category name if available
        category_name = ''
        if category_id:
            try:
                category = ProductCategory.objects.get(id=category_id)
                category_name = category.title
            except ProductCategory.DoesNotExist:
                pass
        
        prompt = f"""Génère une description professionnelle et attrayante en français pour un produit d'investissement financier avec les caractéristiques suivantes:
- Nom: {name or 'Non spécifié'}
- Catégorie: {category_name or 'Non spécifiée'}
- Prix: {price or 'Non spécifié'}€
- Rentabilité: {profitability or 'Non spécifiée'}%

La description doit être:
- Professionnelle et rassurante
- Mise en avant des avantages pour l'investisseur
- Environ 3-4 phrases
- En français
- Sans caractères spéciaux de formatage (pas de markdown)

Description:"""
        
        response = model.generate_content(prompt)
        description = response.text.strip()
        
        return Response({'description': description, 'text': description})
    
    except ImportError:
        return Response(
            {'error': 'google-generativeai package not installed. Run: pip install google-generativeai'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Error generating description: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def product_generate_cgv(request):
    """Générer des CGV (Conditions Générales de Vente) avec l'IA Gemini"""
    try:
        import google.generativeai as genai
        
        if not settings.GEMINI_API_KEY:
            return Response(
                {'error': 'GEMINI_API_KEY not configured'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-pro')
        
        name = request.data.get('name', '')
        category_id = request.data.get('categoryId', '')
        
        # Get category name if available
        category_name = ''
        if category_id:
            try:
                category = ProductCategory.objects.get(id=category_id)
                category_name = category.title
            except ProductCategory.DoesNotExist:
                pass
        
        prompt = f"""Génère des Conditions Générales de Vente (CGV) complètes et professionnelles en français pour un produit d'investissement financier avec les caractéristiques suivantes:
- Nom du produit: {name or 'Non spécifié'}
- Catégorie: {category_name or 'Non spécifiée'}

Les CGV doivent inclure les sections suivantes:
1. OBJET - Description du produit et des présentes conditions
2. CARACTÉRISTIQUES DU PRODUIT - Détails du produit
3. CONDITIONS D'ACQUISITION - Modalités d'achat
4. DROIT DE RÉTRACTATION - Délai et modalités
5. RESPONSABILITÉ - Limites de responsabilité
6. PROTECTION DES DONNÉES - Confidentialité

Format: Utilise des listes à puces (•) et numérotées (1., 2., etc.) pour structurer le texte.
Langue: Français
Style: Professionnel et conforme à la réglementation financière française

CGV:"""
        
        response = model.generate_content(prompt)
        cgv = response.text.strip()
        
        return Response({'cgv': cgv, 'text': cgv})
    
    except ImportError:
        return Response(
            {'error': 'google-generativeai package not installed. Run: pip install google-generativeai'}, 
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
def app_settings(request):
    """Get or update app settings (logo and colors)"""
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
                'primary_color': '#030213',
                'secondary_color': '',
                'accent_color': ''
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
                    'logo': None,
                    'logo_url': None,
                    'login_background_image': None,
                    'login_background_image_url': None,
                    'primary_color': settings_obj.primary_color or '#030213',
                    'secondary_color': settings_obj.secondary_color or '',
                    'accent_color': settings_obj.accent_color or '',
                    'created_at': settings_obj.created_at,
                    'updated_at': settings_obj.updated_at,
                    'error': f'Error loading logo: {str(e)}'
                })
        
        elif request.method in ['POST', 'PUT']:
            # Handle FormData for file uploads
            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            
            # Handle logo removal
            if data.get('remove_logo') == 'true':
                if settings_obj.logo:
                    settings_obj.logo.delete(save=False)
                settings_obj.logo = None
                settings_obj.save()

            # Handle login background removal
            if data.get('remove_login_background_image') == 'true':
                if settings_obj.login_background_image:
                    settings_obj.login_background_image.delete(save=False)
                settings_obj.login_background_image = None
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
                    
                    print(f"Uploading logo: {original_filename} as {custom_filename}")
                    
                    # Delete old logo if it exists
                    if settings_obj.logo:
                        print(f"Deleting old logo: {settings_obj.logo.name}")
                        settings_obj.logo.delete(save=False)
                    
                    # Save with custom filename - load into memory first to avoid temp-file issues on Windows/Python 3.14
                    from django.core.files.base import ContentFile
                    try:
                        logo_file.seek(0)
                    except Exception:
                        pass
                    settings_obj.logo.save(custom_filename, ContentFile(logo_file.read()), save=True)
                    
                    # Verify the logo was saved and uploaded to Cloudinary
                    if not settings_obj.logo:
                        return Response({'error': 'Logo upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    
                    # Verify Cloudinary upload
                    try:
                        storage = settings_obj.logo.storage
                        from api.storage import CloudinaryMediaStorage
                        if isinstance(storage, CloudinaryMediaStorage):
                            logo_url = settings_obj.logo.url
                            if logo_url and (logo_url.startswith('http://') or logo_url.startswith('https://')):
                                print(f"Logo successfully uploaded to Cloudinary: {settings_obj.logo.name}")
                                print(f"Cloudinary URL: {logo_url[:100]}...")
                    except Exception as verify_error:
                        print(f"Warning: Could not verify Cloudinary upload: {str(verify_error)}")
                except Exception as upload_error:
                    print(f"Error uploading logo: {str(upload_error)}")
                    import traceback
                    traceback.print_exc()
                    return Response({'error': f'Logo upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Handle login background image upload
            if 'login_background_image' in request.FILES:
                try:
                    bg_file = request.FILES['login_background_image']
                    original_filename = bg_file.name
                    _, ext = os.path.splitext(original_filename)
                    custom_filename = f'login_background{ext}'

                    # Delete old background if it exists
                    if settings_obj.login_background_image:
                        settings_obj.login_background_image.delete(save=False)

                    # Load into memory first to avoid temp-file issues on Windows/Python 3.14
                    from django.core.files.base import ContentFile
                    try:
                        bg_file.seek(0)
                    except Exception:
                        pass
                    settings_obj.login_background_image.save(custom_filename, ContentFile(bg_file.read()), save=True)

                    if not settings_obj.login_background_image:
                        return Response({'error': 'Background upload failed - file was not saved'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                except Exception as upload_error:
                    import traceback
                    traceback.print_exc()
                    return Response({'error': f'Background upload failed: {str(upload_error)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Update colors from request data
            if 'platform_name' in data:
                settings_obj.platform_name = (data.get('platform_name') or 'Panorama').strip()[:80]
            if 'primary_color' in data:
                settings_obj.primary_color = data.get('primary_color', '#030213')
            if 'secondary_color' in data:
                settings_obj.secondary_color = data.get('secondary_color', '')
            if 'accent_color' in data:
                settings_obj.accent_color = data.get('accent_color', '')
            
            settings_obj.save()
            
            serializer = AppSettingsSerializer(settings_obj, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Custom Token Refresh Serializer that handles missing users gracefully
class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Custom token refresh serializer that handles cases where the user referenced
    in the token no longer exists in the database.
    """
    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except TokenError:
            # Re-raise TokenError as-is (invalid/expired token)
            raise
        except DjangoUser.DoesNotExist:
            # User referenced in token doesn't exist - raise TokenError to return 401
            raise TokenError('User no longer exists')
        except Exception as e:
            # Check if it's a DoesNotExist exception by checking the error message or type
            error_str = str(e)
            error_type = type(e).__name__
            if 'DoesNotExist' in error_type or 'DoesNotExist' in error_str or 'matching query does not exist' in error_str:
                raise TokenError('User no longer exists')
            # Re-raise other exceptions
            raise


# Custom Token Refresh View that uses the custom serializer
class CustomTokenRefreshView(TokenRefreshView):
    """
    Custom token refresh view that handles cases where the user referenced
    in the token no longer exists in the database.
    """
    serializer_class = CustomTokenRefreshSerializer


@api_view(['GET', 'HEAD', 'OPTIONS'])
@permission_classes([AllowAny])
def media_proxy(request, file_path):
    """
    Proxy endpoint to serve media files from Cloudinary with proper CORS headers.
    Note: Cloudinary URLs are public by default, but this proxy ensures CORS headers are set.
    """
    from .storage import CloudinaryMediaStorage
    import requests
    from django.http import HttpResponse
    from django.core.exceptions import SuspiciousOperation

    # Handle OPTIONS request for CORS preflight
    if request.method == 'OPTIONS':
        response = Response()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        return response

    try:
        # Strip trailing slash if present
        file_path = file_path.rstrip('/')
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Media proxy requested for file: {file_path}")
        
        # Create storage instance
        storage = CloudinaryMediaStorage()

        # Generate the actual URL for the file
        try:
            file_url = storage.url(file_path)
            logger.info(f"Generated storage URL: {file_url[:150] if file_url else 'None'}...")
        except Exception as url_error:
            logger.error(f"Error generating storage URL for {file_path}: {str(url_error)}")
            import traceback
            logger.error(traceback.format_exc())
            return Response(
                {'error': f'Failed to generate storage URL: {str(url_error)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        if not file_url:
            logger.warning(f"Storage returned empty URL for file: {file_path}")
            return Response(
                {'error': 'File not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Cloudinary URLs are already complete and public, no need to modify them

        # Fetch the file from Cloudinary (HEAD for HEAD requests, GET otherwise)
        try:
            if request.method == 'HEAD':
                response = requests.head(file_url, timeout=30)
            else:
                response = requests.get(file_url, timeout=30)
        except Exception as fetch_error:
            logger.error(f"Error fetching file from {file_url[:150]}: {str(fetch_error)}")
            import traceback
            logger.error(traceback.format_exc())
            raise

        if response.status_code != 200:
            return Response(
                {'error': 'Failed to fetch file from storage'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Create Django response
        content_type = response.headers.get('content-type', 'application/octet-stream')
        if request.method == 'HEAD':
            # HEAD request - return headers only, no body
            django_response = HttpResponse()
            django_response['Content-Type'] = content_type
        else:
            # GET request - return file content
            django_response = HttpResponse(
                response.content,
                content_type=content_type
            )

        # Add CORS headers to allow the frontend to access the image
        django_response['Access-Control-Allow-Origin'] = '*'
        django_response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        django_response['Access-Control-Allow-Headers'] = '*'

        # Copy other relevant headers
        if 'content-disposition' in response.headers:
            django_response['Content-Disposition'] = response.headers['content-disposition']
        if 'cache-control' in response.headers:
            django_response['Cache-Control'] = response.headers['cache-control']
        if 'etag' in response.headers:
            django_response['ETag'] = response.headers['etag']

        return django_response

    except requests.exceptions.Timeout:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Timeout fetching media file: {file_path}")
        return Response(
            {'error': 'Request timeout'},
            status=status.HTTP_408_REQUEST_TIMEOUT
        )
    except requests.exceptions.RequestException as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Request exception fetching media file {file_path}: {str(e)}")
        logger.error(traceback.format_exc())
        return Response(
            {'error': f'Failed to fetch media: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Unexpected error in media_proxy for {file_path}: {str(e)}")
        logger.error(traceback.format_exc())
        return Response(
            {'error': f'Unexpected error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

# News Posts endpoints
@api_view(['GET'])
@authentication_classes([])  # Disable authentication - don't validate tokens
@permission_classes([AllowAny])  # Allow clients to view published news
def news_list(request):
    """Liste toutes les actualités publiées"""
    news_posts = NewsPost.objects.filter(published=True).order_by('-created_at')
    serializer = NewsPostSerializer(news_posts, many=True, context={'request': request})
    return Response({'news': serializer.data})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def news_list_all(request):
    """Liste toutes les actualités (admin seulement)"""
    news_posts = NewsPost.objects.all().order_by('-created_at')
    serializer = NewsPostSerializer(news_posts, many=True, context={'request': request})
    return Response({'news': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def news_create(request):
    """Créer une nouvelle actualité"""
    # Generate ID
    max_id = 0
    for id_val in NewsPost.objects.values_list('id', flat=True):
        try:
            int_id = int(id_val)
            if int_id > max_id:
                max_id = int_id
        except (ValueError, TypeError):
            continue
    
    new_id = max_id + 1
    news_id = str(new_id)
    
    if len(news_id) > 12:
        import uuid
        while True:
            news_id = uuid.uuid4().hex[:12]
            if not NewsPost.objects.filter(id=news_id).exists():
                break
    
    # Create news post
    serializer = NewsPostSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        news_post = serializer.save(id=news_id, author=request.user)
        return Response(NewsPostSerializer(news_post, context={'request': request}).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def news_update(request, news_id):
    """Mettre à jour une actualité"""
    try:
        news_post = NewsPost.objects.get(id=news_id)
    except NewsPost.DoesNotExist:
        return Response({'error': 'News post not found'}, status=status.HTTP_404_NOT_FOUND)
    
    serializer = NewsPostSerializer(news_post, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def news_delete(request, news_id):
    """Supprimer une actualité"""
    try:
        news_post = NewsPost.objects.get(id=news_id)
    except NewsPost.DoesNotExist:
        return Response({'error': 'News post not found'}, status=status.HTTP_404_NOT_FOUND)
    
    news_post.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def news_fetch_from_api(request):
    """Récupérer les actualités financières depuis NewsAPI"""
    import requests
    import os
    from datetime import datetime, timedelta
    
    news_api_key = os.getenv('NEWS_API_KEY', '')
    if not news_api_key:
        return Response({'error': 'NewsAPI key not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    try:
        # Fetch finance/investing-focused news and reduce noise.
        # Strategy:
        # - Use a finance-oriented query (FR + EN keywords)
        # - Restrict to reputable business/finance domains
        # - Search in title/description only (less spammy than full content)
        # - Limit to recent articles
        url = 'https://newsapi.org/v2/everything'
        from_date = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')

        # You can override domains and query via query params if needed (admin use).
        domains = request.GET.get('domains', '') or (
            'lesechos.fr,latribune.fr,boursorama.com,capital.fr,challenges.fr,investir.lesechos.fr,zonebourse.com,'
            'reuters.com,bloomberg.com,ft.com,wsj.com,institutional-investor.com,cointelegraph.com,cointribune.com'
        )

        q = request.GET.get('q', '') or (
            '('
            'bourse OR marchés OR actions OR obligations OR taux OR inflation OR '
            'banque OR \"banque centrale\" OR \"politique monétaire\" OR '
            'investissement OR \"gestion de patrimoine\" OR portefeuille OR '
            'ETF OR dividende OR résultats OR \"marchés financiers\" OR '
            'crypto OR bitcoin OR ethereum OR '
            'finance OR financial OR investment OR \"stock market\" OR trading OR banking'
            ')'
            ' AND NOT (sport OR football OR tennis OR recette OR cuisine OR people OR cinéma OR série OR météo)'
        )

        params = {
            'q': q,
            'language': 'fr',
            'searchIn': 'title,description',
            'domains': domains,
            'from': from_date,
            'sortBy': 'publishedAt',
            'pageSize': int(request.GET.get('pageSize', 30)),
            'apiKey': news_api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        articles = data.get('articles', [])
        return Response({'articles': articles})
    except requests.exceptions.RequestException as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching news from NewsAPI: {str(e)}")
        return Response({'error': f'Failed to fetch news: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Unexpected error fetching news: {str(e)}")
        return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def news_import_from_api(request):
    """Importer une actualité depuis NewsAPI dans la base de données"""
    article_data = request.data.get('article')
    if not article_data:
        return Response({'error': 'Article data is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Generate ID
        max_id = 0
        for id_val in NewsPost.objects.values_list('id', flat=True):
            try:
                int_id = int(id_val)
                if int_id > max_id:
                    max_id = int_id
            except (ValueError, TypeError):
                continue
        
        new_id = max_id + 1
        news_id = str(new_id)
        
        if len(news_id) > 12:
            import uuid
            while True:
                news_id = uuid.uuid4().hex[:12]
                if not NewsPost.objects.filter(id=news_id).exists():
                    break
        
        # Create news post from article data
        title = article_data.get('title', '')[:200]
        content = article_data.get('description', '') or article_data.get('content', '')
        image_url = article_data.get('urlToImage', '')
        source_name = ''
        try:
            source_name = (article_data.get('source') or {}).get('name', '') or ''
        except Exception:
            source_name = ''
        article_url = article_data.get('url', '') or ''
        
        # Create news post
        news_post = NewsPost.objects.create(
            id=news_id,
            title=title,
            content=content,
            source_name=source_name[:200],
            article_url=article_url[:500],
            author=request.user,
            published=True
        )
        
        # Download and save image if available
        if image_url:
            try:
                import requests
                from io import BytesIO
                from django.core.files.base import ContentFile
                from django.core.files.images import ImageFile
                
                img_response = requests.get(image_url, timeout=10)
                if img_response.status_code == 200:
                    img_content = ContentFile(img_response.content)
                    news_post.image.save(
                        f'news_{news_id}.jpg',
                        img_content,
                        save=True
                    )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not download image for news post {news_id}: {str(e)}")
        
        serializer = NewsPostSerializer(news_post, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error importing news from API: {str(e)}")
        return Response({'error': f'Failed to import news: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def news_bulk_import_from_api(request):
    """Importer plusieurs actualités depuis NewsAPI dans la base de données"""
    articles_data = request.data.get('articles', [])
    if not articles_data or not isinstance(articles_data, list):
        return Response({'error': 'Articles array is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    imported_posts = []
    errors = []
    
    # Get max ID once at the start
    max_id = 0
    for id_val in NewsPost.objects.values_list('id', flat=True):
        try:
            int_id = int(id_val)
            if int_id > max_id:
                max_id = int_id
        except (ValueError, TypeError):
            continue
    
    for idx, article_data in enumerate(articles_data):
        try:
            # Generate ID
            new_id = max_id + 1 + idx
            news_id = str(new_id)
            
            if len(news_id) > 12:
                import uuid
                while True:
                    news_id = uuid.uuid4().hex[:12]
                    if not NewsPost.objects.filter(id=news_id).exists():
                        break
            
            # Create news post from article data
            title = article_data.get('title', '')[:200]
            content = article_data.get('description', '') or article_data.get('content', '')
            image_url = article_data.get('urlToImage', '')
            source_name = ''
            try:
                source_name = (article_data.get('source') or {}).get('name', '') or ''
            except Exception:
                source_name = ''
            article_url = article_data.get('url', '') or ''
            
            # Create news post
            news_post = NewsPost.objects.create(
                id=news_id,
                title=title,
                content=content,
                source_name=source_name[:200],
                article_url=article_url[:500],
                author=request.user,
                published=True
            )
            
            # Download and save image if available
            if image_url:
                try:
                    import requests
                    from django.core.files.base import ContentFile
                    
                    img_response = requests.get(image_url, timeout=10)
                    if img_response.status_code == 200:
                        img_content = ContentFile(img_response.content)
                        news_post.image.save(
                            f'news_{news_id}.jpg',
                            img_content,
                            save=True
                        )
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Could not download image for news post {news_id}: {str(e)}")
            
            serializer = NewsPostSerializer(news_post, context={'request': request})
            imported_posts.append(serializer.data)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error importing article {idx} from API: {str(e)}")
            errors.append({'index': idx, 'error': str(e)})
    
    return Response({
        'imported': imported_posts,
        'errors': errors,
        'success_count': len(imported_posts),
        'error_count': len(errors)
    }, status=status.HTTP_201_CREATED)
