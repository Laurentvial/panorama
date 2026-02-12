import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Plus, Search, Trash2, Pencil, X, RefreshCw, TrendingUp, TrendingDown } from '../utils/iconMapping';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/Modal.css';
import '../styles/PageHeader.css';

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

export function ManageAssets() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTypeTab, setActiveTypeTab] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
    
    // Refresh asset prices every 2 minutes (scheduler runs every 10 minutes)
    const priceRefreshInterval = setInterval(() => {
      loadAssets();
    }, 120000); // 2 minutes
    
    // Cleanup function to clear timeout and interval on unmount
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      clearInterval(priceRefreshInterval);
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
      { value: 'or', label: `Or`, typeKey: canonicalTypeKey('Or') },
      { value: 'argent', label: `Argent`, typeKey: canonicalTypeKey('Argent') },
      { value: 'petrole', label: `Petrole`, typeKey: canonicalTypeKey('Pétrole') },
      { value: 'gaz', label: `Gaz`, typeKey: canonicalTypeKey('Gaz') },
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

  async function handleSelectSearchResult(result: any) {
    // Set selected result
    setSelectedSearchResult(result);
    
    // Prefill form with selected result
    const isCommodityMode =
      (searchAssetType || '').toLowerCase().includes('matière') ||
      (searchAssetType || '').toLowerCase().includes('matiere');

    // CRM Type:
    // - Spot commodities (XAU/XAG): use underlying ("Or"/"Argent") so it matches CRM options.
    // - Commodity ETFs/proxies: keep "Matière première" and store underlying in subcategory.
    // - Others: infer from Alpha Vantage type.
    const assetType = isCommodityMode
      ? (result.type === 'Spot' && result.commodity_underlying ? result.commodity_underlying : 'Matière première')
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
      toast.success('Prix mis à jour avec succès');
      loadAssets();
    } catch (error: any) {
      console.error('Error updating price:', error);
      // Check if it's a rate limit issue (503 status or rate_limit_reached in response)
      if (error?.status === 503 || error?.response?.rate_limit_reached) {
        toast.warning('Limite de requêtes API atteinte (25/jour pour le plan gratuit). Veuillez réessayer demain.');
      } else {
        toast.error(error?.message || 'Erreur lors de la mise à jour du prix');
      }
    }
  }

  async function handleBulkUpdatePrices() {
    const assetsWithSymbols = assets.filter(a => a.alphaVantageSymbol);
    if (assetsWithSymbols.length === 0) {
      toast.error('Aucun actif avec symbole Alpha Vantage trouvé');
      return;
    }

    try {
      setUpdatingPrices(true);
      const assetIds = assetsWithSymbols.map(a => a.id);
      await apiCall('/api/assets/bulk-update-prices/', {
        method: 'POST',
        body: JSON.stringify({ assetIds }),
        headers: { 'Content-Type': 'application/json' }
      });
      bustAssetsCache();
      toast.success(`${assetsWithSymbols.length} prix mis à jour`);
      loadAssets();
    } catch (error: any) {
      console.error('Error updating prices:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour des prix');
    } finally {
      setUpdatingPrices(false);
    }
  }

  const filteredAssets = assets.filter(asset => {
    const searchLower = searchTerm.toLowerCase();
    // Apply type tab filter first (then search).
    if (activeTypeTab !== 'all') {
      const tab = assetTypeTabs.find((t) => t.value === activeTypeTab) || null;
      const assetTypeKey = canonicalTypeKey(asset?.type);
      if (tab && tab.typeKey !== 'all' && assetTypeKey !== tab.typeKey) {
        return false;
      }
      // If we somehow have a selected tab but can't resolve it, fallback to showing all.
    }
    return (
      asset.name?.toLowerCase().includes(searchLower) ||
      asset.type?.toLowerCase().includes(searchLower) ||
      asset.reference?.toLowerCase().includes(searchLower) ||
      asset.category?.toLowerCase().includes(searchLower) ||
      asset.subcategory?.toLowerCase().includes(searchLower)
    );
  });

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
            onClick={handleBulkUpdatePrices}
            disabled={updatingPrices || assets.filter(a => a.alphaVantageSymbol).length === 0}
          >
            {/* @ts-ignore - react-icons accepts className at runtime */}
            <RefreshCw className={`w-4 h-4 mr-2 ${updatingPrices ? 'animate-spin' : ''}`} />
            Mettre à jour les prix
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            {/* @ts-ignore - react-icons accepts className at runtime */}
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un actif
          </Button>
        </div>
      </div>

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

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
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
                    <th className="text-left p-2 font-medium text-slate-700">Type</th>
                    <th className="text-left p-2 font-medium text-slate-700">Nom</th>
                    <th className="text-left p-2 font-medium text-slate-700">Référence</th>
                    <th className="text-left p-2 font-medium text-slate-700">Symbole Ticker</th>
                    <th className="text-left p-2 font-medium text-slate-700">Prix</th>
                    <th className="text-left p-2 font-medium text-slate-700">Variation</th>
                    <th className="text-left p-2 font-medium text-slate-700">Catégorie</th>
                    <th className="text-left p-2 font-medium text-slate-700">Sous-catégorie</th>
                    <th className="text-left p-2 font-medium text-slate-700">Par défaut</th>
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id} className="border-b hover:bg-slate-50">
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
                          <span className="font-semibold">${parseFloat(asset.lastPrice).toFixed(2)}</span>
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
                              {parseFloat(asset.priceChange) >= 0 ? '+' : ''}{parseFloat(asset.priceChange).toFixed(2)}
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
                              title="Mettre à jour le prix"
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
                    <SelectItem value="Matière première">Matière première</SelectItem>
                    <SelectItem value="Or">Or</SelectItem>
                    <SelectItem value="Argent">Argent</SelectItem>
                    <SelectItem value="Pétrole">Pétrole</SelectItem>
                    <SelectItem value="Gaz">Gaz</SelectItem>
                    
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
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleUploadLogo}
                              disabled={uploadingLogo}
                              className="w-full"
                            >
                              {uploadingLogo ? 'Téléchargement...' : 'Télécharger le logo'}
                            </Button>
                          )}
                          {!editingAsset && (
                            <p className="text-sm text-blue-600">
                              Le logo sera téléchargé automatiquement après la création de l'actif.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Input
                          id="asset-logo-file"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileChange}
                          className="cursor-pointer"
                          disabled={uploadingLogo}
                        />
                        {formData.logoUrl && (
                          <p className="text-xs text-green-600 mt-2">
                            ✓ Logo téléchargé avec succès
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {editingAsset 
                      ? 'Téléchargez un logo manuellement si l\'API ne l\'a pas trouvé. Formats acceptés: JPG, PNG, GIF (max 5MB)'
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
                  <Input
                    id="exchange"
                    value={formData.exchange}
                    onChange={(e) => setFormData({ ...formData, exchange: e.target.value.toUpperCase() })}
                    placeholder="Ex: NASDAQ, NYSE, BINANCE, EURONEXT..."
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Pour les cryptos, utilisez généralement "BINANCE". Pour les actions US: "NASDAQ" ou "NYSE". Pour l'Europe: "EURONEXT", "LSE", etc.
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

    </div>
  );
}
