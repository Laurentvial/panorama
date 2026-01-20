import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Checkbox } from './ui/checkbox';
import { Plus, X, Eye, Filter, ChevronDown } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
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

// Extract asset name from description (if available)
const extractAssetFromDescription = (description: string): string => {
  if (!description) return '-';
  // Try to extract asset name from common patterns
  const patterns = [
    /actif[:\s]+([^,\n]+)/i,
    /asset[:\s]+([^,\n]+)/i,
    /produit[:\s]+([^,\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '-';
};

interface ClientTransactionsTabProps {
  transactions: any[];
  onRefresh: () => void;
  clientId: string;
}

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

export function ClientTransactionsTab({ transactions, onRefresh, clientId }: ClientTransactionsTabProps) {
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isViewTransactionModalOpen, setIsViewTransactionModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [filters, setFilters] = useState({
    types: [] as string[],
    status: 'all',
    amountMin: '',
    amountMax: '',
    dateFrom: '',
    dateTo: ''
  });
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en_attente_paiement',
    datetime: ''
  });

  // Update status when type changes
  useEffect(() => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    if (typeConfig && !typeConfig.statuses.includes(transactionForm.status)) {
      setTransactionForm(prev => ({ ...prev, status: typeConfig.statuses[0] }));
    }
  }, [transactionForm.type, transactionForm.status]);

  // Initialize datetime with current date/time when modal opens
  useEffect(() => {
    if (isTransactionDialogOpen && !transactionForm.datetime) {
      const now = new Date();
      // Format as YYYY-MM-DDTHH:mm for datetime-local input
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTransactionForm(prev => ({ ...prev, datetime: `${year}-${month}-${day}T${hours}:${minutes}` }));
    }
  }, [isTransactionDialogOpen]);

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    
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
      
      await apiCall(`/api/clients/${clientId}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: transactionForm.type,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          status: transactionForm.status,
          datetime: datetimeISO
        })
      });
      
      toast.success('Transaction créée avec succès');
      setIsTransactionDialogOpen(false);
      setTransactionForm({
        type: 'depot',
        amount: '',
        description: '',
        status: 'en_attente_paiement',
        datetime: ''
      });
      onRefresh();
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      toast.error(error.message || 'Erreur lors de la création de la transaction');
    }
  }

  const getAvailableStatuses = () => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    return typeConfig ? typeConfig.statuses : [];
  };

  const formatTransactionType = (type: string) => {
    return TRANSACTION_TYPES[type as keyof typeof TRANSACTION_TYPES]?.label || type;
  };

  const formatStatus = (status: string) => {
    return STATUS_LABELS[status] || status;
  };

  // Filter transactions based on filters
  const filteredTransactions = transactions.filter(transaction => {
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
    
    // Filter by date
    const transactionDate = new Date(transaction.datetime || transaction.createdAt);
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
      types: [],
      status: 'all',
      amountMin: '',
      amountMax: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  const getTypeFilterDisplayText = () => {
    if (filters.types.length === 0) {
      return 'Tous les types';
    }
    if (filters.types.length === 1) {
      return TRANSACTION_TYPES[filters.types[0] as keyof typeof TRANSACTION_TYPES]?.label || filters.types[0];
    }
    return `${filters.types.length} types sélectionnés`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Transactions</h2>
        <Button onClick={() => {
          setIsTransactionDialogOpen(true);
          // Reset form when opening
          setTransactionForm({
            type: 'depot',
            amount: '',
            description: '',
            status: 'en_attente_paiement',
            datetime: ''
          });
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une transaction
        </Button>
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
              <Popover open={isTypeFilterOpen} onOpenChange={setIsTypeFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 border-input bg-input-background px-3 py-2 text-sm"
                  >
                    <span className="truncate">{getTypeFilterDisplayText()}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="max-h-64 overflow-y-auto p-2">
                    {Object.entries(TRANSACTION_TYPES).map(([key, config]) => (
                      <div key={key} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded">
                        <Checkbox
                          id={`type-filter-${key}`}
                          checked={filters.types.includes(key)}
                          onCheckedChange={(checked) => handleTypeFilterChange(key, checked as boolean)}
                        />
                        <Label 
                          htmlFor={`type-filter-${key}`} 
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {config.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
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
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
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

      {isTransactionDialogOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsTransactionDialogOpen(false);
          // Reset form when closing
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
              <h2 className="modal-title">Nouvelle transaction</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => {
                  setIsTransactionDialogOpen(false);
                  // Reset form when closing
                  setTransactionForm({
                    type: 'depot',
                    amount: '',
                    description: '',
                    status: 'en_attente_paiement',
                    datetime: '',
                    visibleByClient: true
                  });
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleCreateTransaction} className="modal-form">
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
                  setIsTransactionDialogOpen(false);
                  // Reset form when closing
                  setTransactionForm({
                    type: 'depot',
                    amount: '',
                    description: '',
                    status: 'en_attente_paiement',
                    datetime: '',
                    visibleByClient: true
                  });
                }}>
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
          <CardTitle>Transactions ({transactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4">Date</th>
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
                    const assetName = extractAssetFromDescription(transaction.description || '');
                    
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
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {getTypeLabel(transaction.type)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-700">
                            {assetName}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate" title={transaction.description || ''}>
                          {transaction.description || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-medium ${transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? 'text-red-600' : 'text-green-600'}`}>
                            {transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? '-' : '+'}{parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </span>
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
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedTransaction(transaction);
                              setIsViewTransactionModalOpen(true);
                            }}
                            className="hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Voir
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucune transaction</p>
          )}
        </CardContent>
      </Card>

      {/* View Transaction Modal */}
      {isViewTransactionModalOpen && selectedTransaction && (
        <div className="modal-overlay" onClick={() => setIsViewTransactionModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Détails de la transaction</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setIsViewTransactionModalOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div className="modal-form">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600 font-semibold">Date</Label>
                    <p className="text-slate-900 mt-1">
                      {new Date(selectedTransaction.datetime || selectedTransaction.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-slate-600 font-semibold">Type</Label>
                    <div className="mt-1">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {getTypeLabel(selectedTransaction.type)}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-slate-600 font-semibold">Montant</Label>
                    <p className={`text-lg font-medium mt-1 ${
                      selectedTransaction.type === 'retrait' || selectedTransaction.type === 'perte' || selectedTransaction.type === 'frais' 
                        ? 'text-red-600' 
                        : 'text-green-600'
                    }`}>
                      {selectedTransaction.type === 'retrait' || selectedTransaction.type === 'perte' || selectedTransaction.type === 'frais' ? '-' : '+'}
                      {parseFloat(selectedTransaction.amount || 0).toLocaleString('fr-FR', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })} €
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-slate-600 font-semibold">Statut</Label>
                    <div className="mt-1">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        selectedTransaction.status === 'termine' ? 'bg-green-100 text-green-700' :
                        selectedTransaction.status === 'en_attente_paiement' ? 'bg-orange-100 text-orange-700' :
                        selectedTransaction.status === 'conteste' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {getStatusLabel(selectedTransaction.status)}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-slate-600 font-semibold">Actif</Label>
                    <p className="text-slate-900 mt-1">
                      {extractAssetFromDescription(selectedTransaction.description || '')}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-slate-600 font-semibold">ID Transaction</Label>
                    <p className="text-slate-900 mt-1 font-mono text-sm">
                      {selectedTransaction.id}
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-slate-600 font-semibold">Description</Label>
                  <p className="text-slate-900 mt-1 whitespace-pre-wrap">
                    {selectedTransaction.description || 'Aucune description'}
                  </p>
                </div>
                
                <div>
                  <Label className="text-slate-600 font-semibold">Date de création</Label>
                  <p className="text-slate-900 mt-1">
                    {new Date(selectedTransaction.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="modal-form-actions mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsViewTransactionModalOpen(false)}
                >
                  Fermer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

