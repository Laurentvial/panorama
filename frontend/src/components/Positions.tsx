import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { apiCall } from '../utils/api';
import { formatPositionDateTime, formatPositionDateOnly } from '../utils/positionDateTime';
import { toast } from 'sonner';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import '../styles/PageHeader.css';
import {
  PositionStatusBadge,
  AssetNameWithLogo,
  getAssetLogoUrlFromSources,
  formatPositionPnlWithPct,
  positionsTableBodyClass,
  positionsTableCellClass,
  positionsTableClass,
  positionsTableHeadCellClass,
  positionsTableHeadClass,
  positionsTableHeadRowClass,
  positionsTableRowClass,
  positionsTableShellClass,
} from './positionUtils';

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

const formatPositionDateRange = (p: PositionRow) => {
  if (p.opened_at) {
    const start = formatPositionDateTime(p.opened_at);
    const end = p.closed_at ? formatPositionDateTime(p.closed_at) : '-';
    return `${start} → ${end}`;
  }
  // Fallback for legacy monthly positions
  if (p.period_date) {
    const d = new Date(p.period_date);
    if (!Number.isNaN(d.getTime())) {
      return formatPositionDateOnly(p.period_date);
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
  const [assets, setAssets] = useState<any[]>([]);
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

  useEffect(() => {
    const loadAssets = async () => {
      try {
        const assetsData = await apiCall('/api/assets/').catch(() => ({ assets: [] }));
        setAssets((assetsData as any)?.assets || assetsData || []);
      } catch (error) {
        console.error('Error loading assets for positions:', error);
        setAssets([]);
      }
    };
    loadAssets();
  }, []);

  const assetsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const asset of assets || []) {
      if (asset?.id != null) map.set(String(asset.id), asset);
    }
    return map;
  }, [assets]);

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
                  <PositionsTable rows={filtered} assetsById={assetsById} />
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
                  <PositionsTable rows={filtered} assetsById={assetsById} />
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
                  <PositionsTable rows={filtered} assetsById={assetsById} />
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

function PositionsTable({
  rows,
  assetsById,
}: {
  rows: PositionRow[];
  assetsById: Map<string, any>;
}) {
  if (!rows.length) {
    return (
      <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
        Aucune position.
      </div>
    );
  }

  return (
    <div className={positionsTableShellClass}>
      <div className="overflow-x-auto">
        <table className={positionsTableClass}>
          <thead className={positionsTableHeadClass}>
            <tr className={positionsTableHeadRowClass}>
              <th className={`${positionsTableHeadCellClass} text-left`}>Date et heure</th>
              <th className={`${positionsTableHeadCellClass} text-left`}>Client</th>
              <th className={`${positionsTableHeadCellClass} text-left`}>Produit</th>
              <th className={`${positionsTableHeadCellClass} text-left`}>Asset</th>
              <th className={`${positionsTableHeadCellClass} text-right`}>Montant</th>
              <th className={`${positionsTableHeadCellClass} text-right`}>P&amp;L</th>
              <th className={`${positionsTableHeadCellClass} text-left`}>Statut</th>
              <th className={`${positionsTableHeadCellClass} text-left`}>Transaction</th>
            </tr>
          </thead>
          <tbody className={positionsTableBodyClass}>
            {rows.map((p) => {
              const pnl = typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
              const invested =
                typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
              const pnlFormatted = formatPositionPnlWithPct(
                Number.isFinite(pnl) ? pnl : null,
                Number.isFinite(invested) ? invested : null,
                'EUR'
              );
              const pnlColorClass =
                pnlFormatted.isPositive == null
                  ? 'text-slate-700'
                  : pnlFormatted.isPositive
                    ? 'text-green-600'
                    : 'text-red-600';

              return (
                <tr key={p.id} className={positionsTableRowClass}>
                  <td className={`${positionsTableCellClass} whitespace-nowrap`}>{formatPositionDateRange(p)}</td>
                  <td className={positionsTableCellClass}>
                    <div className="font-medium text-slate-900">{p.clientName || p.clientId}</div>
                  </td>
                  <td className={positionsTableCellClass}>
                    <div className="font-medium text-slate-900">{p.productName || p.productId}</div>
                  </td>
                  <td className={positionsTableCellClass}>
                    <AssetNameWithLogo
                      name={p.assetName || p.assetId}
                      logoUrl={getAssetLogoUrlFromSources(assetsById.get(String(p.assetId || '')), p)}
                      nameClassName="text-slate-700"
                    />
                  </td>
                  <td className={`${positionsTableCellClass} text-right font-medium whitespace-nowrap`}>
                    {formatCurrency(p.invested_amount)}
                  </td>
                  <td className={`${positionsTableCellClass} text-right font-medium whitespace-nowrap ${pnlColorClass}`}>
                    {pnlFormatted.pct ? `${pnlFormatted.main} ${pnlFormatted.pct}` : pnlFormatted.main}
                  </td>
                  <td className={positionsTableCellClass}>
                    <PositionStatusBadge status={p.status} />
                  </td>
                  <td className={`${positionsTableCellClass} font-mono text-xs text-slate-600`}>
                    {p.transactionId || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Positions;
