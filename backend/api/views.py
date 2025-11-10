from django.shortcuts import render
from django.contrib.auth.models import User as DjangoUser
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from .models import Client
from .models import Note
from .models import UserDetails
from .models import Team
from .models import Event
from .serializer import (
    UserSerializer, ClientSerializer, NoteSerializer,
    TeamSerializer, TeamDetailSerializer, UserDetailsSerializer, EventSerializer
)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import uuid


class UserCreateView(generics.CreateAPIView):
    queryset = DjangoUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

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
            return float(value)
        except (ValueError, TypeError):
            return default
    
    # Helper function to safely get date
    def get_date(value):
        if not value or value == '':
            return None
        return value
    
    # Map frontend field names to model field names
    # Informations personnelles
    client_data = {
        'id': client_id,
        'civility': request.data.get('civility', '') or '',
        'fname': request.data.get('firstName', '') or '',
        'lname': request.data.get('lastName', '') or '',
        'platform_access': request.data.get('platformAccess', True),
        'active': request.data.get('active', True),
        'template': request.data.get('template', '') or '',
        'support': request.data.get('support', '') or '',
        'password': request.data.get('password', 'Access@123') or 'Access@123',
        'phone': request.data.get('phone', '') or '',
        'mobile': request.data.get('mobile', '') or '',
        'email': request.data.get('email', '') or '',
        'username': request.data.get('username', '') or '',
        'birth_date': get_date(request.data.get('birthDate')),
        'birth_place': request.data.get('birthPlace', '') or '',
        'address': request.data.get('address', '') or '',
        'postal_code': request.data.get('postalCode', '') or '',
        'city': request.data.get('city', '') or '',
        'nationality': request.data.get('nationality', '') or '',
        'successor': request.data.get('successor', '') or '',
        'managed_by': request.data.get('managerId', '') or '',
        # Fiche patrimoniale
        'professional_activity_status': request.data.get('professionalActivityStatus', '') or '',
        'professional_activity_comment': request.data.get('professionalActivityComment', '') or '',
        'professions': request.data.get('professions', []) or [],
        'professions_comment': request.data.get('professionsComment', '') or '',
        'bank_name': request.data.get('bankName', '') or '',
        'current_account': to_decimal(request.data.get('currentAccount')),
        'livret_ab': to_decimal(request.data.get('livretAB')),
        'pea': to_decimal(request.data.get('pea')),
        'pel': to_decimal(request.data.get('pel')),
        'ldd': to_decimal(request.data.get('ldd')),
        'cel': to_decimal(request.data.get('cel')),
        'csl': to_decimal(request.data.get('csl')),
        'securities_account': to_decimal(request.data.get('securitiesAccount')),
        'life_insurance': to_decimal(request.data.get('lifeInsurance')),
        'savings_comment': request.data.get('savingsComment', '') or '',
        'total_wealth': to_decimal(request.data.get('totalWealth')),
        'objectives': request.data.get('objectives', []) or [],
        'objectives_comment': request.data.get('objectivesComment', '') or '',
        'experience': request.data.get('experience', []) or [],
        'experience_comment': request.data.get('experienceComment', '') or '',
        'tax_optimization': request.data.get('taxOptimization', False),
        'tax_optimization_comment': request.data.get('taxOptimizationComment', '') or '',
        'annual_household_income': to_decimal(request.data.get('annualHouseholdIncome')),
    }
    
    try:
        client = Client.objects.create(**client_data)
        return Response(ClientSerializer(client).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error creating client: {error_details}")
        return Response({'error': str(e), 'details': error_details}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_toggle_active(request, client_id):
    client = get_object_or_404(Client, id=client_id)
    client.active = not client.active
    client.save()
    return Response({'active': client.active})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    django_user = request.user
    try:
        # Try to get the user details profile
        user_details = UserDetails.objects.get(django_user=django_user)
        return Response({
            'id': user_details.id,
            'username': django_user.username,
            'email': django_user.email or '',
            'role': user_details.role,
        })
    except UserDetails.DoesNotExist:
        # If custom user doesn't exist, return Django user data with default role
        return Response({
            'id': django_user.id,
            'username': django_user.username,
            'email': django_user.email or '',
            'role': '0',  # Default role
        })

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
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def team_delete(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    team.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def team_detail(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    serializer = TeamDetailSerializer({
        'team': team,
        'members': team.members.all()
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
    if user_details.django_user:
        user_details.django_user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def user_toggle_active(request, user_id):
    user_details = get_object_or_404(UserDetails, id=user_id)
    # Toggle the active status
    user_details.active = not user_details.active
    user_details.save()
    return Response({'active': user_details.active})

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def user_update(request, user_id):
    user_details = get_object_or_404(UserDetails, id=user_id)
    django_user = user_details.django_user
    
    if not django_user:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
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
    if 'teamId' in request.data:
        team_id = request.data['teamId']
        if team_id:
            try:
                team = Team.objects.get(id=team_id)
                user_details.team = team
            except Team.DoesNotExist:
                return Response({'error': 'Team not found'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            user_details.team = None
    user_details.save()
    
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

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def event_delete(request, event_id):
    event = get_object_or_404(Event, id=event_id, userId=request.user)
    event.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
