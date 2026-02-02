import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { TrendingUp, Plus, Trash2, X, Star } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
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
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');

  async function handleAddAsset(assetId: string) {
    try {
      await apiCall(`/api/clients/${clientId}/assets/add/`, {
        method: 'POST',
        body: JSON.stringify({ assetId }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Actif ajouté avec succès');
      setIsAddAssetDialogOpen(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error adding asset:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout de l\'actif');
    }
  }

  async function handleAddProduct(productId: string) {
    try {
      await apiCall(`/api/clients/${clientId}/products/add/`, {
        method: 'POST',
        body: JSON.stringify({ productId }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Produit ajouté avec succès');
      setIsAddProductDialogOpen(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout du produit');
    }
  }

  async function handleRemoveAsset(assetId: string) {
    if (!confirm('Retirer cet actif du client ?')) return;
    
    try {
      await apiCall(`/api/clients/${clientId}/assets/${assetId}/`, { method: 'DELETE' });
      toast.success('Actif retiré avec succès');
      onRefresh();
    } catch (error) {
      console.error('Error removing asset:', error);
      toast.error('Erreur lors du retrait de l\'actif');
    }
  }

  async function handleRemoveProduct(productId: string) {
    if (!confirm('Retirer ce produit du client ?')) return;
    
    try {
      await apiCall(`/api/clients/${clientId}/products/${productId}/`, { method: 'DELETE' });
      toast.success('Produit retiré avec succès');
      onRefresh();
    } catch (error) {
      console.error('Error removing product:', error);
      toast.error('Erreur lors du retrait du produit');
    }
  }

  async function handleToggleFeaturedAsset(clientAssetId: string, assetId: string, currentFeatured: boolean) {
    try {
      await apiCall(`/api/clients/${clientId}/assets/${assetId}/toggle-featured/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success(currentFeatured ? 'Actif ne sera plus mis en avant' : 'Actif mis en avant');
      onRefresh();
    } catch (error: any) {
      console.error('Error toggling featured:', error);
      toast.error(error.message || 'Erreur lors de la modification');
    }
  }

  async function handleToggleFeaturedProduct(clientProductId: string, productId: string, currentFeatured: boolean) {
    try {
      await apiCall(`/api/clients/${clientId}/products/${productId}/toggle-featured/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success(currentFeatured ? 'Produit ne sera plus mis en avant' : 'Produit mis en avant');
      onRefresh();
    } catch (error: any) {
      console.error('Error toggling featured:', error);
      toast.error(error.message || 'Erreur lors de la modification');
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="assets">Actifs</TabsTrigger>
          <TabsTrigger value="products">Produits</TabsTrigger>
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
                    {Array.from(new Set(clientAssets.map((ca: any) => ca.asset?.type).filter(Boolean) as string[])).map((type) => (
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
                    {Array.from(new Set(clientAssets.map((ca: any) => ca.asset?.category).filter(Boolean) as string[])).map((category) => (
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
                    {Array.from(new Set(clientAssets.map((ca: any) => ca.asset?.subcategory).filter(Boolean) as string[])).map((subcategory) => (
                      <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2">
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
                            .filter((asset: any) => !clientAssets.some((ca: any) => ca.asset?.id === asset.id))
                            .map((asset: any) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.name} ({asset.type}) - {asset.reference || 'N/A'}
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
                  const filteredAssets = clientAssets.filter((clientAsset: any) => {
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
                            <th className="text-left py-2 px-3">Type</th>
                            <th className="text-left py-2 px-3">Nom</th>
                            <th className="text-left py-2 px-3">Référence</th>
                            <th className="text-left py-2 px-3">Catégorie</th>
                            <th className="text-left py-2 px-3">Sous-catégorie</th>
                            <th className="text-center py-2 px-3">Mis en avant</th>
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveAsset(asset.id)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : clientAssets.length > 0 ? (
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
              {/* Actions */}
              <div className="flex gap-2">
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
                  Ajouter un produit
                </Button>
              </div>
            </div>

            {isAddProductDialogOpen && (
              <div className="modal-overlay" onClick={() => setIsAddProductDialogOpen(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2 className="modal-title">Ajouter un produit</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={() => setIsAddProductDialogOpen(false)}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>
                  <div className="modal-form">
                    <div className="modal-form-field">
                      <Label>Produit</Label>
                      <Select onValueChange={(value) => handleAddProduct(value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un produit" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProducts
                            .filter((product: any) => !clientProducts.some((cp: any) => cp.product?.id === product.id))
                            .map((product: any) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} ({product.type || 'N/A'}) - {product.reference || 'N/A'}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="modal-form-actions">
                      <Button type="button" variant="outline" onClick={() => setIsAddProductDialogOpen(false)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Produits visibles par le client</CardTitle>
              </CardHeader>
              <CardContent>
                {clientProducts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Nom</th>
                          <th className="text-left py-2 px-3">Référence</th>
                          <th className="text-left py-2 px-3">Statut</th>
                          <th className="text-center py-2 px-3">Mis en avant</th>
                          <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientProducts.map((clientProduct: any) => {
                          const product = clientProduct.product;
                          if (!product) return null; // Skip if product was deleted
                          const isFeatured = clientProduct.featured || false;
                          return (
                            <tr key={clientProduct.id} className="border-b border-slate-100">
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveProduct(product.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucun produit assigné</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
