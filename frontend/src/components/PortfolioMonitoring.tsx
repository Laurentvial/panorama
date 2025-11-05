import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

const mockClientsData = [
  {
    id: 1,
    name: 'Jean Dupont',
    portfolioValue: 125430,
    performance: 8.2,
    risk: 'Moyen',
    positions: [
      { type: 'Action', value: 45000 },
      { type: 'Crypto', value: 35430 },
      { type: 'Livret', value: 45000 },
    ],
    alerts: ['Forte volatilité sur BTC'],
  },
  {
    id: 2,
    name: 'Marie Martin',
    portfolioValue: 87250,
    performance: 12.5,
    risk: 'Faible',
    positions: [
      { type: 'Action', value: 60000 },
      { type: 'Livret', value: 27250 },
    ],
    alerts: [],
  },
  {
    id: 3,
    name: 'Pierre Bernard',
    portfolioValue: 234800,
    performance: -2.1,
    risk: 'Élevé',
    positions: [
      { type: 'Action', value: 120000 },
      { type: 'Crypto', value: 94800 },
      { type: 'Livret', value: 20000 },
    ],
    alerts: ['Performance négative', 'Exposition crypto élevée'],
  },
];

const performanceData = [
  { name: 'Jean D.', performance: 8.2 },
  { name: 'Marie M.', performance: 12.5 },
  { name: 'Pierre B.', performance: -2.1 },
  { name: 'Sophie D.', performance: 15.3 },
  { name: 'Laurent P.', performance: 6.7 },
  { name: 'Isabelle R.', performance: 18.9 },
];

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981'];

export function PortfolioMonitoring() {
  const [selectedClient, setSelectedClient] = useState('1');
  const currentClient = mockClientsData.find(c => c.id === Number(selectedClient));

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Client Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Suivi des portefeuilles</CardTitle>
              <CardDescription>Surveillez la performance et l'allocation de vos clients</CardDescription>
            </div>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mockClientsData.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {currentClient && (
        <>
          {/* Client Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Client</CardTitle>
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{getInitials(currentClient.name)}</AvatarFallback>
                </Avatar>
              </CardHeader>
              <CardContent>
                <div className="text-slate-900">{currentClient.name}</div>
                <p className="text-xs text-slate-500 mt-1">
                  Profil {currentClient.risk}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Valeur totale</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-slate-900">
                  {currentClient.portfolioValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Depuis l'ouverture
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Performance</CardTitle>
                {currentClient.performance > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className={currentClient.performance > 0 ? 'text-green-600' : 'text-red-600'}>
                  {currentClient.performance > 0 ? '+' : ''}{currentClient.performance}%
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Depuis le début
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Alertes</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${currentClient.alerts.length > 0 ? 'text-orange-600' : 'text-slate-500'}`} />
              </CardHeader>
              <CardContent>
                <div className="text-slate-900">{currentClient.alerts.length}</div>
                <p className="text-xs text-slate-500 mt-1">
                  {currentClient.alerts.length > 0 ? 'Nécessite attention' : 'Aucune alerte'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Alerts */}
          {currentClient.alerts.length > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-900">
                  <AlertTriangle className="h-5 w-5" />
                  Alertes actives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {currentClient.alerts.map((alert, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-orange-800">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      {alert}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Allocation Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Allocation du portefeuille</CardTitle>
              <CardDescription>Répartition par type d'actif</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={currentClient.positions}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {currentClient.positions.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Performance Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Comparaison des performances clients</CardTitle>
          <CardDescription>Performance de tous vos clients</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => `${value}%`}
              />
              <Bar 
                dataKey="performance" 
                fill="#3b82f6"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
