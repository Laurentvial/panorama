from django.db import models
from django.contrib.auth.models import User as DjangoUser

# Create your models here.
class Client(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    fname = models.CharField(max_length=50, default="")
    lname = models.CharField(max_length=50, default="")
    email = models.EmailField(max_length=100, default="", unique=True)
    password = models.CharField(max_length=100, default="Access@123")
    phone = models.CharField(max_length=20, default="")
    mobile = models.CharField(max_length=20, default="")
    managed_by = models.CharField(max_length=50, default="")
    active = models.BooleanField(null=False,default=True)
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