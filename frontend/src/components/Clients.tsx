import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Search, Eye } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import '../styles/Clients.css';

interface ClientsProps {
  onSelectClient: (clientId: string) => void;
}

export function Clients({ onSelectClient }: ClientsProps) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [clientsData, teamsData] = await Promise.all([
        apiCall('/clients'),
        apiCall('/teams')
      ]);
      
      setClients(clientsData.clients || []);
      setTeams(teamsData.teams || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  }

  async function handleToggleActive(clientId: string) {
    try {
      await apiCall(`/clients/${clientId}/toggle-active`, { method: 'POST' });
      loadData();
    } catch (error) {
      console.error('Error toggling client status:', error);
    }
  }

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTeam = selectedTeam === 'all' || client.teamId === selectedTeam;
    
    return matchesSearch && matchesTeam;
  });

  return (
    <div className="clients-container">
      <div className="clients-header">
        <div>
          <h1 className="clients-title">Clients</h1>
          <p className="clients-subtitle">Gestion de vos clients</p>
        </div>
        
        <Button onClick={() => navigate('/clients/add')}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un client
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="clients-filters">
            <div className="clients-filter-section">
              <Label>Recherche</Label>
              <div className="clients-search-wrapper">
                <Search className="clients-search-icon" />
                <Input
                  className="clients-search-input"
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
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clients List */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des clients ({filteredClients.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredClients.length > 0 ? (
            <div className="clients-table-wrapper">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nom</th>
                    <th>Téléphone</th>
                    <th>E-mail</th>
                    <th>Date d'inscription</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id}>
                      <td className="clients-table-id">
                        {client.id.substring(0, 8)}...
                      </td>
                      <td>
                        {client.firstName} {client.lastName}
                      </td>
                      <td>{client.phone || client.mobile || '-'}</td>
                      <td className="clients-table-email">{client.email}</td>
                      <td>
                        {new Date(client.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(client.id)}
                          className={client.active ? 'clients-status-active' : 'clients-status-inactive'}
                        >
                          {client.active ? 'Actif' : 'Inactif'}
                        </Button>
                      </td>
                      <td>
                        <div className="clients-actions">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => onSelectClient(client.id)}
                            title="Voir le client"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}

export default Clients;