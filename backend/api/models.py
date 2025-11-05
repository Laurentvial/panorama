from django.db import models
from django.contrib.auth.models import User

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
    userId = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notes')
    text = models.TextField(default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.text

class User(models.Model):
    id = models.CharField(max_length=12, default="", unique=True, primary_key=True)
    username = models.CharField(max_length=50, default="")
    email = models.EmailField(max_length=100, default="", unique=True)
    password = models.CharField(max_length=100, default="Access@123")
