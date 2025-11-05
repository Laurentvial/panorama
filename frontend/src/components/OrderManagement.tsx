import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ProductCatalog } from './ProductCatalog';
import { Check, X, Clock, TrendingUp } from 'lucide-react';

const mockOrders = [
  {
    id: 1,
    client: 'Jean Dupont',
    product: 'Apple Inc.',
    symbol: 'AAPL',
    type: 'Achat',
    quantity: 10,
    price: 185.40,
    status: 'En attente',
    date: '2025-10-22 09:30',
  },
  {
    id: 2,
    client: 'Marie Martin',
    product: 'Bitcoin',
    symbol: 'BTC',
    type: 'Achat',
    quantity: 0.5,
    price: 45500,
    status: 'En attente',
    date: '2025-10-22 10:15',
  },
  {
    id: 3,
    client: 'Pierre Bernard',
    product: 'Tesla Inc.',
    symbol: 'TSLA',
    type: 'Vente',
    quantity: 5,
    price: 258.75,
    status: 'Exécuté',
    date: '2025-10-22 08:45',
  },
  {
    id: 4,
    client: 'Sophie Dubois',
    product: 'Microsoft Corp.',
    symbol: 'MSFT',
    type: 'Achat',
    quantity: 15,
    price: 355.20,
    status: 'Exécuté',
    date: '2025-10-21 14:20',
  },
  {
    id: 5,
    client: 'Laurent Petit',
    product: 'Ethereum',
    symbol: 'ETH',
    type: 'Achat',
    quantity: 2,
    price: 3100,
    status: 'Annulé',
    date: '2025-10-21 16:30',
  },
  {
    id: 6,
    client: 'Isabelle Roux',
    product: 'Amazon.com Inc.',
    symbol: 'AMZN',
    type: 'Achat',
    quantity: 20,
    price: 142.30,
    status: 'En attente',
    date: '2025-10-22 11:00',
  },
];

export function OrderManagement() {
  const [orders, setOrders] = useState(mockOrders);

  const pendingOrders = orders.filter(o => o.status === 'En attente');
  const executedOrders = orders.filter(o => o.status === 'Exécuté');
  const cancelledOrders = orders.filter(o => o.status === 'Annulé');

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'En attente': return 'secondary';
      case 'Exécuté': return 'default';
      case 'Annulé': return 'destructive';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'En attente': return <Clock className="h-4 w-4" />;
      case 'Exécuté': return <Check className="h-4 w-4" />;
      case 'Annulé': return <X className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Ordres en attente</CardTitle>
            <Clock className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{pendingOrders.length}</div>
            <p className="text-xs text-slate-500 mt-1">
              À valider ou annuler
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Ordres exécutés</CardTitle>
            <Check className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{executedOrders.length}</div>
            <p className="text-xs text-slate-500 mt-1">
              Aujourd'hui
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Volume total</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">28 450 €</div>
            <p className="text-xs text-slate-500 mt-1">
              Sur les dernières 24h
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            En attente ({pendingOrders.length})
          </TabsTrigger>
          <TabsTrigger value="executed">
            Exécutés ({executedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Annulés ({cancelledOrders.length})
          </TabsTrigger>
          <TabsTrigger value="new">
            Nouvel ordre
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Ordres en attente de validation</CardTitle>
              <CardDescription>Validez ou annulez les ordres de vos clients</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.date}</TableCell>
                      <TableCell>{order.client}</TableCell>
                      <TableCell>
                        <div>
                          <div>{order.product}</div>
                          <div className="text-sm text-slate-500">{order.symbol}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.type === 'Achat' ? 'default' : 'secondary'}>
                          {order.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{order.quantity}</TableCell>
                      <TableCell className="text-right">
                        {order.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                      </TableCell>
                      <TableCell className="text-right">
                        {(order.quantity * order.price).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="default">
                            <Check className="h-4 w-4 mr-1" />
                            Valider
                          </Button>
                          <Button size="sm" variant="destructive">
                            <X className="h-4 w-4 mr-1" />
                            Annuler
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executed">
          <Card>
            <CardHeader>
              <CardTitle>Ordres exécutés</CardTitle>
              <CardDescription>Historique des ordres validés et exécutés</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.date}</TableCell>
                      <TableCell>{order.client}</TableCell>
                      <TableCell>
                        <div>
                          <div>{order.product}</div>
                          <div className="text-sm text-slate-500">{order.symbol}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.type === 'Achat' ? 'default' : 'secondary'}>
                          {order.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{order.quantity}</TableCell>
                      <TableCell className="text-right">
                        {order.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                      </TableCell>
                      <TableCell className="text-right">
                        {(order.quantity * order.price).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1">{order.status}</span>
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled">
          <Card>
            <CardHeader>
              <CardTitle>Ordres annulés</CardTitle>
              <CardDescription>Historique des ordres annulés</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancelledOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.date}</TableCell>
                      <TableCell>{order.client}</TableCell>
                      <TableCell>
                        <div>
                          <div>{order.product}</div>
                          <div className="text-sm text-slate-500">{order.symbol}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.type === 'Achat' ? 'default' : 'secondary'}>
                          {order.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{order.quantity}</TableCell>
                      <TableCell className="text-right">
                        {order.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1">{order.status}</span>
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new">
          <ProductCatalog userRole="conseiller" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
