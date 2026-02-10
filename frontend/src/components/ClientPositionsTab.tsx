import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';

type ClientPositionRow = {
  id: string;
  productId: string;
  productName: string;
  assetId?: string | null;
  assetName?: string | null;
  assetCurrency?: string | null;
  transactionId?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  period_date?: string | null;
  invested_amount: number | string;
  invested_amount_asset_currency?: number | string | null;
  profit_loss?: number | string | null;
  fx_rate_eur_to_asset?: number | string | null;
  entry_price?: number | string | null;
  quantity?: number | string | null;
  status: string;
};

const formatCurrency = (value: any) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
};

const formatMoney = (value: any, currency: string | undefined, opts?: Intl.NumberFormatOptions) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return '-';
  const cur = String(currency || '').trim().toUpperCase();
  if (!cur || cur === 'EUR') return formatCurrency(n);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 8, ...opts })} ${cur}`;
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
  const [allPositions, setAllPositions] = useState<ClientPositionRow[]>([]); // All positions for counts
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'open' | 'closed'>('upcoming');

  const upcomingStatuses = useMemo(() => new Set(['pending']), []);
  const openStatuses = useMemo(() => new Set(['open']), []);
  const closedStatuses = useMemo(() => new Set(['done', 'cancelled']), []);

  // Load all positions for counts (paginate through all pages)
  async function loadAllPositionsForCounts() {
    try {
      // Load all positions by paginating through all pages to get accurate counts
      const allPositionsList: ClientPositionRow[] = [];
      let page = 1;
      const limit = 500; // Backend max limit
      let hasMore = true;

      while (hasMore) {
        const data = await apiCall(`/api/clients/${clientId}/positions/?page=${page}&limit=${limit}`);
        const positions = (data as any)?.positions || [];
        allPositionsList.push(...positions);
        
        const pagination = (data as any).pagination;
        if (pagination && page >= pagination.total_pages) {
          hasMore = false;
        } else if (positions.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      }
      
      setAllPositions(allPositionsList);
    } catch (error: any) {
      console.error('Error loading all positions for counts:', error);
      setAllPositions([]);
    }
  }

  async function loadPositions(page: number = 1, limit: number = 50) {
    try {
      setLoading(true);
      // Pass status filter to backend for proper sorting
      // For upcoming tab, pass status=pending so backend sorts ascending (sooner to later)
      let url = `/api/clients/${clientId}/positions/?page=${page}&limit=${limit}`;
      if (activeTab === 'upcoming') {
        url += '&status=pending';
      } else if (activeTab === 'open') {
        url += '&status=open';
      } else if (activeTab === 'closed') {
        url += '&status=done,cancelled';
      }
      const data = await apiCall(url);
      setPositions((data as any)?.positions || []);
      if ((data as any).pagination) {
        setPagination((data as any).pagination);
      }
    } catch (error: any) {
      console.error('Error loading client positions:', error);
      toast.error(error?.message || 'Erreur lors du chargement des positions');
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }

  // Load all positions for counts on mount and when clientId changes
  useEffect(() => {
    loadAllPositionsForCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Load paginated positions when tab changes
  useEffect(() => {
    loadPositions(1, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, activeTab]);

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

  useEffect(() => {
    const loadAssets = async () => {
      try {
        const assetsData = await apiCall('/api/assets/').catch(() => ({ assets: [] }));
        setAssets(assetsData.assets || assetsData || []);
      } catch (error) {
        console.error('Error loading assets:', error);
      }
    };
    loadAssets();
  }, []);

  // Filter by product and search (without status filter) - use allPositions for counts
  const filteredByProductAndSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPositions.filter((p) => {
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
  }, [allPositions, search, selectedProductId]);

  // Filter paginated positions by product and search (for display)
  const filteredPaginatedByProductAndSearch = useMemo(() => {
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

  // Filter paginated positions by product, search AND active tab status
  // Backend already handles sorting, so we just filter here
  const filtered = useMemo(() => {
    return filteredPaginatedByProductAndSearch.filter((p) => {
      const isUpcoming = upcomingStatuses.has(p.status);
      const isOpen = openStatuses.has(p.status);
      const isClosed = closedStatuses.has(p.status);
      if (activeTab === 'upcoming' && !isUpcoming) return false;
      if (activeTab === 'open' && !isOpen) return false;
      if (activeTab === 'closed' && !isClosed) return false;
      return true;
    });
  }, [filteredPaginatedByProductAndSearch, activeTab, upcomingStatuses, openStatuses, closedStatuses]);

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
        <CardTitle>Positions ({loading ? '...' : pagination.total})</CardTitle>
        <Button variant="outline" onClick={() => {
          loadAllPositionsForCounts();
          loadPositions(pagination.page, pagination.limit);
        }} disabled={loading}>
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

        {loading && positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <LoadingIndicator />
            <p className="mt-4 text-slate-500">Chargement des positions...</p>
          </div>
        ) : (
          <>
            {loading && positions.length > 0 && (
              <div className="flex items-center justify-center py-4">
                <LoadingIndicator />
              </div>
            )}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList>
                <TabsTrigger value="upcoming">À venir ({counts.upcoming})</TabsTrigger>
                <TabsTrigger value="open">Ouvertes ({counts.open})</TabsTrigger>
                <TabsTrigger value="closed">Fermées ({counts.closed})</TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="mt-4">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className="text-sm text-slate-600">Aucune position.</div>
                ) : (
                  <PositionsTable rows={filtered} assets={assets} />
                )}
              </TabsContent>
              <TabsContent value="open" className="mt-4">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className="text-sm text-slate-600">Aucune position.</div>
                ) : (
                  <PositionsTable rows={filtered} assets={assets} />
                )}
              </TabsContent>
              <TabsContent value="closed" className="mt-4">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className="text-sm text-slate-600">Aucune position.</div>
                ) : (
                  <PositionsTable rows={filtered} assets={assets} />
                )}
              </TabsContent>
            </Tabs>
            
            {/* Pagination Controls */}
            {pagination.total_pages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  Page {pagination.page} sur {pagination.total_pages} ({pagination.total} positions)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (pagination.page > 1) {
                        loadPositions(1, pagination.limit);
                      }
                    }}
                    disabled={pagination.page <= 1 || loading}
                    title="Première page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <ChevronLeft className="w-4 h-4 -ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (pagination.page > 1) {
                        loadPositions(pagination.page - 1, pagination.limit);
                      }
                    }}
                    disabled={pagination.page <= 1 || loading}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Précédent
                  </Button>
                  
                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.total_pages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.page >= pagination.total_pages - 2) {
                        pageNum = pagination.total_pages - 4 + i;
                      } else {
                        pageNum = pagination.page - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={pagination.page === pageNum ? "default" : "outline"}
                          size="sm"
                          className="min-w-[2.5rem]"
                          onClick={() => loadPositions(pageNum, pagination.limit)}
                          disabled={loading}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (pagination.page < pagination.total_pages) {
                        loadPositions(pagination.page + 1, pagination.limit);
                      }
                    }}
                    disabled={pagination.page >= pagination.total_pages || loading}
                  >
                    Suivant
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (pagination.page < pagination.total_pages) {
                        loadPositions(pagination.total_pages, pagination.limit);
                      }
                    }}
                    disabled={pagination.page >= pagination.total_pages || loading}
                    title="Dernière page"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <ChevronRight className="w-4 h-4 -ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PositionsTable({ rows, assets }: { rows: ClientPositionRow[]; assets: any[] }) {
  // Créer un Map pour accéder rapidement aux assets par ID
  const assetsById = new Map<string, any>();
  assets.forEach((asset) => {
    if (asset?.id) {
      assetsById.set(String(asset.id), asset);
    }
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3">Date et heure</th>
            <th className="text-left py-2 px-3">Produit</th>
            <th className="text-left py-2 px-3">Asset</th>
            <th className="text-right py-2 px-3">Montant</th>
            <th className="text-right py-2 px-3">P&amp;L</th>
            <th className="text-left py-2 px-3">Statut</th>
            <th className="text-left py-2 px-3">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const pnlNum =
              p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
            const assetCurrency = (p.assetCurrency || 'EUR').trim().toUpperCase();
            const fxRateNum = p.fx_rate_eur_to_asset == null ? null : typeof p.fx_rate_eur_to_asset === 'string' ? parseFloat(p.fx_rate_eur_to_asset) : Number(p.fx_rate_eur_to_asset);
            const fxRate = fxRateNum != null && Number.isFinite(fxRateNum) && fxRateNum > 0 ? fxRateNum : null;
            
            // Calculer le P&L en devise de l'actif et en EUR
            let pnlAsset: number | null = null;
            let pnlEur: number | null = pnlNum;
            
            if (pnlNum != null && Number.isFinite(pnlNum)) {
              // Si la devise n'est pas EUR et qu'on a un taux de change, profit_loss est probablement en devise de l'actif
              if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                pnlAsset = pnlNum; // P&L en devise de l'actif
                pnlEur = pnlNum / fxRate; // Convertir en EUR
              } else {
                pnlEur = pnlNum; // Déjà en EUR
                pnlAsset = null;
              }
            } else if (p.status === 'open' && p.assetId) {
              // Pour les positions ouvertes sans profit_loss stocké, calculer en temps réel
              const asset = assetsById.get(String(p.assetId));
              const entryPriceNum = p.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
              const qtyNum = p.quantity == null ? null : typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
              const entryPrice = entryPriceNum != null && Number.isFinite(entryPriceNum) && entryPriceNum > 0 ? entryPriceNum : null;
              const qty = qtyNum != null && Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : null;
              
              if (asset && entryPrice != null && qty != null) {
                const currentPriceRaw = asset?.lastPrice ?? asset?.price ?? null;
                const currentPriceNum =
                  currentPriceRaw == null ? null : typeof currentPriceRaw === 'string' ? parseFloat(currentPriceRaw) : Number(currentPriceRaw);
                const currentPrice = currentPriceNum != null && Number.isFinite(currentPriceNum) ? currentPriceNum : null;
                
                if (currentPrice != null && entryPrice > 0) {
                  // Calculer le P&L en devise de l'actif
                  const marketValue = qty * currentPrice;
                  const costBasis = qty * entryPrice;
                  pnlAsset = marketValue - costBasis;
                  
                  // Convertir en EUR si nécessaire
                  if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                    pnlEur = pnlAsset / fxRate;
                  } else {
                    pnlEur = pnlAsset;
                    pnlAsset = null; // Pas besoin d'afficher deux fois si c'est déjà en EUR
                  }
                }
              }
            }
            
            // Labels pour l'affichage
            let pnlLabelMain: string;
            let pnlLabelSub: string | null = null;
            let finalPnlColor: string;
            
            if (assetCurrency !== 'EUR' && pnlAsset != null && Number.isFinite(pnlAsset)) {
              // Position non-EUR : devise de l'actif en principal
              pnlLabelMain = formatMoney(pnlAsset, assetCurrency, { maximumFractionDigits: 2 });
              // EUR en secondaire (estimation)
              pnlLabelSub = pnlEur != null && Number.isFinite(pnlEur) && fxRate != null && fxRate > 0
                ? `≈ ${formatCurrency(pnlEur)}`
                : null;
              // Couleur basée sur le P&L en devise de l'actif
              finalPnlColor = pnlAsset >= 0 ? 'text-green-600' : 'text-red-600';
            } else {
              // Position EUR : EUR uniquement
              pnlLabelMain = pnlEur != null && Number.isFinite(pnlEur) 
                ? formatCurrency(pnlEur)
                : '-';
              finalPnlColor = pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? 'text-green-600' : 'text-red-600') : 'text-slate-700';
            }
            
            return (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 px-3">{formatPositionRange(p)}</td>
                <td className="py-2 px-3">{p.productName || p.productId}</td>
                <td className="py-2 px-3">{p.assetName || p.assetId || '-'}</td>
                <td className="py-2 px-3 text-right">{formatCurrency(p.invested_amount)}</td>
                <td className={`py-2 px-3 text-right font-medium ${finalPnlColor}`}>
                  <div>{pnlLabelMain}</div>
                  {pnlLabelSub && (
                    <div className="text-xs text-slate-500 mt-0.5">{pnlLabelSub}</div>
                  )}
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

