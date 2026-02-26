import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import { TrendingUp, Plus, Trash2, X, Star, Calendar } from 'lucide-react';
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

  const openAvailabilityModal = (clientAsset: any) => {
    setSelectedClientAsset(clientAsset);
    setIsAvailabilityModalOpen(true);
  };

  const openProductAvailabilityModal = (clientProduct: any) => {
    setSelectedClientProduct(clientProduct);
    setIsProductAvailabilityModalOpen(true);
  };

  async function handleAddAsset(assetId: string) {
    const asset = availableAssets.find((a: any) => a.id === assetId);
    const tempId = `pending-${assetId}-${Date.now()}`;
    if (asset) {
      setLocalClientAssets((prev) => [...prev, { id: tempId, asset, featured: false }]);
    }
    setIsAddAssetDialogOpen(false);
    try {
      await apiCall(`/api/clients/${clientId}/assets/add/`, {
        method: 'POST',
        body: JSON.stringify({ assetId }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Actif ajouté avec succès');
      onRefresh();
    } catch (error: any) {
      if (asset) {
        setLocalClientAssets((prev) => prev.filter((ca: any) => ca.id !== tempId));
      }
      console.error('Error adding asset:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout de l\'actif');
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
      featured: false
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
              <div className="modal-overlay" onClick={() => setIsAddAssetDialogOpen(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2 className="modal-title">Ajouter un actif</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={() => setIsAddAssetDialogOpen(false)}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>
                  <div className="modal-form">
                    <div className="modal-form-field">
                      <Label>Actif</Label>
                      <Select onValueChange={(value) => handleAddAsset(value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un actif" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAssets
                            .filter((asset: any) => !localClientAssets.some((ca: any) => ca.asset?.id === asset.id))
                            .map((asset: any) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.name} ({asset.type}) - {asset.reference || 'Aucun'}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="modal-form-actions">
                      <Button type="button" variant="outline" onClick={() => setIsAddAssetDialogOpen(false)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Actifs visibles par le client</CardTitle>
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
                                      title="Configurer les dates de disponibilité"
                                    >
                                      <Calendar className="w-4 h-4" />
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
                              return (Array.from(new Set(filteredForSub.map((p: any) => p.subcategory).filter(Boolean))) as string[]).sort().map((sub: string) => (
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
                      const subMatch = filterProductSubcategory === 'all' || product.subcategory === filterProductSubcategory;
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
                <CardTitle>Produits visibles par le client</CardTitle>
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
                          <th className="text-left py-2 px-3">Statut</th>
                          <th className="text-center py-2 px-3">Mis en avant</th>
                          <th className="text-left py-2 px-3">Dates de disponibilité</th>
                          <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((clientProduct: any) => {
                          const product = clientProduct.product;
                          if (!product) return null; // Skip if product was deleted
                          const isFeatured = clientProduct.featured || false;
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
                              <td className="py-2 px-3">{product.name || '-'}</td>
                              <td className="py-2 px-3">{product.reference || '-'}</td>
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
                                    title="Configurer les dates de disponibilité"
                                  >
                                    <Calendar className="w-4 h-4" />
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
          onSuccess={onRefresh}
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
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
