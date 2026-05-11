import uuid
from django.db import models
from django.contrib.auth.models import User as DjangoUser
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

# Import storage - S3/MinIO for media; deferred storage when not yet configured (Render bootstrap)
try:
    from api.storage import S3MediaStorage, S3DeferredStorage
    s3_configured = getattr(settings, 'S3_CONFIGURED', False)
    is_render = getattr(settings, 'IS_RENDER', __import__('os').environ.get('RENDER', '').lower() == 'true')
    # Use real S3 when configured; deferred (raises on first upload) when not (e.g. Render first deploy)
    _media_storage = S3MediaStorage if s3_configured else S3DeferredStorage
    if not s3_configured and not is_render:
        raise ValueError(
            "S3/MinIO credentials are REQUIRED. "
            "Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_STORAGE_BUCKET_NAME."
        )
    product_storage = _media_storage
    app_settings_storage = _media_storage
    useful_link_storage = _media_storage
    client_profile_storage = _media_storage
    user_profile_storage = _media_storage
except ImportError as e:
    raise ImportError(
        "S3 storage is required. "
        "Please install django-storages and boto3: pip install django-storages boto3"
    ) from e

# Create your models here.
class Client(models.Model):
    # Identifiant
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    
    # Informations personnelles
    profile_photo = models.ImageField(upload_to='client_profiles/', storage=client_profile_storage, null=True, blank=True)
    civility = models.CharField(max_length=30, default="", blank=True)  # Monsieur, Madame, etc.
    fname = models.CharField(max_length=50, default="")
    middle_name = models.CharField(max_length=80, default="", blank=True)  # Deuxième prénom (optionnel)
    lname = models.CharField(max_length=50, default="")
    legal_name = models.CharField(max_length=200, default="", blank=True)  # Dénomination légale (nom complet)
    sex = models.CharField(max_length=20, default="", blank=True)  # male | female | other
    account_verified = models.BooleanField(default=False)
    active = models.BooleanField(null=False, default=True)  # Si actif, le client peut accéder à la plateforme
    password = models.CharField(max_length=100, default="Access@123")
    phone = models.CharField(max_length=20, default="", blank=True)
    mobile = models.CharField(max_length=20, default="", blank=True)
    email = models.EmailField(max_length=100, default="", unique=True)
    birth_date = models.DateField(null=True, blank=True)
    birth_place = models.CharField(max_length=100, default="", blank=True)
    address = models.CharField(max_length=200, default="", blank=True)
    postal_code = models.CharField(max_length=20, default="", blank=True)
    city = models.CharField(max_length=100, default="", blank=True)
    nationality = models.CharField(max_length=100, default="", blank=True)
    successor = models.CharField(max_length=200, default="", blank=True)
    
    # RIB du client (un seul RIB possible par client)
    rib_bank_name = models.CharField(max_length=200, default="", blank=True)  # Nom de la banque
    rib_account_holder = models.CharField(max_length=200, default="", blank=True)  # Titulaire du compte
    rib_bank_code = models.CharField(max_length=5, default="", blank=True)  # Code banque (5 chiffres)
    rib_branch_code = models.CharField(max_length=5, default="", blank=True)  # Code guichet (5 chiffres)
    rib_account_number = models.CharField(max_length=11, default="", blank=True)  # Numéro de compte (11 caractères)
    rib_key = models.CharField(max_length=2, default="", blank=True)  # Clé RIB (2 chiffres)
    rib_iban = models.CharField(max_length=34, default="", blank=True)  # IBAN
    rib_bic = models.CharField(max_length=11, default="", blank=True)  # BIC
    rib_domiciliation = models.CharField(max_length=200, default="", blank=True)  # Domiciliation

    # KYC Documents (client platform)
    identity_document = models.ImageField(upload_to='kyc/identity/', storage=client_profile_storage, null=True, blank=True)  # ID card, passport, driver's license (recto)
    identity_document_verso = models.ImageField(upload_to='kyc/identity/', storage=client_profile_storage, null=True, blank=True)  # ID card verso (back side)
    proof_of_address = models.ImageField(upload_to='kyc/address/', storage=client_profile_storage, null=True, blank=True)  # Utility bill, bank statement, etc.
    selfie_photo = models.ImageField(upload_to='kyc/selfie/', storage=client_profile_storage, null=True, blank=True)  # Selfie for identity verification
    kyc_status = models.CharField(max_length=20, default="pending", blank=True)  # pending, submitted, approved, rejected
    # Per-document review status managed by CRM (keys: identityDocument, identityDocumentVerso, proofOfAddress, selfiePhoto)
    # values: pending | approved | rejected
    kyc_documents_review = models.JSONField(default=dict, blank=True)
    kyc_submitted_at = models.DateTimeField(null=True, blank=True)
    kyc_reviewed_at = models.DateTimeField(null=True, blank=True)

    # Onboarding / Preferences (client platform)
    preferences = models.JSONField(default=list, blank=True)  # ex: ["stocks", "crypto", ...]

    # Verification questionnaire (client platform)
    trading_objective = models.CharField(max_length=200, default="", blank=True)
    planned_investment_12m = models.CharField(max_length=100, default="", blank=True)
    risk_reward_profile = models.CharField(max_length=20, default="", blank=True)  # e.g. "5", "10", "20", "40", "80"
    compliance_family_flags = models.JSONField(default=list, blank=True)
    funds_sources = models.JSONField(default=list, blank=True)
    primary_profession = models.CharField(max_length=120, default="", blank=True)
    employer_name = models.CharField(max_length=200, default="", blank=True)
    annual_net_income = models.CharField(max_length=80, default="", blank=True)
    total_liquidities = models.CharField(max_length=80, default="", blank=True)
    
    # Fiche patrimoniale - Activité professionnelle
    professional_activity_status = models.CharField(max_length=50, default="", blank=True)  # Aucune, En activité, Salarié(e), etc.
    professional_activity_comment = models.TextField(default="", blank=True)
    professions = models.JSONField(default=list, blank=True)  # Liste de métiers
    professions_comment = models.TextField(default="", blank=True)
    
    # Fiche patrimoniale - Patrimoine
    bank_name = models.CharField(max_length=100, default="", blank=True)
    current_account = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    livret_ab = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    pea = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    pel = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    ldd = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    cel = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    csl = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    securities_account = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    life_insurance = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    savings_comment = models.TextField(default="", blank=True)
    total_wealth = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    
    # Fiche patrimoniale - Objectifs et expérience
    objectives = models.JSONField(default=list, blank=True)  # Epargne, Fructifier, Succession
    objectives_comment = models.TextField(default="", blank=True)
    experience = models.JSONField(default=list, blank=True)  # Bourse, Livrets, Placements, Risque
    experience_comment = models.TextField(default="", blank=True)
    
    # Fiche patrimoniale - Informations financières
    tax_optimization = models.BooleanField(default=False)  # Défiscalisation
    tax_optimization_comment = models.TextField(default="", blank=True)
    annual_household_income = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    
    # Wallet (fonds du client - distinct du portefeuille d'actifs)
    invested_capital = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)  # Capital investi
    trading_portfolio = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)  # Wallet trading (fonds utilisés pour le trading)
    bonus = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)  # Bonus
    # Note: available_funds is calculated on frontend (invested_capital - trading_portfolio - bonus)
    # Note: Le "portefeuille" d'actifs est géré via ClientAsset, pas ici
    
    # Devise du compte (une seule devise par compte - pas de fonds multi-devises)
    ACCOUNT_CURRENCY_CHOICES = [('EUR', 'Euro'), ('USD', 'Dollar US'), ('CHF', 'Franc suisse')]
    account_currency = models.CharField(max_length=3, choices=ACCOUNT_CURRENCY_CHOICES, default='EUR')
    
    # Méthodes de paiement disponibles pour le dépôt des fonds
    payment_methods = models.JSONField(default=list, blank=True)  # ex: ["virement", "carte_bancaire"]
    
    # Fonctionnalités diverses
    trading_enabled = models.BooleanField(default=False)  # Activer le trading (afficher le bouton Trader dans les assets)
    show_position_prices = models.BooleanField(default=False)  # Afficher les prix d'achat/vente des positions au client
    banner_message = models.TextField(default="", blank=True)  # Message de bannière à afficher sur la plateforme client
    contract_preview_enabled = models.BooleanField(default=True)  # Prévisualisation du contrat
    imported_contract_preview_enabled = models.BooleanField(
        default=False
    )  # Si prévisualisation PDF désactivée : afficher contrats importés (documents) sur la plateforme

    # Relations
    managed_by = models.CharField(max_length=50, default="", blank=True)  # ID ou username du gestionnaire
    source = models.CharField(max_length=100, default="", blank=True)  # Source du client
    team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='clients')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ClientSuccessor(models.Model):
    """Successor for property transfer - linked to a client."""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='successors')
    first_name = models.CharField(max_length=100, default="", blank=True)
    last_name = models.CharField(max_length=100, default="", blank=True)
    email = models.EmailField(max_length=100, default="", blank=True)
    phone = models.CharField(max_length=30, default="", blank=True)
    address = models.CharField(max_length=200, default="", blank=True)
    postal_code = models.CharField(max_length=20, default="", blank=True)
    city = models.CharField(max_length=100, default="", blank=True)
    country = models.CharField(max_length=100, default="", blank=True)
    share_percentage = models.IntegerField(default=0, null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    identity_document = models.FileField(upload_to='successors/identity/', storage=client_profile_storage, null=True, blank=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.client_id})"


class ClientConversation(models.Model):
    """
    Conversation (thread) between a client and their manager.
    Used to support multiple requests with a subject.
    """
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='conversations')
    manager_user = models.ForeignKey(
        DjangoUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_client_conversations',
    )
    subject = models.CharField(max_length=255, default="", blank=True)
    closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ClientChatMessage(models.Model):
    """Simple chat message between a client and their manager."""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='chat_messages')
    conversation = models.ForeignKey(
        ClientConversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='messages',
    )
    manager_user = models.ForeignKey(
        DjangoUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_client_chat_messages',
    )
    sender = models.CharField(max_length=10, default="client")  # client | manager
    message = models.TextField(default="")
    read_by_client = models.BooleanField(default=False)
    read_by_manager = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

class Note(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    clientId = models.ForeignKey(Client, on_delete=models.CASCADE, null=True, blank=True)
    userId = models.ForeignKey(DjangoUser, on_delete=models.CASCADE, related_name='notes')
    text = models.TextField(default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.text

class UserDetails(models.Model):
    STATUS_CHOICES = [
        ('online', 'En ligne'),
        ('away', 'Absent'),
        ('offline', 'Déconnecté'),
    ]
    
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    django_user = models.OneToOneField(DjangoUser, on_delete=models.CASCADE, related_name='user_details')
    profile_photo = models.ImageField(upload_to='user_profiles/', storage=user_profile_storage, null=True, blank=True)
    role = models.CharField(max_length=12, default="0")
    phone = models.CharField(max_length=20, default="", blank=True)
    active = models.BooleanField(null=False, default=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline', blank=True)
    availability_schedule = models.JSONField(default=dict, blank=True)  # Format: {"monday": {"start": "09:00", "end": "18:00"}, ...}
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Notification(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    type = models.CharField(max_length=50, default="")
    messageId = models.CharField(max_length=12, default="")
    transactionId = models.CharField(max_length=12, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class AppNotification(models.Model):
    """In-app notifications for CRM users and platform clients."""
    RECIPIENT_CRM_USER = 'crm_user'
    RECIPIENT_CLIENT = 'client'
    RECIPIENT_CHOICES = [
        (RECIPIENT_CRM_USER, 'CRM User'),
        (RECIPIENT_CLIENT, 'Client'),
    ]
    TYPE_MESSAGE_FROM_CLIENT = 'message_from_client'
    TYPE_CLIENT_SUBSCRIPTION = 'client_subscription'
    TYPE_CLIENT_LOGIN = 'client_login'
    TYPE_MESSAGE_FROM_MANAGER = 'message_from_manager'
    TYPE_CLIENT_DEPOT = 'client_depot'
    TYPE_CLIENT_RETRAIT = 'client_retrait'
    TYPE_CLIENT_KYC_DOCUMENT_UPLOADED = 'client_kyc_document_uploaded'
    TYPE_REFERRAL_INSCRIPTION = 'referral_inscription'

    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    recipient_type = models.CharField(max_length=20, choices=RECIPIENT_CHOICES, default=RECIPIENT_CRM_USER)
    recipient_user = models.ForeignKey(
        DjangoUser,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='app_notifications',
    )
    recipient_client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='app_notifications',
    )
    notification_type = models.CharField(max_length=50, default="")
    read = models.BooleanField(default=False)
    title = models.CharField(max_length=200, default="", blank=True)
    message = models.TextField(default="", blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"AppNotification {self.id} - {self.notification_type} - {self.created_at}"


class Role(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    name = models.CharField(max_length=50, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Team(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    name = models.CharField(max_length=50, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class TeamMember(models.Model):
    """Table de relation entre UserDetails et Team avec date d'insertion"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    user = models.ForeignKey('UserDetails', on_delete=models.CASCADE, related_name='team_memberships')
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='team_members')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['user', 'team']  # Un utilisateur ne peut être qu'une fois dans une équipe

class Log(models.Model):
    """Table for tracking all CRM activity logs"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    event_type = models.CharField(max_length=100, default="")  # createUser, editUser, createClient, etc.
    user_id = models.ForeignKey(DjangoUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
    client_id = models.ForeignKey('Client', on_delete=models.SET_NULL, null=True, blank=True, related_name='history_logs')
    created_at = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict, blank=True)  # IP, browser info, and other metadata
    old_value = models.JSONField(default=dict, null=True, blank=True)  # Previous state
    new_value = models.JSONField(default=dict, null=True, blank=True)  # New state

    def __str__(self):
        return f"Log {self.id} - {self.event_type} - {self.created_at}"

class ClientPlatformLog(models.Model):
    """Table for tracking all client actions on the platform"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='platform_logs')
    action_type = models.CharField(max_length=100, default="")  # login, page_view, click, form_submit, etc.
    origin = models.CharField(max_length=50, default="unknown", db_index=True)  # client_login, otp_login, crm_impersonation, unknown
    action_details = models.JSONField(default=dict, blank=True)  # Details of the action (page, element clicked, etc.)
    ip_address = models.CharField(max_length=50, null=True, blank=True)
    user_agent = models.CharField(max_length=500, null=True, blank=True)
    device = models.CharField(max_length=80, null=True, blank=True)
    os = models.CharField(max_length=80, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"PlatformLog {self.id} - {self.action_type} - {self.client.fname} {self.client.lname} - {self.created_at}"

class Asset(models.Model):
    """Table des actifs disponibles (bourse, cryptos, etc.)"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    type = models.CharField(max_length=50, default="")  # Bourse, Crypto, etc.
    name = models.CharField(max_length=200, default="")  # Nom de l'actif
    reference = models.CharField(max_length=100, default="", blank=True)  # Référence (ex: ISIN, ticker)
    category = models.CharField(max_length=100, default="", blank=True, null=True)  # Catégorie
    subcategory = models.CharField(max_length=100, default="", blank=True, null=True)  # Sous-catégorie
    default = models.BooleanField(default=False)  # Si True, disponible par défaut pour tous les clients
    
    # External API integration fields
    # Note: alpha_vantage_symbol stores the symbol for both Alpha Vantage (stocks/ETFs) and Finnhub (cryptos)
    alpha_vantage_symbol = models.CharField(max_length=50, default="", blank=True)  # Symbol for external APIs (e.g., "AAPL" for stocks, "BTC" for cryptos)
    exchange = models.CharField(max_length=50, default="", blank=True)  # Stock exchange (e.g., "NASDAQ", "NYSE", "EURONEXT")
    trading_view_symbol = models.CharField(max_length=100, default="", blank=True)  # Native TradingView symbol (e.g., "TSLA", "NASDAQ:TSLA", "BINANCE:BTCUSDT")
    currency = models.CharField(max_length=10, default="USD", blank=True)  # Currency code (USD, EUR, etc.)
    region = models.CharField(max_length=50, default="", blank=True)  # Region (United States, France, etc.)
    source_index = models.CharField(max_length=50, default="", blank=True)  # Source market index (e.g., "sp500", "cac40", "nasdaq")
    logo_url = models.URLField(max_length=500, default="", blank=True)  # URL of the company logo
    last_price = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)  # Last trading price
    last_price_update = models.DateTimeField(null=True, blank=True)  # Timestamp of last successful price update
    last_price_update_attempt = models.DateTimeField(null=True, blank=True)  # Last failed attempt; used to backoff retries
    price_change = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)  # Price change from previous close
    price_change_percent = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)  # Percentage change

    # Company / asset information (persisted at import time)
    description = models.TextField(default="", blank=True)  # Company/asset description
    sector = models.CharField(max_length=200, default="", blank=True)  # Sector (e.g., Technology)
    industry = models.CharField(max_length=200, default="", blank=True)  # Industry (e.g., Semiconductors)
    headquarters = models.CharField(max_length=300, default="", blank=True)  # Headquarters / address
    ceo = models.CharField(max_length=200, default="", blank=True)  # CEO (best-effort)
    founded_year = models.IntegerField(null=True, blank=True)  # Founded year (best-effort)
    employees = models.IntegerField(null=True, blank=True)  # Full-time employees (best-effort)
    website = models.URLField(max_length=500, default="", blank=True)  # Company website
    market_cap = models.BigIntegerField(null=True, blank=True)  # Market capitalization (best-effort)
    market_cap_currency = models.CharField(max_length=10, default="USD", blank=True)  # Currency for market_cap
    country = models.CharField(max_length=100, default="", blank=True)  # Country
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.type})"

class ClientAsset(models.Model):
    """Table relationnelle entre Client et Asset"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='client_assets')
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='client_assets')
    featured = models.BooleanField(default=False)  # Si True, l'actif est mis en avant pour ce client
    availability_start = models.DateField(null=True, blank=True)  # Début de disponibilité pour ce client
    availability_end = models.DateField(null=True, blank=True)  # Fin de disponibilité pour ce client
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['client', 'asset']  # Un client ne peut avoir qu'une fois le même actif

    def __str__(self):
        return f"{self.client.fname} {self.client.lname} - {self.asset.name}"

class RIB(models.Model):
    """Table des RIBs disponibles"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    name = models.CharField(max_length=200, default="")  # Nom du RIB
    iban = models.CharField(max_length=34, default="", blank=True)  # IBAN
    bic = models.CharField(max_length=11, default="", blank=True)  # BIC
    bank_name = models.CharField(max_length=200, default="", blank=True)  # Nom de la banque
    account_holder = models.CharField(max_length=200, default="", blank=True)  # Titulaire du compte
    bank_code = models.CharField(max_length=5, default="", blank=True)  # Code banque (5 chiffres)
    branch_code = models.CharField(max_length=5, default="", blank=True)  # Code guichet (5 chiffres)
    account_number = models.CharField(max_length=11, default="", blank=True)  # Numéro de compte (11 caractères)
    rib_key = models.CharField(max_length=2, default="", blank=True)  # Clé RIB (2 chiffres)
    domiciliation = models.CharField(max_length=200, default="", blank=True)  # Domiciliation
    motif = models.CharField(max_length=512, default="", blank=True)  # Libellé / référence à utiliser sur le virement (défini par la gestion)
    default = models.BooleanField(default=False)  # Si True, disponible par défaut pour tous les clients
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.iban}"

class ClientRIB(models.Model):
    """Table relationnelle entre Client et RIB"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='client_ribs')
    rib = models.ForeignKey(RIB, on_delete=models.CASCADE, related_name='client_ribs')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['client', 'rib']  # Un client ne peut avoir qu'une fois le même RIB

    def __str__(self):
        return f"{self.client.fname} {self.client.lname} - {self.rib.name}"

class UsefulLink(models.Model):
    """Table des liens utiles disponibles"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    name = models.CharField(max_length=200, default="")  # Nom du lien (Titre)
    url = models.URLField(max_length=500, default="")  # URL du lien
    description = models.TextField(default="", blank=True)  # Description du lien
    image = models.ImageField(upload_to='useful_links/', storage=useful_link_storage, null=True, blank=True)  # Image du lien
    category = models.CharField(max_length=100, default="", blank=True)  # Catégorie du lien (déprécié)
    button = models.CharField(max_length=200, default="", blank=True)  # Texte du bouton pour ouvrir le lien ou télécharger le fichier
    default = models.BooleanField(default=False)  # Si True, disponible par défaut pour tous les clients
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.url}"

class ClientUsefulLink(models.Model):
    """Table relationnelle entre Client et UsefulLink"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='client_useful_links')
    useful_link = models.ForeignKey(UsefulLink, on_delete=models.CASCADE, related_name='client_useful_links')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['client', 'useful_link']  # Un client ne peut avoir qu'une fois le même lien

    def __str__(self):
        return f"{self.client.fname} {self.client.lname} - {self.useful_link.name}"

class ReferralProspect(models.Model):
    """Prospect invité par parrainage - coordonnées pour rappel"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    referrer = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='referral_prospects')
    fname = models.CharField(max_length=50)
    lname = models.CharField(max_length=50)
    email = models.EmailField()
    phone = models.CharField(max_length=20, default="", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.id or self.id.strip() == "":
            self.id = uuid.uuid4().hex[:12]
            while ReferralProspect.objects.filter(id=self.id).exists():
                self.id = uuid.uuid4().hex[:12]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.fname} {self.lname} - référé par {self.referrer.fname} {self.referrer.lname}"

class Transaction(models.Model):
    """Table des transactions clients"""
    TRANSACTION_TYPES = [
        ('depot', 'Dépôt'),
        ('retrait', 'Retrait'),
        ('bonus', 'Bonus'),
        ('achat', 'Achat'),
        ('vente', 'Vente'),
        ('interets', 'Intérêts'),
        ('frais', 'Frais'),
        ('transfert', 'Transfert'),
        ('perte', 'Perte'),
        ('conversion', 'Conversion'),
    ]
    
    STATUS_CHOICES = [
        ('en_attente_paiement', 'En attente de paiement'),
        ('en_cours', 'En cours'),
        ('en_verification', 'En vérification'),
        ('valide', 'Validé'),
        ('conteste', 'Contesté'),
        ('annule', 'Annulé'),
    ]
    
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=50, choices=TRANSACTION_TYPES, default='depot')
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_currency = models.CharField(max_length=3, default='EUR')  # Devise du montant (EUR, USD, CHF)
    description = models.TextField(default="", blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='en_cours')
    datetime = models.DateTimeField()  # Date et heure de la transaction
    # Timestamp when the transaction was validated (status became 'valide').
    # Used to start position generation at validation time instead of creation time.
    validated_at = models.DateTimeField(null=True, blank=True, default=None)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Transfer direction fields (for transfert transactions)
    # 'from' can be: null, 'solde', or product ID
    # 'to' can be: null, 'solde', or product ID
    transfer_from = models.CharField(max_length=50, null=True, blank=True, default=None)  # Source: 'solde' or product ID
    transfer_to = models.CharField(max_length=50, null=True, blank=True, default=None)  # Destination: 'solde' or product ID
    
    # Subscription details for transfert transactions
    subscription_details = models.JSONField(default=dict, blank=True, null=True)  # Store subscription form data as JSON
    product = models.ForeignKey('Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')  # Link to product if transfert
    # Trading orders: store the purchased asset directly on the transaction.
    asset = models.ForeignKey(Asset, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    # FX conversion snapshot for trading orders when asset currency != EUR
    fx_rate_eur_to_asset = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    amount_in_asset_currency = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    subscription_first_name = models.CharField(max_length=100, default="", blank=True, null=True)
    subscription_last_name = models.CharField(max_length=100, default="", blank=True, null=True)
    subscription_birth_date = models.CharField(max_length=20, default="", blank=True, null=True)
    subscription_city = models.CharField(max_length=100, default="", blank=True, null=True)
    subscription_ip = models.CharField(max_length=50, default="", blank=True, null=True)
    subscription_date = models.CharField(max_length=20, default="", blank=True, null=True)
    subscription_duration = models.CharField(max_length=50, default="", blank=True, null=True)
    subscription_interest_period = models.CharField(max_length=50, default="", blank=True, null=True)
    subscription_profitability = models.CharField(max_length=50, default="", blank=True, null=True)
    subscription_investment = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    subscription_profits = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    subscription_total = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    subscription_contract_end = models.CharField(max_length=20, default="", blank=True, null=True)
    subscription_signature = models.TextField(default="", blank=True, null=True)  # Base64 encoded signature image
    
    # Position generation history: stores details of each position generation run
    # Format: [{"timestamp": "...", "rates": {...}, "positions": [...], "summary": {...}}, ...]
    position_generation_history = models.JSONField(default=list, blank=True, null=True)
    
    def __str__(self):
        return f"{self.get_type_display()} - {self.amount} € - {self.client.fname} {self.client.lname}"


class Position(models.Model):
    """
    Position mensuelle créée lors du démarrage d'un investissement (transfert solde -> produit).
    Une ligne = un mois/période pour un client sur un produit.
    """
    STATUS_CHOICES = [
        # pending = scheduled but not yet opened (for trade-like positions)
        ('pending', 'En attente'),
        # open = currently open (opened_at passed, closed_at not yet reached)
        ('open', 'Ouverte'),
        ('done', 'Terminé'),
        ('cancelled', 'Annulé'),
    ]

    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='positions')
    # Product is optional for asset-only trades (client trading orders).
    # For investment positions (legacy monthly) and smart-portfolio trade-like positions, product is set.
    product = models.ForeignKey('Product', on_delete=models.CASCADE, null=True, blank=True, related_name='positions')
    transaction = models.ForeignKey('Transaction', on_delete=models.SET_NULL, null=True, blank=True, related_name='positions')

    # 0 = 1er mois, 1 = 2e mois, etc. (NULL for manual trading positions)
    period_index = models.PositiveIntegerField(null=True, blank=True, default=None)
    # Date représentant le mois/période (ex: 2026-01-01). NULL for manual trading positions.
    period_date = models.DateField(null=True, blank=True)

    invested_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    # Trading positions (asset orders): capture entry price + quantity bought
    entry_price = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    quantity = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    # FX conversion snapshot (EUR -> asset currency) used at order placement
    fx_rate_eur_to_asset = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    invested_amount_asset_currency = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    expected_profit = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    expected_total = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    # For Smart Portfolio trade-like positions (optional for legacy monthly positions)
    asset = models.ForeignKey(Asset, on_delete=models.SET_NULL, null=True, blank=True, related_name='positions')
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    profit_loss = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # unique_together allows NULL period_index (multiple trading positions per transaction)
        unique_together = ['transaction', 'period_index']
        # Order by period_date when available, otherwise by created_at
        ordering = ['period_date', 'created_at']

    def __str__(self):
        period_info = f" - {self.period_date} (#{self.period_index})" if self.period_date else ""
        return f"Position {self.client_id} - {self.product_id or '-'}{period_info}"


class PositionDeletionRecord(models.Model):
    """
    Append-only audit trail when a Position row is deleted (debug: who / why / snapshot).
    Does not FK to Position (row is gone); IDs are denormalized strings.
    """
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    position_id = models.CharField(max_length=12, db_index=True)
    client_id = models.CharField(max_length=12, db_index=True)
    transaction_id = models.CharField(max_length=12, null=True, blank=True, db_index=True)
    product_id = models.CharField(max_length=12, null=True, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    trigger = models.CharField(max_length=128, db_index=True)
    actor_user = models.ForeignKey(DjangoUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='position_deletion_records')
    batch_id = models.CharField(max_length=36, null=True, blank=True, db_index=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client_id', '-created_at']),
        ]

    def __str__(self):
        return f"PositionDeletion {self.id} pos={self.position_id} @ {self.created_at}"


class ProductCategory(models.Model):
    """Table des catégories de produits financiers"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    title = models.CharField(max_length=200, default="")  # Titre de la catégorie
    url = models.CharField(max_length=200, default="", blank=True)  # URL slug
    subcategories = models.JSONField(default=list, blank=True)  # Liste des sous-catégories
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class Product(models.Model):
    """Table des produits financiers"""
    STATUS_CHOICES = [
        ('Actif', 'Actif'),
        ('Brouillon', 'Brouillon'),
        ('Inactif', 'Inactif'),
    ]
    
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    name = models.CharField(max_length=200, default="")  # Nom du produit
    reference = models.CharField(max_length=100, default="", blank=True)  # Référence du produit
    type = models.CharField(max_length=200, default="", blank=True)  # Type de produit (Épargne, Livret, PEA, etc.)
    category = models.ForeignKey(ProductCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    subcategory = models.CharField(max_length=200, default="", blank=True)  # Sous-catégorie
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Brouillon')  # Statut du produit
    profitability = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)  # Rentabilité en %
    duration = models.CharField(max_length=100, default="", blank=True)  # Durée (ex: "12 mois")
    description = models.TextField(default="", blank=True)  # Description du produit
    cgv = models.TextField(default="", blank=True)  # Conditions Générales de Vente
    image = models.ImageField(upload_to='products/', storage=product_storage, null=True, blank=True)  # Image du produit
    technical_sheet = models.FileField(
        upload_to='products/technical_sheets/',
        storage=product_storage,
        null=True,
        blank=True,
    )  # Fiche technique (PDF)

    # Gestion de la rentabilité
    no_profitability = models.BooleanField(default=True)  # Produit sans rentabilité (True = pas de rentabilité, False = avec rentabilité)
    is_variable_profitability = models.CharField(max_length=10, default='Non')  # Rentabilité variable (Oui/Non)
    variable_profitability = models.CharField(max_length=100, default="", blank=True)  # Taux maximum si variable, sinon vide
    profitability_period = models.CharField(max_length=200, default="", blank=True)  # Période de rentabilité
    interest_period = models.CharField(max_length=200, default="", blank=True)  # Période d'intérêt disponible (peut contenir plusieurs valeurs séparées par des virgules)
    
    # Gestion du produit
    availability_start = models.DateField(null=True, blank=True)  # Début de disponibilité
    availability_end = models.DateField(null=True, blank=True)  # Fin de disponibilité
    link_to_assets = models.CharField(max_length=10, default='Non')  # Lie le produit à des actifs (Oui/Non)
    
    # Gestion des prix
    min_entry_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Valeur minimum d'entrée
    max_entry_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Valeur maximum d'entrée
    default = models.BooleanField(default=False)  # Si True, disponible par défaut pour tous les clients
    available_funds = models.BooleanField(default=False)  # Fonds disponibles
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.reference})"


class ProductAssetAllocation(models.Model):
    """Liaison entre un produit et des actifs avec une proportion (%)"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='asset_allocations')
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='product_allocations')
    proportion = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Proportion en pourcentage (0 à 100)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['product', 'asset']

    def __str__(self):
        return f"{self.product.name} - {self.asset.name}: {self.proportion}%"

class ClientProduct(models.Model):
    """Table relationnelle entre Client et Product"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='client_products')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='client_products')
    featured = models.BooleanField(default=False)  # Si True, le produit est mis en avant pour ce client
    show_rates = models.BooleanField(default=True)  # Afficher les taux/rentabilité à ce client
    availability_start = models.DateField(null=True, blank=True)  # Début de disponibilité pour ce client
    availability_end = models.DateField(null=True, blank=True)  # Fin de disponibilité pour ce client
    # Personnalisation par client (clés camelCase allowlist, voir client_product_overrides.py)
    overrides = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['client', 'product']  # Un client ne peut avoir qu'une fois le même produit

    def __str__(self):
        return f"{self.client.fname} {self.client.lname} - {self.product.name}"

class ClientDocument(models.Model):
    """Table pour stocker les documents clients (contrats, documents KYC, etc.)"""
    DOCUMENT_TYPES = [
        ('contract', 'Contrat'),
        ('kyc', 'Document KYC'),
        ('identity', 'Pièce d\'identité'),
        ('address', 'Justificatif de domicile'),
        ('financial', 'Document financier'),
        ('other', 'Autre'),
    ]
    
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='documents')
    transaction = models.ForeignKey('Transaction', on_delete=models.CASCADE, null=True, blank=True, related_name='documents')  # Contrats liés aux transactions
    product = models.ForeignKey(
        'Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='client_documents',
    )  # Contrats rattachés directement à un produit (sans transaction)
    name = models.CharField(max_length=200, default="")  # Nom du document
    document_type = models.CharField(max_length=50, choices=DOCUMENT_TYPES, default='other')
    file = models.FileField(upload_to='client_documents/', storage=client_profile_storage, null=True, blank=True)
    description = models.TextField(default="", blank=True)  # Description du document
    uploaded_by = models.ForeignKey(DjangoUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_documents')
    # Date de création « métier » (saisie / contrat) — affichage client. created_at = horodatage d’enregistrement.
    document_created_on = models.DateField(null=True, blank=True, verbose_name="Date de création du document")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.client.fname} {self.client.lname} - {self.name}"

class AppSettings(models.Model):
    """Table pour stocker les paramètres de personnalisation de l'application"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    platform_name = models.CharField(max_length=80, default='Panorama')
    address = models.CharField(max_length=200, default='', blank=True)
    website = models.URLField(max_length=200, default='', blank=True)
    email = models.EmailField(max_length=100, default='', blank=True)
    # Champs complémentaires pour mentions légales / CGU / politiques (Paramètres admin)
    legal_form = models.CharField(max_length=120, default='', blank=True)  # ex. SAS, SARL
    share_capital = models.CharField(max_length=120, default='', blank=True)  # ex. 10 000 €
    siren = models.CharField(max_length=20, default='', blank=True)
    siret = models.CharField(max_length=20, default='', blank=True)
    rcs = models.CharField(max_length=200, default='', blank=True)  # ex. 849 123 456 RCS Paris
    vat_number = models.CharField(max_length=30, default='', blank=True)  # TVA intracommunautaire
    publication_director = models.CharField(max_length=200, default='', blank=True)
    hosting_provider = models.TextField(default='', blank=True)
    dpo_contact = models.TextField(default='', blank=True)
    consumer_mediator = models.TextField(default='', blank=True)
    regulatory_mentions = models.TextField(default='', blank=True)  # ORIAS, AMF, autres agréments
    company_country = models.CharField(
        max_length=2,
        choices=[
            ('FR', 'France'),
            ('BE', 'Belgique'),
            ('LU', 'Luxembourg'),
            ('CH', 'Suisse'),
            ('GR', 'Grèce'),
        ],
        default='FR',
    )
    logo = models.ImageField(upload_to='app_settings/', storage=app_settings_storage, null=True, blank=True)
    favicon = models.ImageField(upload_to='app_settings/', storage=app_settings_storage, null=True, blank=True)
    login_background_image = models.ImageField(upload_to='app_settings/', storage=app_settings_storage, null=True, blank=True)
    platform_banner_image = models.ImageField(upload_to='app_settings/', storage=app_settings_storage, null=True, blank=True)
    primary_color = models.CharField(max_length=7, default='#030213')  # Couleur primaire (hex)
    secondary_color = models.CharField(max_length=7, default='', blank=True)  # Couleur secondaire (hex)
    accent_color = models.CharField(max_length=7, default='', blank=True)  # Couleur d'accent (hex)
    otp_email_enabled = models.BooleanField(default=True)
    otp_sms_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "App Settings"
        verbose_name_plural = "App Settings"
    
    def __str__(self):
        return f"App Settings - {self.updated_at}"

class NewsPost(models.Model):
    """Table pour stocker les actualités/news posts"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    title = models.CharField(max_length=200, default="")
    content = models.TextField(default="")
    source_name = models.CharField(max_length=200, default="", blank=True)  # e.g. "Les Echos"
    article_url = models.URLField(max_length=500, default="", blank=True)  # Link to original article
    image = models.ImageField(upload_to='news/', storage=app_settings_storage, null=True, blank=True)
    author = models.ForeignKey(DjangoUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='news_posts')
    published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "News Post"
        verbose_name_plural = "News Posts"
    
    def __str__(self):
        return self.title

class ClientVerificationConfig(models.Model):
    """Table pour gérer l'activation/désactivation des étapes et questions de vérification par client"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='verification_configs')
    
    # Configuration des étapes (1-8)
    # Structure: {"step_1": {"enabled": true, "questions": {"firstName": true, "middleName": false, ...}}, ...}
    # Étapes 3–5 actives et 6–7 inactives par défaut côté API (voir defaults get_or_create).
    steps_config = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['client']  # Un seul config par client
        verbose_name = "Client Verification Config"
        verbose_name_plural = "Client Verification Configs"
    
    def __str__(self):
        return f"Verification Config for {self.client.fname} {self.client.lname}"