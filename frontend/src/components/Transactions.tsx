import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Filter } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { TransactionList } from './TransactionList';
import { ViewTransactionModal } from './ViewTransactionModal';
import { EditTransactionModal } from './EditTransactionModal';
import { TRANSACTION_TYPES, STATUS_LABELS } from './transactionUtils';
import LoadingIndicator from './LoadingIndicator';
import '../styles/PageHeader.css';
import '../styles/Modal.css';

export function Transactions() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
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
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }


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
    transfert: 'Transfert',
    perte: 'Perte',
  };


  const [isViewTransactionModalOpen, setIsViewTransactionModalOpen] = useState(false);
  const [isEditTransactionModalOpen, setIsEditTransactionModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  const openEditModal = (transaction: any) => {
    setSelectedTransaction(transaction);
    setIsEditTransactionModalOpen(true);
  };

  const applyTransactionUpdate = (updatedTransaction?: any) => {
    if (!updatedTransaction?.id) return;

    setTransactions(prevTransactions =>
      prevTransactions.map(transaction =>
        transaction.id === updatedTransaction.id
          ? { ...transaction, ...updatedTransaction }
          : transaction
      )
    );

    setSelectedTransaction(prevSelected =>
      prevSelected?.id === updatedTransaction.id
        ? { ...prevSelected, ...updatedTransaction }
        : prevSelected
    );
  };

  const selectedTypeCount = filters.types.length;
  const typeFilterLabel =
    selectedTypeCount === 0
      ? 'Tous les types'
      : selectedTypeCount === 1
        ? (TRANSACTION_TYPES_FILTER[filters.types[0] as keyof typeof TRANSACTION_TYPES_FILTER] ||
            filters.types[0])
        : `${selectedTypeCount} sélectionnés`;

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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    {typeFilterLabel}
                    <span className="ml-2 text-slate-500">▼</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start">
                  <DropdownMenuLabel>Type de transaction</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={filters.types.length === 0}
                    onCheckedChange={(checked) => {
                      // When "all" is checked, we clear types.
                      if (checked) {
                        setFilters((prev) => ({ ...prev, types: [] }));
                      }
                    }}
                  >
                    Tous les types
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {Object.entries(TRANSACTION_TYPES_FILTER).map(([key, label]) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={filters.types.includes(key)}
                      onCheckedChange={(checked) => handleTypeFilterChange(key, checked as boolean)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
                  <SelectItem value="valide">Validé</SelectItem>
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
          <CardTitle>Liste des transactions ({loading ? '...' : `${filteredTransactions.length} / ${transactions.length}`})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && transactions.length === 0 ? (
            <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
              <LoadingIndicator />
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {loading && transactions.length > 0 && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20 }}>
                  <LoadingIndicator />
                </div>
              )}
              <TransactionList
                transactions={filteredTransactions}
                assets={assets}
                products={products}
                clients={clients}
                showClientColumn={true}
                onView={(transaction) => {
                  setSelectedTransaction(transaction);
                  setIsViewTransactionModalOpen(true);
                }}
                onEdit={(transaction) => {
                  openEditModal(transaction);
                }}
                emptyMessage="Aucune transaction trouvée"
              />
            </div>
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

      {/* View Transaction Modal */}
      <ViewTransactionModal
        isOpen={isViewTransactionModalOpen}
        transaction={selectedTransaction}
        clientId={selectedTransaction?.clientId}
        assets={assets}
        products={products}
        onClose={() => {
          setIsViewTransactionModalOpen(false);
          setSelectedTransaction(null);
        }}
      />

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={isEditTransactionModalOpen}
        transaction={selectedTransaction}
        clientId={selectedTransaction?.clientId || ''}
        onClose={() => {
          setIsEditTransactionModalOpen(false);
          setSelectedTransaction(null);
        }}
        onSuccess={(updatedTransaction) => {
          applyTransactionUpdate(updatedTransaction);
          loadData();
        }}
      />
    </div>
  );
}
