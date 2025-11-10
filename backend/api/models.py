from django.db import models
from django.contrib.auth.models import User as DjangoUser

# Create your models here.
class Client(models.Model):
    # Identifiant
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    
    # Informations personnelles
    profile_photo = models.ImageField(upload_to='client_profiles/', null=True, blank=True)
    civility = models.CharField(max_length=10, default="", blank=True)  # Monsieur, Madame, etc.
    fname = models.CharField(max_length=50, default="")
    lname = models.CharField(max_length=50, default="")
    platform_access = models.BooleanField(default=True)  # Connexion à la plateforme
    active = models.BooleanField(null=False, default=True)
    template = models.CharField(max_length=100, default="", blank=True)
    support = models.CharField(max_length=100, default="", blank=True)
    password = models.CharField(max_length=100, default="Access@123")
    phone = models.CharField(max_length=20, default="", blank=True)
    mobile = models.CharField(max_length=20, default="", blank=True)
    email = models.EmailField(max_length=100, default="", unique=True)
    username = models.CharField(max_length=100, default="", blank=True)
    birth_date = models.DateField(null=True, blank=True)
    birth_place = models.CharField(max_length=100, default="", blank=True)
    address = models.CharField(max_length=200, default="", blank=True)
    postal_code = models.CharField(max_length=20, default="", blank=True)
    city = models.CharField(max_length=100, default="", blank=True)
    nationality = models.CharField(max_length=100, default="", blank=True)
    successor = models.CharField(max_length=200, default="", blank=True)
    
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
    
    # Relations
    managed_by = models.CharField(max_length=50, default="", blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    role = models.CharField(max_length=12, default="0")
    team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='members')
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