import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar as CalendarIcon, Plus, Clock, User, Pencil, Trash2, X } from 'lucide-react';
import api from '../utils/api';
import { useUser } from '../contexts/UserContext';
import '../styles/PlanningCalendar.css';
import { toast } from 'sonner';

export function PlanningCalendar() {
  const { currentUser } = useUser();
  const [events, setEvents] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    clientId: '',
    comment: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [eventsData, clientsData] = await Promise.all([
        api.get('/api/events'),
        api.get('/api/clients')
      ]);
      
      setEvents(eventsData.data?.events || []);
      setClients(clientsData.data || []);
    } catch (error) {
      console.error('Error loading planning data:', error);
    }
  }

  async function handleCreateEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    try {
      await api.post('/api/events/create/', {
        datetime: `${formData.date}T${formData.time}`,
        clientId: formData.clientId || null,
        comment: formData.comment || ''
      });
      
      setIsModalOpen(false);
      setFormData({ date: '', time: '', clientId: '', comment: '' });
      loadData();
      toast.success('Événement créé avec succès');
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Erreur lors de la création de l\'événement');
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce rendez-vous ?')) return;
    
    try {
      await api.delete(`/api/events/${id}/`);
      loadData();
      toast.success('Événement supprimé avec succès');
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Erreur lors de la suppression de l\'événement');
    }
  }

  const daysInMonth = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1
  ).getDay();

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  function getEventsForDay(day: number) {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(event => {
      if (!event.datetime) return false;
      const eventDate = new Date(event.datetime).toISOString().split('T')[0];
      return eventDate === dateStr;
    });
  }

  return (
    <div className="planning-container">
      <div className="planning-header">
        <div className="planning-title-section">
          <h1 className="planning-title">Planning</h1>
          <p className="planning-subtitle">Gestion des rendez-vous</p>
        </div>
        
        <Button type="button" onClick={() => setIsModalOpen(true)}>
          <Plus className="planning-icon planning-icon-with-margin" />
          Ajouter un rendez-vous
        </Button>
        
        {isModalOpen && (
          <div className="planning-modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="planning-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="planning-modal-header">
                <h2 className="planning-modal-title">Nouveau rendez-vous</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="planning-modal-close"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X className="planning-icon-md" />
                </Button>
              </div>
              <form onSubmit={handleCreateEvent} className="planning-form">
                <div className="planning-form-field">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                
                <div className="planning-form-field">
                  <Label>Heure</Label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                  />
                </div>
                
                <div className="planning-form-field">
                  <Label>Client (optionnel)</Label>
                  <Select value={formData.clientId || "none"} onValueChange={(value) => setFormData({ ...formData, clientId: value === "none" ? "" : value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun client</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.fname} {client.lname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="planning-form-field">
                  <Label>Commentaire (optionnel)</Label>
                  <Textarea
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Notes sur le rendez-vous..."
                  />
                </div>
                
                <div className="planning-form-actions">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">
                    Créer
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="planning-calendar-header">
            <CardTitle>
              {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </CardTitle>
            <div className="planning-calendar-nav">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
              >
                Aujourd'hui
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
              >
                →
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="planning-calendar-grid">
            {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((day) => (
              <div key={day} className="planning-weekday">
                {day}
              </div>
            ))}
            
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="planning-calendar-empty"></div>
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const isToday = new Date().getDate() === day && 
                             new Date().getMonth() === selectedDate.getMonth() &&
                             new Date().getFullYear() === selectedDate.getFullYear();
              
              return (
                <div
                  key={day}
                  className={`planning-calendar-day ${isToday ? 'planning-calendar-day-today' : ''}`}
                >
                  <div className="planning-day-number">{day}</div>
                  <div className="planning-day-events">
                    {dayEvents.map((event) => {
                      const eventDate = new Date(event.datetime);
                      const time = eventDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <div key={event.id} className="planning-event-badge">
                          <div className="planning-event-time">
                            <Clock className="planning-icon-sm" />
                            {time}
                          </div>
                          {event.clientName && (
                            <div className="planning-event-client">{event.clientName}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des rendez-vous</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <div className="planning-events-list">
              {events.map((event) => {
                const datetime = new Date(event.datetime);
                
                return (
                  <div key={event.id} className="planning-event-item">
                    <div className="planning-event-content">
                      <div className="planning-event-meta">
                        <div className="planning-event-date-time">
                          <div className="planning-event-date-row">
                            <CalendarIcon className="planning-icon-md planning-icon-slate" />
                            <span>{datetime.toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="planning-event-time-row">
                            <Clock className="planning-icon-md planning-icon-slate" />
                            <span>{datetime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        
                        {event.clientName && (
                          <div className="planning-event-client-row">
                            <User className="planning-icon-md planning-icon-slate" />
                            <span>{event.clientName}</span>
                          </div>
                        )}
                      </div>
                      
                      {event.comment && (
                        <p className="planning-event-comment">{event.comment}</p>
                      )}
                    </div>
                    
                    <div className="planning-event-actions">
                      <Button variant="ghost" size="sm">
                        <Pencil className="planning-icon-md" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="planning-delete-button"
                      >
                        <Trash2 className="planning-icon-md" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="planning-empty-message">Aucun rendez-vous</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
export default PlanningCalendar;