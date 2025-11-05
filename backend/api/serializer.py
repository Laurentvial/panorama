from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Client
from .models import Note


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': False, 'allow_blank': True}
        }
    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
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
    class Meta:
        model = Client
        fields = '__all__'