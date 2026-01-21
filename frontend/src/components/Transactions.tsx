import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Filter, Eye, Edit, X, ArrowLeftRight } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import '../styles/PageHeader.css';
import '../styles/Modal.css';

// Helper functions for French labels
const getTypeLabel = (type: string): string => {
  const typeMap: { [key: string]: string } = {
    'depot': 'Dépôt',
    'retrait': 'Retrait',
    'bonus': 'Bonus',
    'achat': 'Achat',
    'vente': 'Vente',
    'interets': 'Intérêts',
    'frais': 'Frais',
    'investissement': 'Investissement',
    'transfert': 'Transfert',
    'perte': 'Perte',
  };
  return typeMap[type] || type;
};

const getStatusLabel = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    'en_attente_paiement': 'En attente de paiement',
    'en_cours': 'En cours',
    'termine': 'Terminé',
    'conteste': 'Contesté',
  };
  return statusMap[status] || status;
};

// Extract asset/product name and reference from description
const extractAssetInfo = (description: string): { name: string; reference: string | null; displayText: string } => {
  if (!description) return { name: '-', reference: null, displayText: '-' };
  
  // Pattern for transfert: "Transfert de Balance Cash vers Nom (Référence)"
  const transfertPattern = /Transfert de Balance Cash vers\s+([^(]+?)(?:\s*\(([^)]+)\))?/i;
  const transfertMatch = description.match(transfertPattern);
  if (transfertMatch) {
    const name = transfertMatch[1].trim();
    const reference = transfertMatch[2] ? transfertMatch[2].trim() : null;
    return {
      name,
      reference,
      displayText: reference ? `${name} (${reference})` : name
    };
  }
  
  // Try other patterns
  const patterns = [
    /actif[:\s]+([^,\n]+)/i,
    /asset[:\s]+([^,\n]+)/i,
    /produit[:\s]+([^,\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      return { name, reference: null, displayText: name };
    }
  }
  
  return { name: '-', reference: null, displayText: '-' };
};

export function Transactions() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    types: [] as string[],
    status: 'all',
    amountMin: '',
    amountMax: '',
    teamId: 'all'
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [transactionsData, clientsData, teamsData, assetsData, productsData] = await Promise.all([
        apiCall('/api/transactions/'),
        apiCall('/api/clients/'),
        apiCall('/api/teams/'),
        apiCall('/api/assets/').catch(() => ({ assets: [] })),
        apiCall('/api/products/').catch(() => ({ products: [] }))
      ]);
      
      setTransactions(transactionsData.transactions || []);
      setClients(clientsData.clients || []);
      setTeams(teamsData.teams || []);
      setAssets(assetsData.assets || assetsData || []);
      setProducts(productsData.products || productsData || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  }

  // Find asset/product ID by name
  const findAssetProductId = (name: string, reference: string | null): string | null => {
    // First try to find by reference if available
    if (reference) {
      const productByRef = products.find(p => p.reference === reference);
      if (productByRef) return productByRef.id;
    }
    
    // Then try by name
    const productByName = products.find(p => p.name === name);
    if (productByName) return productByName.id;
    
    const assetByName = assets.find(a => a.name === name);
    if (assetByName) return assetByName.id;
    
    return null;
  };

  const filteredTransactions = transactions.filter(transaction => {
    const transactionDate = new Date(transaction.datetime || transaction.createdAt);
    
    // Filter by date
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (transactionDate < fromDate) {
        return false;
      }
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (transactionDate > toDate) {
        return false;
      }
    }
    
    // Filter by types (multiple selection)
    if (filters.types.length > 0 && !filters.types.includes(transaction.type)) {
      return false;
    }
    
    // Filter by status
    if (filters.status !== 'all' && transaction.status !== filters.status) {
      return false;
    }
    
    // Filter by amount
    const amount = parseFloat(transaction.amount || 0);
    if (filters.amountMin && amount < parseFloat(filters.amountMin)) {
      return false;
    }
    if (filters.amountMax && amount > parseFloat(filters.amountMax)) {
      return false;
    }
    
    // Filter by team if needed
    if (filters.teamId !== 'all') {
      const client = clients.find(c => c.id === transaction.clientId);
      if (!client || client.teamId !== filters.teamId) {
        return false;
      }
    }
    
    return true;
  });

  const handleTypeFilterChange = (type: string, checked: boolean) => {
    if (checked) {
      setFilters(prev => ({ ...prev, types: [...prev.types, type] }));
    } else {
      setFilters(prev => ({ ...prev, types: prev.types.filter(t => t !== type) }));
    }
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      types: [],
      status: 'all',
      amountMin: '',
      amountMax: '',
      teamId: 'all'
    });
  };

  // Transaction types for filter checkboxes
  const TRANSACTION_TYPES_FILTER = {
    depot: 'Dépôt',
    retrait: 'Retrait',
    bonus: 'Bonus',
    achat: 'Achat',
    vente: 'Vente',
    interets: 'Intérêts',
    frais: 'Frais',
    investissement: 'Investissement',
    transfert: 'Transfert',
    perte: 'Perte',
  };

  // Transaction types with their allowed statuses
  const TRANSACTION_TYPES = {
    depot: {
      label: 'Dépôt',
      statuses: ['en_attente_paiement', 'en_cours', 'termine', 'conteste']
    },
    retrait: {
      label: 'Retrait',
      statuses: ['en_cours', 'termine']
    },
    bonus: {
      label: 'Bonus',
      statuses: ['en_cours', 'termine']
    },
    achat: {
      label: 'Achat',
      statuses: ['en_cours', 'termine']
    },
    vente: {
      label: 'Vente',
      statuses: ['en_cours', 'termine']
    },
    interets: {
      label: 'Intérêts',
      statuses: ['en_cours', 'termine']
    },
    frais: {
      label: 'Frais',
      statuses: ['en_cours', 'termine']
    },
    investissement: {
      label: 'Investissement',
      statuses: ['en_cours', 'termine']
    },
    transfert: {
      label: 'Transfert',
      statuses: ['en_cours', 'termine']
    },
    perte: {
      label: 'Perte',
      statuses: ['termine']
    }
  };

  const STATUS_LABELS: { [key: string]: string } = {
    en_attente_paiement: 'En attente de paiement',
    en_cours: 'En cours',
    termine: 'Terminé',
    conteste: 'Contesté'
  };

  const [isEditTransactionModalOpen, setIsEditTransactionModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en_attente_paiement',
    datetime: ''
  });

  // Update status when type changes
  useEffect(() => {
    if (isEditTransactionModalOpen && transactionForm.type) {
      const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
      if (typeConfig && !typeConfig.statuses.includes(transactionForm.status)) {
        setTransactionForm(prev => ({ ...prev, status: typeConfig.statuses[0] }));
      }
    }
  }, [transactionForm.type, transactionForm.status, isEditTransactionModalOpen]);

  const getAvailableStatuses = () => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    return typeConfig ? typeConfig.statuses : [];
  };

  const openEditModal = (transaction: any) => {
    setSelectedTransaction(transaction);
    // Format datetime for datetime-local input
    const transactionDate = new Date(transaction.datetime || transaction.createdAt);
    const year = transactionDate.getFullYear();
    const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
    const day = String(transactionDate.getDate()).padStart(2, '0');
    const hours = String(transactionDate.getHours()).padStart(2, '0');
    const minutes = String(transactionDate.getMinutes()).padStart(2, '0');
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    setTransactionForm({
      type: transaction.type,
      amount: transaction.amount?.toString() || '',
      description: transaction.description || '',
      status: transaction.status || 'en_cours',
      datetime: datetimeLocal
    });
    setIsEditTransactionModalOpen(true);
  };

  async function handleUpdateTransaction(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedTransaction) return;
    
    if (!transactionForm.datetime) {
      toast.error('La date et l\'heure sont requises');
      return;
    }

    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) {
      toast.error('Le montant doit être supérieur à 0');
      return;
    }
    
    try {
      // Convert datetime-local format to ISO string
      const datetimeISO = new Date(transactionForm.datetime).toISOString();
      
      await apiCall(`/api/clients/${selectedTransaction.clientId}/transactions/${selectedTransaction.id}/`, {
        method: 'PUT',
        body: JSON.stringify({
          type: transactionForm.type,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          status: transactionForm.status,
          datetime: datetimeISO
        })
      });
      
      toast.success('Transaction modifiée avec succès');
      setIsEditTransactionModalOpen(false);
      setSelectedTransaction(null);
      setTransactionForm({
        type: 'depot',
        amount: '',
        description: '',
        status: 'en_attente_paiement',
        datetime: ''
      });
      loadData();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast.error(error.message || 'Erreur lors de la modification de la transaction');
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <h1 className="page-title">Transactions</h1>
        <p className="page-subtitle">Gestion de toutes les transactions</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Type filter (multiple selection) */}
            <div className="space-y-2">
              <Label>Type de transaction</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded p-3">
                {Object.entries(TRANSACTION_TYPES_FILTER).map(([key, label]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${key}`}
                      checked={filters.types.includes(key)}
                      onCheckedChange={(checked) => handleTypeFilterChange(key, checked as boolean)}
                    />
                    <Label htmlFor={`type-${key}`} className="text-sm font-normal cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="en_attente_paiement">En attente de paiement</SelectItem>
                  <SelectItem value="en_cours">En cours</SelectItem>
                  <SelectItem value="termine">Terminé</SelectItem>
                  <SelectItem value="conteste">Contesté</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount filter */}
            <div className="space-y-2">
              <Label>Montant (€)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Min"
                  value={filters.amountMin}
                  onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Max"
                  value={filters.amountMax}
                  onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })}
                />
              </div>
            </div>

            {/* Date filter */}
            <div className="space-y-2">
              <Label>Date de début</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Date de fin</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>

            {/* Team filter */}
            <div className="space-y-2">
              <Label>Équipe</Label>
              <Select value={filters.teamId} onValueChange={(value) => setFilters({ ...filters, teamId: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les équipes</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear filters button */}
            <div className="space-y-2">
              <Label className="opacity-0">Actions</Label>
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des transactions ({filteredTransactions.length} / {transactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">Client</th>
                    <th className="text-left py-3 px-4">Type</th>
                    <th className="text-left py-3 px-4">Actif</th>
                    <th className="text-left py-3 px-4">Description</th>
                    <th className="text-left py-3 px-4">Montant</th>
                    <th className="text-left py-3 px-4">Statut</th>
                    <th className="text-right py-3 px-4">Voir la transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => {
                    const client = clients.find(c => c.id === transaction.clientId);
                    const assetInfo = extractAssetInfo(transaction.description || '');
                    const assetProductId = findAssetProductId(assetInfo.name, assetInfo.reference);
                    
                    return (
                      <tr key={transaction.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          {new Date(transaction.datetime || transaction.createdAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-3 px-4">
                          {client ? `${client.firstName || client.fname || ''} ${client.lastName || client.lname || ''}`.trim() || client.email || '-' : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {getTypeLabel(transaction.type)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {assetProductId ? (
                            <span 
                              className="text-slate-700 cursor-pointer hover:text-blue-600 hover:underline"
                              onClick={() => navigate(`/platform/product/${assetProductId}`)}
                            >
                              {assetInfo.displayText}
                            </span>
                          ) : (
                            <span className="text-slate-700">
                              {assetInfo.displayText}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate" title={transaction.description || ''}>
                          {transaction.description || '-'}
                        </td>
                        <td className="py-3 px-4">
                          {transaction.type === 'transfert' ? (
                            <span className="font-medium text-orange-600 flex items-center gap-1">
                              <ArrowLeftRight className="w-4 h-4" />
                              {parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          ) : (
                            <span className={`font-medium ${transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? 'text-red-600' : 'text-green-600'}`}>
                              {transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? '-' : '+'}{parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            transaction.status === 'termine' ? 'bg-green-100 text-green-700' :
                            transaction.status === 'en_attente_paiement' ? 'bg-orange-100 text-orange-700' :
                            transaction.status === 'conteste' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {getStatusLabel(transaction.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/admin/clients/${transaction.clientId}?transaction=${transaction.id}`)}
                              className="hover:bg-slate-100"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Voir
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openEditModal(transaction)}
                              className="hover:bg-slate-100"
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              Modifier
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucune transaction trouvée</p>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Total des dépôts</p>
              <p className="text-green-600">
                {filteredTransactions
                  .filter(t => t.type === 'depot')
                  .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
                  .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Total des retraits</p>
              <p className="text-red-600">
                {filteredTransactions
                  .filter(t => t.type === 'retrait')
                  .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
                  .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">En attente</p>
              <p className="text-orange-600">
                {filteredTransactions
                  .filter(t => t.status === 'en_attente_paiement' || t.status === 'en_cours')
                  .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
                  .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Transaction Modal */}
      {isEditTransactionModalOpen && selectedTransaction && (
        <div className="modal-overlay" onClick={() => {
          setIsEditTransactionModalOpen(false);
          setSelectedTransaction(null);
          setTransactionForm({
            type: 'depot',
            amount: '',
            description: '',
            status: 'en_attente_paiement',
            datetime: ''
          });
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Modifier la transaction</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => {
                  setIsEditTransactionModalOpen(false);
                  setSelectedTransaction(null);
                  setTransactionForm({
                    type: 'depot',
                    amount: '',
                    description: '',
                    status: 'en_attente_paiement',
                    datetime: ''
                  });
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleUpdateTransaction} className="modal-form">
              <div className="modal-form-field">
                <Label>Type</Label>
                <Select value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRANSACTION_TYPES).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-field">
                <Label>Date et heure</Label>
                <Input
                  type="datetime-local"
                  value={transactionForm.datetime}
                  onChange={(e) => setTransactionForm({ ...transactionForm, datetime: e.target.value })}
                  required
                />
              </div>
              <div className="modal-form-field">
                <Label>Montant (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  required
                />
              </div>
              <div className="modal-form-field">
                <Label>Description</Label>
                <Textarea
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                  placeholder="Description de la transaction"
                />
              </div>
              <div className="modal-form-field">
                <Label>Statut</Label>
                <Select value={transactionForm.status} onValueChange={(value) => setTransactionForm({ ...transactionForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableStatuses().map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={() => {
                  setIsEditTransactionModalOpen(false);
                  setSelectedTransaction(null);
                  setTransactionForm({
                    type: 'depot',
                    amount: '',
                    description: '',
                    status: 'en_attente_paiement',
                    datetime: ''
                  });
                }}>
                  Annuler
                </Button>
                <Button type="submit">Enregistrer</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
