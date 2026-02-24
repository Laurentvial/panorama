from django.contrib.auth.models import User as DjangoUser
from rest_framework import serializers
from .models import Client, ClientConversation, ClientChatMessage, Note, UserDetails, Team, TeamMember, Log, ClientPlatformLog, Asset, ClientAsset, RIB, ClientRIB, UsefulLink, ClientUsefulLink, Transaction, ProductCategory, Product, ProductAssetAllocation, ClientProduct, Position, AppSettings, NewsPost, ClientVerificationConfig, ClientDocument, AppNotification
import uuid
from urllib.parse import urlparse, unquote

COMPLETED_TRANSACTION_STATUSES = ('valide',)

class UserSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.CharField(write_only=True, required=False, default='0')
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    teamId = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    
    class Meta:
        model = DjangoUser
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'phone', 'teamId']
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': False, 'allow_blank': True},
            'username': {'required': False, 'allow_blank': True}
        }
    
    def validate_username(self, value):
        """Validate username: strip whitespace and check for case-insensitive duplicates."""
        # Username is optional if email is provided (will be set in validate method)
        if value:
            value = value.strip()
            # Check for case-insensitive duplicate
            if DjangoUser.objects.filter(username__iexact=value).exists():
                raise serializers.ValidationError("A user with that username already exists.")
        return value
    
    def validate(self, data):
        """Use email as username if username is not provided."""
        email = data.get('email', '').strip() if data.get('email') else ''
        username = data.get('username', '').strip() if data.get('username') else ''
        
        # If email is provided and username is not, use email as username
        if email and not username:
            data['username'] = email
            # Validate that this email/username doesn't already exist
            if DjangoUser.objects.filter(username__iexact=email).exists():
                raise serializers.ValidationError({"email": "A user with this email already exists."})
        
        # If both are provided but different, use email as username
        elif email and username and email != username:
            data['username'] = email
            # Validate that this email/username doesn't already exist
            if DjangoUser.objects.filter(username__iexact=email).exists():
                raise serializers.ValidationError({"email": "A user with this email already exists."})
        
        # Ensure username is set
        if not data.get('username'):
            raise serializers.ValidationError({"email": "Email is required when username is not provided."})
        
        return data

    def create(self, validated_data):
        # Extract UserDetails fields
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        role = validated_data.pop('role', '0')
        phone = validated_data.pop('phone', '')
        # Ensure role doesn't exceed 12 characters (database constraint)
        role = str(role)[:12] if role else '0'
        team_id = validated_data.pop('teamId', None)
        
        # Get and normalize username (already validated and stripped in validate_username)
        username = validated_data.get('username', '').strip()
        
        # Create Django User
        user = DjangoUser.objects.create_user(
            username=username,
            email=validated_data.get('email', '').strip() if validated_data.get('email') else '',
            password=validated_data.get('password'),
            first_name=first_name.strip() if first_name else '',
            last_name=last_name.strip() if last_name else ''
        )

        # Generate a numeric UserDetails ID (str) incrementing from max existing one
        # Ensure it's always 12 characters or less
        max_id = 0
        for id_val in UserDetails.objects.values_list('id', flat=True):
            try:
                int_id = int(id_val)
                if int_id > max_id:
                    max_id = int_id
            except (ValueError, TypeError):
                continue
        
        # Generate new ID and ensure it doesn't exceed 12 characters
        new_id = max_id + 1
        user_details_id = str(new_id)
        
        # If the ID exceeds 12 characters, use a truncated UUID instead
        if len(user_details_id) > 12:
            # Generate a unique 12-character ID
            while True:
                user_details_id = uuid.uuid4().hex[:12]
                if not UserDetails.objects.filter(id=user_details_id).exists():
                    break

        # Create UserDetails entry for this user
        user_details = UserDetails.objects.create(
            id=user_details_id,
            django_user=user,
            role=role,
            phone=phone.strip() if phone else ''
        )
        
        # Create TeamMember if teamId provided
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
                pass
        
        return user

class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ['id', 'clientId', 'userId', 'text', 'created_at', 'updated_at']
        extra_kwargs = {
            'userId': {'read_only': True},
            'clientId': {'required': False, 'allow_null': True},
            'id': {'required': False}
        }

class ClientSerializer(serializers.ModelSerializer):
    firstName = serializers.SerializerMethodField()
    lastName = serializers.SerializerMethodField()
    fullName = serializers.SerializerMethodField()
    teamId = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    capital = serializers.SerializerMethodField()
    manager = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    
    class Meta:
        model = Client
        fields = '__all__'
    
    def get_firstName(self, obj):
        return obj.fname
    
    def get_lastName(self, obj):
        return obj.lname
    
    def get_fullName(self, obj):
        return f"{obj.fname} {obj.lname}".strip()
    
    def get_teamId(self, obj):
        # Retourner l'ID de l'équipe si elle existe
        return obj.team.id if obj.team else None
    
    def get_capital(self, obj):
        # Calculate invested capital from completed transactions
        # Use prefetched completed_transactions if available (from ClientView optimization)
        if hasattr(obj, 'completed_transactions'):
            transactions = obj.completed_transactions
        else:
            from .models import Transaction
            transactions = Transaction.objects.filter(
                client=obj,
                status__in=COMPLETED_TRANSACTION_STATUSES
            )
        
        calculated_invested_capital = 0
        for txn in transactions:
            amount = float(txn.amount) if txn.amount else 0
            if txn.type == 'depot':
                calculated_invested_capital += amount
            elif txn.type == 'retrait':
                calculated_invested_capital -= amount
            elif txn.type == 'bonus':
                calculated_invested_capital += amount
            elif txn.type == 'interets':
                # Interest transactions credit gains to cash balance
                calculated_invested_capital += amount
        
        # Use calculated value if transactions exist, otherwise fallback to stored value
        if transactions:
            return calculated_invested_capital
        else:
            return float(obj.invested_capital) if obj.invested_capital else 0
    
    def get_manager(self, obj):
        return obj.managed_by or ''
    
    def get_source(self, obj):
        # Source n'existe pas dans le modèle, retourner vide pour l'instant
        return ''
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # S'assurer que tous les champs sont présents et convertir en camelCase
        ret['firstName'] = instance.fname
        ret['lastName'] = instance.lname
        ret['fullName'] = f"{instance.fname} {instance.lname}".strip()
        ret['createdAt'] = instance.created_at
        # Calculate capital from transactions (invested capital)
        # Use prefetched completed_transactions if available (from ClientView optimization)
        if hasattr(instance, 'completed_transactions'):
            transactions = instance.completed_transactions
        else:
            from .models import Transaction
            transactions = Transaction.objects.filter(
                client=instance,
                status__in=COMPLETED_TRANSACTION_STATUSES
            )
        
        calculated_invested_capital = 0
        for txn in transactions:
            amount = float(txn.amount) if txn.amount else 0
            if txn.type == 'depot':
                calculated_invested_capital += amount
            elif txn.type == 'retrait':
                calculated_invested_capital -= amount
            elif txn.type == 'bonus':
                calculated_invested_capital += amount
            elif txn.type == 'interets':
                # Interest transactions credit gains to cash balance
                calculated_invested_capital += amount
        
        # Use calculated value if transactions exist, otherwise fallback to stored value
        if transactions:
            ret['capital'] = calculated_invested_capital
        else:
            ret['capital'] = float(instance.invested_capital) if instance.invested_capital else 0
        ret['source'] = instance.source or ''
        ret['teamId'] = instance.team.id if instance.team else None
        ret['teamName'] = instance.team.name if instance.team else ''
        
        # Get manager user details if managed_by is set
        # managed_by should always contain the user ID
        manager_user = None
        manager_id = None
        if instance.managed_by:
            try:
                # Try to find user by ID first (managed_by should be an ID)
                try:
                    # Check if managed_by is a numeric ID
                    manager_id = int(instance.managed_by)
                    manager_user = DjangoUser.objects.filter(id=manager_id).first()
                except (ValueError, TypeError):
                    # If not numeric, try as username (for backward compatibility)
                    manager_user = DjangoUser.objects.filter(username=instance.managed_by).first()
                    if manager_user:
                        manager_id = manager_user.id
            except Exception:
                pass
        
        if manager_user:
            ret['managerId'] = str(manager_user.id)  # DjangoUser.id
            ret['manager'] = str(manager_user.id)  # Always return the ID, not the username
            ret['managerName'] = f"{manager_user.first_name} {manager_user.last_name}".strip() or manager_user.username
            ret['managerEmail'] = manager_user.email or ''
            # Get manager's team and UserDetails ID for frontend compatibility
            try:
                manager_user_details = manager_user.user_details
                ret['managerUserDetailsId'] = manager_user_details.id  # UserDetails.id for Select component
                manager_team_member = manager_user_details.team_memberships.first()
                if manager_team_member:
                    ret['managerTeamId'] = manager_team_member.team.id
                    ret['managerTeamName'] = manager_team_member.team.name
                else:
                    ret['managerTeamId'] = None
                    ret['managerTeamName'] = ''
            except:
                ret['managerUserDetailsId'] = None
                ret['managerTeamId'] = None
                ret['managerTeamName'] = ''
        else:
            ret['managerId'] = None
            ret['manager'] = instance.managed_by or ''  # Keep original value if user not found
            ret['managerName'] = ''
            ret['managerEmail'] = ''
            ret['managerUserDetailsId'] = None
            ret['managerTeamId'] = None
            ret['managerTeamName'] = ''
        
        # Convertir les champs personnels de snake_case à camelCase
        if instance.profile_photo:
            profile_url = instance.profile_photo.url
            # Cloudinary URLs are public by default, return them directly
            if profile_url and (profile_url.startswith('http://') or profile_url.startswith('https://')):
                ret['profilePhoto'] = profile_url
            else:
                # Local path - build absolute URI
                request = self.context.get('request')
                if request:
                    ret['profilePhoto'] = request.build_absolute_uri(profile_url) if profile_url else ''
                else:
                    ret['profilePhoto'] = profile_url if profile_url else ''
        else:
            ret['profilePhoto'] = ''
        ret['civility'] = ret.get('civility', '') or ''
        ret['password'] = ret.get('password', '') or ''
        ret['active'] = bool(ret.get('active', True))
        ret['middleName'] = ret.get('middle_name', '') or ''
        ret['legalName'] = ret.get('legal_name', '') or ''
        ret['sex'] = ret.get('sex', '') or ''
        ret['accountVerified'] = bool(ret.get('account_verified', False))
        ret['preferences'] = ret.get('preferences', []) or []
        ret['tradingObjective'] = ret.get('trading_objective', '') or ''
        ret['plannedInvestment12m'] = ret.get('planned_investment_12m', '') or ''
        ret['riskRewardProfile'] = ret.get('risk_reward_profile', '') or ''
        ret['complianceFamilyFlags'] = ret.get('compliance_family_flags', []) or []
        ret['fundsSources'] = ret.get('funds_sources', []) or []
        ret['primaryProfession'] = ret.get('primary_profession', '') or ''
        ret['employerName'] = ret.get('employer_name', '') or ''
        ret['annualNetIncome'] = ret.get('annual_net_income', '') or ''
        ret['totalLiquidities'] = ret.get('total_liquidities', '') or ''
        
        # KYC fields
        if instance.identity_document:
            identity_url = instance.identity_document.url
            if identity_url and (identity_url.startswith('http://') or identity_url.startswith('https://')):
                ret['identityDocument'] = identity_url
            else:
                request = self.context.get('request')
                if request:
                    ret['identityDocument'] = request.build_absolute_uri(identity_url) if identity_url else ''
                else:
                    ret['identityDocument'] = identity_url if identity_url else ''
        else:
            ret['identityDocument'] = ''
        
        if instance.identity_document_verso:
            identity_verso_url = instance.identity_document_verso.url
            if identity_verso_url and (identity_verso_url.startswith('http://') or identity_verso_url.startswith('https://')):
                ret['identityDocumentVerso'] = identity_verso_url
            else:
                request = self.context.get('request')
                if request:
                    ret['identityDocumentVerso'] = request.build_absolute_uri(identity_verso_url) if identity_verso_url else ''
                else:
                    ret['identityDocumentVerso'] = identity_verso_url if identity_verso_url else ''
        else:
            ret['identityDocumentVerso'] = ''
        
        if instance.proof_of_address:
            address_url = instance.proof_of_address.url
            if address_url and (address_url.startswith('http://') or address_url.startswith('https://')):
                ret['proofOfAddress'] = address_url
            else:
                request = self.context.get('request')
                if request:
                    ret['proofOfAddress'] = request.build_absolute_uri(address_url) if address_url else ''
                else:
                    ret['proofOfAddress'] = address_url if address_url else ''
        else:
            ret['proofOfAddress'] = ''
        
        if instance.selfie_photo:
            selfie_url = instance.selfie_photo.url
            if selfie_url and (selfie_url.startswith('http://') or selfie_url.startswith('https://')):
                ret['selfiePhoto'] = selfie_url
            else:
                request = self.context.get('request')
                if request:
                    ret['selfiePhoto'] = request.build_absolute_uri(selfie_url) if selfie_url else ''
                else:
                    ret['selfiePhoto'] = selfie_url if selfie_url else ''
        else:
            ret['selfiePhoto'] = ''
        
        ret['kycStatus'] = ret.get('kyc_status', 'pending') or 'pending'
        ret['kycSubmittedAt'] = ret.get('kyc_submitted_at', None)
        ret['kycReviewedAt'] = ret.get('kyc_reviewed_at', None)
        ret['birthDate'] = instance.birth_date.isoformat() if instance.birth_date else None
        ret['birthPlace'] = ret.get('birth_place', '') or ''
        ret['address'] = ret.get('address', '') or ''
        ret['postalCode'] = ret.get('postal_code', '') or ''
        ret['city'] = ret.get('city', '') or ''
        ret['nationality'] = ret.get('nationality', '') or ''
        ret['successor'] = ret.get('successor', '') or ''
        
        # Convertir les champs RIB de snake_case à camelCase
        ret['ribBankName'] = ret.get('rib_bank_name', '') or ''
        ret['ribAccountHolder'] = ret.get('rib_account_holder', '') or ''
        ret['ribBankCode'] = ret.get('rib_bank_code', '') or ''
        ret['ribBranchCode'] = ret.get('rib_branch_code', '') or ''
        ret['ribAccountNumber'] = ret.get('rib_account_number', '') or ''
        ret['ribKey'] = ret.get('rib_key', '') or ''
        ret['ribIban'] = ret.get('rib_iban', '') or ''
        ret['ribBic'] = ret.get('rib_bic', '') or ''
        ret['ribDomiciliation'] = ret.get('rib_domiciliation', '') or ''
        
        # Convertir les champs patrimoniaux de snake_case à camelCase
        ret['professionalActivityStatus'] = ret.get('professional_activity_status', '') or ''
        ret['professionalActivityComment'] = ret.get('professional_activity_comment', '') or ''
        ret['professions'] = ret.get('professions', []) or []
        ret['professionsComment'] = ret.get('professions_comment', '') or ''
        ret['bankName'] = ret.get('bank_name', '') or ''
        ret['currentAccount'] = float(ret.get('current_account', 0) or 0)
        ret['livretAB'] = float(ret.get('livret_ab', 0) or 0)
        ret['pea'] = float(ret.get('pea', 0) or 0)
        ret['pel'] = float(ret.get('pel', 0) or 0)
        ret['ldd'] = float(ret.get('ldd', 0) or 0)
        ret['cel'] = float(ret.get('cel', 0) or 0)
        ret['csl'] = float(ret.get('csl', 0) or 0)
        ret['securitiesAccount'] = float(ret.get('securities_account', 0) or 0)
        ret['lifeInsurance'] = float(ret.get('life_insurance', 0) or 0)
        ret['savingsComment'] = ret.get('savings_comment', '') or ''
        ret['totalWealth'] = float(ret.get('total_wealth', 0) or 0)
        ret['objectives'] = ret.get('objectives', []) or []
        ret['objectivesComment'] = ret.get('objectives_comment', '') or ''
        ret['experience'] = ret.get('experience', []) or []
        ret['experienceComment'] = ret.get('experience_comment', '') or ''
        ret['taxOptimization'] = bool(ret.get('tax_optimization', False))
        ret['taxOptimizationComment'] = ret.get('tax_optimization_comment', '') or ''
        ret['annualHouseholdIncome'] = float(ret.get('annual_household_income', 0) or 0)
        
        # Convertir les champs wallet de snake_case à camelCase
        ret['investedCapital'] = float(ret.get('invested_capital', 0) or 0)
        ret['tradingPortfolio'] = float(ret.get('trading_portfolio', 0) or 0)
        ret['bonus'] = float(ret.get('bonus', 0) or 0)
        # availableFunds is calculated on frontend
        
        # Méthodes de paiement
        ret['paymentMethods'] = ret.get('payment_methods', []) or []
        
        # Fonctionnalités diverses
        ret['tradingEnabled'] = bool(ret.get('trading_enabled', True))
        ret['bannerMessage'] = ret.get('banner_message', '') or ''
        ret['contractPreviewEnabled'] = bool(ret.get('contract_preview_enabled', True))
        
        return ret


class ClientChatMessageSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    conversationId = serializers.SerializerMethodField()

    class Meta:
        model = ClientChatMessage
        fields = [
            'id',
            'client',
            'conversationId',
            'manager_user',
            'sender',
            'message',
            'read_by_client',
            'read_by_manager',
            'createdAt',
        ]

    def get_conversationId(self, obj):
        return getattr(obj.conversation, 'id', None)


class ClientConversationSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    lastMessageAt = serializers.SerializerMethodField()
    lastMessagePreview = serializers.SerializerMethodField()

    class Meta:
        model = ClientConversation
        fields = [
            'id',
            'client',
            'manager_user',
            'subject',
            'closed',
            'createdAt',
            'updatedAt',
            'lastMessageAt',
            'lastMessagePreview',
        ]

    def _get_last_message(self, obj):
        # Fallback to None when there are no messages.
        try:
            return obj.messages.order_by('-created_at').first()
        except Exception:
            return None

    def get_lastMessageAt(self, obj):
        m = self._get_last_message(obj)
        return m.created_at if m else None

    def get_lastMessagePreview(self, obj):
        m = self._get_last_message(obj)
        if not m:
            return ''
        text = (m.message or '').strip()
        return (text[:120] + '…') if len(text) > 120 else text

class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class UserDetailsSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    firstName = serializers.SerializerMethodField()
    lastName = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    teamId = serializers.SerializerMethodField()
    teamName = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    mobile = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    profilePhoto = serializers.SerializerMethodField()
    status = serializers.CharField(required=False, allow_blank=True)
    availabilitySchedule = serializers.JSONField(source='availability_schedule', required=False, allow_null=True)

    class Meta:
        model = UserDetails
        fields = [
            'id', 'firstName', 'lastName', 'username', 'email',
            'role', 'phone', 'mobile', 'teamId', 'teamName', 'active', 'createdAt', 'profilePhoto',
            'status', 'availabilitySchedule'
        ]
        read_only_fields = ['id']

    def get_firstName(self, obj):
        return obj.django_user.first_name if obj.django_user else ''

    def get_lastName(self, obj):
        return obj.django_user.last_name if obj.django_user else ''

    def get_username(self, obj):
        return obj.django_user.username if obj.django_user else ''

    def get_email(self, obj):
        return obj.django_user.email if obj.django_user else ''

    def get_phone(self, obj):
        return obj.phone if obj.phone else ''

    def get_mobile(self, obj):
        # mobile field does not exist on UserDetails; return empty string
        return ''

    def get_teamId(self, obj):
        # Get team from TeamMember relationship
        team_member = obj.team_memberships.first()
        return team_member.team.id if team_member else None

    def get_teamName(self, obj):
        # Get team name from TeamMember relationship
        team_member = obj.team_memberships.first()
        return team_member.team.name if team_member else None

    def get_profilePhoto(self, obj):
        if not getattr(obj, 'profile_photo', None):
            return ''
        try:
            url = obj.profile_photo.url
        except Exception:
            return ''
        if url and (url.startswith('http://') or url.startswith('https://')):
            return url
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request and url else (url or '')
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['isLeader'] = instance.role == 'teamleader'
        # Get teamId and teamName from TeamMember relationship
        team_member = instance.team_memberships.first()
        ret['teamId'] = team_member.team.id if team_member else None
        ret['teamName'] = team_member.team.name if team_member else None
        ret['status'] = instance.status if instance.status else 'offline'
        ret['availabilitySchedule'] = instance.availability_schedule if instance.availability_schedule else {}
        return ret

class TeamMemberSerializer(serializers.ModelSerializer):
    userId = serializers.CharField(source='user.id', read_only=True)
    userData = serializers.SerializerMethodField()
    isLeader = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = TeamMember
        fields = ['userId', 'userData', 'isLeader', 'createdAt']

    def get_userData(self, obj):
        user_details = obj.user
        django_user = user_details.django_user
        return {
            'firstName': django_user.first_name if django_user else '',
            'lastName': django_user.last_name if django_user else '',
            'role': user_details.role,
        }
    
    def get_isLeader(self, obj):
        return obj.user.role == 'teamleader'

class TeamDetailSerializer(serializers.Serializer):
    team = TeamSerializer()
    members = TeamMemberSerializer(many=True, source='team_members')

class LogSerializer(serializers.ModelSerializer):
    userId = serializers.SerializerMethodField()
    userName = serializers.SerializerMethodField()
    eventType = serializers.CharField(source='event_type', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    oldValue = serializers.JSONField(source='old_value', read_only=True)
    newValue = serializers.JSONField(source='new_value', read_only=True)
    
    class Meta:
        model = Log
        fields = ['id', 'eventType', 'userId', 'userName', 'createdAt', 'details', 'oldValue', 'newValue']
        read_only_fields = ['id', 'createdAt']
    
    def get_userId(self, obj):
        return obj.user_id.id if obj.user_id else None
    
    def get_userName(self, obj):
        if obj.user_id:
            return f"{obj.user_id.first_name} {obj.user_id.last_name}".strip() or obj.user_id.username
        # If no user_id but we have client_name in details (client-created transaction)
        if obj.details and obj.details.get('client_name'):
            return obj.details.get('client_name')
        return None
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['eventType'] = instance.event_type
        ret['userId'] = instance.user_id.id if instance.user_id else None
        # Get user name from user_id if available, otherwise from client_name in details
        if instance.user_id:
            ret['userName'] = f"{instance.user_id.first_name} {instance.user_id.last_name}".strip() or instance.user_id.username
        elif instance.details and instance.details.get('client_name'):
            ret['userName'] = instance.details.get('client_name')
        else:
            ret['userName'] = None
        ret['createdAt'] = instance.created_at
        ret['details'] = instance.details if instance.details else {}
        ret['oldValue'] = instance.old_value if instance.old_value else {}
        ret['newValue'] = instance.new_value if instance.new_value else {}
        return ret

class ClientHistoryLogSerializer(serializers.ModelSerializer):
    """Serializer for client history logs (actions performed ON the client)"""
    userId = serializers.SerializerMethodField()
    userName = serializers.SerializerMethodField()
    eventType = serializers.CharField(source='event_type', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    oldValue = serializers.JSONField(source='old_value', read_only=True)
    newValue = serializers.JSONField(source='new_value', read_only=True)
    
    class Meta:
        model = Log
        fields = ['id', 'eventType', 'userId', 'userName', 'createdAt', 'details', 'oldValue', 'newValue']
        read_only_fields = ['id', 'createdAt']
    
    def get_userId(self, obj):
        return obj.user_id.id if obj.user_id else None
    
    def get_userName(self, obj):
        if obj.user_id:
            return f"{obj.user_id.first_name} {obj.user_id.last_name}".strip() or obj.user_id.username
        # If no user_id but we have client_name in details (client-created transaction)
        if obj.details and obj.details.get('client_name'):
            return obj.details.get('client_name')
        return None
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['eventType'] = instance.event_type
        ret['userId'] = instance.user_id.id if instance.user_id else None
        if instance.user_id:
            ret['userName'] = f"{instance.user_id.first_name} {instance.user_id.last_name}".strip() or instance.user_id.username
        elif instance.details and instance.details.get('client_name'):
            ret['userName'] = instance.details.get('client_name')
        else:
            ret['userName'] = None
        ret['createdAt'] = instance.created_at
        ret['details'] = instance.details if instance.details else {}
        ret['oldValue'] = instance.old_value if instance.old_value else {}
        ret['newValue'] = instance.new_value if instance.new_value else {}
        return ret

class ClientPlatformLogSerializer(serializers.ModelSerializer):
    """Serializer for client platform logs (actions performed BY the client)"""
    actionType = serializers.CharField(source='action_type', read_only=True)
    actionDetails = serializers.JSONField(source='action_details', read_only=True)
    ipAddress = serializers.CharField(source='ip_address', read_only=True, allow_null=True)
    userAgent = serializers.CharField(source='user_agent', read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    clientId = serializers.CharField(source='client.id', read_only=True)
    
    class Meta:
        model = ClientPlatformLog
        fields = ['id', 'actionType', 'actionDetails', 'ipAddress', 'userAgent', 'createdAt', 'clientId']
        read_only_fields = ['id', 'createdAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['actionType'] = instance.action_type
        ret['actionDetails'] = instance.action_details if instance.action_details else {}
        ret['ipAddress'] = instance.ip_address
        ret['userAgent'] = instance.user_agent
        ret['createdAt'] = instance.created_at
        ret['clientId'] = instance.client.id
        return ret

class AssetSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    alphaVantageSymbol = serializers.CharField(source='alpha_vantage_symbol', required=False, allow_blank=True)
    tradingViewSymbol = serializers.CharField(source='trading_view_symbol', required=False, allow_blank=True)
    sourceIndex = serializers.CharField(source='source_index', required=False, allow_blank=True)
    logoUrl = serializers.URLField(source='logo_url', required=False, allow_blank=True)
    lastPrice = serializers.DecimalField(source='last_price', max_digits=15, decimal_places=4, read_only=True, allow_null=True)
    lastPriceUpdate = serializers.DateTimeField(source='last_price_update', read_only=True, allow_null=True)
    priceChange = serializers.DecimalField(source='price_change', max_digits=15, decimal_places=4, read_only=True, allow_null=True)
    priceChangePercent = serializers.DecimalField(source='price_change_percent', max_digits=10, decimal_places=4, read_only=True, allow_null=True)
    marketCap = serializers.IntegerField(source='market_cap', read_only=True, allow_null=True)
    marketCapCurrency = serializers.CharField(source='market_cap_currency', required=False, allow_blank=True)
    foundedYear = serializers.IntegerField(source='founded_year', read_only=True, allow_null=True)
    
    class Meta:
        model = Asset
        fields = [
            'id', 'type', 'name', 'reference', 'category', 'subcategory', 'default',
            'alphaVantageSymbol', 'tradingViewSymbol', 'exchange', 'currency', 'region', 'sourceIndex', 'logoUrl',
            'lastPrice', 'lastPriceUpdate', 'priceChange', 'priceChangePercent',
            'description', 'sector', 'industry', 'headquarters', 'ceo', 'employees', 'website',
            'marketCap', 'marketCapCurrency', 'foundedYear', 'country',
            'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt', 'lastPrice', 'lastPriceUpdate', 'priceChange', 'priceChangePercent']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['default'] = bool(instance.default)
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        if instance.last_price:
            ret['lastPrice'] = float(instance.last_price)
        if instance.price_change:
            ret['priceChange'] = float(instance.price_change)
        if instance.price_change_percent:
            ret['priceChangePercent'] = float(instance.price_change_percent)
        if instance.market_cap is not None:
            try:
                ret['marketCap'] = int(instance.market_cap)
            except Exception:
                pass
        # Ensure logoUrl is included even if empty
        ret['logoUrl'] = instance.logo_url or ''
        return ret

class ClientAssetSerializer(serializers.ModelSerializer):
    asset = AssetSerializer(read_only=True)
    assetId = serializers.CharField(write_only=True, required=False)
    clientId = serializers.CharField(source='client.id', read_only=True)
    featured = serializers.BooleanField()
    availabilityStart = serializers.DateField(source='availability_start', required=False, allow_null=True)
    availabilityEnd = serializers.DateField(source='availability_end', required=False, allow_null=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ClientAsset
        fields = ['id', 'clientId', 'asset', 'assetId', 'featured', 'availabilityStart', 'availabilityEnd', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['clientId'] = instance.client.id
        # Only serialize asset if it exists (handle case where asset was deleted but ClientAsset remains)
        if instance.asset:
            ret['asset'] = AssetSerializer(instance.asset).data
            ret['assetId'] = instance.asset.id
        else:
            ret['asset'] = None
            ret['assetId'] = None
        ret['featured'] = bool(instance.featured)
        ret['availabilityStart'] = instance.availability_start
        ret['availabilityEnd'] = instance.availability_end
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        return ret

class RIBSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    bankName = serializers.CharField(source='bank_name', required=False, allow_blank=True)
    accountHolder = serializers.CharField(source='account_holder', required=False, allow_blank=True)
    bankCode = serializers.CharField(source='bank_code', required=False, allow_blank=True)
    branchCode = serializers.CharField(source='branch_code', required=False, allow_blank=True)
    accountNumber = serializers.CharField(source='account_number', required=False, allow_blank=True)
    ribKey = serializers.CharField(source='rib_key', required=False, allow_blank=True)
    
    class Meta:
        model = RIB
        fields = ['id', 'name', 'iban', 'bic', 'bankName', 'accountHolder', 'bankCode', 'branchCode', 'accountNumber', 'ribKey', 'domiciliation', 'default', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['bankName'] = instance.bank_name
        ret['accountHolder'] = instance.account_holder
        ret['bankCode'] = instance.bank_code
        ret['branchCode'] = instance.branch_code
        ret['accountNumber'] = instance.account_number
        ret['ribKey'] = instance.rib_key
        ret['default'] = bool(instance.default)
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        return ret

class ClientRIBSerializer(serializers.ModelSerializer):
    rib = RIBSerializer(read_only=True)
    ribId = serializers.CharField(write_only=True, required=False)
    clientId = serializers.CharField(source='client.id', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ClientRIB
        fields = ['id', 'clientId', 'rib', 'ribId', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['clientId'] = instance.client.id
        ret['rib'] = RIBSerializer(instance.rib).data
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        return ret

class UsefulLinkSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    imageUrl = serializers.SerializerMethodField()
    
    class Meta:
        model = UsefulLink
        fields = ['id', 'name', 'url', 'description', 'image', 'imageUrl', 'button', 'default', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt', 'imageUrl']
    
    def get_imageUrl(self, obj):
        if obj.image:
            image_url = obj.image.url
            # Cloudinary URLs are public by default, return them directly
            if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                return image_url
            # Local path - build absolute URI
            request = self.context.get('request')
            if request and image_url:
                return request.build_absolute_uri(image_url)
            return image_url
        return None
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['default'] = bool(instance.default)
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        # Note: imageUrl is handled by get_imageUrl method, no need to override here
        return ret

class ClientUsefulLinkSerializer(serializers.ModelSerializer):
    usefulLink = UsefulLinkSerializer(source='useful_link', read_only=True)
    usefulLinkId = serializers.CharField(write_only=True, required=False)
    clientId = serializers.CharField(source='client.id', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ClientUsefulLink
        fields = ['id', 'clientId', 'usefulLink', 'usefulLinkId', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['clientId'] = instance.client.id
        # Pass the request context to UsefulLinkSerializer so it can build absolute URLs
        request = self.context.get('request')
        ret['usefulLink'] = UsefulLinkSerializer(instance.useful_link, context={'request': request}).data
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        return ret

class TransactionSerializer(serializers.ModelSerializer):
    clientId = serializers.CharField(source='client.id', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    productId = serializers.CharField(source='product.id', read_only=True, allow_null=True)
    assetId = serializers.CharField(source='asset.id', read_only=True, allow_null=True)
    assetType = serializers.CharField(source='asset.type', read_only=True, allow_null=True)
    from_field = serializers.CharField(source='transfer_from', allow_null=True, required=False)
    to_field = serializers.CharField(source='transfer_to', allow_null=True, required=False)
    
    class Meta:
        model = Transaction
        fields = [
            'id', 'clientId', 'type', 'amount', 'description', 'status', 'datetime', 
            'createdAt', 'updatedAt', 'productId', 'assetId', 'assetType', 'from_field', 'to_field',
            'fx_rate_eur_to_asset', 'amount_in_asset_currency',
            'subscription_details', 'subscription_first_name', 'subscription_last_name',
            'subscription_birth_date', 'subscription_city', 'subscription_ip',
            'subscription_date', 'subscription_duration', 'subscription_interest_period',
            'subscription_profitability', 'subscription_investment', 'subscription_profits',
            'subscription_total', 'subscription_contract_end', 'subscription_signature',
            'position_generation_history'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['clientId'] = instance.client.id
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        # Ensure datetime is in ISO 8601 format in local timezone (not UTC)
        if instance.datetime:
            # Convert to local timezone before formatting
            from django.utils import timezone as dj_timezone
            local_dt = instance.datetime
            # If datetime is timezone-aware and not in local timezone, convert it
            if dj_timezone.is_aware(local_dt):
                local_tz = dj_timezone.get_current_timezone()
                local_dt = local_dt.astimezone(local_tz)
            # Format without timezone info to avoid confusion
            ret['datetime'] = local_dt.strftime('%Y-%m-%dT%H:%M:%S')
        ret['from'] = instance.transfer_from
        ret['to'] = instance.transfer_to
        if instance.product:
            ret['productId'] = instance.product.id
            ret['productName'] = instance.product.name
            ret['productReference'] = instance.product.reference
        if getattr(instance, 'asset', None):
            ret['assetId'] = instance.asset.id
            ret['assetName'] = instance.asset.name
            ret['assetReference'] = instance.asset.reference
            ret['assetType'] = instance.asset.type
        return ret


class PositionSerializer(serializers.ModelSerializer):
    clientId = serializers.CharField(source='client.id', read_only=True)
    clientName = serializers.SerializerMethodField()
    productId = serializers.SerializerMethodField()
    productName = serializers.SerializerMethodField()
    productType = serializers.SerializerMethodField()
    productReference = serializers.SerializerMethodField()
    transactionId = serializers.CharField(source='transaction.id', read_only=True, allow_null=True)
    assetId = serializers.CharField(source='asset.id', read_only=True, allow_null=True)
    assetName = serializers.CharField(source='asset.name', read_only=True, allow_null=True)
    assetType = serializers.CharField(source='asset.type', read_only=True, allow_null=True)
    assetReference = serializers.CharField(source='asset.reference', read_only=True, allow_null=True)
    assetCurrency = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = Position
        fields = [
            'id',
            'clientId', 'clientName',
            'productId', 'productName', 'productType', 'productReference',
            'transactionId',
            'assetId', 'assetName', 'assetType', 'assetReference', 'assetCurrency',
            'period_index', 'period_date',
            'invested_amount',
            'entry_price', 'quantity',
            'fx_rate_eur_to_asset', 'invested_amount_asset_currency',
            'expected_profit', 'expected_total',
            'opened_at', 'closed_at', 'profit_loss',
            'status',
            'createdAt', 'updatedAt',
        ]

    def get_clientName(self, obj):
        try:
            return f"{obj.client.fname} {obj.client.lname}".strip()
        except Exception:
            return ''

    def get_productId(self, obj):
        try:
            return obj.product.id if obj.product else None
        except Exception:
            return None

    def get_productName(self, obj):
        try:
            return obj.product.name if obj.product else None
        except Exception:
            return None

    def get_productType(self, obj):
        try:
            return obj.product.type if obj.product else None
        except Exception:
            return None

    def get_productReference(self, obj):
        try:
            return obj.product.reference if obj.product else None
        except Exception:
            return None

    def get_assetCurrency(self, obj):
        try:
            return obj.asset.currency if obj.asset else None
        except Exception:
            return None


class ProductCategorySerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ProductCategory
        fields = ['id', 'title', 'url', 'subcategories', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        return ret

class ProductSerializer(serializers.ModelSerializer):
    categoryId = serializers.CharField(source='category.id', read_only=True, allow_null=True)
    categoryTitle = serializers.CharField(source='category.title', read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    imageUrl = serializers.SerializerMethodField()
    assetAllocations = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'reference', 'type', 'categoryId', 'categoryTitle', 'subcategory', 'status', 
            'profitability', 'duration', 'description', 'cgv', 'image', 'imageUrl',
            'no_profitability', 'is_variable_profitability', 'variable_profitability', 'profitability_period',
            'interest_period',
            'availability_start', 'availability_end',
            'link_to_assets', 'min_entry_value', 'max_entry_value',
            'default', 'available_funds',
            'assetAllocations',
            'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt', 'imageUrl']
    
    def get_imageUrl(self, obj):
        if obj.image:
            try:
                # Get the URL using the storage backend
                image_url = obj.image.url
                
                # Cloudinary URLs are public by default, so we can return them directly
                # If URL is already absolute (Cloudinary URL), return as-is
                if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                    # Ensure it's a valid Cloudinary URL format
                    if 'res.cloudinary.com' in image_url or image_url.startswith('http'):
                        return image_url
                
                # If URL is relative or not a Cloudinary URL, try to build absolute URI
                # This should not happen with Cloudinary, but handle it gracefully
                request = self.context.get('request')
                if request and image_url:
                    # If it's a relative path, build absolute URI
                    if not image_url.startswith('http'):
                        return request.build_absolute_uri(image_url)
                    return image_url
                
                # If we still don't have a valid URL, log and return None
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not generate valid image URL for product {obj.id}: {image_url}")
                return None
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error getting image URL for product {obj.id}: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                return None
        return None

    def get_assetAllocations(self, obj):
        allocations = ProductAssetAllocation.objects.filter(product=obj).select_related('asset').order_by('created_at')
        # Include full asset details for frontend display
        return [
            {
                'id': alloc.id,
                'assetId': alloc.asset.id,
                'assetName': alloc.asset.name,
                'assetType': alloc.asset.type,
                'proportion': float(alloc.proportion) if alloc.proportion is not None else 0,
                'asset': {
                    'id': alloc.asset.id,
                    'name': alloc.asset.name,
                    'reference': alloc.asset.reference or '',
                    'type': alloc.asset.type,
                    'logoUrl': alloc.asset.logo_url or '',
                }
            }
            for alloc in allocations
        ]
    
    def to_internal_value(self, data):
        # Convert camelCase to snake_case for backend compatibility
        camel_to_snake = {
            'categoryId': 'category_id',
            'noProfitability': 'no_profitability',
            'isVariableProfitability': 'is_variable_profitability',
            'variableProfitability': 'variable_profitability',
            'profitabilityPeriod': 'profitability_period',
            'interestPeriod': 'interest_period',
            'availabilityStart': 'availability_start',
            'availabilityEnd': 'availability_end',
            'linkToAssets': 'link_to_assets',
            'minEntryValue': 'min_entry_value',
            'maxEntryValue': 'max_entry_value',
            'availableFunds': 'available_funds',
        }
        
        # Create a copy to avoid modifying the original
        internal_data = {}
        for key, value in data.items():
            if key in camel_to_snake:
                internal_data[camel_to_snake[key]] = value
            else:
                internal_data[key] = value

        # Normalize booleans that historically arrived as 'Oui'/'Non'
        if 'available_funds' in internal_data:
            v = internal_data.get('available_funds')
            if isinstance(v, str):
                internal_data['available_funds'] = v.strip().lower() in ['oui', 'true', '1', 'yes']
            else:
                internal_data['available_funds'] = bool(v)
        
        return super().to_internal_value(internal_data)
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['categoryId'] = instance.category.id if instance.category else None
        ret['categoryTitle'] = instance.category.title if instance.category else None
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        # Convert snake_case to camelCase for frontend compatibility
        # no_profitability is now a boolean (True = no profitability, False = has profitability)
        ret['noProfitability'] = ret.pop('no_profitability', True)
        ret['isVariableProfitability'] = ret.pop('is_variable_profitability', 'Non')
        ret['variableProfitability'] = ret.pop('variable_profitability', '')
        ret['profitabilityPeriod'] = ret.pop('profitability_period', '')
        ret['interestPeriod'] = ret.pop('interest_period', '')
        ret['availabilityStart'] = ret.pop('availability_start', None)
        ret['availabilityEnd'] = ret.pop('availability_end', None)
        ret['linkToAssets'] = ret.pop('link_to_assets', 'Non')
        ret['minEntryValue'] = ret.pop('min_entry_value', None)
        ret['maxEntryValue'] = ret.pop('max_entry_value', None)
        ret['default'] = bool(ret.pop('default', False))
        ret['availableFunds'] = bool(ret.pop('available_funds', False))
        # Type is now a real field in the model, so it's already in ret
        # Handle image URL - get_imageUrl already handles proxy URL conversion
        # Just ensure None values are handled correctly
        if not instance.image:
            ret['imageUrl'] = None
        elif ret.get('imageUrl') == '':
            ret['imageUrl'] = None
        return ret

class ClientProductSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    productId = serializers.CharField(write_only=True, required=False)
    clientId = serializers.CharField(source='client.id', read_only=True)
    featured = serializers.BooleanField()
    availabilityStart = serializers.DateField(source='availability_start', required=False, allow_null=True)
    availabilityEnd = serializers.DateField(source='availability_end', required=False, allow_null=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ClientProduct
        fields = ['id', 'clientId', 'product', 'productId', 'featured', 'availabilityStart', 'availabilityEnd', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['clientId'] = instance.client.id
        # Pass request context to ProductSerializer for image URLs
        # Only serialize product if it exists (handle case where product was deleted but ClientProduct remains)
        request = self.context.get('request')
        if instance.product:
            ret['product'] = ProductSerializer(instance.product, context={'request': request}).data
            ret['productId'] = instance.product.id
        else:
            ret['product'] = None
            ret['productId'] = None
        ret['featured'] = bool(instance.featured)
        ret['availabilityStart'] = instance.availability_start
        ret['availabilityEnd'] = instance.availability_end
        ret['createdAt'] = instance.created_at
        ret['updatedAt'] = instance.updated_at
        return ret

class AppSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    favicon_url = serializers.SerializerMethodField()
    login_background_image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = AppSettings
        fields = [
            'id',
            'platform_name',
            'address',
            'website',
            'email',
            # Writable file fields (required for uploads)
            'logo',
            'favicon',
            'login_background_image',
            # Read-only URL helpers for frontend consumption
            'logo_url',
            'favicon_url',
            'login_background_image_url',
            'primary_color',
            'secondary_color',
            'accent_color',
            'otp_email_enabled',
            'otp_sms_enabled',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_logo_url(self, obj):
        if obj.logo:
            try:
                logo_url = obj.logo.url
                # Cloudinary URLs are public by default, return them directly
                if logo_url and (logo_url.startswith('http://') or logo_url.startswith('https://')):
                    return logo_url
                # Local path - build absolute URI
                request = self.context.get('request')
                if request and logo_url:
                    return request.build_absolute_uri(logo_url)
                return logo_url
            except Exception as e:
                # Log error but don't fail - return None if URL generation fails
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error getting logo URL for app settings: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                return None
        return None

    def get_favicon_url(self, obj):
        if obj.favicon:
            try:
                favicon_url = obj.favicon.url
                # Cloudinary URLs are public by default, return them directly
                if favicon_url and (favicon_url.startswith('http://') or favicon_url.startswith('https://')):
                    return favicon_url
                # Local path - build absolute URI
                request = self.context.get('request')
                if request and favicon_url:
                    return request.build_absolute_uri(favicon_url)
                return favicon_url
            except Exception as e:
                # Log error but don't fail - return None if URL generation fails
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error getting favicon URL for app settings: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                return None
        return None

    def get_login_background_image_url(self, obj):
        if obj.login_background_image:
            try:
                image_url = obj.login_background_image.url
                # Cloudinary URLs are public by default, return them directly
                if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                    return image_url
                # Local path - build absolute URI
                request = self.context.get('request')
                if request and image_url:
                    return request.build_absolute_uri(image_url)
                return image_url
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error getting login background URL for app settings: {str(e)}")
                return None
        return None

class NewsPostSerializer(serializers.ModelSerializer):
    authorName = serializers.SerializerMethodField()
    imageUrl = serializers.SerializerMethodField()
    sourceName = serializers.CharField(source='source_name', required=False, allow_blank=True)
    articleUrl = serializers.URLField(source='article_url', required=False, allow_blank=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = NewsPost
        fields = ['id', 'title', 'content', 'sourceName', 'articleUrl', 'image', 'imageUrl', 'author', 'authorName', 'published', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt', 'imageUrl', 'authorName']
    
    def get_authorName(self, obj):
        if obj.author:
            return f"{obj.author.first_name} {obj.author.last_name}".strip() or obj.author.username
        return "Admin"
    
    def get_imageUrl(self, obj):
        if obj.image:
            try:
                image_url = obj.image.url
                if image_url and (image_url.startswith('http://') or image_url.startswith('https://')):
                    if 'res.cloudinary.com' in image_url or image_url.startswith('http'):
                        return image_url
                request = self.context.get('request')
                if request and image_url:
                    if not image_url.startswith('http'):
                        return request.build_absolute_uri(image_url)
                    return image_url
                return None
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error getting image URL for news post {obj.id}: {str(e)}")
                return None
        return None

class ClientVerificationConfigSerializer(serializers.ModelSerializer):
    clientId = serializers.CharField(source='client.id', read_only=True)
    clientName = serializers.SerializerMethodField()
    stepsConfig = serializers.JSONField(source='steps_config', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ClientVerificationConfig
        fields = ['id', 'client', 'clientId', 'clientName', 'stepsConfig', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'client', 'createdAt', 'updatedAt', 'clientId', 'clientName']
    
    def get_clientName(self, obj):
        if obj.client:
            return f"{obj.client.fname} {obj.client.lname}".strip()
        return None
    
    def update(self, instance, validated_data):
        import logging
        logger = logging.getLogger(__name__)
        
        # Log what we received
        logger.info(f'Serializer update - validated_data keys: {list(validated_data.keys())}')
        logger.info(f'Serializer update - initial_data keys: {list(self.initial_data.keys()) if hasattr(self, "initial_data") else "N/A"}')
        
        # Explicitly handle stepsConfig -> steps_config mapping
        # Check validated_data first (after DRF processing)
        if 'steps_config' in validated_data:
            steps_config_data = validated_data.pop('steps_config')
            logger.info(f'Found steps_config in validated_data: {steps_config_data}')
            instance.steps_config = steps_config_data if steps_config_data is not None else {}
        # Also check initial_data in case DRF didn't process it (e.g., with partial=True)
        elif hasattr(self, 'initial_data') and 'stepsConfig' in self.initial_data:
            import json
            steps_config_data = self.initial_data.get('stepsConfig')
            logger.info(f'Found stepsConfig in initial_data: {steps_config_data}')
            if isinstance(steps_config_data, str):
                try:
                    steps_config_data = json.loads(steps_config_data)
                except Exception as e:
                    logger.error(f'Error parsing stepsConfig JSON: {e}')
                    steps_config_data = {}
            instance.steps_config = steps_config_data if steps_config_data is not None else {}
        else:
            logger.warning('Neither steps_config nor stepsConfig found in request data!')
        
        logger.info(f'Setting instance.steps_config to: {instance.steps_config}')
        
        # Call parent update for other fields
        result = super().update(instance, validated_data)
        logger.info(f'After save, instance.steps_config is: {instance.steps_config}')
        return result

class ClientDocumentSerializer(serializers.ModelSerializer):
    """Serializer pour les documents clients"""
    fileUrl = serializers.SerializerMethodField()
    uploadedByName = serializers.SerializerMethodField()
    documentType = serializers.CharField(source='document_type', required=False)
    transactionId = serializers.CharField(source='transaction.id', read_only=True, allow_null=True)
    uploadedBy = serializers.PrimaryKeyRelatedField(source='uploaded_by', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = ClientDocument
        fields = ['id', 'name', 'documentType', 'file', 'fileUrl', 'description', 'transactionId', 'uploadedBy', 'uploadedByName', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt', 'uploadedBy', 'fileUrl', 'uploadedByName', 'transactionId']
        extra_kwargs = {
            'transaction': {'write_only': True, 'required': False}
        }
    
    def get_fileUrl(self, obj):
        """Retourne l'URL du fichier"""
        if obj.file:
            try:
                file_url = obj.file.url
                # Check if it's a PDF file
                is_pdf = obj.file.name.lower().endswith('.pdf') if obj.file.name else False
                
                # Cloudinary URLs are public by default, but for PDFs use media proxy to ensure correct Content-Type and Content-Disposition
                if file_url and (file_url.startswith('http://') or file_url.startswith('https://')):
                    # Verify it's a valid Cloudinary URL
                    if 'res.cloudinary.com' in file_url:
                        # For PDFs, ALWAYS use media proxy to ensure:
                        # - Correct Content-Type (application/pdf)
                        # - Content-Disposition: inline (for browser preview)
                        # - Proper CORS headers
                        if is_pdf:
                            request = self.context.get('request')
                            if request:
                                # Use media proxy with the full Cloudinary URL encoded
                                # This ensures proper headers for browser preview
                                from urllib.parse import quote
                                encoded_url = quote(file_url, safe='')
                                return request.build_absolute_uri(f'/api/media/{encoded_url}/')
                        # For non-PDFs, return Cloudinary URL directly
                        return file_url
                    # If it's another absolute URL, return as-is
                    return file_url
                else:
                    # Local path - use media proxy for better CORS support
                    request = self.context.get('request')
                    if request and file_url:
                        # Use media proxy endpoint for better compatibility
                        # Remove leading slash if present
                        clean_path = file_url.lstrip('/')
                        return request.build_absolute_uri(f'/api/media/{clean_path}/')
                    elif file_url:
                        # Fallback: return relative path
                        return file_url
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error getting file URL for document {obj.id}: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                return ''
        return ''
    
    def get_uploadedByName(self, obj):
        """Retourne le nom de l'utilisateur qui a uploadé le document"""
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return ''
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Convertir les champs en camelCase
        ret['documentType'] = instance.document_type
        ret['uploadedBy'] = instance.uploaded_by.id if instance.uploaded_by else None
        ret['transactionId'] = instance.transaction.id if instance.transaction else None
        return ret
    
    def create(self, validated_data):
        """Override create pour gérer documentType"""
        document_type = validated_data.pop('document_type', 'other')
        document = ClientDocument.objects.create(document_type=document_type, **validated_data)
        return document
    
    def update(self, instance, validated_data):
        """Override update pour gérer documentType"""
        document_type = validated_data.pop('document_type', None)
        if document_type is not None:
            instance.document_type = document_type
        return super().update(instance, validated_data)


class AppNotificationSerializer(serializers.ModelSerializer):
    """Serializer for in-app notifications (CRM and client)."""
    notificationType = serializers.CharField(source='notification_type', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = AppNotification
        fields = ['id', 'notificationType', 'title', 'message', 'read', 'payload', 'createdAt']
        read_only_fields = ['id', 'notificationType', 'title', 'message', 'payload', 'createdAt']
