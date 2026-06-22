import React, { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Search, LogIn, Trash2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import LoadingIndicator from './LoadingIndicator';
import { toast } from 'sonner';
import '../styles/Clients.css';
import '../styles/PageHeader.css';
import '../styles/Filters.css';

interface ClientsProps {
  onSelectClient: (clientId: string) => void;
}

export function Clients({ onSelectClient }: ClientsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useUser();
  const [clients, setClients] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [onlineClientIds, setOnlineClientIds] = useState<Set<string>>(new Set());

  const isGestionnaire = currentUser?.role === 'gestionnaire';

  // Refetch when navigating to clients page (e.g. after creating or returning from add)
  useEffect(() => {
    const forceRefresh = !!(location.state as { clientCreated?: boolean })?.clientCreated;
    loadData(forceRefresh);
    // Clear clientCreated state after handling (avoids stale state in history)
    if (location.state?.clientCreated) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.key]);

  async function loadData(forceRefresh = false) {
    try {
      setLoading(true);
      if (forceRefresh) {
        clearApiCache('/api/clients');
        clearApiCache('/api/teams');
      }
      const [clientsData, teamsData] = await Promise.all([
        apiCall('/api/clients/'),
        apiCall('/api/teams/')
      ]);
      
      setClients(clientsData.clients || []);
      setTeams(teamsData.teams || []);
      const ids = clientsData.onlineClientIds || [];
      setOnlineClientIds(new Set(ids));
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  }

  // Poll online status every 30 seconds
  useEffect(() => {
    async function fetchOnlineIds() {
      try {
        const data = await apiCall('/api/clients/online-ids/');
        const ids = data?.onlineClientIds || [];
        setOnlineClientIds(new Set(ids));
      } catch {
        // Silently ignore polling errors
      }
    }
    const intervalId = setInterval(fetchOnlineIds, 30000);
    return () => clearInterval(intervalId);
  }, []);

  async function handleToggleActive(clientId: string) {
    try {
      await apiCall(`/api/clients/${clientId}/toggle-active/`, { method: 'POST' });
      loadData(true);
    } catch (error) {
      console.error('Error toggling client status:', error);
    }
  }

  const filteredClients = clients.filter(client => {
    const fullName = `${client.firstName || ''} ${client.lastName || ''}`.toLowerCase();
    const matchesSearch = 
      fullName.includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTeam = selectedTeam === 'all' || client.teamId === selectedTeam;
    
    return matchesSearch && matchesTeam;
  });

  // Sort by creation date, latest first
  const sortedClients = [...filteredClients].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // Descending order (latest first)
  });

  const displayedClients = sortedClients.slice(0, itemsPerPage);

  function handlePlatformAccess(clientId: string) {
    const client = clients.find(c => c.id === clientId);
    
    if (!client) {
      toast.error('Client introuvable');
      return;
    }
    
    if (!client.active) {
      toast.error('Compte client désactivé');
      return;
    }

    // Open in a new tab with a per-tab (sessionStorage) client session,
    // so the admin panel stays connected in the current tab.
    window.open(`/platform/impersonate/${clientId}`, '_blank', 'noopener,noreferrer');
  }

  async function handleDeleteClient(clientId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) return;
    
    try {
      await apiCall(`/api/clients/${clientId}/delete/`, { method: 'DELETE' });
      toast.success('Client supprimé');
      loadData(true);
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Erreur lors de la suppression du client');
    }
  }

  const activeFiltersCount = (searchTerm ? 1 : 0) + (selectedTeam !== 'all' ? 1 : 0);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);

  return (
    <div className="clients-container">
      {/* Page header */}
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Gestion de vos clients</p>
        </div>
        <div className="clients-header-actions">
          <button
            className="clients-header-btn clients-header-btn--outline"
            onClick={() => loadData(true)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          <button
            className="clients-header-btn clients-header-btn--primary"
            onClick={() => navigate('/admin/clients/add')}
          >
            <Plus className="w-4 h-4" />
            Ajouter un client
          </button>
        </div>
      </div>

      {/* Filter card */}
      <div className="filter-card">
        <div className="filter-card-header">
          <div className="filter-card-left">
            <div className="filter-card-icon">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <p className="filter-card-title">Filtres clients</p>
              <p className="filter-card-subtitle">Affinez la liste par nom, email ou équipe.</p>
            </div>
          </div>
          <div className="filter-card-right">
            <span className={`filter-card-badge ${activeFiltersCount > 0 ? 'filter-card-badge--active' : ''}`}>
              {activeFiltersCount} actif{activeFiltersCount > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="filter-card-toggle"
              onClick={() => setIsFiltersCollapsed(p => !p)}
            >
              <span>{isFiltersCollapsed ? 'Afficher' : 'Masquer'}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.2s', transform: isFiltersCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>
        {!isFiltersCollapsed && (
          <div className="filter-card-body">
            <div className="clients-filters">
              <div className="clients-filter-section">
                <Label>Recherche</Label>
                <div className="clients-search-wrapper">
                  <Search className="clients-search-icon" />
                  <Input
                    className="clients-search-input"
                    type="search"
                    name="client-search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="search"
                    data-form-type="other"
                    placeholder="Nom, email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="clients-filter-section">
                <Label>Équipe</Label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes les équipes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les équipes</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="clients-filter-section">
                <Label>Affichage par</Label>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="25" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clients list */}
      <div className="clients-list-card">
        <div className="clients-list-header">
          <p className="clients-list-title">
            Liste des clients
            <span className="clients-list-count">{loading ? '…' : filteredClients.length}</span>
          </p>
        </div>
        <div className="clients-list-body">
          {loading && clients.length === 0 ? (
            <div className="clients-loading">
              <LoadingIndicator />
            </div>
          ) : filteredClients.length > 0 ? (
            <div className="clients-table-wrapper">
              {loading && clients.length > 0 && (
                <div className="clients-table-overlay">
                  <LoadingIndicator />
                </div>
              )}
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Nom entier</th>
                    <th>Téléphone</th>
                    <th>E-Mail</th>
                    <th>Créé le</th>
                    {!isGestionnaire && <th>Gestionnaire</th>}
                    <th>Source</th>
                    <th>Capital</th>
                    <th>Équipe</th>
                    <th>Actif</th>
                    <th>En ligne</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedClients.map((client) => (
                    <tr key={client.id}>
                      <td className="clients-table-id">{client.id.substring(0, 8)}</td>
                      <td>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(`/admin/clients/${client.id}`)}
                            className="clients-name-link"
                          >
                            {client.fullName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || '-'}
                          </button>
                          {typeof client.pendingPositionsCount === 'number' && client.pendingPositionsCount < 5 && (
                            client.pendingPositionsCount === 0 ? (
                              <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800 font-normal" title="Aucune position au statut « en attente »">
                                0 en attente
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-900 font-normal" title={`${client.pendingPositionsCount} position(s) en attente (moins de 5)`}>
                                {client.pendingPositionsCount} en attente
                              </Badge>
                            )
                          )}
                        </div>
                      </td>
                      <td>{client.phone || client.mobile || '-'}</td>
                      <td className="clients-table-email">{client.email || '-'}</td>
                      <td>
                        {client.createdAt
                          ? new Date(client.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                          : '-'}
                      </td>
                      {!isGestionnaire && <td>{client.managerName || client.manager || '-'}</td>}
                      <td>{client.source || '-'}</td>
                      <td>
                        {client.capital
                          ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(client.capital)
                          : '0,00 €'}
                      </td>
                      <td>{teams.find(t => t.id === client.teamId)?.name || '-'}</td>
                      <td>
                        <button
                          className={`clients-toggle-btn ${client.active ? 'clients-toggle-btn--active' : 'clients-toggle-btn--inactive'}`}
                          onClick={() => handleToggleActive(client.id)}
                        >
                          {client.active ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                      <td>
                        <span
                          className={`clients-online-indicator ${onlineClientIds.has(client.id) ? 'clients-online' : 'clients-offline'}`}
                          title={onlineClientIds.has(client.id) ? 'Connecté' : 'Déconnecté'}
                        />
                      </td>
                      <td>
                        <div className="clients-actions">
                          <button className="clients-action-icon" onClick={() => handlePlatformAccess(client.id)} title="Connexion à la plateforme client">
                            <LogIn className="w-4 h-4" />
                          </button>
                          <button className="clients-action-icon clients-action-icon--danger" onClick={() => handleDeleteClient(client.id)} title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="clients-empty">Aucun client trouvé</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Clients;