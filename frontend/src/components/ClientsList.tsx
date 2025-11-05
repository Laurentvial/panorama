import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Search, Eye, MessageSquare, TrendingUp } from 'lucide-react';

const mockClients = [
  { 
    id: 1, 
    name: 'Jean Dupont', 
    email: 'jean.dupont@email.com',
    portfolioValue: 125430,
    performance: 8.2,
    positions: 6,
    lastActivity: '2025-10-20',
    risk: 'Moyen'
  },
  { 
    id: 2, 
    name: 'Marie Martin', 
    email: 'marie.martin@email.com',
    portfolioValue: 87250,
    performance: 12.5,
    positions: 4,
    lastActivity: '2025-10-21',
    risk: 'Faible'
  },
  { 
    id: 3, 
    name: 'Pierre Bernard', 
    email: 'pierre.bernard@email.com',
    portfolioValue: 234800,
    performance: -2.1,
    positions: 12,
    lastActivity: '2025-10-19',
    risk: 'Élevé'
  },
  { 
    id: 4, 
    name: 'Sophie Dubois', 
    email: 'sophie.dubois@email.com',
    portfolioValue: 156900,
    performance: 15.3,
    positions: 8,
    lastActivity: '2025-10-22',
    risk: 'Moyen'
  },
  { 
    id: 5, 
    name: 'Laurent Petit', 
    email: 'laurent.petit@email.com',
    portfolioValue: 98450,
    performance: 6.7,
    positions: 5,
    lastActivity: '2025-10-18',
    risk: 'Faible'
  },
  { 
    id: 6, 
    name: 'Isabelle Roux', 
    email: 'isabelle.roux@email.com',
    portfolioValue: 312600,
    performance: 18.9,
    positions: 15,
    lastActivity: '2025-10-21',
    risk: 'Moyen'
  },
];

export function ClientsList() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredClients = mockClients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getRiskBadgeVariant = (risk: string) => {
    switch (risk) {
      case 'Faible': return 'default';
      case 'Moyen': return 'secondary';
      case 'Élevé': return 'destructive';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Liste des clients</CardTitle>
          <CardDescription>Gérez vos clients et leurs portefeuilles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher un client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Valeur portefeuille</TableHead>
                <TableHead className="text-right">Performance</TableHead>
                <TableHead className="text-center">Positions</TableHead>
                <TableHead>Profil risque</TableHead>
                <TableHead>Dernière activité</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{getInitials(client.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div>{client.name}</div>
                        <div className="text-sm text-slate-500">{client.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {client.portfolioValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={client.performance > 0 ? 'text-green-600' : 'text-red-600'}>
                      {client.performance > 0 ? '+' : ''}{client.performance}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{client.positions}</TableCell>
                  <TableCell>
                    <Badge variant={getRiskBadgeVariant(client.risk)}>
                      {client.risk}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(client.lastActivity).toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <TrendingUp className="h-4 w-4" />
                      </Button>
                    </div>
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
