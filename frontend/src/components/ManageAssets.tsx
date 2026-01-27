import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Plus, Search, Trash2, Pencil, X, RefreshCw, TrendingUp, TrendingDown } from '../utils/iconMapping';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/Modal.css';
import '../styles/PageHeader.css';

export function ManageAssets() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [formData, setFormData] = useState({
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
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Alpha Vantage search state (inside modal)
  const [alphaVantageSearch, setAlphaVantageSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<any>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAssets();
    
    // Cleanup function to clear timeout on unmount
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, []);

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
        logoUrl: asset.logoUrl || '',
        description: asset.description || '',
      });
    } else {
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
    }
    // Reset search when opening dialog
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
    
    // Check if alpha_vantage_symbol is provided
    if (!formData.alphaVantageSymbol || !formData.alphaVantageSymbol.trim()) {
      errors.push('⚠️ Le symbole Alpha Vantage est requis pour récupérer les prix en temps réel');
    }
    
    // Best-effort checks for external market data
    const assetType = formData.type?.toLowerCase() || '';
    const isCrypto = assetType.includes('crypto') || assetType.includes('cryptomonnaie');
    const isCommodity = assetType.includes('matière') || assetType.includes('matiere') || assetType.includes('commodity');
    
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
        // For stocks, validate exchange is a known exchange (best-effort)
        const usExchanges = ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'BATS'];
        const internationalExchanges = ['EURONEXT', 'LSE', 'TSE', 'ASX', 'SSE', 'SZSE', 'HKEX', 'XETR', 'FWB', 'SWX'];
        const validExchanges = [...usExchanges, ...internationalExchanges];
        
        if (!validExchanges.includes(exchange)) {
          errors.push(`⚠️ Exchange "${exchange}" non reconnu. Exemples: ${validExchanges.slice(0, 10).join(', ')}...`);
        }
      }
    }
    
    // If we have alpha_vantage_symbol, validate it
    if (formData.alphaVantageSymbol && formData.alphaVantageSymbol.trim()) {
      try {
        // Try to verify the symbol exists in Alpha Vantage
        const symbol = formData.alphaVantageSymbol.trim().toUpperCase();
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
    
    // Check logo URL (warning only, not blocking)
    if (!formData.logoUrl || !formData.logoUrl.trim()) {
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
        toast.success('Actif modifié avec succès');
      } else {
        // Use the import endpoint so we persist extra company info (description, market cap, etc.)
        // at creation time.
        const importPayload = {
          symbol: formData.alphaVantageSymbol,
          name: formData.name,
          type: formData.type,
          category: formData.category,
          subcategory: formData.subcategory,
          default: formData.default,
          exchange: formData.exchange,
          currency: selectedSearchResult?.currency || undefined,
          region: selectedSearchResult?.region || undefined,
          logoUrl: formData.logoUrl,
          description: formData.description,
        };

        await apiCall('/api/assets/create-from-alpha-vantage/', {
          method: 'POST',
          body: JSON.stringify(importPayload),
          headers: { 'Content-Type': 'application/json' }
        });
        toast.success('Actif créé avec succès');
      }
      handleCloseDialog();
      loadAssets();
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

    // Determine API type based on formData.type
    const assetType = formData.type?.toLowerCase() || '';
    const isCrypto = assetType === 'crypto' || assetType.includes('cryptomonnaie');
    const isCommodity =
      assetType.includes('matière') ||
      assetType.includes('matiere') ||
      assetType.includes('commodity') ||
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

  async function handleSelectSearchResult(result: any) {
    // Set selected result
    setSelectedSearchResult(result);
    
    // Prefill form with selected result
    const assetType = result.type === 'Crypto' ? 'Crypto' : 
                      result.type === 'Equity' ? 'Action' : 
                      result.type === 'ETF' ? 'ETF' : 
                      formData.type || 'Action';
    
    const isCrypto = assetType === 'Crypto' || assetType.toLowerCase().includes('crypto');
    
    // Determine exchange from result or infer from type
    let exchange = result.exchange || '';
    if (!exchange) {
      if (isCrypto) {
        exchange = 'BINANCE'; // Default for crypto
      } else if (result.region) {
        // Try to infer from region
        const region = result.region.toLowerCase();
        if (region.includes('united states') || region.includes('usa') || region.includes('us')) {
          exchange = 'NASDAQ'; // Default for US stocks
        } else if (region.includes('france') || region.includes('europe')) {
          exchange = 'EURONEXT';
        } else if (region.includes('uk') || region.includes('united kingdom')) {
          exchange = 'LSE';
        }
      }
    }
    
    let logoUrl = result.logo_url || '';
    
    // If logo is missing, try to fetch it
    if (!logoUrl && result.symbol) {
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
    
    setFormData({
      ...formData,
      name: result.name || result.symbol,
      reference: result.symbol,
      alphaVantageSymbol: result.symbol,
      exchange: exchange,
      type: assetType,
      category: result.region || formData.category,
      subcategory: result.type || formData.subcategory,
      logoUrl: logoUrl
    });
  }


  async function handleUpdatePrice(assetId: string) {
    try {
      const response = await apiCall(`/api/assets/${assetId}/update-price/`, { method: 'POST' });
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
                      value={formData.type}
                      onValueChange={(value) => {
                        setFormData({ ...formData, type: value });
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
                        <SelectItem value="Crypto">Crypto</SelectItem>
                        <SelectItem value="Obligation">Obligation</SelectItem>
                        <SelectItem value="Matière première">Matière première</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {formData.type && (
                    <div className="modal-form-field">
                        <Label htmlFor="alpha-vantage-search">
                          {formData.type === 'Crypto' 
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
                              formData.type === 'Crypto' 
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
                                  key={index}
                                  onClick={() => handleSelectSearchResult(result)}
                                  className={`p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors ${
                                    selectedSearchResult?.symbol === result.symbol ? 'bg-blue-50 border-blue-200' : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{result.name}</div>
                                      <div className="text-xs text-slate-500 font-mono">{result.symbol}</div>
                                      <div className="text-xs text-slate-400 mt-1">
                                        {result.type} • {result.region} • {result.currency}
                                      </div>
                                    </div>
                                    {result.price && (
                                      <div className="text-right ml-4 flex-shrink-0">
                                        <div className="font-semibold text-sm">${parseFloat(result.price).toFixed(2)}</div>
                                        {result.change !== undefined && (
                                          <div className={`text-xs ${parseFloat(result.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {parseFloat(result.change) >= 0 ? '+' : ''}{parseFloat(result.change).toFixed(2)}
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
                    <SelectItem value="Crypto">Crypto</SelectItem>
                    
                    {/* Fonds et ETF - Actifs externes du marché */}
                    <SelectItem value="ETF">ETF</SelectItem>
                    <SelectItem value="SICAV">SICAV</SelectItem>
                    <SelectItem value="FCP">FCP</SelectItem>
                    <SelectItem value="Fonds">Fonds</SelectItem>
                    <SelectItem value="Tracker">Tracker</SelectItem>
                    
                    {/* Obligations - Actifs externes du marché */}
                    <SelectItem value="Obligation">Obligation</SelectItem>
                    
                    {/* Matières premières - Actifs externes du marché */}
                    <SelectItem value="Matière première">Matière première</SelectItem>
                    <SelectItem value="Commodity">Commodity</SelectItem>
                    <SelectItem value="Or">Or</SelectItem>
                    <SelectItem value="Argent">Argent</SelectItem>
                    <SelectItem value="Pétrole">Pétrole</SelectItem>
                    <SelectItem value="Gaz">Gaz</SelectItem>
                    
                    {/* Devises - Actifs externes du marché */}
                    <SelectItem value="Devise">Devise</SelectItem>
                    <SelectItem value="Forex">Forex</SelectItem>
                    
                    {/* Indices - Actifs externes du marché */}
                    <SelectItem value="Indice">Indice</SelectItem>
                    
                    {/* Dérivés - Actifs externes du marché */}
                    <SelectItem value="Warrant">Warrant</SelectItem>
                    <SelectItem value="Option">Option</SelectItem>
                    <SelectItem value="Future">Future</SelectItem>
                    <SelectItem value="Dérivé">Dérivé</SelectItem>
                    
                    {/* Immobilier - Actifs externes du marché */}
                    <SelectItem value="REIT">REIT</SelectItem>
                    <SelectItem value="SCPI">SCPI</SelectItem>
                    <SelectItem value="OPCI">OPCI</SelectItem>
                    
                    {/* Autres actifs externes */}
                    <SelectItem value="Bourse">Bourse</SelectItem>
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
                            currency: selectedSearchResult?.currency || '',
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
