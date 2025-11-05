from django.contrib.auth.models import User as DjangoUser
from rest_framework import serializers
from .models import Client, Note, UserDetails, Team, Event

class UserSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.CharField(write_only=True, required=False, default='0')
    teamId = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    
    class Meta:
        model = DjangoUser
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'teamId']
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': False, 'allow_blank': True}
        }

    def create(self, validated_data):
        # Extract UserDetails fields
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        role = validated_data.pop('role', '0')
        team_id = validated_data.pop('teamId', None)
        
        # Create Django User
        user = DjangoUser.objects.create_user(
            username=validated_data.get('username'),
            email=validated_data.get('email', ''),
            password=validated_data.get('password'),
            first_name=first_name,
            last_name=last_name
        )

        # Generate a numeric UserDetails ID (str) incrementing from max existing one
        max_id = 0
        for id_val in UserDetails.objects.values_list('id', flat=True):
            try:
                int_id = int(id_val)
                if int_id > max_id:
                    max_id = int_id
            except (ValueError, TypeError):
                continue
        user_details_id = str(max_id + 1)

        # Get team if teamId provided
        team = None
        if team_id:
            try:
                team = Team.objects.get(id=team_id)
            except Team.DoesNotExist:
                pass

        # Create UserDetails entry for this user
        UserDetails.objects.create(
            id=user_details_id,
            django_user=user,
            role=role,
            team=team
        )
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

class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class UserDetailsSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    firstName = serializers.SerializerMethodField()
    lastName = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    teamId = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    mobile = serializers.SerializerMethodField()

    class Meta:
        model = UserDetails
        fields = [
            'id', 'firstName', 'lastName', 'email',
            'role', 'phone', 'mobile', 'teamId', 'active'
        ]
        read_only_fields = ['id']

    def get_firstName(self, obj):
        return obj.django_user.first_name if obj.django_user else ''

    def get_lastName(self, obj):
        return obj.django_user.last_name if obj.django_user else ''

    def get_email(self, obj):
        return obj.django_user.email if obj.django_user else ''

    def get_phone(self, obj):
        # phone field does not exist on UserDetails; return empty string
        return ''

    def get_mobile(self, obj):
        # mobile field does not exist on UserDetails; return empty string
        return ''

    def get_teamId(self, obj):
        return obj.team.id if obj.team else None

class TeamMemberSerializer(serializers.Serializer):
    userId = serializers.CharField(source='id')
    userData = serializers.SerializerMethodField()

    def get_userData(self, obj):
        django_user = obj.django_user
        return {
            'firstName': django_user.first_name if django_user else '',
            'lastName': django_user.last_name if django_user else '',
            'role': obj.role,
        }

class TeamDetailSerializer(serializers.Serializer):
    team = TeamSerializer()
    members = TeamMemberSerializer(many=True, source='members')

class EventSerializer(serializers.ModelSerializer):
    clientId = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    clientId_read = serializers.CharField(source='clientId.id', read_only=True, allow_null=True)
    clientName = serializers.SerializerMethodField()
    
    class Meta:
        model = Event
        fields = ['id', 'datetime', 'userId', 'clientId', 'clientId_read', 'comment', 'created_at', 'updated_at', 'clientName']
        extra_kwargs = {
            'userId': {'read_only': True},
            'id': {'required': False}
        }
    
    def get_clientName(self, obj):
        if obj.clientId:
            return f"{obj.clientId.fname} {obj.clientId.lname}"
        return None
    
    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['clientId'] = ret.pop('clientId_read', None)
        return ret
