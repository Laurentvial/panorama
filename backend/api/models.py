from django.db import models
from django.contrib.auth.models import User as DjangoUser
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

# Import storage - Cloudinary is REQUIRED (no local storage fallback)
try:
    from api.storage import CloudinaryMediaStorage
    # Check if Cloudinary credentials are configured
    cloudinary_config = getattr(settings, 'CLOUDINARY_STORAGE', {})
    cloudinary_configured = (
        cloudinary_config.get('CLOUD_NAME') and 
        cloudinary_config.get('API_KEY') and 
        cloudinary_config.get('API_SECRET')
    )
    # Cloudinary is REQUIRED - raise error if not configured
    if not cloudinary_configured:
        raise ValueError(
            "Cloudinary credentials are REQUIRED. "
            "Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment variables. "
            "Local file storage is no longer supported - all media files must be uploaded to Cloudinary."
        )
    # All image fields MUST use Cloudinary storage
    product_storage = CloudinaryMediaStorage
    app_settings_storage = CloudinaryMediaStorage
    useful_link_storage = CloudinaryMediaStorage
    client_profile_storage = CloudinaryMediaStorage
    user_profile_storage = CloudinaryMediaStorage
except ImportError:
    # CloudinaryMediaStorage must be available
    raise ImportError(
        "CloudinaryMediaStorage is required but not available. "
        "Please install django-cloudinary-storage: pip install django-cloudinary-storage"
    )

# Create your models here.
class Client(models.Model):
    # Identifiant
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    
    # Informations personnelles
    profile_photo = models.ImageField(upload_to='client_profiles/', storage=client_profile_storage, null=True, blank=True)
    civility = models.CharField(max_length=10, default="", blank=True)  # Monsieur, Madame, etc.
    fname = models.CharField(max_length=50, default="")
    middle_name = models.CharField(max_length=80, default="", blank=True)  # Deuxième prénom (optionnel)
    lname = models.CharField(max_length=50, default="")
    legal_name = models.CharField(max_length=200, default="", blank=True)  # Dénomination légale (nom complet)
    sex = models.CharField(max_length=20, default="", blank=True)  # male | female | other
    account_verified = models.BooleanField(default=False)
    platform_access = models.BooleanField(default=True)  # Connexion à la plateforme
    active = models.BooleanField(null=False, default=True)
    template = models.CharField(max_length=100, default="", blank=True)
    support = models.CharField(max_length=100, default="", blank=True)
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
    
    # Méthodes de paiement disponibles pour le dépôt des fonds
    payment_methods = models.JSONField(default=list, blank=True)  # ex: ["virement", "carte_bancaire"]
    
    # Relations
    managed_by = models.CharField(max_length=50, default="", blank=True)  # ID ou username du gestionnaire
    source = models.CharField(max_length=100, default="", blank=True)  # Source du client
    team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='clients')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    django_user = models.OneToOneField(DjangoUser, on_delete=models.CASCADE, related_name='user_details')
    profile_photo = models.ImageField(upload_to='user_profiles/', storage=user_profile_storage, null=True, blank=True)
    role = models.CharField(max_length=12, default="0")
    phone = models.CharField(max_length=20, default="", blank=True)
    active = models.BooleanField(null=False, default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Notification(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    type = models.CharField(max_length=50, default="")
    messageId = models.CharField(max_length=12, default="")
    transactionId = models.CharField(max_length=12, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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

class Event(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    datetime = models.DateTimeField()
    userId = models.ForeignKey(DjangoUser, on_delete=models.CASCADE, related_name='events')
    clientId = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True)
    comment = models.TextField(default="", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Event {self.id} - {self.datetime}"

class Log(models.Model):
    """Table for tracking all CRM activity logs"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    event_type = models.CharField(max_length=100, default="")  # createUser, editUser, createClient, etc.
    user_id = models.ForeignKey(DjangoUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
    created_at = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict, blank=True)  # IP, browser info, and other metadata
    old_value = models.JSONField(default=dict, null=True, blank=True)  # Previous state
    new_value = models.JSONField(default=dict, null=True, blank=True)  # New state

    def __str__(self):
        return f"Log {self.id} - {self.event_type} - {self.created_at}"

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
    logo_url = models.URLField(max_length=500, default="", blank=True)  # URL of the company logo
    last_price = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)  # Last trading price
    last_price_update = models.DateTimeField(null=True, blank=True)  # Timestamp of last price update
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
        ('investissement', 'Investissement'),
        ('transfert', 'Transfert'),
        ('perte', 'Perte'),
    ]
    
    STATUS_CHOICES = [
        ('en_attente_paiement', 'En attente de paiement'),
        ('en_cours', 'En cours'),
        ('termine', 'Terminé'),
        ('conteste', 'Contesté'),
        ('annule', 'Annulé'),
    ]
    
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=50, choices=TRANSACTION_TYPES, default='depot')
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    description = models.TextField(default="", blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='en_cours')
    datetime = models.DateTimeField()  # Date et heure de la transaction
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Transfer direction fields (for transfert transactions)
    # 'from' can be: null, 'balance', or product ID
    # 'to' can be: null, 'balance', or product ID
    transfer_from = models.CharField(max_length=50, null=True, blank=True, default=None)  # Source: 'balance' or product ID
    transfer_to = models.CharField(max_length=50, null=True, blank=True, default=None)  # Destination: 'balance' or product ID
    
    # Subscription details for transfert transactions
    subscription_details = models.JSONField(default=dict, blank=True, null=True)  # Store subscription form data as JSON
    product = models.ForeignKey('Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')  # Link to product if transfert
    # Trading orders: store the purchased asset directly on the transaction.
    asset = models.ForeignKey(Asset, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    # FX conversion snapshot for trading orders when asset currency != EUR
    fx_rate_eur_to_asset = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    amount_in_asset_currency = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    subscription_first_name = models.CharField(max_length=100, default="", blank=True)
    subscription_last_name = models.CharField(max_length=100, default="", blank=True)
    subscription_birth_date = models.CharField(max_length=20, default="", blank=True)
    subscription_city = models.CharField(max_length=100, default="", blank=True)
    subscription_ip = models.CharField(max_length=50, default="", blank=True)
    subscription_date = models.CharField(max_length=20, default="", blank=True)
    subscription_duration = models.CharField(max_length=50, default="", blank=True)
    subscription_interest_period = models.CharField(max_length=50, default="", blank=True)
    subscription_profitability = models.CharField(max_length=50, default="", blank=True)
    subscription_investment = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    subscription_profits = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    subscription_total = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    subscription_contract_end = models.CharField(max_length=20, default="", blank=True)
    subscription_signature = models.TextField(default="", blank=True)  # Base64 encoded signature image
    
    def __str__(self):
        return f"{self.get_type_display()} - {self.amount} € - {self.client.fname} {self.client.lname}"


class Position(models.Model):
    """
    Position mensuelle créée lors du démarrage d'un investissement (transfert balance -> produit).
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
    
    # Gestion de la rentabilité
    no_profitability = models.BooleanField(default=True)  # Produit sans rentabilité (True = pas de rentabilité, False = avec rentabilité)
    is_variable_profitability = models.CharField(max_length=10, default='Non')  # Rentabilité variable (Oui/Non)
    variable_profitability = models.CharField(max_length=100, default="", blank=True)  # Taux maximum si variable, sinon vide
    profitability_period = models.CharField(max_length=50, default="", blank=True)  # Période de rentabilité
    interest_period = models.CharField(max_length=50, default="", blank=True)  # Période d'intérêt disponible
    capitalisation_fonds = models.CharField(max_length=10, default='Non')  # Capitalisation des fonds (Oui/Non)
    
    # Gestion du produit
    availability_start = models.DateField(null=True, blank=True)  # Début de disponibilité
    availability_end = models.DateField(null=True, blank=True)  # Fin de disponibilité
    link_to_assets = models.CharField(max_length=10, default='Non')  # Lie le produit à des actifs (Oui/Non)
    
    # Gestion des prix
    min_entry_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Valeur minimum d'entrée
    max_entry_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Valeur maximum d'entrée
    
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

class AppSettings(models.Model):
    """Table pour stocker les paramètres de personnalisation de l'application"""
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    platform_name = models.CharField(max_length=80, default='Panorama')
    logo = models.ImageField(upload_to='app_settings/', storage=app_settings_storage, null=True, blank=True)
    login_background_image = models.ImageField(upload_to='app_settings/', storage=app_settings_storage, null=True, blank=True)
    primary_color = models.CharField(max_length=7, default='#030213')  # Couleur primaire (hex)
    secondary_color = models.CharField(max_length=7, default='', blank=True)  # Couleur secondaire (hex)
    accent_color = models.CharField(max_length=7, default='', blank=True)  # Couleur d'accent (hex)
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