import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Calendar as CalendarIcon, Plus, Clock, User, Pencil, Trash2 } from 'lucide-react';
import { apiCall } from '../utils/api';

interface PlanningProps {
  user: any;
}

export function Planning({ user }: PlanningProps) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
      const [appointmentsData, clientsData] = await Promise.all([
        apiCall('/appointments'),
        apiCall('/clients')
      ]);
      
      setAppointments(appointmentsData.appointments || []);
      setClients(clientsData.clients || []);
    } catch (error) {
      console.error('Error loading planning data:', error);
    }
  }

  async function handleCreateAppointment(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          datetime: `${formData.date}T${formData.time}`,
          userId: user.id
        })
      });
      
      setIsDialogOpen(false);
      setFormData({ date: '', time: '', clientId: '', comment: '' });
      loadData();
    } catch (error) {
      console.error('Error creating appointment:', error);
    }
  }

  async function handleDeleteAppointment(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce rendez-vous ?')) return;
    
    try {
      await apiCall(`/appointments/${id}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Error deleting appointment:', error);
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

  function getAppointmentsForDay(day: number) {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.filter(apt => apt.datetime?.startsWith(dateStr));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 mb-2">Planning</h1>
          <p className="text-slate-600">Gestion des rendez-vous</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un rendez-vous
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau rendez-vous</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label>Heure</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label>Client (optionnel)</Label>
                <Select value={formData.clientId} onValueChange={(value) => setFormData({ ...formData, clientId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun client</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.firstName} {client.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Commentaire (optionnel)</Label>
                <Textarea
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  placeholder="Notes sur le rendez-vous..."
                />
              </div>
              
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  Créer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </CardTitle>
            <div className="flex gap-2">
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
          <div className="grid grid-cols-7 gap-2">
            {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((day) => (
              <div key={day} className="text-center text-sm text-slate-600 p-2">
                {day}
              </div>
            ))}
            
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="p-2"></div>
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayAppointments = getAppointmentsForDay(day);
              const isToday = new Date().getDate() === day && 
                             new Date().getMonth() === selectedDate.getMonth() &&
                             new Date().getFullYear() === selectedDate.getFullYear();
              
              return (
                <div
                  key={day}
                  className={`p-2 border rounded-lg min-h-24 ${isToday ? 'bg-blue-50 border-blue-200' : 'border-slate-200'}`}
                >
                  <div className="text-sm mb-1">{day}</div>
                  <div className="space-y-1">
                    {dayAppointments.map((apt) => {
                      const client = clients.find(c => c.id === apt.clientId);
                      const time = apt.datetime?.split('T')[1]?.substring(0, 5);
                      
                      return (
                        <div key={apt.id} className="bg-blue-100 text-blue-800 text-xs p-1 rounded">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {time}
                          </div>
                          {client && (
                            <div className="truncate">{client.firstName} {client.lastName}</div>
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

      {/* Appointments List */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des rendez-vous</CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length > 0 ? (
            <div className="space-y-3">
              {appointments.map((apt) => {
                const client = clients.find(c => c.id === apt.clientId);
                const datetime = new Date(apt.datetime);
                
                return (
                  <div key={apt.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <CalendarIcon className="w-4 h-4 text-slate-500" />
                            <span>{datetime.toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-500" />
                            <span>{datetime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        
                        {client && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-500" />
                            <span>{client.firstName} {client.lastName}</span>
                          </div>
                        )}
                      </div>
                      
                      {apt.comment && (
                        <p className="text-sm text-slate-600 mt-2">{apt.comment}</p>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteAppointment(apt.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucun rendez-vous</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
