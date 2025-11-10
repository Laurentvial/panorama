from django.urls import path
from . import views as api_views

urlpatterns = [
    # Notes endpoints
    path('notes/', api_views.NoteListCreateView.as_view(), name='note-list-create'),
    path('notes/delete/<str:pk>/', api_views.NoteDeleteView.as_view(), name='note-delete'),
    path('notes/create/', api_views.NoteListCreateView.as_view(), name='note-create'),
    # Clients endpoints
    path('clients/', api_views.ClientView.as_view(), name='client-list'),
    path('clients/create/', api_views.client_create, name='client-create'),
    path('clients/<str:client_id>/toggle-active/', api_views.client_toggle_active, name='client-toggle-active'),
    # Teams endpoints
    path('teams/', api_views.team_list, name='team-list'),
    path('teams/create/', api_views.team_create, name='team-create'),  # POST for create
    path('teams/<str:team_id>/', api_views.team_detail, name='team-detail'),
    path('teams/<str:team_id>/delete/', api_views.team_delete, name='team-delete'),
    # Users endpoints
    path('user/current/', api_views.get_current_user, name='get-current-user'),
    path('users/', api_views.user_list, name='user-list'),
    path('users/create/', api_views.UserCreateView.as_view(), name='user-create'),
    path('users/<str:user_id>/', api_views.user_delete, name='user-delete'),
    path('users/<str:user_id>/update/', api_views.user_update, name='user-update'),
    path('users/<str:user_id>/toggle-active/', api_views.user_toggle_active, name='user-toggle-active'),
    # Events endpoints
    path('events/', api_views.event_list, name='event-list'),
    path('events/create/', api_views.event_create, name='event-create'),
    path('events/<str:event_id>/', api_views.event_delete, name='event-delete'),
]
