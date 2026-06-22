import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { DateInput } from './ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { apiCall, clearApiCache } from '../utils/api';
import { formatPositionDateTime, formatPositionDateOnly } from '../utils/positionDateTime';
import { formatAmount } from '../utils/currency';
import { toast } from 'sonner';
import { RefreshCw, ChevronLeft, ChevronRight, Pencil, ChevronDown, X, Plus } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import {
  PositionStatusBadge,
  AssetNameWithLogo,
  getAssetLogoUrlFromSources,
  computePositionPnlPct,
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

const formatMoney = (value: any, currency: string | undefined, opts?: Intl.NumberFormatOptions) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return '-';
  return formatAmount(n, currency || 'EUR', opts);
};

const formatPositionRange = (p: ClientPositionRow) => {
  if (p.opened_at) {
    const start = formatPositionDateTime(p.opened_at);
    const end = p.closed_at ? formatPositionDateTime(p.closed_at) : '-';
    return `${start} → ${end}`;
  }
  if (p.period_date) {
    const d = new Date(p.period_date);
    if (!Number.isNaN(d.getTime())) {
      return formatPositionDateOnly(p.period_date);
    }
    return p.period_date;
  }
  return '-';
};

const splitForDateTimeInputs = (value?: string | null) => {
  if (!value) return { date: '', time: '' };
  const raw = String(value).trim();
  // Preserve wall-clock datetime from API payload and avoid browser timezone conversion.
  const isoPrefixMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
  if (isoPrefixMatch) {
    return { date: isoPrefixMatch[1], time: `${isoPrefixMatch[2]}:${isoPrefixMatch[3]}` };
  }
  return { date: '', time: '' };
};

const combineDateAndTimeForApi = (date: string, time: string): string | null => {
  const normalizedDate = String(date || '').trim();
  const normalizedTime = String(time || '').trim();
  if (!normalizedDate && !normalizedTime) return null;
  if (!normalizedDate || !normalizedTime) return '';
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalizedTime)) return '';
  return `${normalizedDate}T${normalizedTime}`;
};

export function ClientPositionsTab({
  clientId,
  accountCurrency = 'EUR',
  refreshToken = 0,
}: {
  clientId: string;
  accountCurrency?: string;
  refreshToken?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [positions, setPositions] = useState<ClientPositionRow[]>([]);
  const [allPositions, setAllPositions] = useState<ClientPositionRow[]>([]); // All positions for counts
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [assets, setAssets] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'open' | 'closed' | 'cancelled'>('upcoming');
  const [editingPosition, setEditingPosition] = useState<ClientPositionRow | null>(null);
  const [editOpenedDate, setEditOpenedDate] = useState('');
  const [editOpenedTime, setEditOpenedTime] = useState('');
  const [editClosedDate, setEditClosedDate] = useState('');
  const [editClosedTime, setEditClosedTime] = useState('');
  const [editAssetId, setEditAssetId] = useState<string>('none');
  const [isAssetSearchOpen, setIsAssetSearchOpen] = useState(false);
  const [editAssetQuery, setEditAssetQuery] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createOpenedDate, setCreateOpenedDate] = useState('');
  const [createOpenedTime, setCreateOpenedTime] = useState('');
  const [createClosedDate, setCreateClosedDate] = useState('');
  const [createClosedTime, setCreateClosedTime] = useState('');
  const [createAssetId, setCreateAssetId] = useState<string>('none');
  const [isCreateAssetSearchOpen, setIsCreateAssetSearchOpen] = useState(false);
  const [createAssetQuery, setCreateAssetQuery] = useState('');
  const [createAmount, setCreateAmount] = useState('');
  const [createProfitLoss, setCreateProfitLoss] = useState('');
  const [createProductId, setCreateProductId] = useState<string>('none');
  const [createTransactionId, setCreateTransactionId] = useState<string>('none');
  const [createStatusMode, setCreateStatusMode] = useState<'auto' | 'pending' | 'open' | 'done'>('auto');
  const [clientProducts, setClientProducts] = useState<any[]>([]);
  const [clientTransactions, setClientTransactions] = useState<any[]>([]);
  const [loadingCreateData, setLoadingCreateData] = useState(false);
  const [createTransactionQuery, setCreateTransactionQuery] = useState('');
  const [isCreateTransactionSearchOpen, setIsCreateTransactionSearchOpen] = useState(false);
  const prevRefreshTokenRef = useRef(refreshToken);

  const upcomingStatuses = useMemo(() => new Set(['pending']), []);
  const openStatuses = useMemo(() => new Set(['open']), []);
  const closedStatuses = useMemo(() => new Set(['done']), []);
  const cancelledStatuses = useMemo(() => new Set(['cancelled']), []);

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

  async function loadPositionsForTab(
    tab: 'upcoming' | 'open' | 'closed' | 'cancelled',
    page: number = 1,
    limit: number = 50,
    manageLoading: boolean = true
  ) {
    try {
      if (manageLoading) setLoading(true);
      // Pass status filter to backend for proper sorting
      // For upcoming tab, pass status=pending so backend sorts ascending (sooner to later)
      let url = `/api/clients/${clientId}/positions/?page=${page}&limit=${limit}`;
      if (tab === 'upcoming') {
        url += '&status=pending';
      } else if (tab === 'open') {
        url += '&status=open';
      } else if (tab === 'closed') {
        url += '&status=done';
      } else if (tab === 'cancelled') {
        url += '&status=cancelled';
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
      if (manageLoading) setLoading(false);
    }
  }

  async function loadPositions(page: number = 1, limit: number = 50) {
    return loadPositionsForTab(activeTab, page, limit);
  }

  async function cancelPosition(positionId: string) {
    await apiCall(`/api/clients/${clientId}/positions/${positionId}/cancel/`, { method: 'POST' });
  }

  async function handleRefresh() {
    setLoading(true);
    try {
      await apiCall(`/api/clients/${clientId}/process-positions/`, { method: 'POST' });
      clearApiCache(`clients/${clientId}/positions`);
      await loadAllPositionsForCounts();
      await loadPositionsForTab(activeTab, pagination.page, pagination.limit, false);
      toast.success('Positions mises à jour (traitement planifié exécuté pour ce client).');
    } catch (error: any) {
      console.error('Error processing client positions:', error);
      toast.error(error?.message || 'Échec du traitement des positions');
    } finally {
      setLoading(false);
    }
  }

  // Load all positions for counts on mount and when clientId or refreshToken changes
  useEffect(() => {
    loadAllPositionsForCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshToken]);

  // Load paginated positions when tab or client changes
  useEffect(() => {
    loadPositionsForTab(activeTab, 1, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, activeTab]);

  // Silent reload of current page when parent triggers a full client refresh
  useEffect(() => {
    if (prevRefreshTokenRef.current === refreshToken || refreshToken === 0) {
      prevRefreshTokenRef.current = refreshToken;
      return;
    }
    prevRefreshTokenRef.current = refreshToken;
    void loadPositionsForTab(activeTab, pagination.page, pagination.limit, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

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

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPositions) {
      const productId = String(p.productId || '').trim();
      if (!productId) continue;
      const productName = String(p.productName || productId).trim();
      if (!map.has(productId)) map.set(productId, productName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [allPositions]);

  useEffect(() => {
    if (!selectedProductId) return;
    const stillExists = productOptions.some((p) => p.id === selectedProductId);
    if (!stillExists) setSelectedProductId(undefined);
  }, [productOptions, selectedProductId]);

  // Filter by product (without status filter) - use allPositions for counts
  const filteredByProduct = useMemo(() => {
    return allPositions.filter((p) => {
      // Filter by product
      if (selectedProductId && p.productId !== selectedProductId) return false;
      return true;
    });
  }, [allPositions, selectedProductId]);

  // Filter paginated positions by product (for display)
  const filteredPaginatedByProduct = useMemo(() => {
    return positions.filter((p) => {
      // Filter by product
      if (selectedProductId && p.productId !== selectedProductId) return false;
      return true;
    });
  }, [positions, selectedProductId]);

  // Filter paginated positions by product AND active tab status
  // Backend already handles sorting, so we just filter here
  const filtered = useMemo(() => {
    return filteredPaginatedByProduct.filter((p) => {
      const isUpcoming = upcomingStatuses.has(p.status);
      const isOpen = openStatuses.has(p.status);
      const isClosed = closedStatuses.has(p.status);
      const isCancelled = cancelledStatuses.has(p.status);
      if (activeTab === 'upcoming' && !isUpcoming) return false;
      if (activeTab === 'open' && !isOpen) return false;
      if (activeTab === 'closed' && !isClosed) return false;
      if (activeTab === 'cancelled' && !isCancelled) return false;
      return true;
    });
  }, [filteredPaginatedByProduct, activeTab, upcomingStatuses, openStatuses, closedStatuses, cancelledStatuses]);

  // Counts should reflect filtered positions by product, but not by active tab
  const counts = useMemo(() => {
    let upcoming = 0;
    let open = 0;
    let closed = 0;
    let cancelled = 0;
    for (const p of filteredByProduct) {
      if (upcomingStatuses.has(p.status)) upcoming += 1;
      else if (openStatuses.has(p.status)) open += 1;
      else if (closedStatuses.has(p.status)) closed += 1;
      else if (cancelledStatuses.has(p.status)) cancelled += 1;
    }
    return { upcoming, open, closed, cancelled };
  }, [filteredByProduct, upcomingStatuses, openStatuses, closedStatuses, cancelledStatuses]);

  function openEditModal(row: ClientPositionRow) {
    setEditingPosition(row);
    const opened = splitForDateTimeInputs(row.opened_at);
    const closed = splitForDateTimeInputs(row.closed_at);
    setEditOpenedDate(opened.date);
    setEditOpenedTime(opened.time);
    setEditClosedDate(closed.date);
    setEditClosedTime(closed.time);
    setEditAssetId(row.assetId ? String(row.assetId) : 'none');
    setIsAssetSearchOpen(false);
    setEditAssetQuery('');
    const initialAmount = typeof row.invested_amount === 'number' ? row.invested_amount : parseFloat(String(row.invested_amount));
    setEditAmount(Number.isFinite(initialAmount) ? String(initialAmount) : '');
  }

  async function handleSavePositionEdit() {
    if (!editingPosition) return;
    const openedAt = combineDateAndTimeForApi(editOpenedDate, editOpenedTime);
    if (openedAt === '') {
      toast.error("Veuillez renseigner l'heure d'ouverture");
      return;
    }
    const closedAt = combineDateAndTimeForApi(editClosedDate, editClosedTime);
    if (closedAt === '') {
      toast.error("Veuillez renseigner l'heure de fermeture");
      return;
    }
    if (openedAt && closedAt && new Date(closedAt).getTime() < new Date(openedAt).getTime()) {
      toast.error("La date de fermeture doit être postérieure à la date d'ouverture");
      return;
    }

    const payload: Record<string, string | number | null> = {
      opened_at: openedAt,
      closed_at: closedAt,
      asset_id: editAssetId === 'none' ? null : editAssetId,
    };
    const normalizedAmount = String(editAmount ?? '').trim();
    if (normalizedAmount !== '') {
      const parsedAmount = parseFloat(normalizedAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        toast.error('Le montant doit être un nombre positif ou nul');
        return;
      }
      payload.invested_amount = parsedAmount;
    }

    setSavingEdit(true);
    try {
      await apiCall(`/api/clients/${clientId}/positions/${editingPosition.id}/update/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      clearApiCache(`clients/${clientId}/positions`);
      await loadAllPositionsForCounts();
      await loadPositionsForTab(activeTab, pagination.page, pagination.limit, false);
      toast.success('Position modifiée avec succès');
      setEditingPosition(null);
    } catch (error: any) {
      console.error('Error updating position:', error);
      toast.error(error?.message || 'Erreur lors de la modification de la position');
    } finally {
      setSavingEdit(false);
    }
  }

  function resetCreateForm() {
    setCreateOpenedDate('');
    setCreateOpenedTime('');
    setCreateClosedDate('');
    setCreateClosedTime('');
    setCreateAssetId('none');
    setCreateAssetQuery('');
    setIsCreateAssetSearchOpen(false);
    setCreateAmount('');
    setCreateProfitLoss('');
    setCreateProductId('none');
    setCreateTransactionId('none');
    setCreateStatusMode('auto');
    setCreateTransactionQuery('');
    setIsCreateTransactionSearchOpen(false);
  }

  async function loadCreateFormData() {
    setLoadingCreateData(true);
    try {
      const allTransactions: any[] = [];
      let page = 1;
      const limit = 500;
      let hasMore = true;

      while (hasMore) {
        const data = await apiCall(`/api/clients/${clientId}/transactions/?page=${page}&limit=${limit}`);
        const transactions = (data as any)?.transactions || [];
        allTransactions.push(...transactions);
        const pag = (data as any)?.pagination;
        if (pag && page >= pag.total_pages) {
          hasMore = false;
        } else if (transactions.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      }

      const productsData = await apiCall(`/api/clients/${clientId}/products/`);
      setClientProducts((productsData as any)?.products || []);
      setClientTransactions(allTransactions);
    } catch (error) {
      console.error('Error loading create form data:', error);
      toast.error('Erreur lors du chargement des produits et transactions');
      setClientProducts([]);
      setClientTransactions([]);
    } finally {
      setLoadingCreateData(false);
    }
  }

  function openCreateModal() {
    resetCreateForm();
    setIsCreateOpen(true);
    void loadCreateFormData();
  }

  function statusToTab(status: string): 'upcoming' | 'open' | 'closed' | 'cancelled' {
    if (status === 'pending') return 'upcoming';
    if (status === 'open') return 'open';
    if (status === 'done') return 'closed';
    if (status === 'cancelled') return 'cancelled';
    return 'upcoming';
  }

  async function handleSavePositionCreate() {
    const openedAt = combineDateAndTimeForApi(createOpenedDate, createOpenedTime);
    if (!createOpenedDate.trim() || openedAt === '') {
      toast.error("Veuillez renseigner la date et l'heure d'ouverture");
      return;
    }
    const closedAt = combineDateAndTimeForApi(createClosedDate, createClosedTime);
    if (!createClosedDate.trim() || closedAt === '') {
      toast.error("Veuillez renseigner la date et l'heure de fermeture");
      return;
    }
    if (openedAt && closedAt && new Date(closedAt).getTime() < new Date(openedAt).getTime()) {
      toast.error("La date de fermeture doit être postérieure à la date d'ouverture");
      return;
    }

    const normalizedAmount = String(createAmount ?? '').trim();
    if (!normalizedAmount) {
      toast.error('Le montant investi est requis');
      return;
    }
    const parsedAmount = parseFloat(normalizedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error('Le montant doit être un nombre positif ou nul');
      return;
    }

    const payload: Record<string, string | number | null> = {
      opened_at: openedAt,
      closed_at: closedAt,
      invested_amount: parsedAmount,
      asset_id: createAssetId === 'none' ? null : createAssetId,
    };

    if (createProductId !== 'none') {
      payload.product_id = createProductId;
    }
    if (createTransactionId !== 'none') {
      payload.transaction_id = createTransactionId;
    }

    const normalizedProfitLoss = String(createProfitLoss ?? '').trim();
    if (normalizedProfitLoss !== '') {
      const parsedProfitLoss = parseFloat(normalizedProfitLoss);
      if (!Number.isFinite(parsedProfitLoss)) {
        toast.error('Le profit / perte doit être un nombre valide');
        return;
      }
      payload.profit_loss = parsedProfitLoss;
    }

    if (createStatusMode !== 'auto') {
      payload.status = createStatusMode;
    }

    setSavingCreate(true);
    try {
      const response = await apiCall(`/api/clients/${clientId}/positions/create/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      clearApiCache(`clients/${clientId}/positions`);
      const createdStatus = String((response as any)?.position?.status || 'pending');
      const targetTab = statusToTab(createdStatus);
      setActiveTab(targetTab);
      await loadAllPositionsForCounts();
      await loadPositionsForTab(targetTab, 1, pagination.limit, false);
      toast.success('Position créée avec succès');
      setIsCreateOpen(false);
      resetCreateForm();
    } catch (error: any) {
      console.error('Error creating position:', error);
      toast.error(error?.message || 'Erreur lors de la création de la position');
    } finally {
      setSavingCreate(false);
    }
  }

  const selectedEditAsset = useMemo(() => {
    if (editAssetId === 'none') return null;
    return assets.find((asset) => String(asset.id) === String(editAssetId)) || null;
  }, [assets, editAssetId]);

  const selectedEditAssetLabel =
    editAssetId === 'none'
      ? 'Aucun asset'
      : selectedEditAsset
        ? `${selectedEditAsset.name || selectedEditAsset.id}${selectedEditAsset.reference ? ` (${selectedEditAsset.reference})` : ''}`
        : 'Asset sélectionné';

  const filteredAssetOptions = useMemo(() => {
    const query = editAssetQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return assets
      .filter((asset) => {
        const name = String(asset?.name || '').toLowerCase();
        const reference = String(asset?.reference || '').toLowerCase();
        return name.includes(query) || reference.includes(query);
      })
      .slice(0, 150);
  }, [assets, editAssetQuery]);

  const createProductOptions = useMemo(() => {
    return clientProducts
      .map((cp) => {
        const product = cp?.product || cp;
        const id = String(product?.id || cp?.productId || '').trim();
        if (!id) return null;
        const name = String(product?.name || id).trim();
        return { id, name };
      })
      .filter(Boolean) as { id: string; name: string }[];
  }, [clientProducts]);

  const selectedCreateAsset = useMemo(() => {
    if (createAssetId === 'none') return null;
    return assets.find((asset) => String(asset.id) === String(createAssetId)) || null;
  }, [assets, createAssetId]);

  const selectedCreateAssetLabel =
    createAssetId === 'none'
      ? 'Aucun asset'
      : selectedCreateAsset
        ? `${selectedCreateAsset.name || selectedCreateAsset.id}${selectedCreateAsset.reference ? ` (${selectedCreateAsset.reference})` : ''}`
        : 'Asset sélectionné';

  const filteredCreateAssetOptions = useMemo(() => {
    const query = createAssetQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return assets
      .filter((asset) => {
        const name = String(asset?.name || '').toLowerCase();
        const reference = String(asset?.reference || '').toLowerCase();
        return name.includes(query) || reference.includes(query);
      })
      .slice(0, 150);
  }, [assets, createAssetQuery]);

  const formatTransactionLabel = (tx: any) => {
    const id = String(tx?.id || '').trim();
    const type = String(tx?.type || tx?.transactionType || '-').trim();
    const amount = tx?.amount != null ? `${tx.amount} €` : '-';
    const dateRaw = tx?.date || tx?.transactionDate || tx?.createdAt || '';
    const dateLabel = dateRaw ? formatPositionDateOnly(String(dateRaw)) : '-';
    return `${id} · ${type} · ${amount} · ${dateLabel}`;
  };

  const selectedCreateTransaction = useMemo(() => {
    if (createTransactionId === 'none') return null;
    return clientTransactions.find((tx) => String(tx.id) === String(createTransactionId)) || null;
  }, [clientTransactions, createTransactionId]);

  const selectedCreateTransactionLabel =
    createTransactionId === 'none'
      ? 'Aucune transaction'
      : selectedCreateTransaction
        ? formatTransactionLabel(selectedCreateTransaction)
        : 'Transaction sélectionnée';

  const filteredCreateTransactionOptions = useMemo(() => {
    const query = createTransactionQuery.trim().toLowerCase();
    if (query.length < 1) return clientTransactions.slice(0, 100);
    return clientTransactions
      .filter((tx) => {
        const id = String(tx?.id || '').toLowerCase();
        const type = String(tx?.type || tx?.transactionType || '').toLowerCase();
        const amount = String(tx?.amount ?? '').toLowerCase();
        return id.includes(query) || type.includes(query) || amount.includes(query);
      })
      .slice(0, 100);
  }, [clientTransactions, createTransactionQuery]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="tab-section-title">Positions ({loading ? '...' : pagination.total})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <div className="mb-4 flex flex-nowrap items-center gap-3">
                <TabsList className="h-auto shrink-0">
                  <TabsTrigger value="upcoming">À venir ({counts.upcoming})</TabsTrigger>
                  <TabsTrigger value="open">Ouvertes ({counts.open})</TabsTrigger>
                  <TabsTrigger value="closed">Fermées ({counts.closed})</TabsTrigger>
                  <TabsTrigger value="cancelled">Annulées ({counts.cancelled})</TabsTrigger>
                </TabsList>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Select
                    modal={false}
                    value={selectedProductId || 'all'}
                    onValueChange={(value) => setSelectedProductId(value === 'all' ? undefined : value)}
                  >
                    <SelectTrigger className="app-tabs-toolbar-control w-[200px]">
                      <SelectValue placeholder="Filtrer par produit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les produits</SelectItem>
                      {productOptions.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="app-tabs-toolbar-control shrink-0"
                    onClick={openCreateModal}
                    disabled={loading}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Créer une position
                  </Button>
                  <Button
                    variant="outline"
                    className="app-tabs-toolbar-control shrink-0"
                    onClick={() => {
                      void handleRefresh();
                    }}
                    disabled={loading}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {loading ? 'Chargement...' : 'Rafraîchir'}
                  </Button>
                </div>
              </div>

              <TabsContent value="upcoming" className="mt-0">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucune position.
                  </div>
                ) : (
                  <PositionsTable
                    rows={filtered}
                    assets={assets}
                    accountCurrency={accountCurrency}
                    onEdit={openEditModal}
                    onCancel={async (row) => {
                      try {
                        await cancelPosition(row.id);
                        toast.success('Position annulée');
                        // After cancellation, switch to the "closed" tab so the user sees it immediately.
                        setActiveTab('cancelled');
                        await loadAllPositionsForCounts();
                        await loadPositionsForTab('cancelled', 1, pagination.limit);
                      } catch (error: any) {
                        console.error('Error cancelling position:', error);
                        toast.error(error?.message || "Erreur lors de l'annulation");
                      }
                    }}
                  />
                )}
              </TabsContent>
              <TabsContent value="open" className="mt-0">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucune position.
                  </div>
                ) : (
                  <PositionsTable
                    rows={filtered}
                    assets={assets}
                    accountCurrency={accountCurrency}
                    onEdit={openEditModal}
                    onCancel={async (row) => {
                      try {
                        await cancelPosition(row.id);
                        toast.success('Position annulée');
                        // After cancellation, switch to the "closed" tab so the user sees it immediately.
                        setActiveTab('cancelled');
                        await loadAllPositionsForCounts();
                        await loadPositionsForTab('cancelled', 1, pagination.limit);
                      } catch (error: any) {
                        console.error('Error cancelling position:', error);
                        toast.error(error?.message || "Erreur lors de l'annulation");
                      }
                    }}
                  />
                )}
              </TabsContent>
              <TabsContent value="closed" className="mt-0">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucune position.
                  </div>
                ) : (
                  <PositionsTable
                    rows={filtered}
                    assets={assets}
                    accountCurrency={accountCurrency}
                    onEdit={openEditModal}
                    onCancel={async (row) => {
                      try {
                        await cancelPosition(row.id);
                        toast.success('Position annulée');
                        await loadAllPositionsForCounts();
                        // Stay on "closed" and refresh current page.
                        await loadPositionsForTab('closed', pagination.page, pagination.limit);
                      } catch (error: any) {
                        console.error('Error cancelling position:', error);
                        toast.error(error?.message || "Erreur lors de l'annulation");
                      }
                    }}
                  />
                )}
              </TabsContent>
              <TabsContent value="cancelled" className="mt-0">
                {loading && positions.length > 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingIndicator />
                  </div>
                ) : !filtered.length ? (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucune position.
                  </div>
                ) : (
                  <PositionsTable
                    rows={filtered}
                    assets={assets}
                    accountCurrency={accountCurrency}
                    onEdit={openEditModal}
                    onCancel={async (row) => {
                      try {
                        await cancelPosition(row.id);
                        toast.success('Position annulée');
                        await loadAllPositionsForCounts();
                        await loadPositionsForTab('cancelled', pagination.page, pagination.limit);
                      } catch (error: any) {
                        console.error('Error cancelling position:', error);
                        toast.error(error?.message || "Erreur lors de l'annulation");
                      }
                    }}
                  />
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
        <Dialog open={!!editingPosition} onOpenChange={(open) => { if (!open && !savingEdit) setEditingPosition(null); }}>
          <DialogContent className="w-[min(92vw,36rem)] sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Modifier la position</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Date (JJ/MM/AAAA) et heure d&apos;ouverture</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <DateInput
                    id="edit-position-opened-date"
                    value={editOpenedDate}
                    onChange={setEditOpenedDate}
                    disabled={savingEdit}
                  />
                  <Input
                    id="edit-position-opened-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                    value={editOpenedTime}
                    onChange={(e) => setEditOpenedTime(e.target.value)}
                    disabled={savingEdit}
                  />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Date (JJ/MM/AAAA) et heure de fermeture</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <DateInput
                    id="edit-position-closed-date"
                    value={editClosedDate}
                    onChange={setEditClosedDate}
                    disabled={savingEdit}
                  />
                  <Input
                    id="edit-position-closed-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                    value={editClosedTime}
                    onChange={(e) => setEditClosedTime(e.target.value)}
                    disabled={savingEdit}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-position-asset">Asset</Label>
                <Popover
                  open={isAssetSearchOpen}
                  onOpenChange={(open) => {
                    setIsAssetSearchOpen(open);
                    if (!open) setEditAssetQuery('');
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="edit-position-asset"
                      variant="outline"
                      role="combobox"
                      aria-expanded={isAssetSearchOpen}
                      disabled={savingEdit}
                      className="w-full justify-between h-9 rounded-md border-input bg-input-background px-3 py-2 text-sm font-normal text-slate-700"
                    >
                      <span className="truncate">{selectedEditAssetLabel}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[10050]" align="start" style={{ zIndex: 10050 }}>
                    <Command>
                      <CommandInput
                        placeholder="Rechercher un asset (nom ou référence)..."
                        value={editAssetQuery}
                        onValueChange={setEditAssetQuery}
                      />
                      <CommandList className="max-h-[220px]">
                        <CommandEmpty>
                          {editAssetQuery.trim().length < 2
                            ? 'Tapez au moins 2 caractères.'
                            : 'Aucun asset trouvé.'}
                        </CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="aucun asset none"
                            onSelect={() => {
                              setEditAssetId('none');
                              setIsAssetSearchOpen(false);
                            }}
                          >
                            Aucun asset
                          </CommandItem>
                          {filteredAssetOptions.map((asset) => {
                            const assetLabel = asset.name || asset.id;
                            const searchValue = `${assetLabel} ${asset.reference || ''}`.toLowerCase();
                            return (
                              <CommandItem
                                key={String(asset.id)}
                                value={searchValue}
                                onSelect={() => {
                                  setEditAssetId(String(asset.id));
                                  setIsAssetSearchOpen(false);
                                }}
                              >
                                {assetLabel}
                                {asset.reference ? ` (${asset.reference})` : ''}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-position-amount">Montant investi (EUR)</Label>
                <Input
                  id="edit-position-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  disabled={savingEdit}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingPosition(null)} disabled={savingEdit}>
                Annuler
              </Button>
              <Button type="button" onClick={() => { void handleSavePositionEdit(); }} disabled={savingEdit}>
                {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open && !savingCreate) { setIsCreateOpen(false); resetCreateForm(); } else if (open) setIsCreateOpen(true); }}>
          <DialogContent
            className="max-h-[90vh] overflow-y-auto"
            style={{ width: 'min(92vw, 48rem)', maxWidth: '48rem' }}
          >
            <DialogHeader>
              <DialogTitle>Créer une position</DialogTitle>
            </DialogHeader>
            {loadingCreateData ? (
              <div className="flex flex-col items-center justify-center py-8">
                <LoadingIndicator />
                <p className="mt-4 text-sm text-slate-500">Chargement des données...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 py-2" style={{ columnGap: '2.5rem', rowGap: '1rem' }}>
                <div className="space-y-2">
                  <Label>Date (JJ/MM/AAAA) et heure d&apos;ouverture</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <DateInput
                      id="create-position-opened-date"
                      value={createOpenedDate}
                      onChange={setCreateOpenedDate}
                      disabled={savingCreate}
                    />
                    <Input
                      id="create-position-opened-time"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                      value={createOpenedTime}
                      onChange={(e) => setCreateOpenedTime(e.target.value)}
                      disabled={savingCreate}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date (JJ/MM/AAAA) et heure de fermeture</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <DateInput
                      id="create-position-closed-date"
                      value={createClosedDate}
                      onChange={setCreateClosedDate}
                      disabled={savingCreate}
                    />
                    <Input
                      id="create-position-closed-time"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                      value={createClosedTime}
                      onChange={(e) => setCreateClosedTime(e.target.value)}
                      disabled={savingCreate}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-position-asset">Asset</Label>
                  <Popover
                    open={isCreateAssetSearchOpen}
                    onOpenChange={(open) => {
                      setIsCreateAssetSearchOpen(open);
                      if (!open) setCreateAssetQuery('');
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        id="create-position-asset"
                        variant="outline"
                        role="combobox"
                        aria-expanded={isCreateAssetSearchOpen}
                        disabled={savingCreate}
                        className="w-full justify-between h-9 rounded-md border-input bg-input-background px-3 py-2 text-sm font-normal text-slate-700"
                      >
                        <span className="truncate">{selectedCreateAssetLabel}</span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[10050]" align="start" style={{ zIndex: 10050 }}>
                      <Command>
                        <CommandInput
                          placeholder="Rechercher un asset (nom ou référence)..."
                          value={createAssetQuery}
                          onValueChange={setCreateAssetQuery}
                        />
                        <CommandList className="max-h-[220px]">
                          <CommandEmpty>
                            {createAssetQuery.trim().length < 2
                              ? 'Tapez au moins 2 caractères.'
                              : 'Aucun asset trouvé.'}
                          </CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="aucun asset none"
                              onSelect={() => {
                                setCreateAssetId('none');
                                setIsCreateAssetSearchOpen(false);
                              }}
                            >
                              Aucun asset
                            </CommandItem>
                            {filteredCreateAssetOptions.map((asset) => {
                              const assetLabel = asset.name || asset.id;
                              const searchValue = `${assetLabel} ${asset.reference || ''}`.toLowerCase();
                              return (
                                <CommandItem
                                  key={String(asset.id)}
                                  value={searchValue}
                                  onSelect={() => {
                                    setCreateAssetId(String(asset.id));
                                    setIsCreateAssetSearchOpen(false);
                                  }}
                                >
                                  {assetLabel}
                                  {asset.reference ? ` (${asset.reference})` : ''}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-position-amount">Montant investi (EUR)</Label>
                  <Input
                    id="create-position-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={createAmount}
                    onChange={(e) => setCreateAmount(e.target.value)}
                    disabled={savingCreate}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-position-product">Produit</Label>
                  <Select
                    modal={false}
                    value={createProductId}
                    onValueChange={setCreateProductId}
                    disabled={savingCreate}
                  >
                    <SelectTrigger id="create-position-product" className="w-full">
                      <SelectValue placeholder="Sélectionner un produit" />
                    </SelectTrigger>
                    <SelectContent style={{ zIndex: 10050 }}>
                      <SelectItem value="none">Aucun produit</SelectItem>
                      {createProductOptions.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-position-status">Statut</Label>
                  <Select
                    modal={false}
                    value={createStatusMode}
                    onValueChange={(value) => setCreateStatusMode(value as 'auto' | 'pending' | 'open' | 'done')}
                    disabled={savingCreate}
                  >
                    <SelectTrigger id="create-position-status" className="w-full">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent style={{ zIndex: 10050 }}>
                      <SelectItem value="auto">Automatique (selon dates)</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="open">Ouverte</SelectItem>
                      <SelectItem value="done">Terminée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-position-profit-loss">Profit / Perte (EUR)</Label>
                  <Input
                    id="create-position-profit-loss"
                    type="number"
                    step="0.01"
                    value={createProfitLoss}
                    onChange={(e) => setCreateProfitLoss(e.target.value)}
                    disabled={savingCreate}
                    placeholder="Optionnel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-position-transaction">Transaction liée</Label>
                  <Popover
                    open={isCreateTransactionSearchOpen}
                    onOpenChange={(open) => {
                      setIsCreateTransactionSearchOpen(open);
                      if (!open) setCreateTransactionQuery('');
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        id="create-position-transaction"
                        variant="outline"
                        role="combobox"
                        aria-expanded={isCreateTransactionSearchOpen}
                        disabled={savingCreate}
                        className="w-full justify-between h-9 rounded-md border-input bg-input-background px-3 py-2 text-sm font-normal text-slate-700"
                      >
                        <span className="truncate">{selectedCreateTransactionLabel}</span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[10050]" align="start" style={{ zIndex: 10050 }}>
                      <Command>
                        <CommandInput
                          placeholder="Rechercher une transaction (id, type, montant)..."
                          value={createTransactionQuery}
                          onValueChange={setCreateTransactionQuery}
                        />
                        <CommandList className="max-h-[220px]">
                          <CommandEmpty>Aucune transaction trouvée.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="aucune transaction none"
                              onSelect={() => {
                                setCreateTransactionId('none');
                                setIsCreateTransactionSearchOpen(false);
                              }}
                            >
                              Aucune transaction
                            </CommandItem>
                            {filteredCreateTransactionOptions.map((tx) => {
                              const label = formatTransactionLabel(tx);
                              return (
                                <CommandItem
                                  key={String(tx.id)}
                                  value={label.toLowerCase()}
                                  onSelect={() => {
                                    setCreateTransactionId(String(tx.id));
                                    setIsCreateTransactionSearchOpen(false);
                                  }}
                                >
                                  {label}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setIsCreateOpen(false); resetCreateForm(); }}
                disabled={savingCreate}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={() => { void handleSavePositionCreate(); }}
                disabled={savingCreate || loadingCreateData}
              >
                {savingCreate ? 'Création...' : 'Créer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function PositionsTable({
  rows,
  assets,
  accountCurrency = 'EUR',
  onEdit,
  onCancel,
}: {
  rows: ClientPositionRow[];
  assets: any[];
  accountCurrency?: string;
  onEdit: (row: ClientPositionRow) => void;
  onCancel: (row: ClientPositionRow) => Promise<void>;
}) {
  // Créer un Map pour accéder rapidement aux assets par ID
  const assetsById = new Map<string, any>();
  assets.forEach((asset) => {
    if (asset?.id) {
      assetsById.set(String(asset.id), asset);
    }
  });

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRow, setCancelRow] = useState<ClientPositionRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [ackDone, setAckDone] = useState(false);

  const cancelRiskText = (status: string) => {
    if (status === 'pending') {
      return "Risque: cette annulation peut créer un trou de période et la position peut réapparaître si une régénération/recalcul est relancé.";
    }
    if (status === 'open') {
      return "Risque élevé: annuler une position ouverte peut impacter le suivi en cours et les calculs/affichages associés.";
    }
    if (status === 'done') {
      return "Risque très élevé: annuler une position terminée modifie l'historique et peut affecter des logiques aval (ex: complétude de période, intérêts).";
    }
    return "Cette action annule la position (soft-delete) et peut impacter des affichages ou calculs.";
  };

  return (
    <>
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) {
            setCancelRow(null);
            setCancelBusy(false);
            setAckDone(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette position ?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelRow ? (
                <div className="space-y-2">
                  <div>
                    Cette action mettra la position <span className="font-medium">{cancelRow.id}</span> au statut{' '}
                    <span className="font-medium">Annulée</span>.
                  </div>
                  <div className="text-amber-700">{cancelRiskText(cancelRow.status)}</div>
                  {cancelRow.status === 'done' && (
                    <label className="flex items-start gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={ackDone}
                        onChange={(e) => setAckDone(e.target.checked)}
                        disabled={cancelBusy}
                        className="mt-1"
                      />
                      <span>Je comprends le risque et je souhaite annuler une position terminée.</span>
                    </label>
                  )}
                </div>
              ) : (
                'Sélectionnez une position.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={cancelBusy}
              className="bg-transparent border-0 shadow-none underline underline-offset-4 text-slate-600 hover:text-slate-900 hover:bg-transparent"
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                cancelBusy ||
                !cancelRow ||
                cancelRow.status === 'cancelled' ||
                (cancelRow.status === 'done' && !ackDone)
              }
              onClick={async () => {
                if (!cancelRow) return;
                try {
                  setCancelBusy(true);
                  await onCancel(cancelRow);
                  setCancelOpen(false);
                } finally {
                  setCancelBusy(false);
                }
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={positionsTableShellClass}>
        <div className="overflow-x-auto">
          <table className={positionsTableClass}>
            <thead className={positionsTableHeadClass}>
              <tr className={positionsTableHeadRowClass}>
                <th className={`${positionsTableHeadCellClass} text-left`}>Date et heure</th>
                <th className={`${positionsTableHeadCellClass} text-left`}>Produit</th>
                <th className={`${positionsTableHeadCellClass} text-left`}>Asset</th>
                <th className={`${positionsTableHeadCellClass} text-right`}>Montant</th>
                <th className={`${positionsTableHeadCellClass} text-right`}>P&amp;L</th>
                <th className={`${positionsTableHeadCellClass} text-left`}>Statut</th>
                <th className={`${positionsTableHeadCellClass} text-left`}>Transaction</th>
                <th className={`${positionsTableHeadCellClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className={positionsTableBodyClass}>
              {rows.map((p) => {
            const pnlNum =
              p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
            const investedEur = typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
            const investedAsset =
              p.invested_amount_asset_currency == null
                ? null
                : typeof p.invested_amount_asset_currency === 'string'
                  ? parseFloat(p.invested_amount_asset_currency)
                  : Number(p.invested_amount_asset_currency);
            const assetCurrency = (p.assetCurrency || 'EUR').trim().toUpperCase();
            const fxRateNum = p.fx_rate_eur_to_asset == null ? null : typeof p.fx_rate_eur_to_asset === 'string' ? parseFloat(p.fx_rate_eur_to_asset) : Number(p.fx_rate_eur_to_asset);
            const fxRate = fxRateNum != null && Number.isFinite(fxRateNum) && fxRateNum > 0 ? fxRateNum : null;
            
            // Calculer le P&L en devise de l'actif et en EUR
            let pnlAsset: number | null = null;
            let pnlEur: number | null = pnlNum;
            
            if (pnlNum != null && Number.isFinite(pnlNum)) {
              // profit_loss est toujours en EUR (objectif de période)
              if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                pnlEur = pnlNum;
                pnlAsset = pnlNum * fxRate; // conversion EUR → devise actif pour affichage secondaire
              } else {
                pnlEur = pnlNum;
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
            // profit_loss stocké = toujours en EUR → afficher EUR principal, devise actif secondaire
            // P&L temps réel (positions ouvertes) = en devise actif → afficher actif principal, EUR secondaire
            const hasStoredProfitLoss = pnlNum != null && Number.isFinite(pnlNum);
            let pnlLabelMain: string;
            let pnlLabelSub: string | null = null;
            let finalPnlColor: string;
            let pnlPct: number | null = null;

            if (assetCurrency === 'EUR') {
              const formatted = formatPositionPnlWithPct(pnlEur, investedEur, 'EUR');
              pnlLabelMain = formatted.main;
              pnlPct = computePositionPnlPct(pnlEur, investedEur);
              finalPnlColor =
                formatted.isPositive == null
                  ? 'text-slate-700'
                  : formatted.isPositive
                    ? 'text-green-600'
                    : 'text-red-600';
            } else if (hasStoredProfitLoss && pnlEur != null && Number.isFinite(pnlEur)) {
              const formatted = formatPositionPnlWithPct(pnlEur, investedEur, 'EUR');
              pnlLabelMain = formatted.main;
              pnlPct = computePositionPnlPct(pnlEur, investedEur);
              pnlLabelSub = pnlAsset != null && Number.isFinite(pnlAsset)
                ? `≈ ${formatMoney(pnlAsset, assetCurrency, { maximumFractionDigits: 2 })}`
                : null;
              finalPnlColor = pnlEur >= 0 ? 'text-green-600' : 'text-red-600';
            } else if (pnlAsset != null && Number.isFinite(pnlAsset)) {
              const investedForPct =
                investedAsset != null && Number.isFinite(investedAsset) && investedAsset > 0 ? investedAsset : null;
              pnlLabelMain = `${pnlAsset >= 0 ? '+' : '-'}${formatMoney(Math.abs(pnlAsset), assetCurrency, { maximumFractionDigits: 2 })}`;
              pnlPct = computePositionPnlPct(pnlAsset, investedForPct);
              pnlLabelSub = pnlEur != null && Number.isFinite(pnlEur) ? `≈ ${formatAmount(pnlEur, 'EUR')}` : null;
              finalPnlColor = pnlAsset >= 0 ? 'text-green-600' : 'text-red-600';
            } else {
              const formatted = formatPositionPnlWithPct(pnlEur, investedEur, 'EUR');
              pnlLabelMain = formatted.main;
              pnlPct = computePositionPnlPct(pnlEur, investedEur);
              finalPnlColor =
                formatted.isPositive == null
                  ? 'text-slate-700'
                  : formatted.isPositive
                    ? 'text-green-600'
                    : 'text-red-600';
            }

            const pnlPctLabel =
              pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)` : '';
            
            return (
              <tr key={p.id} className={positionsTableRowClass}>
                <td className={`${positionsTableCellClass} whitespace-nowrap`}>{formatPositionRange(p)}</td>
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
                <td className={`${positionsTableCellClass} text-right whitespace-nowrap`}>
                  <div className="font-medium text-slate-900">
                    {Number.isFinite(investedEur) ? formatAmount(investedEur, 'EUR') : '-'}
                  </div>
                  {p.assetId && investedAsset != null && Number.isFinite(investedAsset) && assetCurrency !== 'EUR' && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      ≈ {formatMoney(investedAsset, assetCurrency, { maximumFractionDigits: 2 })}
                    </div>
                  )}
                </td>
                <td className={`${positionsTableCellClass} text-right font-medium whitespace-nowrap ${finalPnlColor}`}>
                  <div>
                    {pnlLabelMain}
                    {pnlPctLabel}
                  </div>
                  {pnlLabelSub && (
                    <div className="mt-0.5 text-xs font-normal text-slate-500">{pnlLabelSub}</div>
                  )}
                </td>
                <td className={positionsTableCellClass}>
                  <PositionStatusBadge status={p.status} />
                </td>
                <td className={`${positionsTableCellClass} font-mono text-xs text-slate-600`}>{p.transactionId || '-'}</td>
                <td className={`${positionsTableCellClass} text-right whitespace-nowrap`}>
                  {p.status === 'cancelled' ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="relative flex flex-nowrap justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(p)}
                        className="h-8 rounded-md border border-purple-200/80 bg-purple-50/40 px-2.5 text-slate-700 shadow-sm hover:!bg-purple-50 hover:!text-purple-800 transition-colors duration-200"
                        title="Modifier la position"
                        aria-label="Modifier la position"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCancelRow(p);
                          setCancelOpen(true);
                        }}
                        className="h-8 rounded-md border border-red-200/80 bg-red-50/40 px-2.5 text-slate-700 shadow-sm hover:!bg-red-50 hover:!text-red-700 transition-colors duration-200"
                        title="Annuler la position"
                        aria-label="Annuler la position"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ClientPositionsTab;

