import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

type ClientPositionRow = {
  id: string;
  productId: string;
  productName: string;
  assetId?: string | null;
  assetName?: string | null;
  transactionId?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  period_date?: string | null;
  invested_amount: number | string;
  profit_loss?: number | string | null;
  status: string;
};

const formatCurrency = (value: any) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
};

const formatDateTime = (iso: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

const formatPositionRange = (p: ClientPositionRow) => {
  if (p.opened_at) {
    const start = formatDateTime(p.opened_at);
    const end = p.closed_at ? formatDateTime(p.closed_at) : '-';
    return `${start} → ${end}`;
  }
  if (p.period_date) {
    const d = new Date(p.period_date);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
    }
    return p.period_date;
  }
  return '-';
};

export function ClientPositionsTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<ClientPositionRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'open' | 'closed'>('upcoming');

  const upcomingStatuses = useMemo(() => new Set(['pending']), []);
  const openStatuses = useMemo(() => new Set(['open']), []);
  const closedStatuses = useMemo(() => new Set(['done', 'cancelled']), []);

  async function loadPositions() {
    try {
      setLoading(true);
      const data = await apiCall(`/api/clients/${clientId}/positions/`);
      setPositions((data as any)?.positions || []);
    } catch (error: any) {
      console.error('Error loading client positions:', error);
      toast.error(error?.message || 'Erreur lors du chargement des positions');
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const productsData = await apiCall('/api/products/').catch(() => ({ products: [] }));
        setProducts(productsData.products || productsData || []);
      } catch (error) {
        console.error('Error loading products:', error);
      }
    };
    loadProducts();
  }, []);

  // Filter by product and search (without status filter)
  const filteredByProductAndSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return positions.filter((p) => {
      // Filter by product
      if (selectedProductId && p.productId !== selectedProductId) return false;
      
      // Filter by search query
      if (!q) return true;
      return (
        (p.productName || '').toLowerCase().includes(q) ||
        (p.productId || '').toLowerCase().includes(q) ||
        (p.assetName || '').toLowerCase().includes(q) ||
        (p.assetId || '').toLowerCase().includes(q) ||
        (p.transactionId || '').toLowerCase().includes(q)
      );
    });
  }, [positions, search, selectedProductId]);

  // Filter by product, search AND active tab status
  const filtered = useMemo(() => {
    return filteredByProductAndSearch.filter((p) => {
      const isUpcoming = upcomingStatuses.has(p.status);
      const isOpen = openStatuses.has(p.status);
      const isClosed = closedStatuses.has(p.status);
      if (activeTab === 'upcoming' && !isUpcoming) return false;
      if (activeTab === 'open' && !isOpen) return false;
      if (activeTab === 'closed' && !isClosed) return false;
      return true;
    });
  }, [filteredByProductAndSearch, activeTab, upcomingStatuses, openStatuses, closedStatuses]);

  // Counts should reflect filtered positions (by product and search, but not by active tab)
  const counts = useMemo(() => {
    let upcoming = 0;
    let open = 0;
    let closed = 0;
    for (const p of filteredByProductAndSearch) {
      if (upcomingStatuses.has(p.status)) upcoming += 1;
      else if (openStatuses.has(p.status)) open += 1;
      else if (closedStatuses.has(p.status)) closed += 1;
    }
    return { upcoming, open, closed };
  }, [filteredByProductAndSearch, upcomingStatuses, openStatuses, closedStatuses]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Positions</CardTitle>
        <Button variant="outline" onClick={loadPositions} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {loading ? 'Chargement...' : 'Rafraîchir'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-full md:w-[420px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (produit, asset, transaction...)"
            />
          </div>
          <div className="w-full md:w-[300px]">
            <Select 
              value={selectedProductId || 'all'} 
              onValueChange={(value) => setSelectedProductId(value === 'all' ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filtrer par produit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les produits</SelectItem>
                {products.map((product: any) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}{product.reference ? ` (${product.reference})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="upcoming">À venir ({counts.upcoming})</TabsTrigger>
            <TabsTrigger value="open">Ouvertes ({counts.open})</TabsTrigger>
            <TabsTrigger value="closed">Fermées ({counts.closed})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {!filtered.length ? (
              <div className="text-sm text-slate-600">Aucune position.</div>
            ) : (
              <PositionsTable rows={filtered} />
            )}
          </TabsContent>
          <TabsContent value="open" className="mt-4">
            {!filtered.length ? (
              <div className="text-sm text-slate-600">Aucune position.</div>
            ) : (
              <PositionsTable rows={filtered} />
            )}
          </TabsContent>
          <TabsContent value="closed" className="mt-4">
            {!filtered.length ? (
              <div className="text-sm text-slate-600">Aucune position.</div>
            ) : (
              <PositionsTable rows={filtered} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PositionsTable({ rows }: { rows: ClientPositionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3">Date et heure</th>
            <th className="text-left py-2 px-3">Produit</th>
            <th className="text-left py-2 px-3">Asset</th>
            <th className="text-left py-2 px-3">Montant</th>
            <th className="text-left py-2 px-3">P&amp;L</th>
            <th className="text-left py-2 px-3">Statut</th>
            <th className="text-left py-2 px-3">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const pnlNum =
              p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
            const pnlColor = pnlNum == null ? 'text-slate-700' : pnlNum >= 0 ? 'text-green-600' : 'text-red-600';
            return (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 px-3">{formatPositionRange(p)}</td>
                <td className="py-2 px-3">{p.productName || p.productId}</td>
                <td className="py-2 px-3">{p.assetName || p.assetId || '-'}</td>
                <td className="py-2 px-3">{formatCurrency(p.invested_amount)}</td>
                <td className={`py-2 px-3 font-medium ${pnlColor}`}>
                  {p.profit_loss == null ? '-' : formatCurrency(p.profit_loss)}
                </td>
                <td className="py-2 px-3">
                  {p.status === 'pending'
                    ? 'À venir'
                    : p.status === 'open'
                      ? 'Ouverte'
                      : p.status === 'done'
                        ? 'Fermée'
                        : p.status === 'cancelled'
                          ? 'Annulée'
                          : p.status}
                </td>
                <td className="py-2 px-3">{p.transactionId || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ClientPositionsTab;

