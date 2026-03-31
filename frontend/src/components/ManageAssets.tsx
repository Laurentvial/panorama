import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Plus, Search, Trash2, Pencil, X, RefreshCw, TrendingUp, TrendingDown } from '../utils/iconMapping';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Layers2 } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import { BulkImportFromIndexModal } from './BulkImportFromIndexModal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import '../styles/Modal.css';
import '../styles/PageHeader.css';

const ASSETS_PAGE_SIZE = 25;

type ExternalAssetRefreshScope =
  | 'default_prices'
  | 'client_assigned_prices'
  | 'stale_24h_prices'
  | 'all_prices'
  | 'all_logos';

const EXTERNAL_ASSET_REFRESH_OPTIONS: { value: ExternalAssetRefreshScope; label: string }[] = [
  { value: 'default_prices', label: 'Prix des actifs par défaut' },
  { value: 'client_assigned_prices', label: 'Prix des actifs assignés à des clients' },
  { value: 'stale_24h_prices', label: 'Prix des actifs non mis à jour depuis plus de 24 heures' },
  { value: 'all_prices', label: 'Prix de tous les actifs' },
  { value: 'all_logos', label: 'Logo de tous les actifs' },
];

type ExternalAssetDuplicateKind = 'alphaSymbol' | 'reference' | 'tradingView';

type ExternalAssetDuplicateGroup = {
  kind: ExternalAssetDuplicateKind;
  key: string;
  assets: any[];
};

const EXTERNAL_ASSET_DUPLICATE_KIND_LABELS: Record<ExternalAssetDuplicateKind, string> = {
  alphaSymbol: 'Symbole API (ticker)',
  reference: 'Référence',
  tradingView: 'Symbole TradingView',
};

function normalizeExternalAssetKey(value: string): string {
  return (value || '').trim().toUpperCase();
}

function buildExternalAssetDuplicateGroups(assets: any[]): ExternalAssetDuplicateGroup[] {
  const push = (map: Map<string, any[]>, key: string, asset: any) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(asset);
  };

  const byAlpha = new Map<string, any[]>();
  const byRef = new Map<string, any[]>();
  const byTv = new Map<string, any[]>();

  for (const a of assets) {
    const sym = normalizeExternalAssetKey(a.alphaVantageSymbol || '');
    if (sym) push(byAlpha, sym, a);
    const ref = normalizeExternalAssetKey(a.reference || '');
    if (ref) push(byRef, ref, a);
    const tv = normalizeExternalAssetKey(a.tradingViewSymbol || '');
    if (tv) push(byTv, tv, a);
  }

  const groups: ExternalAssetDuplicateGroup[] = [];
  const collect = (kind: ExternalAssetDuplicateKind, map: Map<string, any[]>) => {
    for (const [key, list] of map) {
      if (list.length > 1) groups.push({ kind, key, assets: list });
    }
  };
  collect('alphaSymbol', byAlpha);
  collect('reference', byRef);
  collect('tradingView', byTv);

  groups.sort((a, b) => {
    const byLabel = EXTERNAL_ASSET_DUPLICATE_KIND_LABELS[a.kind].localeCompare(
      EXTERNAL_ASSET_DUPLICATE_KIND_LABELS[b.kind],
      'fr'
    );
    if (byLabel !== 0) return byLabel;
    return a.key.localeCompare(b.key, 'fr', { sensitivity: 'base' });
  });
  return groups;
}

/** Oldest first for “keep one original”; missing createdAt sorts after dated rows, then by id. */
function sortExternalAssetsOldestFirst(assets: any[]): any[] {
  return [...assets].sort((a, b) => {
    const ta = a?.createdAt != null && a.createdAt !== '' ? new Date(a.createdAt).getTime() : NaN;
    const tb = b?.createdAt != null && b.createdAt !== '' ? new Date(b.createdAt).getTime() : NaN;
    const aOk = !Number.isNaN(ta);
    const bOk = !Number.isNaN(tb);
    if (aOk && bOk && ta !== tb) return ta - tb;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return String(a.id).localeCompare(String(b.id), 'fr', { sensitivity: 'base' });
  });
}

// Liste des bourses disponibles pour le champ Exchange
const EXCHANGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'NASDAQ', label: 'NASDAQ' },
  { value: 'NYSE', label: 'NYSE (Bourse de New York)' },
  { value: 'AMEX', label: 'AMEX (American Stock Exchange)' },
  { value: 'NYSEARCA', label: 'NYSEARCA (ETF)' },
  { value: 'BATS', label: 'BATS' },
  { value: 'EURONEXT', label: 'EURONEXT (Paris, Amsterdam, Bruxelles)' },
  { value: 'LSE', label: 'LSE (Bourse de Londres)' },
  { value: 'XETR', label: 'XETR (Deutsche Börse)' },
  { value: 'FWB', label: 'FWB (Frankfurt)' },
  { value: 'SWX', label: 'SWX (Bourse suisse)' },
  { value: 'TSE', label: 'TSE (Tokyo)' },
  { value: 'HKEX', label: 'HKEX (Hong Kong)' },
  { value: 'SSE', label: 'SSE (Shanghai)' },
  { value: 'SZSE', label: 'SZSE (Shenzhen)' },
  { value: 'TSX', label: 'TSX (Toronto)' },
  { value: 'ASX', label: 'ASX (Australie)' },
  { value: 'BINANCE', label: 'BINANCE (Crypto)' },
];

// Helper function to get currency symbol
function getCurrencySymbol(currency?: string): string {
  if (!currency) return '$';
  const currencyUpper = currency.toUpperCase();
  const currencyMap: { [key: string]: string } = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'CHF': 'CHF',
    'CAD': 'C$',
    'AUD': 'A$',
    'CNY': '¥',
    'INR': '₹',
    'BRL': 'R$',
    'MXN': '$',
    'KRW': '₩',
    'SGD': 'S$',
    'HKD': 'HK$',
    'NZD': 'NZ$',
    'ZAR': 'R',
    'SEK': 'kr',
    'NOK': 'kr',
    'DKK': 'kr',
    'PLN': 'zł',
    'CZK': 'Kč',
    'HUF': 'Ft',
    'RUB': '₽',
    'TRY': '₺',
  };
  return currencyMap[currencyUpper] || currencyUpper;
}

function formatLastPriceUpdate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

type AssetSortKey =
  | 'type'
  | 'name'
  | 'reference'
  | 'alphaVantageSymbol'
  | 'lastPrice'
  | 'priceChangePercent'
  | 'lastPriceUpdate'
  | 'category'
  | 'subcategory'
  | 'default';

type AssetSortDir = 'asc' | 'desc';

function defaultSortDirForColumn(key: AssetSortKey): AssetSortDir {
  if (
    key === 'lastPriceUpdate' ||
    key === 'lastPrice' ||
    key === 'priceChangePercent' ||
    key === 'default'
  ) {
    return 'desc';
  }
  return 'asc';
}

function compareAssets(a: any, b: any, key: AssetSortKey, dir: AssetSortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  const strCmp = (sa: string, sb: string) => sa.localeCompare(sb, 'fr', { sensitivity: 'base' }) * sign;

  switch (key) {
    case 'type':
      return strCmp((a.type || '').toLowerCase(), (b.type || '').toLowerCase());
    case 'name':
      return strCmp((a.name || '').toLowerCase(), (b.name || '').toLowerCase());
    case 'reference':
      return strCmp((a.reference || '').toLowerCase(), (b.reference || '').toLowerCase());
    case 'alphaVantageSymbol':
      return strCmp(
        (a.alphaVantageSymbol || '').toLowerCase(),
        (b.alphaVantageSymbol || '').toLowerCase()
      );
    case 'category':
      return strCmp((a.category || '').toLowerCase(), (b.category || '').toLowerCase());
    case 'subcategory':
      return strCmp((a.subcategory || '').toLowerCase(), (b.subcategory || '').toLowerCase());
    case 'lastPrice': {
      const na = a.lastPrice === null || a.lastPrice === undefined || a.lastPrice === '';
      const nb = b.lastPrice === null || b.lastPrice === undefined || b.lastPrice === '';
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      const pa = parseFloat(a.lastPrice);
      const pb = parseFloat(b.lastPrice);
      if (pa !== pa && pb !== pb) return 0;
      if (pa !== pa) return 1;
      if (pb !== pb) return -1;
      return pa < pb ? -sign : pa > pb ? sign : 0;
    }
    case 'priceChangePercent': {
      const na =
        a.priceChangePercent === null || a.priceChangePercent === undefined || a.priceChangePercent === '';
      const nb =
        b.priceChangePercent === null || b.priceChangePercent === undefined || b.priceChangePercent === '';
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      const pa = parseFloat(a.priceChangePercent);
      const pb = parseFloat(b.priceChangePercent);
      if (pa !== pa && pb !== pb) return 0;
      if (pa !== pa) return 1;
      if (pb !== pb) return -1;
      return pa < pb ? -sign : pa > pb ? sign : 0;
    }
    case 'lastPriceUpdate': {
      const na = !a.lastPriceUpdate;
      const nb = !b.lastPriceUpdate;
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      const ta = new Date(a.lastPriceUpdate).getTime();
      const tb = new Date(b.lastPriceUpdate).getTime();
      if (ta !== ta && tb !== tb) return 0;
      if (ta !== ta) return 1;
      if (tb !== tb) return -1;
      return ta < tb ? -sign : ta > tb ? sign : 0;
    }
    case 'default': {
      const da = !!a.default;
      const db = !!b.default;
      if (da === db) return 0;
      return (da ? 1 : -1) * sign;
    }
    default:
      return 0;
  }
}

export function ManageAssets() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterExchange, setFilterExchange] = useState<string>('all');
  const [filterIndex, setFilterIndex] = useState<string>('all');
  const [activeTypeTab, setActiveTypeTab] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<AssetSortKey | null>(null);
  const [sortDir, setSortDir] = useState<AssetSortDir>('desc');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [bulkRefreshScope, setBulkRefreshScope] = useState<ExternalAssetRefreshScope>('all_prices');
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);
  const [duplicateRowHighlight, setDuplicateRowHighlight] = useState(false);
  const [duplicateDeleteSelection, setDuplicateDeleteSelection] = useState<Set<string>>(() => new Set());
  const [deletingDuplicateSelection, setDeletingDuplicateSelection] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  // Used only for the Alpha Vantage search mode in the create dialog
  // (separate from CRM "Type" stored in formData.type)
  const [searchAssetType, setSearchAssetType] = useState('');
  const [formData, setFormData] = useState({
    type: '',
    name: '',
    reference: '',
    category: '',
    subcategory: '',
    default: false,
    alphaVantageSymbol: '',
    exchange: '',
    currency: '',
    logoUrl: '',
    description: '',
  });
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [fetchingLogo, setFetchingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  
  // Alpha Vantage search state (inside modal)
  const [alphaVantageSearch, setAlphaVantageSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<any>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exchangeAutoSetRef = useRef(false);

  useEffect(() => {
    loadAssets();
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, []);

  const normalizedSymbol = (formData.alphaVantageSymbol || '').trim().toUpperCase();
  const normalizedType = (formData.type || '').trim().toLowerCase();
  const isCryptoType = normalizedType.includes('crypto') || normalizedType.includes('cryptomonnaie');
  const isSpotMetalType = normalizedType === 'or' || normalizedType === 'argent';
  const isSpotCommodityType = normalizedType === 'pétrole' || normalizedType === 'petrole' || normalizedType === 'gaz';
  const isSpotMetalSymbol = normalizedSymbol === 'XAU' || normalizedSymbol === 'XAG';
  const isForexType = normalizedType.includes('devise');
  const hideExchangeField = isCryptoType || isForexType || isSpotMetalType || isSpotCommodityType || isSpotMetalSymbol;

  const normalizeKey = useCallback((value: any) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }, []);

  const canonicalTypeKey = useCallback(
    (raw: any) => {
      const k = normalizeKey(raw);
      // Merge common aliases/plurals to avoid duplicate tabs (e.g. "Crypto" vs "Cryptomonnaie").
      if (!k) return '';
      if (k === 'crypto' || k === 'cryptos' || k === 'cryptomonnaies') return normalizeKey('Cryptomonnaie');
      if (k === 'actions') return normalizeKey('Action');
      if (k === 'etfs') return normalizeKey('ETF');
      if (k === 'obligations') return normalizeKey('Obligation');
      if (k === 'devises') return normalizeKey('Devise');
      if (k === 'indices') return normalizeKey('Indice');
      if (k === 'matieres premieres' || k === 'matiere premieres' || k === 'matieres premiere') return normalizeKey('Matière première');
      return k;
    },
    [normalizeKey],
  );

  const assetTypeTabs = useMemo(() => {
    // Known CRM types, ordered.
    const base: Array<{ value: string; label: string; typeKey: string }> = [
      { value: 'all', label: `Tous`, typeKey: 'all' },
      { value: 'action', label: `Actions`, typeKey: canonicalTypeKey('Action') },
      { value: 'etf', label: `ETF`, typeKey: canonicalTypeKey('ETF') },
      { value: 'cryptomonnaie', label: `Crypto`, typeKey: canonicalTypeKey('Cryptomonnaie') },
      { value: 'obligation', label: `Obligations`, typeKey: canonicalTypeKey('Obligation') },
      { value: 'matiere-premiere', label: `Matiere premiere`, typeKey: canonicalTypeKey('Matière première') },
      { value: 'devise', label: `Devises`, typeKey: canonicalTypeKey('Devise') },
      { value: 'indice', label: `Indices`, typeKey: canonicalTypeKey('Indice') },
      { value: 'autre', label: `Autres`, typeKey: canonicalTypeKey('Autre') },
    ];

    const presentKeys = new Set(base.map((t) => t.typeKey));
    const dynamicTypes = new Map<string, { raw: string; count: number }>();

    for (const a of assets || []) {
      const raw = String(a?.type || '').trim();
      if (!raw) continue;
      const key = canonicalTypeKey(raw);
      const prev = dynamicTypes.get(key);
      dynamicTypes.set(key, { raw, count: (prev?.count || 0) + 1 });
    }

    const tabs = base.map((t) => {
      if (t.value === 'all') return { ...t, count: (assets || []).length };
      const dyn = dynamicTypes.get(t.typeKey);
      return { ...t, count: dyn?.count || 0 };
    });

    // Add any unknown types at the end (rare, but keeps UI future-proof).
    for (const [key, meta] of dynamicTypes.entries()) {
      if (presentKeys.has(key)) continue;
      tabs.push({ value: `type:${key}`, label: meta.raw, typeKey: key, count: meta.count });
    }

    return tabs;
  }, [assets, canonicalTypeKey]);

  useEffect(() => {
    // If current tab disappears (e.g. assets list changed), fall back to "all".
    if (!assetTypeTabs.some((t) => t.value === activeTypeTab)) {
      setActiveTypeTab('all');
    }
  }, [assetTypeTabs, activeTypeTab]);

  useEffect(() => {
    if (!isDialogOpen) return;

    // For forex/spot metals, exchange should be forced to FOREX and the input hidden.
    // This prevents incompatible exchanges (NASDAQ/NYSE/etc.) and avoids HTML "required" blocking.
    if (hideExchangeField) {
      const autoExchange = isCryptoType ? 'BINANCE' : 'FOREX';
      setFormData((prev) => {
        // Only override when empty or when previously auto-set; keep explicit user/backend value if present.
        const current = String(prev.exchange || '').trim().toUpperCase();
        const shouldOverride = !current || current === 'FOREX' || current === 'BINANCE';
        const next = shouldOverride ? { ...prev, exchange: autoExchange } : prev;
        return next;
      });
      exchangeAutoSetRef.current = true;
      return;
    }

    // If we previously auto-set (FOREX/BINANCE) and the user switches to an exchange-based type,
    // clear it so they must pick a relevant exchange.
    if (exchangeAutoSetRef.current) {
      setFormData((prev) => {
        const ex = String(prev.exchange || '').trim().toUpperCase();
        if (ex !== 'FOREX' && ex !== 'BINANCE') return prev;
        return { ...prev, exchange: '' }; // force user input when field becomes visible again
      });
      exchangeAutoSetRef.current = false;
    }
  }, [hideExchangeField, isDialogOpen]);

  function bustAssetsCache(assetId?: string) {
    // apiCall caches GET requests for ~2 minutes; bust cache after any mutation
    // so the table reflects the updated asset immediately.
    clearApiCache('/api/assets');
    clearApiCache('/api/assets/');
    if (assetId) {
      clearApiCache(`/api/assets/${assetId}/`);
    }
  }

  async function loadAssets() {
    try {
      setLoading(true);
      const data = await apiCall('/api/assets/');
      setAssets((data as any).assets || []);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Erreur lors du chargement des actifs');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenDialog(asset?: any) {
    if (asset) {
      exchangeAutoSetRef.current = false;
      setEditingAsset(asset);
      setFormData({
        type: asset.type || '',
        name: asset.name || '',
        reference: asset.reference || '',
        category: asset.category || '',
        subcategory: asset.subcategory || '',
        default: asset.default || false,
        alphaVantageSymbol: asset.alphaVantageSymbol || '',
        exchange: asset.exchange || '',
        currency: asset.currency || '',
        logoUrl: asset.logoUrl || '',
        description: asset.description || '',
      });
      setLogoPreview(asset.logoUrl || null);
    } else {
      exchangeAutoSetRef.current = false;
      setEditingAsset(null);
      setFormData({
        type: '',
        name: '',
        reference: '',
        category: '',
        subcategory: '',
        default: false,
        alphaVantageSymbol: '',
        exchange: '',
        logoUrl: '',
        description: '',
      });
      setLogoPreview(null);
    }
    // Reset logo file and preview
    setLogoFile(null);
    // Reset search when opening dialog
    setSearchAssetType('');
    setAlphaVantageSearch('');
    setSearchResults([]);
    setValidationErrors([]);
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    // Clear any pending search timeout to prevent state updates after dialog closes
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    setIsDialogOpen(false);
    setEditingAsset(null);
    setSearchAssetType('');
    setFormData({
      type: '',
      name: '',
      reference: '',
      category: '',
      subcategory: '',
      default: false,
      alphaVantageSymbol: '',
      exchange: '',
      logoUrl: '',
      description: '',
    });
    setLogoFile(null);
    setLogoPreview(null);
    setAlphaVantageSearch('');
    setSearchResults([]);
    setSelectedSearchResult(null);
  }

  // Validate asset data before saving
  async function validateAssetData(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Basic required fields
    if (!formData.type || !formData.name) {
      errors.push('Le type et le nom sont obligatoires');
      return { isValid: false, errors };
    }
    
    const normalizedSymbol = (formData.alphaVantageSymbol || '').trim().toUpperCase();
    const normalizedExchange = (formData.exchange || '').trim().toUpperCase();
    const isSpotMetal = normalizedSymbol === 'XAU' || normalizedSymbol === 'XAG';
    const isForexExchange = normalizedExchange === 'FOREX';

    // Check if alpha_vantage_symbol is provided
    if (!formData.alphaVantageSymbol || !formData.alphaVantageSymbol.trim()) {
      errors.push('⚠️ Le symbole Alpha Vantage est requis pour récupérer les prix en temps réel');
    }
    
    // Best-effort checks for external market data
    const assetType = formData.type?.toLowerCase() || '';
    const isCrypto = assetType.includes('crypto') || assetType.includes('cryptomonnaie');
    const isCommodity = assetType.includes('matière') || assetType.includes('matiere');
    const isForexType = assetType.includes('devise');
    
    if (!formData.exchange || !formData.exchange.trim()) {
      if (isCrypto) {
        errors.push('⚠️ L\'exchange est requis pour les cryptos (ex: BINANCE).');
      } else {
        errors.push('⚠️ L\'exchange est recommandé (ex: NASDAQ, NYSE, EURONEXT).');
      }
    } else {
      const exchange = formData.exchange.trim().toUpperCase();
      
      // Basic exchange sanity check
      if (isCrypto) {
        if (exchange !== 'BINANCE') {
          errors.push('⚠️ Pour les cryptos, l\'exchange "BINANCE" est généralement le plus compatible.');
        }
      } else {
        // Spot FX-like assets (XAU/XAG, FX pairs) legitimately use FOREX.
        if ((isSpotMetal || isForexType) && exchange === 'FOREX') {
          // ok
        } else if (isForexExchange) {
          // If user selected FOREX but the asset isn't forex/spot, warn.
          errors.push('⚠️ Exchange "FOREX" n\'est valide que pour les actifs Spot/Forex (ex: XAU, XAG, devises).');
        } else {
        // For stocks, validate exchange is a known exchange (best-effort)
        const usExchanges = ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'BATS'];
        const internationalExchanges = ['EURONEXT', 'LSE', 'TSE', 'ASX', 'SSE', 'SZSE', 'HKEX', 'XETR', 'FWB', 'SWX'];
        const validExchanges = [...usExchanges, ...internationalExchanges];
        
        if (!validExchanges.includes(exchange)) {
          errors.push(`⚠️ Exchange "${exchange}" non reconnu. Exemples: ${validExchanges.slice(0, 10).join(', ')}...`);
        }
        }
      }
    }
    
    // If we have alpha_vantage_symbol, validate it
    if (formData.alphaVantageSymbol && formData.alphaVantageSymbol.trim()) {
      // Spot metals (XAU/XAG) are handled via FX endpoints; don't block on SYMBOL_SEARCH.
      if (isSpotMetal || isForexExchange) {
        // ok
      } else {
      try {
        // Try to verify the symbol exists in Alpha Vantage
        const symbol = normalizedSymbol;
        const apiType = isCrypto ? 'crypto' : isCommodity ? 'commodity' : '';
        const url = `/api/alpha-vantage/search/?keywords=${encodeURIComponent(symbol)}${apiType ? `&type=${apiType}` : ''}`;
        const response = await apiCall(url);
        
        const found = response.results?.some((r: any) => 
          r.symbol?.toUpperCase() === symbol || r.symbol?.toUpperCase() === `${symbol}USDT`
        );
        
        if (!found && response.results?.length > 0) {
          errors.push(`⚠️ Le symbole "${symbol}" n'a pas été trouvé dans Alpha Vantage. Vérifiez l'orthographe.`);
        } else if (!found && response.results?.length === 0) {
          // Only mention rate limit if explicitly indicated
          if (response.rate_limit_reached === true) {
            errors.push(`⚠️ Impossible de vérifier le symbole "${symbol}" - limite API Alpha Vantage atteinte (25/jour pour le plan gratuit)`);
          } else {
            errors.push(`⚠️ Le symbole "${symbol}" n'a pas été trouvé dans Alpha Vantage. Vérifiez l'orthographe.`);
          }
        }
      } catch (error: any) {
        console.warn('Could not validate symbol:', error);
        errors.push(`⚠️ Impossible de vérifier le symbole Alpha Vantage (${error?.message || 'erreur API'})`);
      }
      }
    }
    
    // Check logo URL (warning only, not blocking)
    // Spot/FX assets typically won't have logos; don't warn for those.
    if ((!formData.logoUrl || !formData.logoUrl.trim()) && !(isSpotMetal || isForexExchange)) {
      errors.push('⚠️ L\'URL du logo est manquante. Le logo peut être récupéré automatiquement depuis Finnhub lors de la recherche.');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Basic validation
    if (!formData.type || !formData.name) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    // Validate asset data
    setValidating(true);
    setValidationErrors([]);
    
    try {
      const validation = await validateAssetData();
      
      if (!validation.isValid && validation.errors.length > 0) {
        setValidationErrors(validation.errors);
        
        // Show warning but allow saving if user confirms
        const shouldContinue = window.confirm(
          '⚠️ Des avertissements ont été détectés :\n\n' +
          validation.errors.join('\n') +
          '\n\nSouhaitez-vous continuer malgré ces avertissements ?'
        );
        
        if (!shouldContinue) {
          setValidating(false);
          return;
        }
      }
      
      const payload = {
        ...formData,
        alphaVantageSymbol: formData.alphaVantageSymbol || undefined,
        exchange: formData.exchange || undefined,
        logoUrl: formData.logoUrl || undefined,
        description: formData.description || undefined,
      };
      
      if (editingAsset) {
        await apiCall(`/api/assets/${editingAsset.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' }
        });
        bustAssetsCache(String(editingAsset.id));
        toast.success('Actif modifié avec succès');
      } else {
        // Use the import endpoint so we persist extra company info (description, market cap, etc.)
        // at creation time.
        const importPayload = {
          symbol: formData.alphaVantageSymbol,
          name: formData.name,
          type: formData.type,
          reference: formData.reference,
          category: formData.category,
          subcategory: formData.subcategory,
          default: formData.default,
          exchange: formData.exchange,
          currency: formData.currency || selectedSearchResult?.currency || undefined,
          region: selectedSearchResult?.region || undefined,
          logoUrl: formData.logoUrl,
          description: formData.description,
        };

        const createdAsset = await apiCall('/api/assets/create-from-alpha-vantage/', {
          method: 'POST',
          body: JSON.stringify(importPayload),
          headers: { 'Content-Type': 'application/json' }
        });
        bustAssetsCache(createdAsset?.id != null ? String(createdAsset.id) : undefined);
        
        // If a logo file was selected but not uploaded yet, upload it now
        if (logoFile && createdAsset?.id) {
          try {
            const formDataUpload = new FormData();
            formDataUpload.append('logo', logoFile);
            const logoResponse = await apiCall(`/api/assets/${createdAsset.id}/upload-logo/`, {
              method: 'POST',
              body: formDataUpload
            });
            if (logoResponse.logo_url) {
              bustAssetsCache(String(createdAsset.id));
              // Logo uploaded successfully, asset already updated
              // Nettoyer le preview local et le fichier
              setLogoFile(null);
              setLogoPreview(null);
              toast.success('Actif créé avec logo téléchargé avec succès');
            }
          } catch (logoError: any) {
            console.error('Error uploading logo after creation:', logoError);
            toast.warning('Actif créé mais erreur lors du téléchargement du logo: ' + (logoError?.message || 'Erreur inconnue'));
          }
        } else {
          toast.success('Actif créé avec succès');
        }
      }
      handleCloseDialog();
      await loadAssets();
    } catch (error: any) {
      console.error('Error saving asset:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setValidating(false);
    }
  }

  async function handleDelete(assetId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet actif ?')) return;
    
    try {
      await apiCall(`/api/assets/${assetId}/delete/`, { method: 'DELETE' });
      bustAssetsCache(String(assetId));
      toast.success('Actif supprimé avec succès');
      loadAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Erreur lors de la suppression');
    }
  }

  const toggleDuplicateDeleteSelect = useCallback((id: string) => {
    setDuplicateDeleteSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleBulkDeleteDuplicateSelection(ids: string[]) {
    if (ids.length === 0) {
      toast.info('Sélectionnez au moins un actif à supprimer');
      return;
    }
    if (
      !confirm(
        `Supprimer définitivement ${ids.length} actif(s) sélectionné(s) ? Les liaisons clients seront supprimées si nécessaire. Cette action est irréversible.`
      )
    ) {
      return;
    }
    setDeletingDuplicateSelection(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          await apiCall(`/api/assets/${id}/delete/`, { method: 'DELETE' });
          bustAssetsCache(String(id));
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0) {
        toast.success(`${ok} actif(s) supprimé(s)`);
      }
      if (failed > 0) {
        toast.error(`${failed} suppression(s) en échec`);
      }
      setDuplicateDeleteSelection(new Set());
      await loadAssets();
    } finally {
      setDeletingDuplicateSelection(false);
    }
  }

  async function handleAlphaVantageSearch(searchValue?: string) {
    const keywords = (searchValue || alphaVantageSearch).trim();
    if (!keywords) {
      setSearchResults([]);
      return;
    }

    // Determine API type based on the search mode (not CRM type)
    const assetType = (searchAssetType || '').toLowerCase();
    const isCrypto = assetType === 'cryptomonnaie' || assetType.includes('crypto');
    const isCommodity =
      assetType.includes('matière') ||
      assetType.includes('matiere') ||
      assetType === 'or' ||
      assetType === 'argent' ||
      assetType.includes('pétrole') ||
      assetType.includes('petrole') ||
      assetType.includes('gaz');

    const apiType = isCrypto ? 'crypto' : isCommodity ? 'commodity' : '';

    try {
      setSearching(true);
      const url = `/api/alpha-vantage/search/?keywords=${encodeURIComponent(keywords)}${apiType ? `&type=${apiType}` : ''}`;
      const response = await apiCall(url);
      const results = response.results || [];
      setSearchResults(results);
      
      // Only show rate limit warning if explicitly indicated AND no results
      // Don't show warning if we have results (even if there's a rate limit warning, we got data)
      if (response.rate_limit_reached === true && results.length === 0) {
        toast.warning('Limite de requêtes API atteinte (25/jour pour le plan gratuit). Veuillez réessayer demain ou passer à un plan premium.');
      } else if (results.length === 0 && alphaVantageSearch.trim()) {
        // Show info message if no results but not necessarily rate limit
        toast.info(response.message || 'Aucun résultat trouvé. Vérifiez l\'orthographe ou essayez un autre terme.');
      }
    } catch (error: any) {
      console.error('Error searching:', error);
      toast.error(error?.message || 'Erreur lors de la recherche');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner un fichier image');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('L\'image ne doit pas dépasser 5MB');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleUploadLogo() {
    if (!logoFile || !editingAsset) {
      toast.error('Veuillez sélectionner un fichier image');
      return;
    }

    try {
      setUploadingLogo(true);
      const uploadFormData = new FormData();
      uploadFormData.append('logo', logoFile);

      const response = await apiCall(`/api/assets/${editingAsset.id}/upload-logo/`, {
        method: 'POST',
        body: uploadFormData
      });

      if (response.logo_url) {
        setFormData((prevFormData) => ({ ...prevFormData, logoUrl: response.logo_url }));
        bustAssetsCache(String(editingAsset.id));
        // Utiliser uniquement l'URL du serveur, retirer le preview local
        setLogoPreview(null);
        setLogoFile(null);
        // Réinitialiser le champ de fichier
        const fileInput = document.getElementById('asset-logo-file') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        toast.success('Logo téléchargé avec succès');
        // Refresh the list table in the background too
        loadAssets();
      } else {
        toast.error('Erreur lors du téléchargement du logo');
      }
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error(error?.message || 'Erreur lors du téléchargement du logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleFetchLogoFromAPI() {
    if (!editingAsset || !formData.alphaVantageSymbol) {
      toast.error('Symbole Alpha Vantage manquant');
      return;
    }

    try {
      setFetchingLogo(true);
      const assetType = (formData.type || 'action').toLowerCase();
      
      // Extract base symbol (remove exchange suffix like .PA, .DE, .L, etc.)
      const baseSymbol = formData.alphaVantageSymbol.split('.')[0];
      
      const response = await apiCall(
        `/api/assets/get-logo/?symbol=${encodeURIComponent(baseSymbol)}&type=${assetType}`
      );

      if (response.logo_url) {
        // Update the asset with the new logo
        await apiCall(`/api/assets/${editingAsset.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ logoUrl: response.logo_url })
        });

        setFormData((prevFormData) => ({ ...prevFormData, logoUrl: response.logo_url }));
        setLogoPreview(response.logo_url);
        bustAssetsCache(String(editingAsset.id));
        toast.success('Logo récupéré avec succès depuis l\'API');
        loadAssets();
      } else {
        toast.warning('Aucun logo trouvé pour ce symbole');
      }
    } catch (error: any) {
      console.error('Error fetching logo from API:', error);
      toast.error(error?.message || 'Erreur lors de la récupération du logo');
    } finally {
      setFetchingLogo(false);
    }
  }

  async function handleDeleteLogo() {
    if (!editingAsset) {
      return;
    }

    try {
      setDeletingLogo(true);
      
      // Update the asset to remove the logo
      await apiCall(`/api/assets/${editingAsset.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ logoUrl: '' })
      });

      setFormData((prevFormData) => ({ ...prevFormData, logoUrl: '' }));
      setLogoPreview(null);
      setLogoFile(null);
      bustAssetsCache(String(editingAsset.id));
      toast.success('Logo supprimé avec succès');
      loadAssets();
    } catch (error: any) {
      console.error('Error deleting logo:', error);
      toast.error(error?.message || 'Erreur lors de la suppression du logo');
    } finally {
      setDeletingLogo(false);
    }
  }

  async function handleSelectSearchResult(result: any) {
    // Set selected result
    setSelectedSearchResult(result);
    
    // Prefill form with selected result
    const isCommodityMode =
      (searchAssetType || '').toLowerCase().includes('matière') ||
      (searchAssetType || '').toLowerCase().includes('matiere');

    // CRM Type:
    // - Spot commodities (XAU/XAG): use "Matière première" and store metal name in subcategory
    // - Commodity ETFs/proxies: keep "Matière première" and store underlying in subcategory.
    // - Others: infer from Alpha Vantage type.
    const assetType = isCommodityMode
      ? 'Matière première'
      : result.type === 'Crypto'
        ? 'Cryptomonnaie'
        : result.type === 'Equity'
          ? 'Action'
          : result.type === 'ETF'
            ? 'ETF'
            : (formData.type || 'Action');
    
    const isCrypto = assetType === 'Cryptomonnaie' || assetType.toLowerCase().includes('crypto');
    
    // Determine exchange from result or infer from type
    let exchange = result.exchange || '';
    if (!exchange) {
      if (isCrypto) {
        exchange = 'BINANCE'; // Default for crypto
      } else if (result.region) {
        // Try to infer from region
        const region = result.region.toLowerCase();
        // France - Paris stock exchange is EURONEXT
        if (region.includes('france') || region.includes('paris')) {
          exchange = 'EURONEXT';
        }
        // Other European countries - also likely EURONEXT
        else if (region.includes('belgium') || region.includes('netherlands') || region.includes('portugal') || 
                 region.includes('ireland') || region.includes('europe') || region.includes('euro')) {
          exchange = 'EURONEXT';
        }
        // Germany - XETR or FWB
        else if (region.includes('germany')) {
          exchange = 'XETR';
        }
        // United States
        else if (region.includes('united states') || region.includes('usa') || region.includes('us')) {
          exchange = 'NASDAQ'; // Default for US stocks
        }
        // United Kingdom
        else if (region.includes('uk') || region.includes('united kingdom') || region.includes('great britain')) {
          exchange = 'LSE';
        }
        // Switzerland
        else if (region.includes('switzerland')) {
          exchange = 'SWX';
        }
        // Japan
        else if (region.includes('japan')) {
          exchange = 'TSE';
        }
        // Canada
        else if (region.includes('canada')) {
          exchange = 'TSX';
        }
        // Australia
        else if (region.includes('australia')) {
          exchange = 'ASX';
        }
      }
    }
    
    let logoUrl = result.logo_url || '';
    
    // If logo is missing, try to fetch it
    const isSpotForex = result.type === 'Spot' || result.exchange === 'FOREX';
    if (!logoUrl && result.symbol && !isSpotForex) {
      try {
        // Use full symbol (RR.L, HAG.DE, etc.) so Finnhub returns the correct company
        const logoResponse = await apiCall(
          `/api/assets/get-logo/?symbol=${encodeURIComponent(result.symbol)}&type=${assetType.toLowerCase()}`
        );
        if (logoResponse.logo_url) {
          logoUrl = logoResponse.logo_url;
        }
      } catch (error) {
        console.debug('Could not fetch logo:', error);
        // Continue without logo if fetch fails
      }
    }

    const nextSubcategory = isCommodityMode
      ? (result.type === 'Spot'
          ? 'Spot'
          : (result.commodity_underlying || result.type || formData.subcategory))
      : (result.type || formData.subcategory);
    
    const referenceCode = isSpotForex
      ? `${(result.symbol || '').toUpperCase()}/${(result.currency || 'USD').toUpperCase()}`
      : (result.symbol || '');

    setFormData({
      ...formData,
      name: result.name || result.symbol,
      reference: referenceCode,
      alphaVantageSymbol: result.symbol,
      exchange: exchange,
      currency: result.currency || formData.currency || 'USD',
      type: assetType,
      category: result.region || formData.category,
      subcategory: nextSubcategory,
      logoUrl: logoUrl
    });
  }


  async function handleUpdatePrice(assetId: string) {
    try {
      const response = await apiCall(`/api/assets/${assetId}/update-price/`, { method: 'POST' });
      bustAssetsCache(String(assetId));
      toast.success('Données actualisées avec succès');
      loadAssets();
    } catch (error: any) {
      console.error('Error updating asset:', error);
      // 503 = service unavailable (symbol not found, API down, or rate limit)
      if (error?.status === 503 || error?.response?.rate_limit_reached) {
        const sym = error?.response?.symbol;
        const msg = sym
          ? `Prix non disponible pour ${sym}. Les APIs (FMP/Finnhub/Metals-API/Alpha Vantage) n'ont pas retourné de données.`
          : 'Prix non disponible. Le symbole n\'a pas été trouvé ou les APIs (FMP/Finnhub/Metals-API/Alpha Vantage) n\'ont pas retourné de données.';
        toast.warning(msg);
      } else {
        toast.error(error?.message || 'Erreur lors de l\'actualisation des données');
      }
    }
  }

  async function runBulkRefresh(scope: ExternalAssetRefreshScope) {
    const assetsWithSymbols = assets.filter((a) => a.alphaVantageSymbol);
    if (assetsWithSymbols.length === 0) {
      toast.error('Aucun actif avec symbole Alpha Vantage trouvé');
      return;
    }

    try {
      setUpdatingPrices(true);
      const response = await apiCall('/api/assets/bulk-update-prices/', {
        method: 'POST',
        body: JSON.stringify({ refreshScope: scope }),
        headers: { 'Content-Type': 'application/json' },
      });
      bustAssetsCache();

      if (response.skipped) {
        toast.info('Aucun actif ne correspond à ce critère');
        loadAssets();
        return;
      }

      const updatedCount = response.updated || 0;
      if (scope === 'all_logos') {
        if (updatedCount > 0) {
          toast.success(`${updatedCount} logo(s) actualisé(s)`);
        } else {
          toast.info('Aucun logo mis à jour');
        }
      } else {
        if (updatedCount > 0) {
          toast.success(`${updatedCount} actif(s) actualisé(s)`);
        } else {
          toast.info('Aucune donnée à actualiser');
        }
      }

      if (response.errors && response.errors.length > 0) {
        const errorCount = response.errors.length;
        toast.warning(`${errorCount} erreur(s) lors de l'actualisation`);
      }

      loadAssets();
    } catch (error: any) {
      console.error('Error updating assets:', error);
      toast.error(error?.message || "Erreur lors de l'actualisation des données");
    } finally {
      setUpdatingPrices(false);
    }
  }

  const filteredAssets = useMemo(() => {
    const list = assets.filter((asset) => {
      const searchLower = searchTerm.toLowerCase();
      if (activeTypeTab !== 'all') {
        const tab = assetTypeTabs.find((t) => t.value === activeTypeTab) || null;
        const assetTypeKey = canonicalTypeKey(asset?.type);
        if (tab && tab.typeKey !== 'all' && assetTypeKey !== tab.typeKey) {
          return false;
        }
      }
      if (filterExchange !== 'all' && (asset.exchange || '').trim() !== (filterExchange || '').trim()) {
        return false;
      }
      if (filterIndex !== 'all' && (asset.sourceIndex || '').trim() !== (filterIndex || '').trim()) {
        return false;
      }
      return (
        asset.name?.toLowerCase().includes(searchLower) ||
        asset.type?.toLowerCase().includes(searchLower) ||
        asset.reference?.toLowerCase().includes(searchLower) ||
        asset.category?.toLowerCase().includes(searchLower) ||
        asset.subcategory?.toLowerCase().includes(searchLower)
      );
    });
    if (!sortKey) return list;
    return [...list].sort((a, b) => compareAssets(a, b, sortKey, sortDir));
  }, [
    assets,
    searchTerm,
    filterExchange,
    filterIndex,
    activeTypeTab,
    assetTypeTabs,
    canonicalTypeKey,
    sortKey,
    sortDir,
  ]);

  const externalAssetDuplicateGroups = useMemo(
    () => buildExternalAssetDuplicateGroups(assets),
    [assets]
  );

  const externalAssetDuplicateIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of externalAssetDuplicateGroups) {
      for (const a of g.assets) {
        s.add(a.id);
      }
    }
    return s;
  }, [externalAssetDuplicateGroups]);

  const duplicateModalSelectableIds = useMemo(() => Array.from(externalAssetDuplicateIds), [externalAssetDuplicateIds]);

  const selectAllDuplicatesInModal = useCallback(() => {
    setDuplicateDeleteSelection(new Set(duplicateModalSelectableIds));
  }, [duplicateModalSelectableIds]);

  const selectDuplicateGroupAssets = useCallback((group: ExternalAssetDuplicateGroup) => {
    setDuplicateDeleteSelection((prev) => {
      const next = new Set(prev);
      for (const a of group.assets) {
        next.add(a.id);
      }
      return next;
    });
  }, []);

  /** One unchecked row per duplicate group (oldest kept), all others checked — quick path to bulk delete extras. */
  const preselectDuplicateExtrasKeepOldestPerGroup = useCallback(() => {
    const next = new Set<string>();
    for (const g of externalAssetDuplicateGroups) {
      if (g.assets.length < 2) continue;
      const ordered = sortExternalAssetsOldestFirst(g.assets);
      for (let i = 1; i < ordered.length; i++) {
        next.add(ordered[i].id);
      }
    }
    setDuplicateDeleteSelection(next);
    if (next.size === 0) {
      toast.info('Aucun excédent à pré-sélectionner dans les groupes affichés.');
    } else {
      toast.success(`${next.size} fiche(s) cochée(s) — la plus ancienne de chaque groupe est laissée décochée.`);
    }
  }, [externalAssetDuplicateGroups]);

  const toggleSort = useCallback((key: AssetSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir(defaultSortDirForColumn(key));
      return key;
    });
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedAssets = useMemo(() => {
    const start = (safePage - 1) * ASSETS_PAGE_SIZE;
    return filteredAssets.slice(start, start + ASSETS_PAGE_SIZE);
  }, [filteredAssets, safePage]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterExchange, filterIndex, activeTypeTab]);

  const renderSortableHeader = (label: string, colKey: AssetSortKey) => {
    const active = sortKey === colKey;
    return (
      <th className="text-left p-2 font-medium text-slate-700">
        <button
          type="button"
          onClick={() => toggleSort(colKey)}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          <span>{label}</span>
          {active ? (
            sortDir === 'asc' ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
            )
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400 opacity-60" aria-hidden />
          )}
        </button>
      </th>
    );
  };

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Actifs externes</h1>
          <p className="page-subtitle">Gérer les actifs externes du marché (actions, crypto, ETF, etc.)</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsRefreshModalOpen(true)}
            disabled={updatingPrices || assets.filter((a) => a.alphaVantageSymbol).length === 0}
          >
            {/* @ts-ignore - react-icons accepts className at runtime */}
            <RefreshCw className={`w-4 h-4 mr-2 ${updatingPrices ? 'animate-spin' : ''}`} />
            Actualiser les données
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsDuplicatesModalOpen(true)}
            title="Détecter les actifs en double (symbole API, référence, TradingView)"
          >
            <Layers2 className="w-4 h-4 mr-2" aria-hidden />
            Vérifier les doublons
            {externalAssetDuplicateIds.size > 0 ? (
              <span className="ml-1.5 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0 text-xs font-semibold text-slate-600 tabular-nums">
                {externalAssetDuplicateIds.size}
              </span>
            ) : null}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setIsBulkImportModalOpen(true)}
          >
            {/* @ts-ignore - react-icons accepts className at runtime */}
            <Plus className="w-4 h-4 mr-2" />
            Import depuis indice
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            {/* @ts-ignore - react-icons accepts className at runtime */}
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un actif
          </Button>
        </div>
      </div>

      {duplicateRowHighlight && externalAssetDuplicateIds.size > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-2 text-sm text-amber-950"
          role="status"
        >
          <span>
            {externalAssetDuplicateIds.size} actif(s) concerné(s) par au moins un doublon — surlignés dans le tableau.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setDuplicateRowHighlight(false)}>
            Masquer le surlignage
          </Button>
        </div>
      ) : null}

      {/* Type Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTypeTab} onValueChange={setActiveTypeTab}>
            <div className="overflow-x-auto">
              <TabsList className="flex-wrap h-auto">
                {assetTypeTabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label} ({t.count})
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Search and filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="relative">
              {/* @ts-ignore - react-icons accepts className at runtime */}
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                className="pl-10"
                placeholder="Rechercher par nom, type, référence, catégorie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filter-exchange">Bourse</Label>
                <Select value={filterExchange} onValueChange={setFilterExchange}>
                  <SelectTrigger id="filter-exchange">
                    <SelectValue placeholder="Toutes les bourses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les bourses</SelectItem>
                    {(Array.from(new Set(assets.map((a: any) => (a.exchange || '').trim()).filter(Boolean))) as string[]).sort().map((exchange: string) => (
                      <SelectItem key={exchange} value={exchange}>{exchange}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-index">Indice</Label>
                <Select value={filterIndex} onValueChange={setFilterIndex}>
                  <SelectTrigger id="filter-index">
                    <SelectValue placeholder="Tous les indices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les indices</SelectItem>
                    {(Array.from(new Set(assets.map((a: any) => (a.sourceIndex || '').trim()).filter(Boolean))) as string[]).sort().map((index: string) => (
                      <SelectItem key={index} value={index}>{index}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Actifs ({filteredAssets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAssets.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Aucun actif trouvé</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-slate-700">Logo</th>
                    {renderSortableHeader('Type', 'type')}
                    {renderSortableHeader('Nom', 'name')}
                    {renderSortableHeader('Référence', 'reference')}
                    {renderSortableHeader('Symbole Ticker', 'alphaVantageSymbol')}
                    {renderSortableHeader('Prix', 'lastPrice')}
                    {renderSortableHeader('Variation', 'priceChangePercent')}
                    {renderSortableHeader('Dernière MAJ', 'lastPriceUpdate')}
                    {renderSortableHeader('Catégorie', 'category')}
                    {renderSortableHeader('Sous-catégorie', 'subcategory')}
                    {renderSortableHeader('Par défaut', 'default')}
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      className={[
                        'border-b hover:bg-slate-50',
                        duplicateRowHighlight && externalAssetDuplicateIds.has(asset.id)
                          ? 'bg-amber-50/95 hover:bg-amber-50'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="p-2">
                        {asset.logoUrl ? (
                          <img 
                            src={asset.logoUrl} 
                            alt={asset.name}
                            className="w-10 h-10 rounded object-contain border border-slate-200 bg-white p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center border border-slate-200">
                            <span className="text-xs text-slate-400 font-semibold">
                              {asset.name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-2">{asset.type}</td>
                      <td className="p-2 font-medium">{asset.name}</td>
                      <td className="p-2 font-mono text-sm">{asset.reference}</td>
                      <td className="p-2 font-mono text-sm font-semibold">
                        {asset.alphaVantageSymbol || '-'}
                      </td>
                      <td className="p-2">
                        {asset.lastPrice ? (
                          <span className="font-semibold">{getCurrencySymbol(asset.currency)}{parseFloat(asset.lastPrice).toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-2">
                        {asset.priceChange !== null && asset.priceChange !== undefined ? (
                          <div className="flex items-center gap-1">
                            {parseFloat(asset.priceChange) >= 0 ? (
                              <>
                                {/* @ts-ignore - react-icons accepts className at runtime */}
                                <TrendingUp className="w-4 h-4 text-green-600" />
                              </>
                            ) : (
                              <>
                                {/* @ts-ignore - react-icons accepts className at runtime */}
                                <TrendingDown className="w-4 h-4 text-red-600" />
                              </>
                            )}
                            <span className={parseFloat(asset.priceChange) >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {parseFloat(asset.priceChange) >= 0 ? '+' : ''}{getCurrencySymbol(asset.currency)}{parseFloat(asset.priceChange).toFixed(2)}
                              {asset.priceChangePercent !== null && asset.priceChangePercent !== undefined && (
                                <span className="ml-1">
                                  ({parseFloat(asset.priceChangePercent) >= 0 ? '+' : ''}{parseFloat(asset.priceChangePercent).toFixed(2)}%)
                                </span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-2 text-sm text-slate-600">
                        {asset.lastPriceUpdate ? (
                          <span title={new Date(asset.lastPriceUpdate).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}>
                            {formatLastPriceUpdate(asset.lastPriceUpdate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-2">{asset.category}</td>
                      <td className="p-2">{asset.subcategory}</td>
                      <td className="p-2">
                        {asset.default ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Oui</span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-sm">Non</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          {asset.alphaVantageSymbol && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUpdatePrice(asset.id)}
                              title="Actualiser toutes les données manquantes depuis l'API"
                            >
                              {/* @ts-ignore - react-icons accepts className at runtime */}
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(asset)}
                          >
                            {/* @ts-ignore - react-icons accepts className at runtime */}
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(asset.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {/* @ts-ignore - react-icons accepts className at runtime */}
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination Controls */}
          {filteredAssets.length > ASSETS_PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  Page {safePage} sur {totalPages} ({filteredAssets.length} actifs)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={safePage <= 1}
                    title="Première page"
                  >
                    {/* @ts-ignore - react-icons accepts className at runtime */}
                    <ChevronLeft className="w-4 h-4" />
                    <ChevronLeft className="w-4 h-4 -ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    {/* @ts-ignore - react-icons accepts className at runtime */}
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Précédent
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (safePage <= 3) {
                        pageNum = i + 1;
                      } else if (safePage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = safePage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={safePage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          className="min-w-[2.5rem]"
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Suivant
                    {/* @ts-ignore - react-icons accepts className at runtime */}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={safePage >= totalPages}
                    title="Dernière page"
                  >
                    {/* @ts-ignore - react-icons accepts className at runtime */}
                    <ChevronRight className="w-4 h-4" />
                    <ChevronRight className="w-4 h-4 -ml-2" />
                  </Button>
                </div>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
        <div className="modal-overlay" onClick={handleCloseDialog}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingAsset ? 'Modifier l\'actif' : 'Créer un nouvel actif'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={handleCloseDialog}
              >
                {/* @ts-ignore - react-icons accepts className at runtime */}
                <X className="w-6 h-6" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {/* Alpha Vantage Search */}
              {!editingAsset && (
                <>
                  <div className="modal-form-field">
                    <Label htmlFor="asset-type-select">Type d'actif</Label>
                    <Select
                      value={searchAssetType}
                      onValueChange={(value) => {
                        setSearchAssetType(value);
                        setSearchResults([]);
                        setAlphaVantageSearch('');
                        setSelectedSearchResult(null);
                      }}
                    >
                      <SelectTrigger id="asset-type-select">
                        <SelectValue placeholder="Sélectionner le type d'actif" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Action">Action</SelectItem>
                        <SelectItem value="ETF">ETF</SelectItem>
                        <SelectItem value="Cryptomonnaie">Cryptomonnaie</SelectItem>
                        <SelectItem value="Matière première">Matière première</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {searchAssetType && (
                    <div className="modal-form-field">
                        <Label htmlFor="alpha-vantage-search">
                          {searchAssetType === 'Cryptomonnaie' 
                            ? 'Rechercher une crypto-monnaie (nom ou symbole)' 
                            : 'Rechercher un actif (nom ou symbole)'}
                        </Label>
                        <div className="relative">
                          {/* @ts-ignore - react-icons accepts className at runtime */}
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 z-10" />
                          <Input
                            id="alpha-vantage-search"
                            className="pl-10"
                            placeholder={
                              searchAssetType === 'Cryptomonnaie' 
                                ? 'Ex: Bitcoin, BTC, Ethereum, ETH...' 
                                : 'Ex: Apple, AAPL, Microsoft, MSFT...'
                            }
                            value={alphaVantageSearch}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAlphaVantageSearch(value);
                              
                              // Clear previous timeout
                              if (searchTimeoutRef.current) {
                                clearTimeout(searchTimeoutRef.current);
                              }
                              
                              // Debounce search
                              searchTimeoutRef.current = setTimeout(() => {
                                if (value.trim()) {
                                  handleAlphaVantageSearch(value);
                                } else {
                                  setSearchResults([]);
                                  setSelectedSearchResult(null);
                                }
                              }, 500);
                            }}
                          />
                        </div>
                        {searching && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                            {/* @ts-ignore - react-icons accepts className at runtime */}
                            <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                            <span>Recherche en cours...</span>
                          </div>
                        )}
                        
                        {/* Search Results */}
                        {searchResults.length > 0 && (
                          <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
                            <div 
                              className="overflow-y-auto"
                              style={{ 
                                maxHeight: selectedSearchResult ? '400px' : '200px',
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#cbd5e1 #f1f5f9'
                              }}
                            >
                              {searchResults.map((result: any, index: number) => (
                                <div
                                  key={`${result.symbol || 'sym'}-${result.exchange || 'ex'}-${result.currency || 'ccy'}-${index}`}
                                  onClick={() => handleSelectSearchResult(result)}
                                  className={`p-3 hover:bg-slate-100 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors ${
                                    selectedSearchResult?.symbol === result.symbol &&
                                    selectedSearchResult?.exchange === result.exchange &&
                                    selectedSearchResult?.currency === result.currency
                                      ? 'bg-blue-50 border-blue-200'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{result.name}</div>
                                      <div className="text-xs text-slate-500 font-mono">{result.symbol}</div>
                                      <div className="text-xs text-slate-400 mt-1">
                                        {result.type}
                                        {result.commodity_underlying ? ` • Exposition: ${result.commodity_underlying}` : ''}
                                        {result.region ? ` • ${result.region}` : ''}
                                        {result.currency ? ` • ${result.currency}` : ''}
                                      </div>
                                    </div>
                                    {result.price && (
                                      <div className="text-right ml-4 flex-shrink-0">
                                        <div className="font-semibold text-sm">
                                          {getCurrencySymbol(result.currency)}{parseFloat(result.price).toFixed(2)}
                                        </div>
                                        {result.change !== undefined && (
                                          <div className={`text-xs ${parseFloat(result.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {parseFloat(result.change) >= 0 ? '+' : ''}{getCurrencySymbol(result.currency)}{parseFloat(result.change).toFixed(2)}
                                            {result.change_percent && ` (${parseFloat(result.change_percent) >= 0 ? '+' : ''}${parseFloat(result.change_percent)}%)`}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {searchResults.length === 0 && alphaVantageSearch.trim() && !searching && (
                          <p className="text-xs text-slate-500 mt-1">Aucun résultat trouvé</p>
                        )}
                    </div>
                  )}
                </>
              )}
              
              <div className="modal-form-field">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                  required
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Actions - Actifs externes du marché */}
                    <SelectItem value="Action">Action</SelectItem>
                    
                    {/* Cryptomonnaies - Actifs externes du marché */}
                    <SelectItem value="Cryptomonnaie">Cryptomonnaie</SelectItem>
                    
                    {/* Fonds et ETF - Actifs externes du marché */}
                    <SelectItem value="ETF">ETF</SelectItem>
                    
                    {/* Obligations - Actifs externes du marché */}
                    <SelectItem value="Obligation">Obligation</SelectItem>
                    
                    {/* Matières premières - Actifs externes du marché */}
                    <SelectItem value="Matière première">Matière première (Or, Argent, Pétrole, Gaz, etc.)</SelectItem>
                    
                    {/* Devises - Actifs externes du marché */}
                    <SelectItem value="Devise">Devise</SelectItem>
                    
                    {/* Indices - Actifs externes du marché */}
                    <SelectItem value="Indice">Indice</SelectItem>
                    
                    {/* Autres actifs externes */}
                    <SelectItem value="Autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-field">
                <Label htmlFor="name">Nom *</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="flex-1"
                  />
                  {formData.logoUrl && (
                    <div className="flex-shrink-0">
                      <img 
                        src={formData.logoUrl} 
                        alt={formData.name || 'Logo'}
                        className="w-12 h-12 rounded object-contain border border-slate-200 bg-white p-1"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-form-field">
                <Label htmlFor="asset-logo">Logo de l'actif</Label>
                  <div className="space-y-2">
                    {logoFile ? (
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          <img 
                            src={logoPreview || ''} 
                            alt={formData.name || 'Logo'}
                            className="w-20 h-20 rounded object-contain border border-slate-200 bg-white p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input
                            id="asset-logo-file"
                            type="file"
                            accept="image/*"
                            onChange={handleLogoFileChange}
                            className="cursor-pointer"
                            disabled={uploadingLogo}
                          />
                          {editingAsset && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleUploadLogo}
                                disabled={uploadingLogo || fetchingLogo || deletingLogo}
                                className="w-full"
                              >
                                {uploadingLogo ? 'Téléchargement...' : 'Télécharger le logo'}
                              </Button>
                              {formData.alphaVantageSymbol && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={handleFetchLogoFromAPI}
                                  disabled={fetchingLogo || uploadingLogo || deletingLogo}
                                  className="w-full mt-2"
                                >
                                  {fetchingLogo ? 'Récupération...' : 'Récupérer depuis l\'API'}
                                </Button>
                              )}
                              {formData.logoUrl && (
                                <button
                                  type="button"
                                  onClick={handleDeleteLogo}
                                  disabled={deletingLogo || uploadingLogo || fetchingLogo}
                                  className="text-sm text-red-600 hover:text-red-700 underline hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                                >
                                  {deletingLogo ? 'Suppression...' : 'Supprimer le logo'}
                                </button>
                              )}
                            </>
                          )}
                          {!editingAsset && (
                            <p className="text-sm text-blue-600">
                              Le logo sera téléchargé automatiquement après la création de l'actif.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        {formData.logoUrl && (
                          <div className="flex-shrink-0">
                            <img 
                              src={formData.logoUrl} 
                              alt={formData.name || 'Logo'}
                              className="w-20 h-20 rounded object-contain border border-slate-200 bg-white p-1"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="flex-1 space-y-2">
                        <Input
                          id="asset-logo-file"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileChange}
                          className="cursor-pointer"
                          disabled={uploadingLogo || fetchingLogo || deletingLogo}
                        />
                        {editingAsset && formData.alphaVantageSymbol && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleFetchLogoFromAPI}
                            disabled={fetchingLogo || uploadingLogo || deletingLogo}
                            className="w-full mt-2"
                          >
                            {fetchingLogo ? 'Récupération...' : 'Récupérer depuis l\'API'}
                          </Button>
                        )}
                        {editingAsset && formData.logoUrl && (
                          <button
                            type="button"
                            onClick={handleDeleteLogo}
                            disabled={deletingLogo || uploadingLogo || fetchingLogo}
                            className="text-sm text-red-600 hover:text-red-700 underline hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed mt-2 block"
                          >
                            {deletingLogo ? 'Suppression...' : 'Supprimer le logo'}
                          </button>
                        )}
                        {formData.logoUrl && (
                          <p className="text-xs text-green-600 mt-2">
                            ✓ Logo téléchargé avec succès
                          </p>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {editingAsset 
                      ? 'Cliquez sur "Récupérer depuis l\'API" pour obtenir le logo automatiquement, ou sélectionnez un fichier puis "Télécharger le logo" pour le remplacer manuellement. Formats acceptés: JPG, PNG, GIF (max 5MB)'
                      : 'Sélectionnez un logo à télécharger après la création de l\'actif. Formats acceptés: JPG, PNG, GIF (max 5MB)'}
                  </p>
                </div>
              <div className="modal-form-field">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="Ex: ISIN, ticker..."
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="alphaVantageSymbol">Symbole Ticker *</Label>
                <Input
                  id="alphaVantageSymbol"
                  value={formData.alphaVantageSymbol}
                  onChange={(e) => setFormData({ ...formData, alphaVantageSymbol: e.target.value.toUpperCase() })}
                  placeholder="Ex: AAPL, MSFT, TSLA, BTC, ETH..."
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Symbole utilisé pour récupérer les prix en temps réel depuis Alpha Vantage (ex: AAPL pour les actions, BTC pour les cryptos)</p>
              </div>
              {!hideExchangeField && (
                <div className="modal-form-field">
                  <Label htmlFor="exchange">Exchange (Bourse) *</Label>
                  <Select
                    value={formData.exchange || ''}
                    onValueChange={(value) => setFormData({ ...formData, exchange: value })}
                  >
                    <SelectTrigger id="exchange">
                      <SelectValue placeholder="Sélectionner une bourse" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXCHANGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      {formData.exchange?.trim() && !EXCHANGE_OPTIONS.some((o) => o.value === (formData.exchange || '').trim()) && (
                        <SelectItem value={formData.exchange.trim()}>
                          {formData.exchange.trim()} (actuel)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Bourse sur laquelle l'actif est coté. Pour les cryptos: BINANCE. Pour les actions US: NASDAQ ou NYSE. Pour l'Europe: EURONEXT, LSE, etc.
                  </p>
                </div>
              )}
              <div className="modal-form-field">
                <Label htmlFor="category">Catégorie</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="subcategory">Sous-catégorie</Label>
                <Input
                  id="subcategory"
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                />
              </div>

              <div className="modal-form-field">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="asset-description">Description</Label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generatingDescription || !formData.name}
                    onClick={async () => {
                      try {
                        setGeneratingDescription(true);
                        const res = await apiCall('/api/assets/generate-description/', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: formData.name,
                            symbol: formData.alphaVantageSymbol,
                            type: formData.type,
                            exchange: formData.exchange,
                            currency: formData.currency || '',
                            region: selectedSearchResult?.region || '',
                          }),
                        });
                        const text = (res?.description || res?.text || '').toString().trim();
                        if (text) {
                          setFormData((prev) => ({ ...prev, description: text }));
                          toast.success('Description générée');
                        } else {
                          toast.error('Impossible de générer une description');
                        }
                      } catch (e: any) {
                        toast.error(e?.message || 'Erreur lors de la génération');
                      } finally {
                        setGeneratingDescription(false);
                      }
                    }}
                  >
                    {generatingDescription ? 'IA…' : 'IA'}
                  </Button>
                </div>
                <Textarea
                  id="asset-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description personnalisée (si non fournie par l’API)"
                  rows={5}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Cette description sera enregistrée lors de l’import de l’actif.
                </p>
              </div>
              <div className="modal-form-field">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="default"
                    checked={formData.default}
                    onChange={(e) => setFormData({ ...formData, default: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="default">Disponible par défaut pour tous les clients</Label>
                </div>
              </div>
              {/* Validation Errors Display */}
              {validationErrors.length > 0 && (
                <div className="modal-form-field">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="font-semibold text-yellow-800 mb-2">⚠️ Avertissements de validation :</div>
                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                      {validationErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              
              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={validating}>
                  Annuler
                </Button>
                <Button type="submit" disabled={validating}>
                  {validating ? 'Validation...' : (editingAsset ? 'Modifier' : 'Créer')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Dialog open={isRefreshModalOpen} onOpenChange={setIsRefreshModalOpen}>
        <DialogContent className="max-w-[22rem] gap-6 px-6 py-8 pt-9 sm:px-8 sm:py-10 sm:pt-10">
          <DialogHeader className="space-y-2 pr-10">
            <DialogTitle>Actualiser les données</DialogTitle>
            <DialogDescription>
              Choisissez ce qui doit être mis à jour depuis les sources externes.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-3 border-0 p-0 m-0 min-w-0 py-1">
            <legend className="sr-only">Type d&apos;actualisation</legend>
            {EXTERNAL_ASSET_REFRESH_OPTIONS.map((opt) => {
              const selected = bulkRefreshScope === opt.value;
              return (
                <label
                  key={opt.value}
                  className={[
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    selected
                      ? 'border-slate-700 bg-slate-50 ring-1 ring-slate-700/15'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="external-refresh-scope"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setBulkRefreshScope(opt.value)}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-slate-900"
                  />
                  <span className="text-sm font-normal leading-snug text-slate-800">{opt.label}</span>
                </label>
              );
            })}
          </fieldset>
          <DialogFooter className="gap-3 pt-2 sm:gap-3">
            <Button type="button" variant="outline" onClick={() => setIsRefreshModalOpen(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={updatingPrices}
              onClick={() => {
                setIsRefreshModalOpen(false);
                void runBulkRefresh(bulkRefreshScope);
              }}
            >
              {updatingPrices ? 'Actualisation…' : "Lancer l'actualisation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDuplicatesModalOpen}
        onOpenChange={(open) => {
          setIsDuplicatesModalOpen(open);
          if (!open) setDuplicateDeleteSelection(new Set());
        }}
      >
        <DialogContent
          className="!flex w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full"
          style={{
            height: 'min(85vh, 720px)',
            maxHeight: 'min(85vh, 720px)',
          }}
        >
          <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6 pt-7 box-border">
          <DialogHeader className="shrink-0 space-y-2 pr-10 text-left">
            <DialogTitle>Vérifier les doublons</DialogTitle>
            <DialogDescription>
              Comparaison insensible à la casse sur le symbole API (ticker), la référence et le symbole TradingView.
              Deux lignes ou plus avec la même valeur dans l&apos;un de ces champs (non vide) sont signalées.
              Cochez les fiches à retirer puis supprimez-les en lot (gardez au moins une fiche par ligne si vous voulez conserver l&apos;actif).
            </DialogDescription>
          </DialogHeader>

          {externalAssetDuplicateGroups.length > 0 ? (
            <div className="flex min-h-0 flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={preselectDuplicateExtrasKeepOldestPerGroup}
                  title="Pour chaque groupe de doublons : laisse décochée la fiche la plus ancienne (date de création), coche toutes les autres pour les supprimer en un clic."
                >
                  Cocher les doublons (garder 1 par groupe)
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={selectAllDuplicatesInModal}>
                  Tout sélectionner
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDuplicateDeleteSelection(new Set())}
                  disabled={duplicateDeleteSelection.size === 0}
                >
                  Effacer la sélection
                </Button>
                <span className="text-slate-500">
                  {duplicateDeleteSelection.size} sélectionné(s) sur {duplicateModalSelectableIds.length}
                </span>
              </div>
              <p className="text-xs leading-snug text-slate-500">
                Raccourci : « Cocher les doublons… » conserve la fiche <span className="font-medium text-slate-600">la plus ancienne</span> de chaque groupe (selon la date de création) et coche les fiches en trop.
              </p>
            </div>
          ) : null}

          {externalAssetDuplicateGroups.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
                Aucun doublon détecté sur la liste actuelle des actifs.
              </p>
            </div>
          ) : (
            <div
              className="min-h-0 flex-1 overflow-y-scroll overflow-x-hidden overscroll-y-contain rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-2 pr-3 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_rgb(248_250_252)]"
            >
              <div className="space-y-6">
                {externalAssetDuplicateGroups.map((group) => (
                  <div
                    key={`${group.kind}-${group.key}`}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-800">
                          {EXTERNAL_ASSET_DUPLICATE_KIND_LABELS[group.kind]}
                        </span>
                        <span className="font-mono text-slate-600">{group.key}</span>
                        <span className="text-slate-500">({group.assets.length} fiches)</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => selectDuplicateGroupAssets(group)}>
                        Sélectionner ce groupe
                      </Button>
                    </div>
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                      {group.assets.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={duplicateDeleteSelection.has(a.id)}
                            onChange={() => toggleDuplicateDeleteSelect(a.id)}
                            className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-slate-900"
                            aria-label={`Sélectionner ${a.name || a.id} pour suppression`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900">{a.name || '—'}</div>
                            <div className="text-xs text-slate-500">
                              ID {a.id}
                              {a.alphaVantageSymbol ? ` · ${a.alphaVantageSymbol}` : ''}
                              {a.reference ? ` · réf. ${a.reference}` : ''}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsDuplicatesModalOpen(false);
                              handleOpenDialog(a);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Modifier
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 flex-col gap-3 sm:gap-3">
            {externalAssetDuplicateGroups.length > 0 ? (
              <>
                <div className="flex w-full flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={duplicateDeleteSelection.size === 0 || deletingDuplicateSelection}
                    className="w-full sm:w-auto"
                    onClick={() =>
                      void handleBulkDeleteDuplicateSelection(Array.from(duplicateDeleteSelection))
                    }
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deletingDuplicateSelection
                      ? 'Suppression…'
                      : `Supprimer la sélection (${duplicateDeleteSelection.size})`}
                  </Button>
                  <p className="text-xs text-slate-500 sm:max-w-xs sm:text-right">
                    Les actifs encore liés à des clients peuvent être refusés par l&apos;API ; vérifiez les messages d&apos;erreur.
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDuplicateRowHighlight(true)}
                    >
                      Surligner dans le tableau
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setDuplicateRowHighlight(false)}>
                      Masquer le surlignage
                    </Button>
                  </div>
                  <Button type="button" variant="default" onClick={() => setIsDuplicatesModalOpen(false)}>
                    Fermer
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" variant="default" className="w-full sm:w-auto sm:ml-auto" onClick={() => setIsDuplicatesModalOpen(false)}>
                Fermer
              </Button>
            )}
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import from Index Modal */}
      <BulkImportFromIndexModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        onSuccess={() => {
          loadAssets();
          setIsBulkImportModalOpen(false);
        }}
      />

    </div>
  );
}
