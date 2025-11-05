from django.urls import path
from . import views as api_views

urlpatterns = [
    path('notes/', api_views.NoteListCreateView.as_view(), name='note-list-create'),
    path('notes/delete/<str:pk>/', api_views.NoteDeleteView.as_view(), name='note-delete'),
    path('notes/create/', api_views.NoteListCreateView.as_view(), name='note-create'),
]
