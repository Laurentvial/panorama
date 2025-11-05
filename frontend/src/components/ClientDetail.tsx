import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, User, Wallet, FileText, Calendar, Mail, TrendingUp, Plus, Pencil, Trash2 } from 'lucide-react';
import apiCall from '../utils/api';
import LoadingIndicator from './LoadingIndicator';

interface ClientDetailProps {
  clientId: string;
  onBack: () => void;
}

export function ClientDetail({ clientId, onBack }: ClientDetailProps) {
  const [client, setClient] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  
  // Forms
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en attente'
  });
  
  const [appointmentForm, setAppointmentForm] = useState({
    date: '',
    time: '',
    comment: ''
  });
  
  const [noteText, setNoteText] = useState('');
  const [messageForm, setMessageForm] = useState({
    subject: '',
    message: ''
  });

  useEffect(() => {
    loadClientData();
  }, [clientId]);

  async function loadClientData() {
    try {
      const [clientData, transactionsData, appointmentsData, notesData] = await Promise.all([
        apiCall(`/clients/${clientId}`),
        apiCall(`/clients/${clientId}/transactions`),
        apiCall(`/clients/${clientId}/appointments`),
        apiCall(`/clients/${clientId}/notes`)
      ]);
      
      setClient(clientData.client);
      setTransactions(transactionsData.transactions || []);
      setAppointments(appointmentsData.appointments || []);
      setNotes(notesData.notes || []);
    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          ...transactionForm,
          clientId,
          amount: parseFloat(transactionForm.amount)
        })
      });
      
      setIsTransactionDialogOpen(false);
      setTransactionForm({ type: 'depot', amount: '', description: '', status: 'en attente' });
      loadClientData();
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  }

  async function handleCreateAppointment(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          ...appointmentForm,
          datetime: `${appointmentForm.date}T${appointmentForm.time}`,
          clientId
        })
      });
      
      setIsAppointmentDialogOpen(false);
      setAppointmentForm({ date: '', time: '', comment: '' });
      loadClientData();
    } catch (error) {
      console.error('Error creating appointment:', error);
    }
  }

  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall(`/clients/${clientId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: noteText })
      });
      
      setIsNoteDialogOpen(false);
      setNoteText('');
      loadClientData();
    } catch (error) {
      console.error('Error creating note:', error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall('/messages', {
        method: 'POST',
        body: JSON.stringify({
          ...messageForm,
          recipientId: client.authId
        })
      });
      
      setIsMessageDialogOpen(false);
      setMessageForm({ subject: '', message: '' });
      alert('Message envoyé avec succès');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Supprimer cette note ?')) return;
    
    try {
      await apiCall(`/clients/${clientId}/notes/${noteId}`, { method: 'DELETE' });
      loadClientData();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingIndicator />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Client introuvable</p>
        <Button onClick={onBack} className="mt-4">
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        
        <h1 className="text-slate-900 mb-2">
          {client.firstName} {client.lastName}
        </h1>
        <p className="text-slate-600">{client.email}</p>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Placer RDV
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
                  value={appointmentForm.date}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Heure</Label>
                <Input
                  type="time"
                  value={appointmentForm.time}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, time: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={appointmentForm.comment}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, comment: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsAppointmentDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Créer</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Ajouter une note
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle note</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateNote} className="space-y-4">
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={5}
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Ajouter</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isMessageDialogOpen} onOpenChange={setIsMessageDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Mail className="w-4 h-4 mr-2" />
              Envoyer un message
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau message</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div className="space-y-2">
                <Label>Sujet</Label>
                <Input
                  value={messageForm.subject}
                  onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={messageForm.message}
                  onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
                  rows={5}
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsMessageDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Envoyer</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Client Details Tabs */}
      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="appointments">RDV</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations personnelles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Prénom</Label>
                  <p>{client.firstName}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Nom</Label>
                  <p>{client.lastName}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Email</Label>
                  <p>{client.email}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Téléphone</Label>
                  <p>{client.phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Portable</Label>
                  <p>{client.mobile || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Date d'inscription</Label>
                  <p>{new Date(client.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une transaction
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nouvelle transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateTransaction} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="depot">Dépôt</SelectItem>
                        <SelectItem value="retrait">Retrait</SelectItem>
                        <SelectItem value="bonus">Bonus</SelectItem>
                        <SelectItem value="achat">Achat</SelectItem>
                        <SelectItem value="vente">Vente</SelectItem>
                        <SelectItem value="interets">Intérêts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Montant (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={transactionForm.description}
                      onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Statut</Label>
                    <Select value={transactionForm.status} onValueChange={(value) => setTransactionForm({ ...transactionForm, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en attente">En attente</SelectItem>
                        <SelectItem value="validé">Validé</SelectItem>
                        <SelectItem value="confirmé">Confirmé</SelectItem>
                        <SelectItem value="terminé">Terminé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">Créer</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left py-2 px-3">Type</th>
                        <th className="text-left py-2 px-3">Montant</th>
                        <th className="text-left py-2 px-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-slate-100">
                          <td className="py-2 px-3">
                            {new Date(transaction.createdAt).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="py-2 px-3 capitalize">{transaction.type}</td>
                          <td className="py-2 px-3">{transaction.amount?.toLocaleString('fr-FR')} €</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-1 bg-slate-100 rounded text-xs">
                              {transaction.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucune transaction</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <CardTitle>Rendez-vous</CardTitle>
            </CardHeader>
            <CardContent>
              {appointments.length > 0 ? (
                <div className="space-y-3">
                  {appointments.map((apt) => {
                    const datetime = new Date(apt.datetime);
                    return (
                      <div key={apt.id} className="p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p>{datetime.toLocaleDateString('fr-FR')}</p>
                            <p className="text-sm text-slate-600">
                              {datetime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        {apt.comment && (
                          <p className="text-sm text-slate-600">{apt.comment}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucun rendez-vous</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="p-4 border border-slate-200 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm text-slate-600">
                          {new Date(note.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <p>{note.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucune note</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
