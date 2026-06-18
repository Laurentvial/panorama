import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import { TrendingUp, Plus, Trash2, X, Star, SlidersHorizontal } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { AssetAvailabilityModal } from './AssetAvailabilityModal';
import { ProductAvailabilityModal } from './ProductAvailabilityModal';
import '../styles/Modal.css';

interface ClientAssetsTabProps {
  clientId: string;
  clientAssets: any[];
  availableAssets: any[];
  clientProducts: any[];
  availableProducts: any[];
  onRefresh: () => void;
}

export function ClientAssetsTab({ clientId, clientAssets, availableAssets, clientProducts, availableProducts, onRefresh }: ClientAssetsTabProps) {
  const [isAddAssetDialogOpen, setIsAddAssetDialogOpen] = useState(false);
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isProductAvailabilityModalOpen, setIsProductAvailabilityModalOpen] = useState(false);
  const [selectedClientAsset, setSelectedClientAsset] = useState<any>(null);
  const [selectedClientProduct, setSelectedClientProduct] = useState<any>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [localClientAssets, setLocalClientAssets] = useState<any[]>(clientAssets || []);
  const [localClientProducts, setLocalClientProducts] = useState<any[]>(clientProducts || []);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  // Add asset modal: filters + search + multi-select (modal-only; ne pas mélanger avec filterType/filterCategory du tableau)
  const [assetSearchQuery, setAssetSearchQuery] = useState<string>('');
  const [selectedAssetIdsInModal, setSelectedAssetIdsInModal] = useState<Set<string>>(new Set());
  const [filterAssetTypeInModal, setFilterAssetTypeInModal] = useState<string>('all');
  const [filterAssetCategoryInModal, setFilterAssetCategoryInModal] = useState<string>('all');
  const [filterAssetSubcategoryInModal, setFilterAssetSubcategoryInModal] = useState<string>('all');
  // Add product modal: multi-select state (productSearchQuery is modal-only)
  const [selectedProductIdsInModal, setSelectedProductIdsInModal] = useState<Set<string>>(new Set());
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  // Shared product filters for both table and add-product modal
  const [filterProductType, setFilterProductType] = useState<string>('all');
  const [filterProductCategory, setFilterProductCategory] = useState<string>('all');
  const [filterProductSubcategory, setFilterProductSubcategory] = useState<string>('all');

  useEffect(() => {
    setLocalClientAssets(clientAssets || []);
    setSelectedAssetIds(new Set());
  }, [clientAssets]);

  useEffect(() => {
    setLocalClientProducts(clientProducts || []);
    setSelectedProductIds(new Set());
  }, [clientProducts]);

  // Selection handlers for assets
  function handleSelectAsset(assetId: string) {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function handleSelectAllAssets(filteredAssets: any[]) {
    const visibleIds = filteredAssets.map((ca: any) => ca.asset?.id).filter(Boolean) as string[];
    if (selectedAssetIds.size === visibleIds.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(visibleIds));
    }
  }

  function handleClearAssetSelection() {
    setSelectedAssetIds(new Set());
  }

  // Selection handlers for products
  function handleSelectProduct(productId: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function handleSelectAllProducts(filteredProducts: any[]) {
    const visibleIds = filteredProducts
      .map((cp: any) => cp.product?.id)
      .filter(Boolean) as string[];
    if (selectedProductIds.size === visibleIds.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(visibleIds));
    }
  }

  function handleClearProductSelection() {
    setSelectedProductIds(new Set());
  }

  // Bulk delete handlers
  async function handleBulkRemoveAssets() {
    const count = selectedAssetIds.size;
    if (!confirm(`Retirer ${count} actif(s) sélectionné(s) du client ?`)) return;
    const previous = localClientAssets;
    const idsToRemove = new Set(selectedAssetIds);
    setLocalClientAssets((prev) => prev.filter((ca: any) => !idsToRemove.has(ca.asset?.id)));
    handleClearAssetSelection();
    try {
      await Promise.all(
        Array.from(selectedAssetIds).map((assetId) =>
          apiCall(`/api/clients/${clientId}/assets/${assetId}/`, { method: 'DELETE' })
        )
      );
      toast.success(`${count} actif(s) retiré(s) avec succès`);
      onRefresh();
    } catch (error) {
      setLocalClientAssets(previous);
      setSelectedAssetIds(idsToRemove);
      console.error('Error bulk removing assets:', error);
      toast.error('Erreur lors du retrait des actifs');
    }
  }

  async function handleBulkRemoveProducts() {
    const count = selectedProductIds.size;
    if (!confirm(`Retirer ${count} produit(s) sélectionné(s) du client ?`)) return;
    const previous = localClientProducts;
    const idsToRemove = new Set(selectedProductIds);
    setLocalClientProducts((prev) => prev.filter((cp: any) => !idsToRemove.has(cp.product?.id)));
    handleClearProductSelection();
    try {
      await Promise.all(
        Array.from(selectedProductIds).map((productId) =>
          apiCall(`/api/clients/${clientId}/products/${productId}/`, { method: 'DELETE' })
        )
      );
      toast.success(`${count} produit(s) retiré(s) avec succès`);
      onRefresh();
    } catch (error) {
      setLocalClientProducts(previous);
      setSelectedProductIds(idsToRemove);
      console.error('Error bulk removing products:', error);
      toast.error('Erreur lors du retrait des produits');
    }
  }

  // Format date from YYYY-MM-DD to DD/MM/YYYY
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatEur = (value: any): string => {
    if (value === null || value === undefined || value === '') return '-';
    const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  };

  const formatSubscriptionText = (minEntry: any, maxEntry: any): string => {
    const hasMin = !(minEntry === null || minEntry === undefined || minEntry === '');
    const hasMax = !(maxEntry === null || maxEntry === undefined || maxEntry === '');
    if (hasMin && hasMax) return `${formatEur(minEntry)} → ${formatEur(maxEntry)}`;
    if (hasMin) return `À partir de ${formatEur(minEntry)}`;
    if (hasMax) return `Jusqu’à ${formatEur(maxEntry)}`;
    return '-';
  };

  const getProductSubcategoryList = (productSub: any): string[] => {
    if (Array.isArray(productSub)) return productSub.filter(Boolean).map(String);
    if (productSub === null || productSub === undefined || productSub === '') return [];
    return [String(productSub)];
  };

  const formatProductProfitability = (product: any): { main: string; sub?: string } => {
    if (!product) return { main: '-' };
    if (product.noProfitability === true) return { main: '-' };

    const profitNum =
      product.profitability === null || product.profitability === undefined || product.profitability === ''
        ? NaN
        : typeof product.profitability === 'number'
          ? product.profitability
          : parseFloat(String(product.profitability).replace(',', '.'));

    const isVariable = String(product.isVariableProfitability || '').toLowerCase() === 'oui';
    if (isVariable) {
      const maxNum =
        product.variableProfitability === null || product.variableProfitability === undefined || product.variableProfitability === ''
          ? NaN
          : typeof product.variableProfitability === 'number'
            ? product.variableProfitability
            : parseFloat(String(product.variableProfitability).replace(',', '.'));

      const hasMin = Number.isFinite(profitNum) && profitNum !== 0;
      const hasMax = Number.isFinite(maxNum) && maxNum !== 0;
      if (!hasMin && !hasMax) return { main: '-' };

      const minText = hasMin ? `${profitNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-';
      const maxText = hasMax ? `${maxNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-';
      return { main: `${minText} à ${maxText}`, sub: product.profitabilityPeriod || undefined };
    }

    if (!Number.isFinite(profitNum) || profitNum === 0) return { main: '-' };
    return {
      main: `${profitNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`,
      sub: product.profitabilityPeriod || undefined,
    };
  };

  const openAvailabilityModal = (clientAsset: any) => {
    setSelectedClientAsset(clientAsset);
    setIsAvailabilityModalOpen(true);
  };

  const openProductAvailabilityModal = (clientProduct: any) => {
    setSelectedClientProduct(clientProduct);
    setIsProductAvailabilityModalOpen(true);
  };

  function closeAddAssetModal() {
    setIsAddAssetDialogOpen(false);
    setAssetSearchQuery('');
    setSelectedAssetIdsInModal(new Set());
    setFilterAssetTypeInModal('all');
    setFilterAssetCategoryInModal('all');
    setFilterAssetSubcategoryInModal('all');
  }

  async function handleAddAssets(assetIds: string[]) {
    if (assetIds.length === 0) return;
    const baseTime = Date.now();
    const assetsToAdd = assetIds
      .map((id) => availableAssets.find((a: any) => a.id === id))
      .filter(Boolean) as any[];
    const tempItems = assetsToAdd.map((asset: any, i: number) => ({
      id: `pending-${asset.id}-${baseTime}-${i}`,
      asset,
      featured: false,
    }));
    setLocalClientAssets((prev) => [...prev, ...tempItems]);
    closeAddAssetModal();
    let addedCount = 0;
    let skippedCount = 0;
    try {
      const results = await Promise.allSettled(
        assetIds.map((assetId) =>
          apiCall(`/api/clients/${clientId}/assets/add/`, {
            method: 'POST',
            body: JSON.stringify({ assetId }),
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      results.forEach((result) => {
        if (result.status === 'fulfilled') addedCount++;
        else {
          const err = (result as PromiseRejectedResult).reason;
          const msg = String(err?.message || err || '');
          if (msg.includes('already') || msg.includes('déjà') || msg.includes('assign')) skippedCount++;
        }
      });
      onRefresh();
      if (skippedCount > 0) {
        toast.success(`${addedCount} actif(s) ajouté(s), ${skippedCount} déjà assigné(s)`);
      } else {
        toast.success(`${addedCount} actif(s) ajouté(s) avec succès`);
      }
    } catch (error: any) {
      onRefresh();
      console.error('Error adding assets:', error);
      toast.error(error.message || "Erreur lors de l'ajout des actifs");
    }
  }

  function closeAddProductModal() {
    setIsAddProductDialogOpen(false);
    setSelectedProductIdsInModal(new Set());
    setProductSearchQuery('');
  }

  async function handleAddProducts(productIds: string[]) {
    if (productIds.length === 0) return;
    const productsToAdd = productIds.map((id) => availableProducts.find((p: any) => p.id === id)).filter(Boolean);
    const tempItems = productsToAdd.map((product: any) => ({
      id: `pending-${product.id}-${Date.now()}`,
      product,
      featured: false,
      showRates: true,
    }));
    setLocalClientProducts((prev) => [...prev, ...tempItems]);
    closeAddProductModal();
    let addedCount = 0;
    let skippedCount = 0;
    try {
      const results = await Promise.allSettled(
        productIds.map((productId) =>
          apiCall(`/api/clients/${clientId}/products/add/`, {
            method: 'POST',
            body: JSON.stringify({ productId }),
            headers: { 'Content-Type': 'application/json' }
          })
        )
      );
      results.forEach((result) => {
        if (result.status === 'fulfilled') addedCount++;
        else {
          const err = (result as PromiseRejectedResult).reason;
          const msg = String(err?.message || err || '');
          if (msg.includes('already has') || msg.includes('déjà')) skippedCount++;
        }
      });
      onRefresh();
      if (skippedCount > 0) {
        toast.success(`${addedCount} produit(s) ajouté(s), ${skippedCount} déjà assigné(s)`);
      } else {
        toast.success(`${addedCount} produit(s) ajouté(s) avec succès`);
      }
    } catch (error: any) {
      onRefresh();
      console.error('Error adding products:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout des produits');
    }
  }

  async function handleRemoveAsset(assetId: string) {
    if (!confirm('Retirer cet actif du client ?')) return;
    const previous = localClientAssets;
    setLocalClientAssets((prev) => prev.filter((ca: any) => ca.asset?.id !== assetId));
    try {
      await apiCall(`/api/clients/${clientId}/assets/${assetId}/`, { method: 'DELETE' });
      toast.success('Actif retiré avec succès');
      onRefresh();
    } catch (error) {
      setLocalClientAssets(previous);
      console.error('Error removing asset:', error);
      toast.error('Erreur lors du retrait de l\'actif');
    }
  }

  async function handleRemoveProduct(productId: string) {
    if (!confirm('Retirer ce produit du client ?')) return;
    const previous = localClientProducts;
    setLocalClientProducts((prev) => prev.filter((cp: any) => cp.product?.id !== productId));
    try {
      await apiCall(`/api/clients/${clientId}/products/${productId}/`, { method: 'DELETE' });
      toast.success('Produit retiré avec succès');
      onRefresh();
    } catch (error) {
      setLocalClientProducts(previous);
      console.error('Error removing product:', error);
      toast.error('Erreur lors du retrait du produit');
    }
  }

  async function handleToggleFeaturedAsset(clientAssetId: string, assetId: string, currentFeatured: boolean) {
    const nextFeatured = !currentFeatured;
    setLocalClientAssets((prev) =>
      prev.map((ca: any) =>
        String(ca?.id) === String(clientAssetId)
          ? { ...ca, featured: nextFeatured }
          : ca
      )
    );

    try {
      await apiCall(`/api/clients/${clientId}/assets/${assetId}/toggle-featured/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success(currentFeatured ? 'Actif ne sera plus mis en avant' : 'Actif mis en avant');
    } catch (error: any) {
      // Rollback optimistic update on error
      setLocalClientAssets((prev) =>
        prev.map((ca: any) =>
          String(ca?.id) === String(clientAssetId)
            ? { ...ca, featured: currentFeatured }
            : ca
        )
      );
      console.error('Error toggling featured:', error);
      toast.error(error.message || 'Erreur lors de la modification');
    }
  }

  async function handleToggleFeaturedProduct(clientProductId: string, productId: string, currentFeatured: boolean) {
    const nextFeatured = !currentFeatured;
    setLocalClientProducts((prev) =>
      prev.map((cp: any) =>
        String(cp?.id) === String(clientProductId)
          ? { ...cp, featured: nextFeatured }
          : cp
      )
    );

    try {
      await apiCall(`/api/clients/${clientId}/products/${productId}/toggle-featured/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success(currentFeatured ? 'Produit ne sera plus mis en avant' : 'Produit mis en avant');
    } catch (error: any) {
      // Rollback optimistic update on error
      setLocalClientProducts((prev) =>
        prev.map((cp: any) =>
          String(cp?.id) === String(clientProductId)
            ? { ...cp, featured: currentFeatured }
            : cp
        )
      );
      console.error('Error toggling featured:', error);
      toast.error(error.message || 'Erreur lors de la modification');
    }
  }

  async function handleToggleProductRates(clientProductId: string, productId: string, currentShowRates: boolean) {
    const nextShowRates = !currentShowRates;
    setLocalClientProducts((prev) =>
      prev.map((cp: any) =>
        String(cp?.id) === String(clientProductId)
          ? { ...cp, showRates: nextShowRates }
          : cp
      )
    );

    try {
      await apiCall(`/api/clients/${clientId}/products/${productId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showRates: nextShowRates }),
      });
      toast.success(nextShowRates ? 'Taux affichés pour ce produit' : 'Taux masqués pour ce produit');
    } catch (error: any) {
      setLocalClientProducts((prev) =>
        prev.map((cp: any) =>
          String(cp?.id) === String(clientProductId)
            ? { ...cp, showRates: currentShowRates }
            : cp
        )
      );
      console.error('Error toggling product rates:', error);
      toast.error(error.message || 'Erreur lors de la modification des taux');
    }
  }

  function handleAssetAvailabilitySuccess(updatedClientAsset?: any) {
    if (!updatedClientAsset || typeof updatedClientAsset !== 'object') {
      onRefresh();
      return;
    }

    const updatedId = String(updatedClientAsset.id || '').trim();
    const updatedAssetId = String(updatedClientAsset.assetId || updatedClientAsset.asset?.id || '').trim();

    setLocalClientAssets((prev) =>
      prev.map((ca: any) => {
        const caId = String(ca?.id || '').trim();
        const caAssetId = String(ca?.assetId || ca?.asset?.id || '').trim();
        const sameClientAsset = updatedId && caId === updatedId;
        const sameAsset = updatedAssetId && caAssetId === updatedAssetId;
        return sameClientAsset || sameAsset ? { ...ca, ...updatedClientAsset } : ca;
      })
    );

    void onRefresh();
  }

  function handleProductAvailabilitySuccess(updatedClientProduct?: any) {
    if (!updatedClientProduct || typeof updatedClientProduct !== 'object') {
      onRefresh();
      return;
    }

    const updatedId = String(updatedClientProduct.id || '').trim();
    const updatedProductId = String(updatedClientProduct.productId || updatedClientProduct.product?.id || '').trim();

    setLocalClientProducts((prev) =>
      prev.map((cp: any) => {
        const cpId = String(cp?.id || '').trim();
        const cpProductId = String(cp?.productId || cp?.product?.id || '').trim();
        const sameClientProduct = updatedId && cpId === updatedId;
        const sameProduct = updatedProductId && cpProductId === updatedProductId;
        return sameClientProduct || sameProduct ? { ...cp, ...updatedClientProduct } : cp;
      })
    );

    // Background sync to keep local cache aligned with server.
    void onRefresh();
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="products" className="space-y-6">
        <TabsList>
          <TabsTrigger value="products">Produits</TabsTrigger>
          <TabsTrigger value="assets">Actifs</TabsTrigger>
        </TabsList>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <div className="space-y-6">
            <div className="flex justify-between items-center gap-4 flex-wrap">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Type d'actif" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    {Array.from(new Set(localClientAssets.map((ca: any) => ca.asset?.type).filter(Boolean) as string[])).map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les catégories</SelectItem>
                    {Array.from(new Set(localClientAssets.map((ca: any) => ca.asset?.category).filter(Boolean) as string[])).map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterSubcategory} onValueChange={setFilterSubcategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Sous-catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                    {Array.from(new Set(localClientAssets.map((ca: any) => ca.asset?.subcategory).filter(Boolean) as string[])).map((subcategory) => (
                      <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2">
                {selectedAssetIds.size > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleBulkRemoveAssets}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Retirer la sélection ({selectedAssetIds.size})
                  </Button>
                )}
                <Button 
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('Réinitialiser les actifs visibles par le client ? Cela retirera tous les actifs non par défaut et ajoutera tous les actifs par défaut.')) return;
                    
                    try {
                      const response = await apiCall(`/api/clients/${clientId}/assets/reset/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      toast.success(`Actifs réinitialisés : ${(response as any).added} ajouté(s), ${(response as any).removed} retiré(s)`);
                      onRefresh();
                    } catch (error: any) {
                      console.error('Error resetting assets:', error);
                      toast.error(error.message || 'Erreur lors de la réinitialisation des actifs');
                    }
                  }}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Réinitialiser les actifs
                </Button>
                <Button onClick={() => setIsAddAssetDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un actif
                </Button>
              </div>
            </div>

            {isAddAssetDialogOpen && (
              <div className="modal-overlay" onClick={closeAddAssetModal}>
                <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '50rem', maxHeight: '90vh' }}>
                  <div className="modal-header">
                    <h2 className="modal-title">Ajouter un actif</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={closeAddAssetModal}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>

                  <div className="space-y-4 mb-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="asset-filter-type">Type</Label>
                        <Select
                          value={filterAssetTypeInModal}
                          onValueChange={(value) => {
                            setFilterAssetTypeInModal(value);
                            setFilterAssetSubcategoryInModal('all');
                          }}
                        >
                          <SelectTrigger id="asset-filter-type">
                            <SelectValue placeholder="Tous les types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous les types</SelectItem>
                            {(Array.from(new Set(availableAssets.map((a: any) => a.type).filter(Boolean))) as string[])
                              .sort()
                              .map((type: string) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="asset-filter-category">Catégorie</Label>
                        <Select
                          value={filterAssetCategoryInModal}
                          onValueChange={(value) => {
                            setFilterAssetCategoryInModal(value);
                            setFilterAssetSubcategoryInModal('all');
                          }}
                        >
                          <SelectTrigger id="asset-filter-category">
                            <SelectValue placeholder="Toutes les catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les catégories</SelectItem>
                            {(
                              Array.from(
                                new Set(
                                  availableAssets
                                    .map((a: any) => a.category)
                                    .filter((c: any) => {
                                      if (!c) return false;
                                      const label = String(c).trim().toLowerCase();
                                      return !['sous catégorie', 'sous-catégorie', 'sous categorie'].includes(label);
                                    })
                                )
                              ) as string[]
                            )
                              .sort()
                              .map((cat: string) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="asset-filter-subcategory">Sous-catégorie</Label>
                        <Select value={filterAssetSubcategoryInModal} onValueChange={setFilterAssetSubcategoryInModal}>
                          <SelectTrigger id="asset-filter-subcategory">
                            <SelectValue placeholder="Toutes les sous-catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                            {(() => {
                              const assignedIds = new Set(localClientAssets.map((ca: any) => ca.asset?.id).filter(Boolean));
                              const unassigned = availableAssets.filter((a: any) => !assignedIds.has(a.id));
                              const filteredForSub = unassigned.filter(
                                (a: any) =>
                                  (filterAssetTypeInModal === 'all' || a.type === filterAssetTypeInModal) &&
                                  (filterAssetCategoryInModal === 'all' || a.category === filterAssetCategoryInModal)
                              );
                              return (Array.from(new Set(filteredForSub.map((a: any) => a.subcategory).filter(Boolean))) as string[])
                                .sort()
                                .map((sub: string) => (
                                  <SelectItem key={sub} value={sub}>
                                    {sub}
                                  </SelectItem>
                                ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="asset-search">Rechercher</Label>
                      <Input
                        id="asset-search"
                        type="text"
                        placeholder="Rechercher par nom, type, référence ou catégorie..."
                        value={assetSearchQuery}
                        onChange={(e) => setAssetSearchQuery(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {(() => {
                    const assignedIds = new Set(localClientAssets.map((ca: any) => ca.asset?.id).filter(Boolean));
                    const q = assetSearchQuery.trim().toLowerCase();
                    const filteredAssets = availableAssets.filter((asset: any) => {
                      if (assignedIds.has(asset.id)) return false;
                      const typeMatch = filterAssetTypeInModal === 'all' || asset.type === filterAssetTypeInModal;
                      const categoryMatch = filterAssetCategoryInModal === 'all' || asset.category === filterAssetCategoryInModal;
                      const subMatch = filterAssetSubcategoryInModal === 'all' || asset.subcategory === filterAssetSubcategoryInModal;
                      const searchMatch =
                        !q ||
                        (asset.name || '').toLowerCase().includes(q) ||
                        (asset.type || '').toLowerCase().includes(q) ||
                        (asset.reference || '').toLowerCase().includes(q) ||
                        (asset.category || '').toLowerCase().includes(q) ||
                        (asset.subcategory || '').toLowerCase().includes(q);
                      return typeMatch && categoryMatch && subMatch && searchMatch;
                    });
                    const availableIds = filteredAssets.map((a: any) => a.id);
                    const allAvailableSelected =
                      availableIds.length > 0 && availableIds.every((id: string) => selectedAssetIdsInModal.has(id));

                    return (
                      <>
                        {filteredAssets.length > 0 && (
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-600">
                              {filteredAssets.length} actif{filteredAssets.length > 1 ? 's' : ''} trouvé
                              {filteredAssets.length > 1 ? 's' : ''}
                            </span>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (allAvailableSelected) {
                                  setSelectedAssetIdsInModal((prev) => {
                                    const next = new Set(prev);
                                    availableIds.forEach((id: string) => next.delete(id));
                                    return next;
                                  });
                                } else {
                                  setSelectedAssetIdsInModal((prev) => {
                                    const next = new Set(prev);
                                    availableIds.forEach((id: string) => next.add(id));
                                    return next;
                                  });
                                }
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              {allAvailableSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </a>
                          </div>
                        )}
                        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: '0.5rem' }}>
                          {filteredAssets.length > 0 ? (
                            <div className="space-y-2">
                              {filteredAssets.map((asset: any) => {
                                const isSelected = selectedAssetIdsInModal.has(asset.id);
                                return (
                                  <div
                                    key={asset.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                      isSelected
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        setSelectedAssetIdsInModal((prev) => {
                                          const next = new Set(prev);
                                          if (checked) next.add(asset.id);
                                          else next.delete(asset.id);
                                          return next;
                                        });
                                      }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-slate-900">{asset.name}</div>
                                      <div className="text-sm text-slate-500">
                                        {asset.type || 'Aucun'} • {asset.reference || 'Aucune référence'}
                                        {asset.category && ` • ${asset.category}`}
                                        {asset.subcategory && ` • ${asset.subcategory}`}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-500">
                              {assetSearchQuery.trim() || filterAssetTypeInModal !== 'all' || filterAssetCategoryInModal !== 'all' || filterAssetSubcategoryInModal !== 'all'
                                ? 'Aucun actif trouvé avec ces filtres'
                                : 'Aucun actif disponible à ajouter'}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <div className="modal-form-actions" style={{ marginTop: '1rem' }}>
                    <Button type="button" variant="outline" onClick={closeAddAssetModal}>
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleAddAssets(Array.from(selectedAssetIdsInModal))}
                      disabled={selectedAssetIdsInModal.size === 0}
                    >
                      Ajouter la sélection ({selectedAssetIdsInModal.size})
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="tab-section-title">Actifs visibles par le client</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Filter assets based on selected filters
                  const filteredAssets = localClientAssets.filter((clientAsset: any) => {
                    const asset = clientAsset.asset;
                    if (!asset) return false; // Skip if asset was deleted
                    const typeMatch = filterType === 'all' || asset.type === filterType;
                    const categoryMatch = filterCategory === 'all' || asset.category === filterCategory;
                    const subcategoryMatch = filterSubcategory === 'all' || asset.subcategory === filterSubcategory;
                    return typeMatch && categoryMatch && subcategoryMatch;
                  });

                  return filteredAssets.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="w-10 py-2 px-3 pr-0">
                              <Checkbox
                                checked={
                                  selectedAssetIds.size === 0
                                    ? false
                                    : selectedAssetIds.size === filteredAssets.length
                                    ? true
                                    : 'indeterminate'
                                }
                                onCheckedChange={() => handleSelectAllAssets(filteredAssets)}
                                aria-label="Tout sélectionner"
                              />
                            </th>
                            <th className="text-left py-2 px-3">Type</th>
                            <th className="text-left py-2 px-3">Nom</th>
                            <th className="text-left py-2 px-3">Référence</th>
                            <th className="text-left py-2 px-3">Catégorie</th>
                            <th className="text-left py-2 px-3">Sous-catégorie</th>
                            <th className="text-center py-2 px-3">Mis en avant</th>
                            <th className="text-left py-2 px-3">Dates de disponibilité</th>
                            <th className="text-left py-2 px-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAssets.map((clientAsset: any) => {
                            const asset = clientAsset.asset;
                            if (!asset) return null; // Skip if asset was deleted
                            const isFeatured = clientAsset.featured || false;
                            return (
                              <tr key={clientAsset.id} className="border-b border-slate-100">
                                <td className="w-10 py-2 px-3 pr-0">
                                  <Checkbox
                                    checked={selectedAssetIds.has(asset.id)}
                                    onCheckedChange={() => handleSelectAsset(asset.id)}
                                    aria-label={`Sélectionner ${asset.name}`}
                                  />
                                </td>
                                <td className="py-2 px-3">{asset.type || '-'}</td>
                                <td className="py-2 px-3">{asset.name || '-'}</td>
                                <td className="py-2 px-3">{asset.reference || '-'}</td>
                                <td className="py-2 px-3">{asset.category || '-'}</td>
                                <td className="py-2 px-3">{asset.subcategory || '-'}</td>
                                <td className="py-2 px-3 text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleFeaturedAsset(clientAsset.id, asset.id, isFeatured)}
                                    className="p-1 hover:bg-transparent cursor-pointer"
                                  >
                                    {isFeatured ? (
                                      <Star 
                                        className="w-5 h-5 transition-colors"
                                        fill="#facc15"
                                        stroke="#facc15"
                                      />
                                    ) : (
                                      <Star 
                                        className="w-5 h-5 transition-colors text-slate-400 hover:text-yellow-300"
                                        fill="none"
                                        stroke="currentColor"
                                      />
                                    )}
                                  </Button>
                                </td>
                                <td className="py-2 px-3">
                                  {clientAsset.availabilityStart || clientAsset.availabilityEnd ? (
                                    <div className="text-xs">
                                      {clientAsset.availabilityStart && (
                                        <div>Début: {formatDate(clientAsset.availabilityStart)}</div>
                                      )}
                                      {clientAsset.availabilityEnd && (
                                        <div>Fin: {formatDate(clientAsset.availabilityEnd)}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs">Toujours visible</span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openAvailabilityModal(clientAsset)}
                                      className="text-blue-600"
                                      title="Configurer (disponibilité + personnalisation)"
                                    >
                                      <SlidersHorizontal className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveAsset(asset.id)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : localClientAssets.length > 0 ? (
                    <p className="text-sm text-slate-500">Aucun actif ne correspond aux filtres sélectionnés</p>
                  ) : (
                    <p className="text-sm text-slate-500">Aucun actif assigné</p>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products">
          <div className="space-y-6">
            <div className="flex justify-between items-center gap-4 flex-wrap">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <Select value={filterProductType} onValueChange={setFilterProductType}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Type de produit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    {Array.from(new Set(localClientProducts.map((cp: any) => cp.product?.type).filter(Boolean) as string[])).sort().map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterProductCategory} onValueChange={(value) => {
                  setFilterProductCategory(value);
                  setFilterProductSubcategory('all');
                }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les catégories</SelectItem>
                    {Array.from(new Set(localClientProducts.map((cp: any) => cp.product?.categoryTitle || cp.product?.category?.title).filter(Boolean) as string[])).sort().map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterProductSubcategory} onValueChange={setFilterProductSubcategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Sous-catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                    {(() => {
                      const filteredForSub = localClientProducts.filter(
                        (cp: any) => cp.product && (filterProductCategory === 'all' || (cp.product.categoryTitle || cp.product.category?.title) === filterProductCategory)
                      );
                      const subs = new Set<string>();
                      filteredForSub.forEach((cp: any) => {
                        const sub = cp.product?.subcategory;
                        if (Array.isArray(sub)) sub.forEach((s: string) => s && subs.add(s));
                        else if (sub) subs.add(String(sub));
                      });
                      return Array.from(subs).sort().map((sub) => (
                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {selectedProductIds.size > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleBulkRemoveProducts}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Retirer la sélection ({selectedProductIds.size})
                  </Button>
                )}
                <Button 
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('Réinitialiser les produits visibles par le client ? Cela retirera tous les produits non par défaut et ajoutera tous les produits par défaut.')) return;
                    
                    try {
                      const response = await apiCall(`/api/clients/${clientId}/products/reset/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      toast.success(`Produits réinitialisés : ${(response as any).added} ajouté(s), ${(response as any).removed} retiré(s)`);
                      onRefresh();
                    } catch (error: any) {
                      console.error('Error resetting products:', error);
                      toast.error(error.message || 'Erreur lors de la réinitialisation des produits');
                    }
                  }}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Réinitialiser les produits
                </Button>
                <Button onClick={() => setIsAddProductDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter des produits
                </Button>
              </div>
            </div>

            {isAddProductDialogOpen && (
              <div className="modal-overlay" onClick={closeAddProductModal}>
                <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '50rem', maxHeight: '90vh' }}>
                  <div className="modal-header">
                    <h2 className="modal-title">Ajouter des produits</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={closeAddProductModal}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="space-y-4 mb-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="product-filter-type">Type</Label>
                        <Select
                          value={filterProductType}
                          onValueChange={(value) => {
                            setFilterProductType(value);
                            setFilterProductSubcategory('all');
                          }}
                        >
                          <SelectTrigger id="product-filter-type">
                            <SelectValue placeholder="Tous les types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous les types</SelectItem>
                            {(Array.from(new Set(availableProducts.map((p: any) => p.type).filter(Boolean))) as string[]).sort().map((type: string) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-filter-category">Catégorie</Label>
                        <Select
                          value={filterProductCategory}
                          onValueChange={(value) => {
                            setFilterProductCategory(value);
                            setFilterProductSubcategory('all');
                          }}
                        >
                          <SelectTrigger id="product-filter-category">
                            <SelectValue placeholder="Toutes les catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les catégories</SelectItem>
                            {(Array.from(new Set(availableProducts.map((p: any) => p.categoryTitle || p.category?.title).filter(Boolean))) as string[]).sort().map((cat: string) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-filter-subcategory">Sous-catégorie</Label>
                        <Select
                          value={filterProductSubcategory}
                          onValueChange={setFilterProductSubcategory}
                        >
                          <SelectTrigger id="product-filter-subcategory">
                            <SelectValue placeholder="Toutes les sous-catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                            {(() => {
                              const filteredForSub = availableProducts.filter(
                                (p: any) => p.status === 'Actif' && (filterProductCategory === 'all' || (p.categoryTitle || p.category?.title) === filterProductCategory)
                              );
                              const allSubcategories = filteredForSub.flatMap((p: any) => getProductSubcategoryList(p.subcategory));
                              return (Array.from(new Set(allSubcategories)).sort() as string[]).map((sub: string) => (
                                <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-search">Rechercher</Label>
                      <Input
                        id="product-search"
                        placeholder="Rechercher par nom ou référence..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Product list */}
                  {(() => {
                    const assignedIds = new Set(localClientProducts.map((cp: any) => cp.product?.id).filter(Boolean));
                    const filteredProducts = availableProducts.filter((product: any) => {
                      if (assignedIds.has(product.id)) return false;
                      if (product.status !== 'Actif') return false;
                      const typeMatch = filterProductType === 'all' || product.type === filterProductType;
                      const catTitle = product.categoryTitle || product.category?.title;
                      const categoryMatch = filterProductCategory === 'all' || catTitle === filterProductCategory;
                      const productSubList = getProductSubcategoryList(product.subcategory);
                      const subMatch = filterProductSubcategory === 'all' || productSubList.includes(filterProductSubcategory);
                      const q = productSearchQuery.trim().toLowerCase();
                      const searchMatch = !q || (product.name || '').toLowerCase().includes(q) || (product.reference || '').toLowerCase().includes(q);
                      return typeMatch && categoryMatch && subMatch && searchMatch;
                    });
                    const availableIds = filteredProducts.map((p: any) => p.id);
                    const allAvailableSelected = availableIds.length > 0 && availableIds.every((id: string) => selectedProductIdsInModal.has(id));

                    return (
                      <>
                        {filteredProducts.length > 0 && (
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-600">
                              {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} trouvé{filteredProducts.length > 1 ? 's' : ''}
                            </span>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (allAvailableSelected) {
                                  setSelectedProductIdsInModal((prev) => {
                                    const next = new Set(prev);
                                    availableIds.forEach((id: string) => next.delete(id));
                                    return next;
                                  });
                                } else {
                                  setSelectedProductIdsInModal((prev) => {
                                    const next = new Set(prev);
                                    availableIds.forEach((id: string) => next.add(id));
                                    return next;
                                  });
                                }
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              {allAvailableSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </a>
                          </div>
                        )}
                        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: '0.5rem' }}>
                          {filteredProducts.length > 0 ? (
                            <div className="space-y-2">
                              {filteredProducts.map((product: any) => {
                                const isSelected = selectedProductIdsInModal.has(product.id);
                                const profitability = formatProductProfitability(product);
                                const minEntry = product.minEntryValue;
                                const maxEntry = product.maxEntryValue;
                                const subscriptionText = formatSubscriptionText(minEntry, maxEntry);
                                return (
                                  <div
                                    key={product.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                      isSelected
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        setSelectedProductIdsInModal((prev) => {
                                          const next = new Set(prev);
                                          if (checked) next.add(product.id);
                                          else next.delete(product.id);
                                          return next;
                                        });
                                      }}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium text-slate-900">{product.name}</div>
                                      <div className="text-sm text-slate-500">
                                        {product.reference && `${product.reference} • `}
                                        {product.type || 'Aucun'}
                                        {(product.categoryTitle || product.category?.title) && ` • ${product.categoryTitle || product.category?.title}`}
                                        {product.subcategory && ` • ${product.subcategory}`}
                                      </div>
                                      <div className="text-xs text-slate-600 mt-1 flex flex-wrap">
                                        <span>
                                          <span className="text-slate-500">Rentabilité:</span>{' '}{profitability.main}
                                        </span>
                                        <span>{' • '}</span>
                                        <span>
                                          <span className="text-slate-500">Souscription:</span>{' '}{subscriptionText}
                                        </span>
                                        <span>{' • '}</span>
                                        <span>
                                          <span className="text-slate-500">Durée:</span>{' '}{product.duration || '-'}
                                        </span>
                                        {profitability.sub && (
                                          <>
                                            <span>{' • '}</span>
                                            <span>
                                              <span className="text-slate-500">Période:</span>{' '}{profitability.sub}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-500">Aucun produit trouvé avec ces filtres</div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <div className="modal-form-actions" style={{ marginTop: '1rem' }}>
                    <Button type="button" variant="outline" onClick={closeAddProductModal}>
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleAddProducts(Array.from(selectedProductIdsInModal))}
                      disabled={selectedProductIdsInModal.size === 0}
                    >
                      Ajouter la sélection ({selectedProductIdsInModal.size})
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="tab-section-title">Produits visibles par le client</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const filteredProducts = localClientProducts.filter((clientProduct: any) => {
                    const product = clientProduct.product;
                    if (!product) return false;
                    const typeMatch = filterProductType === 'all' || product.type === filterProductType;
                    const categoryMatch = filterProductCategory === 'all' || (product.categoryTitle || product.category?.title) === filterProductCategory;
                    const productSub = product.subcategory;
                    const productSubList = Array.isArray(productSub) ? productSub : (productSub ? [productSub] : []);
                    const subcategoryMatch = filterProductSubcategory === 'all' || productSubList.includes(filterProductSubcategory) || productSub === filterProductSubcategory;
                    return typeMatch && categoryMatch && subcategoryMatch;
                  });
                  return (
                    filteredProducts.length > 0 ? (
                      <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="w-10 py-2 px-3 pr-0">
                            <Checkbox
                              checked={
                                selectedProductIds.size === 0
                                  ? false
                                  : selectedProductIds.size === filteredProducts.length
                                  ? true
                                  : 'indeterminate'
                              }
                              onCheckedChange={() => handleSelectAllProducts(filteredProducts)}
                              aria-label="Tout sélectionner"
                            />
                          </th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Nom</th>
                          <th className="text-left py-2 px-3">Référence</th>
                          <th className="text-left py-2 px-3">Rentabilité</th>
                          <th className="text-left py-2 px-3">Souscription</th>
                          <th className="text-left py-2 px-3">Durée</th>
                          <th className="text-left py-2 px-3">Statut</th>
                          <th className="text-center py-2 px-3">Mis en avant</th>
                          <th className="text-center py-2 px-3">Afficher les taux</th>
                          <th className="text-left py-2 px-3">Dates de disponibilité</th>
                          <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((clientProduct: any) => {
                          const product = clientProduct.product;
                          if (!product) return null; // Skip if product was deleted
                          const isFeatured = clientProduct.featured || false;
                          const showRates = clientProduct.showRates !== false;
                          const profitability = formatProductProfitability(product);
                          const minEntry = product.minEntryValue;
                          const maxEntry = product.maxEntryValue;
                          const subscriptionText = formatSubscriptionText(minEntry, maxEntry);
                          return (
                            <tr key={clientProduct.id} className="border-b border-slate-100">
                              <td className="w-10 py-2 px-3 pr-0">
                                <Checkbox
                                  checked={selectedProductIds.has(product.id)}
                                  onCheckedChange={() => handleSelectProduct(product.id)}
                                  aria-label={`Sélectionner ${product.name}`}
                                />
                              </td>
                              <td className="py-2 px-3">{product.type || '-'}</td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{product.name || '-'}</span>
                                  {clientProduct.isCustomized ? (
                                    <Badge variant="secondary" className="text-xs font-normal">
                                      Personnalisé
                                    </Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-3">{product.reference || '-'}</td>
                              <td className="py-2 px-3">
                                <div className="text-sm text-slate-900">{profitability.main}</div>
                                {profitability.sub && (
                                  <div className="text-xs text-slate-500">{profitability.sub}</div>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <div className="text-sm text-slate-900">{subscriptionText}</div>
                                {(product.availableFunds === true) && (
                                  <div className="text-xs text-slate-500">Fonds disponibles</div>
                                )}
                              </td>
                              <td className="py-2 px-3">{product.duration || '-'}</td>
                              <td className="py-2 px-3">{product.status || '-'}</td>
                              <td className="py-2 px-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleFeaturedProduct(clientProduct.id, product.id, isFeatured)}
                                  className="p-1 hover:bg-transparent cursor-pointer"
                                >
                                  {isFeatured ? (
                                    <Star 
                                      className="w-5 h-5 transition-colors"
                                      fill="#facc15"
                                      stroke="#facc15"
                                    />
                                  ) : (
                                    <Star 
                                      className="w-5 h-5 transition-colors text-slate-400 hover:text-yellow-300"
                                      fill="none"
                                      stroke="currentColor"
                                    />
                                  )}
                                </Button>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Checkbox
                                  checked={showRates}
                                  onCheckedChange={() => handleToggleProductRates(clientProduct.id, product.id, showRates)}
                                  aria-label={`${showRates ? 'Masquer' : 'Afficher'} les taux de ${product.name}`}
                                />
                              </td>
                              <td className="py-2 px-3">
                                {clientProduct.availabilityStart || clientProduct.availabilityEnd ? (
                                  <div className="text-xs">
                                    {clientProduct.availabilityStart && (
                                      <div className="font-medium text-green-600">Client: {formatDate(clientProduct.availabilityStart)}</div>
                                    )}
                                    {clientProduct.availabilityEnd && (
                                      <div className="font-medium text-green-600">Fin: {formatDate(clientProduct.availabilityEnd)}</div>
                                    )}
                                  </div>
                                ) : (product.availabilityStart || product.availabilityEnd) ? (
                                  <div className="text-xs text-gray-500">
                                    {product.availabilityStart && (
                                      <div>Défaut: {formatDate(product.availabilityStart)}</div>
                                    )}
                                    {product.availabilityEnd && (
                                      <div>Fin: {formatDate(product.availabilityEnd)}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">Toujours visible</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openProductAvailabilityModal(clientProduct)}
                                    className="text-blue-600"
                                    title="Configurer (disponibilité + personnalisation)"
                                  >
                                    <SlidersHorizontal className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveProduct(product.id)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                      </div>
                    ) : localClientProducts.length > 0 ? (
                      <p className="text-sm text-slate-500">Aucun produit ne correspond aux filtres sélectionnés</p>
                    ) : (
                      <p className="text-sm text-slate-500">Aucun produit assigné</p>
                    )
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Asset Availability Modal */}
      {selectedClientAsset && (
        <AssetAvailabilityModal
          clientId={clientId}
          clientAsset={selectedClientAsset}
          isOpen={isAvailabilityModalOpen}
          onClose={() => {
            setIsAvailabilityModalOpen(false);
            setSelectedClientAsset(null);
          }}
          onSuccess={handleAssetAvailabilitySuccess}
        />
      )}

      {/* Product Availability Modal */}
      {selectedClientProduct && (
        <ProductAvailabilityModal
          clientId={clientId}
          clientProduct={selectedClientProduct}
          isOpen={isProductAvailabilityModalOpen}
          onClose={() => {
            setIsProductAvailabilityModalOpen(false);
            setSelectedClientProduct(null);
          }}
          onSuccess={handleProductAvailabilitySuccess}
        />
      )}
    </div>
  );
}
