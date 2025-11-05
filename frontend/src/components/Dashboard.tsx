import React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  TrendingUp, 
  Clock, 
  FileText, 
  Calendar, 
  Users as UsersIcon, 
  DollarSign,
  Mail
} from 'lucide-react';
import apiCall from '../utils/api';
import LoadingIndicator from './LoadingIndicator';

interface DashboardProps {
  user: any;
}

export function Dashboard({ user }: DashboardProps) {
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
      const [statsData, teamsData] = await Promise.all([
        apiCall('/stats'),
        apiCall('/teams')
      ]);
      
      setStats(statsData);
      setTeams(teamsData.teams || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingIndicator />
      </div>
    );
  }

  const statCards = [
    { 
      label: 'Chiffre d\'affaires', 
      value: `${(stats?.totalRevenue || 0).toLocaleString('fr-FR')} €`, 
      icon: DollarSign, 
      color: 'text-green-600' 
    },
    { 
      label: 'CA en attente', 
      value: `${(stats?.pendingRevenue || 0).toLocaleString('fr-FR')} €`, 
      icon: Clock, 
      color: 'text-orange-600' 
    },
    { 
      label: 'Nb de Notes', 
      value: '0', 
      icon: FileText, 
      color: 'text-blue-600' 
    },
    { 
      label: 'Nb de RDV', 
      value: stats?.totalAppointments || 0, 
      icon: Calendar, 
      color: 'text-purple-600' 
    },
    { 
      label: 'Nb de leads', 
      value: '0', 
      icon: TrendingUp, 
      color: 'text-indigo-600' 
    },
    { 
      label: 'Nb clients', 
      value: stats?.totalClients || 0, 
      icon: UsersIcon, 
      color: 'text-pink-600' 
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">Vue d'ensemble de votre activité</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Du</Label>
              <Input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Au</Label>
              <Input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">{stat.label}</p>
                    <p className={`${stat.color}`}>{stat.value}</p>
                  </div>
                  <div className={`${stat.color} bg-slate-50 p-3 rounded-lg`}>
                    <Icon className="w-6 h-6" />
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
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Messages récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentMessages && stats.recentMessages.length > 0 ? (
            <div className="space-y-3">
              {stats.recentMessages.slice(0, 5).map((message: any) => (
                <div key={message.id} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm">{message.subject}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(message.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  {!message.read && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      Non lu
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucun message récent</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Dernières transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
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
                  {stats.recentTransactions.slice(0, 10).map((transaction: any) => (
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
            <p className="text-sm text-slate-500">Aucune transaction récente</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
