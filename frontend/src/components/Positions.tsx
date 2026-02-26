import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import '../styles/PageHeader.css';

type PositionRow = {
  id: string;
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  transactionId?: string | null;
  assetId?: string | null;
  assetName?: string | null;
  period_index: number;
  period_date: string;
  opened_at?: string | null;
  closed_at?: string | null;
  invested_amount: number | string;
  profit_loss?: number | string | null;
  status: 'pending' | 'open' | 'done' | 'cancelled' | string;
  createdAt?: string;
};

const formatCurrency = (value: any) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
};

const formatMonth = (isoDate: string) => {
  if (!isoDate) return '-';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('fr-FR', { year: 'numeric', month: 'long' }).format(d);
};

const formatPnlWithPct = (pnlValue: any, amountValue: any) => {
  const pnl = typeof pnlValue === 'string' ? parseFloat(pnlValue) : Number(pnlValue);
  const amount = typeof amountValue === 'string' ? parseFloat(amountValue) : Number(amountValue);
  if (!Number.isFinite(pnl)) return '-';

  const sign = pnl > 0 ? '+' : '';
  const pnlText = `${sign}${formatCurrency(pnl)}`;

  if (!Number.isFinite(amount) || amount === 0) return pnlText;

  const pct = (pnl / amount) * 100;
  const pctSign = pct > 0 ? '+' : '';
  const pctText = `${pctSign}${pct.toFixed(2)}%`;
  return `${pnlText} (${pctText})`;
};

const formatDateTime = (isoDate: string) => {
  if (!isoDate) return '-';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

const formatPositionDateTime = (p: PositionRow) => {
  if (p.opened_at) {
    const start = formatDateTime(p.opened_at);
    const end = p.closed_at ? formatDateTime(p.closed_at) : '-';
    return `${start} → ${end}`;
  }
  // Fallback for legacy monthly positions
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

const PAGE_SIZE = 50;

export function Positions() {
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 1 });
  const [counts, setCounts] = useState({ pending: 0, open: 0, closed: 0 });
  const [activeTab, setActiveTab] = useState<'upcoming' | 'open' | 'closed'>('upcoming');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  const upcomingStatuses = useMemo(() => new Set(['pending']), []);
  const openStatuses = useMemo(() => new Set(['open']), []);
  const closedStatuses = useMemo(() => new Set(['done', 'cancelled']), []);

  const productOptions = useMemo(() => {
    return [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [products]);

  const clientOptions = useMemo(() => {
    return [...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [clients]);

  useEffect(() => {
    if (selectedProductId === 'all') return;
    const stillExists = productOptions.some((p) => p.id === selectedProductId);
    if (!stillExists) setSelectedProductId('all');
  }, [productOptions, selectedProductId]);

  useEffect(() => {
    if (selectedClientId === 'all') return;
    const stillExists = clientOptions.some((c) => c.id === selectedClientId);
    if (!stillExists) setSelectedClientId('all');
  }, [clientOptions, selectedClientId]);

  const filtered = useMemo(() => {
    return positions.filter((p) => {
      if (selectedProductId !== 'all' && String(p.productId) !== selectedProductId) return false;
      if (selectedClientId !== 'all' && String(p.clientId) !== selectedClientId) return false;
      return true;
    });
  }, [positions, selectedProductId, selectedClientId]);

  const loadPositions = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab === 'upcoming') {
        params.set('status', 'pending');
      } else if (activeTab === 'open') {
        params.set('status', 'open');
      } else if (activeTab === 'closed') {
        params.set('status', 'done,cancelled');
      }
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (selectedProductId !== 'all') {
        params.set('product_id', selectedProductId);
      }
      if (selectedClientId !== 'all') {
        params.set('client_id', selectedClientId);
      }
      const data = await apiCall(`/api/positions/?${params.toString()}`);
      setPositions((data as any)?.positions || []);
      setProducts((data as any)?.products || []);
      setClients((data as any)?.clients || []);
      if ((data as any).counts) {
        setCounts((data as any).counts);
      }
      if ((data as any).pagination) {
        setPagination((data as any).pagination);
      }
    } catch (error: any) {
      console.error('Error loading positions:', error);
      toast.error(error?.message || 'Erreur lors du chargement des positions');
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedProductId, selectedClientId]);

  useEffect(() => {
    loadPositions(1);
  }, [loadPositions]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      loadPositions(newPage);
    }
  };

  const PaginationBar = () =>
    pagination.total_pages > 1 ? (
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(pagination.page - 1)}
          disabled={pagination.page === 1 || loading}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Précédent
        </Button>
        <span className="text-sm text-slate-600">
          Page {pagination.page} sur {pagination.total_pages} ({pagination.total} positions)
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.total_pages || loading}
        >
          Suivant
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <div>
          <h1 className="page-title">Positions</h1>
          <p className="page-subtitle">Suivi des positions mensuelles liées aux investissements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadPositions(pagination.page)} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {loading ? 'Chargement...' : 'Rafraîchir'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des positions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full md:w-[280px]">
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer par client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-[280px]">
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer par produit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les produits</SelectItem>
                  {productOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList>
              <TabsTrigger value="upcoming">Positions à venir ({loading ? '...' : counts.pending})</TabsTrigger>
              <TabsTrigger value="open">Positions ouvertes ({loading ? '...' : counts.open})</TabsTrigger>
              <TabsTrigger value="closed">Positions fermées ({loading ? '...' : counts.closed})</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4">
              {loading && positions.length === 0 ? (
                <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
                  <LoadingIndicator />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {loading && positions.length > 0 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20 }}>
                      <LoadingIndicator />
                    </div>
                  )}
                  <PositionsTable rows={filtered} />
                  <PaginationBar />
                </div>
              )}
            </TabsContent>
            <TabsContent value="open" className="mt-4">
              {loading && positions.length === 0 ? (
                <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
                  <LoadingIndicator />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {loading && positions.length > 0 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20 }}>
                      <LoadingIndicator />
                    </div>
                  )}
                  <PositionsTable rows={filtered} />
                  <PaginationBar />
                </div>
              )}
            </TabsContent>
            <TabsContent value="closed" className="mt-4">
              {loading && positions.length === 0 ? (
                <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
                  <LoadingIndicator />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {loading && positions.length > 0 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20 }}>
                      <LoadingIndicator />
                    </div>
                  )}
                  <PositionsTable rows={filtered} />
                  <PaginationBar />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function PositionsTable({ rows }: { rows: PositionRow[] }) {
  if (!rows.length) {
    return <div className="text-sm text-slate-600">Aucune position.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3">Date et heure</th>
            <th className="text-left py-2 px-3">Client</th>
            <th className="text-left py-2 px-3">Produit</th>
            <th className="text-left py-2 px-3">Asset</th>
            <th className="text-left py-2 px-3">Montant</th>
            <th className="text-left py-2 px-3">P&amp;L</th>
            <th className="text-left py-2 px-3">Statut</th>
            <th className="text-left py-2 px-3">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-2 px-3">{formatPositionDateTime(p)}</td>
              <td className="py-2 px-3">{p.clientName || p.clientId}</td>
              <td className="py-2 px-3">{p.productName || p.productId}</td>
              <td className="py-2 px-3">{p.assetName || p.assetId || '-'}</td>
              <td className="py-2 px-3">{formatCurrency(p.invested_amount)}</td>
              <td className="py-2 px-3">
                {formatPnlWithPct(p.profit_loss, p.invested_amount)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Positions;
