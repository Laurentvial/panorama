import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface Position {
  id: number;
  type: string;
  name: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  change: number;
}

interface Portfolio {
  totalValue: number;
  dailyChange: number;
  dailyChangeAmount: number;
  positions: Position[];
}

interface PortfolioOverviewProps {
  portfolio: Portfolio;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

const mockPerformanceData = [
  { date: '01/10', value: 118500 },
  { date: '05/10', value: 119800 },
  { date: '10/10', value: 121200 },
  { date: '15/10', value: 123500 },
  { date: '20/10', value: 125430 },
];

export function PortfolioOverview({ portfolio }: PortfolioOverviewProps) {
  const allocationData = portfolio.positions.reduce((acc, pos) => {
    const existing = acc.find(item => item.name === pos.type);
    if (existing) {
      existing.value += pos.value;
    } else {
      acc.push({ name: pos.type, value: pos.value });
    }
    return acc;
  }, [] as { name: string; value: number }[]);

  return (
    <div className="space-y-6">
      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Allocation par type d'actif</CardTitle>
            <CardDescription>Répartition de votre portefeuille</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {allocationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance du portefeuille</CardTitle>
            <CardDescription>Évolution sur les 30 derniers jours</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockPerformanceData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Mes positions</CardTitle>
          <CardDescription>Détail de tous vos investissements</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">Prix moyen</TableHead>
                <TableHead className="text-right">Prix actuel</TableHead>
                <TableHead className="text-right">Valeur</TableHead>
                <TableHead className="text-right">Performance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.positions.map((position) => (
                <TableRow key={position.id}>
                  <TableCell>
                    <div>
                      <div>{position.name}</div>
                      <div className="text-sm text-slate-500">{position.symbol}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{position.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{position.quantity}</TableCell>
                  <TableCell className="text-right">
                    {position.avgPrice.toLocaleString('fr-FR', { 
                      style: 'currency', 
                      currency: position.type === 'Livret' ? 'EUR' : 'USD' 
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {position.currentPrice.toLocaleString('fr-FR', { 
                      style: 'currency', 
                      currency: position.type === 'Livret' ? 'EUR' : 'USD' 
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {position.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={position.change > 0 ? 'text-green-600' : 'text-red-600'}>
                      {position.change > 0 ? '+' : ''}{position.change.toFixed(2)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
