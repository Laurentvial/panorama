import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  HiOutlineTrendingUp as TrendingUp,
  HiOutlineClock as Clock,
  HiOutlineDocumentText as FileText,
  HiOutlineCalendar as Calendar,
  HiOutlineUserGroup as UsersIcon,
  HiOutlineCurrencyDollar as DollarSign,
  HiOutlineMail as Mail
} from 'react-icons/hi';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { getStatusLabel, getStatusColors } from './transactionUtils';
import { useUser } from '../contexts/UserContext';
import '../styles/Dashboard.css';
import '../styles/PageHeader.css';

interface DashboardProps {
  user?: any;
}

export function Dashboard({ user: userProp }: DashboardProps) {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const user = userProp || currentUser;
  const [stats, setStats] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsResponse, teamsResponse] = await Promise.all([
        apiCall('/api/stats/'),
        apiCall('/api/teams/')
      ]);
      
      setStats(statsResponse);
      setTeams(teamsResponse?.teams || teamsResponse || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <LoadingIndicator />
      </div>
    );
  }

  const statCards = [
    { 
      label: 'Chiffre d\'affaires', 
      value: `${(stats?.totalRevenue || 0).toLocaleString('fr-FR')} €`, 
      icon: DollarSign, 
      valueClass: 'dashboard-stat-value-green',
      iconWrapperClass: 'dashboard-stat-icon-wrapper-green'
    },
    { 
      label: 'CA en attente', 
      value: `${(stats?.pendingRevenue || 0).toLocaleString('fr-FR')} €`, 
      icon: Clock, 
      valueClass: 'dashboard-stat-value-orange',
      iconWrapperClass: 'dashboard-stat-icon-wrapper-orange'
    },
    { 
      label: 'Nb de Notes', 
      value: '0', 
      icon: FileText, 
      valueClass: 'dashboard-stat-value-blue',
      iconWrapperClass: 'dashboard-stat-icon-wrapper-blue'
    },
    { 
      label: 'Nb de RDV', 
      value: stats?.totalAppointments || 0, 
      icon: Calendar, 
      valueClass: 'dashboard-stat-value-purple',
      iconWrapperClass: 'dashboard-stat-icon-wrapper-purple'
    },
    { 
      label: 'Nb de leads', 
      value: '0', 
      icon: TrendingUp, 
      valueClass: 'dashboard-stat-value-indigo',
      iconWrapperClass: 'dashboard-stat-icon-wrapper-indigo'
    },
    { 
      label: 'Nb clients', 
      value: stats?.totalClients || 0, 
      icon: UsersIcon, 
      valueClass: 'dashboard-stat-value-pink',
      iconWrapperClass: 'dashboard-stat-icon-wrapper-pink'
    },
  ];

  const openMessage = (message: any) => {
    const clientId = message.clientId;
    const conversationId = message.conversationId;
    if (clientId && conversationId) {
      navigate(
        `/admin/messagerie?clientId=${encodeURIComponent(clientId)}&conversationId=${encodeURIComponent(conversationId)}`
      );
      return;
    }
    navigate('/admin/messagerie');
  };

  return (
    <div className="dashboard-container">
      <div className="page-header-section">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Vue d'ensemble de votre activité</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="dashboard-filters-grid">
            <div className="dashboard-filter-field">
              <Label>Du</Label>
              <Input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
              />
            </div>
            <div className="dashboard-filter-field">
              <Label>Au</Label>
              <Input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
              />
            </div>
            <div className="dashboard-filter-field">
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

      {/* Statistics Cards */}
      <div className="dashboard-stats-grid">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="dashboard-stat-card-content">
                <div className="dashboard-stat-card-inner">
                  <div className="dashboard-stat-info">
                    <p className="dashboard-stat-label">{stat.label}</p>
                    <p className={stat.valueClass}>{stat.value}</p>
                  </div>
                  <div className={`dashboard-stat-icon-wrapper ${stat.iconWrapperClass}`}>
                    <Icon className="dashboard-stat-icon" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="dashboard-section-header">
            <Mail className="dashboard-section-icon" />
            Messages récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentMessages && stats.recentMessages.length > 0 ? (
            <div className="dashboard-table-container">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Sujet</th>
                    <th>Aperçu</th>
                    <th>Client</th>
                    <th>Pour</th>
                    <th>Date</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentMessages.slice(0, 5).map((message: any) => (
                    <tr key={message.id}>
                      <td className="dashboard-table-type">
                        <button
                          type="button"
                          onClick={() => openMessage(message)}
                          style={{ color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          {message.subject || 'Message'}
                        </button>
                      </td>
                      <td
                        title={(message.message || '').toString()}
                        style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        <button
                          type="button"
                          onClick={() => openMessage(message)}
                          style={{ color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {(message.message || '—').toString()}
                        </button>
                      </td>
                      <td>{message.clientName || message.clientId || 'Utilisateur inconnu'}</td>
                      <td>{message.managerName || 'Gestionnaire'}</td>
                      <td>
                        {new Date(message.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        {!(message.read_by_manager ?? message.read) ? (
                          <span className="dashboard-message-badge">Non lu</span>
                        ) : (
                          <span className="dashboard-table-badge">Lu</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="dashboard-empty-message">Aucun message récent</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="dashboard-section-header">
            <TrendingUp className="dashboard-section-icon" />
            Dernières transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
            <div className="dashboard-table-container">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Montant</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTransactions.slice(0, 10).map((transaction: any) => (
                    <tr key={transaction.id}>
                      <td>
                        {new Date(transaction.datetime || transaction.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="dashboard-table-type">{transaction.type}</td>
                      <td>{parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                      <td>
                        {(() => {
                          const { bg, text } = getStatusColors(transaction.status, transaction.type);
                          return (
                            <span className="dashboard-table-badge" style={{ backgroundColor: bg, color: text }}>
                              {getStatusLabel(transaction.status, transaction.type)}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="dashboard-empty-message">Aucune transaction récente</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;