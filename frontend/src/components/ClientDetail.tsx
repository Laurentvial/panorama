import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateInput } from './ui/date-input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ArrowLeft, User, Wallet, TrendingUp, Plus, Pencil, Trash2, ChevronDown, Power, CheckCircle, XCircle, Calendar, FileText, Mail, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { toast } from 'sonner';
import { EditPersonalInfoModal } from './EditPersonalInfoModal';
import { EditPatrimonialInfoModal } from './EditPatrimonialInfoModal';
import '../styles/Clients.css';
import '../styles/PlanningCalendar.css';

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
  const [isPatrimonialOpen, setIsPatrimonialOpen] = useState(false);
  
  // Dialogs
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isEditPersonalInfoOpen, setIsEditPersonalInfoOpen] = useState(false);
  const [isEditPatrimonialInfoOpen, setIsEditPatrimonialInfoOpen] = useState(false);
  
  // Forms
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en attente'
  });
  

  useEffect(() => {
    loadClientData();
  }, [clientId]);

  async function loadClientData() {
    try {
      const [clientData, notesData, eventsData] = await Promise.all([
        apiCall(`/api/clients/${clientId}/`),
        apiCall(`/api/notes/`),
        apiCall(`/api/events/`)
      ]);
      
      setClient((clientData as any).client);
      // Filter notes for this client - notes API returns array directly
      const notesArray = Array.isArray(notesData) ? notesData : ((notesData as any).notes || notesData || []);
      const clientNotes = notesArray.filter((note: any) => note.clientId === clientId);
      setNotes(clientNotes);
      
      // Filter events (appointments) for this client - events API returns {events: [...]}
      const eventsArray = (eventsData as any).events || [];
      const clientAppointments = eventsArray.filter((event: any) => event.clientId === clientId);
      setAppointments(clientAppointments);
      
      // Transactions endpoint doesn't exist yet, set empty array
      setTransactions([]);
    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenEditModal() {
    setIsEditPersonalInfoOpen(true);
  }

  function handlePersonalInfoUpdated(updatedClient: any) {
    setClient(updatedClient);
  }

  function handlePatrimonialInfoUpdated(updatedClient: any) {
    setClient(updatedClient);
  }

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      // TODO: Implement transactions endpoint
      console.warn('Transactions endpoint not yet implemented');
      setIsTransactionDialogOpen(false);
      setTransactionForm({ type: 'depot', amount: '', description: '', status: 'en attente' });
      loadClientData();
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  }


  async function handleDeleteNote(noteId: string) {
    if (!confirm('Supprimer cette note ?')) return;
    
    try {
      await apiCall(`/api/notes/delete/${noteId}/`, { method: 'DELETE' });
      loadClientData();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  }

  function handlePlatformAccess() {
    // TODO: Redirection vers la plateforme client (à implémenter plus tard)
    toast.info('Redirection vers la plateforme client - Fonctionnalité à venir');
    // window.location.href = `/platform/client/${clientId}`;
  }

  async function handleToggleActive() {
    try {
      await apiCall(`/api/clients/${clientId}/toggle-active/`, { method: 'POST' });
      toast.success(client.active ? 'Client désactivé' : 'Client activé');
      loadClientData();
    } catch (error) {
      console.error('Error toggling active status:', error);
      toast.error('Erreur lors de la modification du statut');
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
          <ArrowLeft className="w-4 h-4 mr-2"/>
          Retour
        </Button>
        <div className="mt-2 flex gap-4">
          {client.profilePhoto ? (
            <img 
              src={client.profilePhoto} 
              alt="Photo de profil" 
              className="client-profile-photo-display"
            />
          ) : (
            <div className="client-profile-photo-placeholder-display">
              <User className="w-12 h-12" />
            </div>
          )}
          <div>
            <h1 className="text-slate-900 mb-1">
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-slate-600">{client.email}</p>
          </div>
          </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button 
          size="sm"
          onClick={() => toast.info('Fonctionnalité à venir - Placer RDV')}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Placer RDV
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={() => toast.info('Fonctionnalité à venir - Ajouter une note')}
        >
          <FileText className="w-4 h-4 mr-2" />
          Ajouter une note
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={() => toast.info('Fonctionnalité à venir - Envoyer un message')}
        >
          <Mail className="w-4 h-4 mr-2" />
          Envoyer un message
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={handlePlatformAccess}
        >
          <Power className="w-4 h-4 mr-2" />
          Connexion à la plateforme
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={handleToggleActive}
          className={client.active ? 'client-action-button-deactivate' : 'client-action-button-activate'}
        >
          {client.active ? (
            <>
              <XCircle className="w-4 h-4 mr-2" />
              Désactiver
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Activer
            </>
          )}
        </Button>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Informations personnelles</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenEditModal}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Éditer
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">

                <div>
                  <Label className="text-slate-600">Civilité</Label>
                  <p>{client.civility || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Prénom / Nom</Label>
                  <p>{client.firstName} {client.lastName}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Template</Label>
                  <p>{client.template || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Support</Label>
                  <p>{client.support || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Mot de passe</Label>
                  <p className="font-mono text-sm">{client.password || '-'}</p>
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
                  <Label className="text-slate-600">E-mail</Label>
                  <p>{client.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Date de naissance</Label>
                  <p>{(() => {
                    if (!client.birthDate) return '-';
                    const date = new Date(client.birthDate);
                    if (isNaN(date.getTime())) return '-';
                    return date.toLocaleDateString('fr-FR', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric'
                    });
                  })()}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Lieu de naissance</Label>
                  <p>{client.birthPlace || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Adresse</Label>
                  <p>{client.address || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Code postal</Label>
                  <p>{client.postalCode || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Ville</Label>
                  <p>{client.city || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Nationalité</Label>
                  <p>{client.nationality || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Successeur</Label>
                  <p>{client.successor || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Date d'inscription</Label>
                  <p>{new Date(client.createdAt).toLocaleDateString('fr-FR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric'
                  })}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fiche patrimoniale */}
          <Collapsible open={isPatrimonialOpen} onOpenChange={setIsPatrimonialOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between pb-6">
                    <CardTitle>Fiche patrimoniale</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditPatrimonialInfoOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Éditer
                      </Button>
                      <ChevronDown className={`client-chevron ${isPatrimonialOpen ? 'open' : ''}`} />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-6">
                  {/* Activité professionnelle */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Activité professionnelle</h3>
                    <div>
                      <Label className="text-slate-600">Statut</Label>
                      <p>{client.professionalActivityStatus || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-slate-600">Commentaire</Label>
                      <p>{client.professionalActivityComment || '-'}</p>
                    </div>
                  </div>

                  {/* Métiers */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Métiers</h3>
                    <div>
                      <Label className="text-slate-600">Métier(s)</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {client.professions && client.professions.length > 0 ? (
                          client.professions.map((profession: string, index: number) => (
                            <div key={index} className="client-profession-badge">
                              <span>{profession}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-600">Commentaire</Label>
                      <p>{client.professionsComment || '-'}</p>
                    </div>
                  </div>

                  {/* Patrimoine */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Patrimoine</h3>
                    <div>
                      <Label className="text-slate-600">Banque</Label>
                      <p>{client.bankName || '-'}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-600">Compte courant (€)</Label>
                        <p>{(client.currentAccount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <Label className="text-slate-600">Livret A/B (€)</Label>
                        <p>{(client.livretAB || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <Label className="text-slate-600">PEA (€)</Label>
                        <p>{(client.pea || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <Label className="text-slate-600">PEL (€)</Label>
                        <p>{(client.pel || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <Label className="text-slate-600">LDD (€)</Label>
                        <p>{(client.ldd || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-semibold">Épargne</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-slate-600">CEL (€)</Label>
                          <p>{(client.cel || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <Label className="text-slate-600">CSL (€)</Label>
                          <p>{(client.csl || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <Label className="text-slate-600">Compte titre (€)</Label>
                          <p>{(client.securitiesAccount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <Label className="text-slate-600">Assurance-vie (€)</Label>
                          <p>{(client.lifeInsurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-slate-600">Commentaire</Label>
                      <p>{client.savingsComment || '-'}</p>
                    </div>

                    <div>
                      <Label className="font-semibold">Total du patrimoine (€)</Label>
                      <p className="text-lg font-bold">{(client.totalWealth || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  {/* Objectifs et expérience */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Objectifs et expérience</h3>
                    <div>
                      <Label className="text-slate-600">Objectifs</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {client.objectives && client.objectives.length > 0 ? (
                          client.objectives.map((obj: string, index: number) => (
                            <div key={index} className="client-badge">
                              {obj}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-600">Commentaire</Label>
                      <p>{client.objectivesComment || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-slate-600">Expérience</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {client.experience && client.experience.length > 0 ? (
                          client.experience.map((exp: string, index: number) => (
                            <div key={index} className="client-badge">
                              {exp}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-600">Commentaire</Label>
                      <p>{client.experienceComment || '-'}</p>
                    </div>
                  </div>

                  {/* Informations financières */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Informations financières</h3>
                    <div>
                      <Label className="text-slate-600">Défiscalisation</Label>
                      <p>{client.taxOptimization !== undefined ? (client.taxOptimization ? 'Oui' : 'Non') : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-slate-600">Commentaire</Label>
                      <p>{client.taxOptimizationComment || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-slate-600">Revenu annuel du foyer (€)</Label>
                      <p>{(client.annualHouseholdIncome || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setIsTransactionDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une transaction
            </Button>
          </div>

          {isTransactionDialogOpen && (
            <div className="planning-modal-overlay" onClick={() => setIsTransactionDialogOpen(false)}>
              <div className="planning-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="planning-modal-header">
                  <h2 className="planning-modal-title">Nouvelle transaction</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="planning-modal-close"
                    onClick={() => setIsTransactionDialogOpen(false)}
                  >
                    <X className="planning-icon-md" />
                  </Button>
                </div>
                <form onSubmit={handleCreateTransaction} className="planning-form">
                  <div className="planning-form-field">
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
                  <div className="planning-form-field">
                    <Label>Montant (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="planning-form-field">
                    <Label>Description</Label>
                    <Textarea
                      value={transactionForm.description}
                      onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                    />
                  </div>
                  <div className="planning-form-field">
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
                  <div className="planning-form-actions">
                    <Button type="button" variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">Créer</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

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
                            {new Date(transaction.createdAt).toLocaleDateString('fr-FR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric'
                          })}
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
                            <p>{datetime.toLocaleDateString('fr-FR', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric'
                            })}</p>
                            <p className="text-sm text-slate-600">
                              {datetime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false })}
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
                          {new Date(note.createdAt).toLocaleDateString('fr-FR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric'
                          })}
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

      {/* Edit Personal Info Modal */}
      <EditPersonalInfoModal
        isOpen={isEditPersonalInfoOpen}
        onClose={() => setIsEditPersonalInfoOpen(false)}
        client={client}
        clientId={clientId}
        onUpdate={handlePersonalInfoUpdated}
      />

      {/* Edit Patrimonial Info Modal */}
      <EditPatrimonialInfoModal
        isOpen={isEditPatrimonialInfoOpen}
        onClose={() => setIsEditPatrimonialInfoOpen(false)}
        client={client}
        clientId={clientId}
        onUpdate={handlePatrimonialInfoUpdated}
      />
    </div>
  );
}

export default ClientDetail;