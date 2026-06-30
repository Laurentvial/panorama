import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Plus, Pencil, Trash2, Folder, X, Copy } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/PageHeader.css';
import '../styles/Modal.css';
import { useUser } from '../contexts/UserContext';

interface ProduitsInvestissementsProps {
  user?: any;
}

export function ProduitsInvestissements({ user }: ProduitsInvestissementsProps) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const isAdmin = String(currentUser?.role || '').toLowerCase() === 'admin';
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isEditCategoryDialogOpen, setIsEditCategoryDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  
  const [categoryForm, setCategoryForm] = useState({
    title: '',
    url: '',
    subcategories: [] as string[]
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [productsData, categoriesData] = await Promise.all([
        apiCall('/api/products/').catch(() => ({ products: [] })),
        apiCall('/api/categories/').catch(() => ({ categories: [] }))
      ]);
      
      setProducts(productsData?.products || productsData || []);
      setCategories(categoriesData?.categories || categoriesData || []);
    } catch (error) {
      console.error('Error loading produits d\'investissements:', error);
      // Set empty arrays on error
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall('/api/categories/create/', {
        method: 'POST',
        body: JSON.stringify(categoryForm)
      });
      
      toast.success('Catégorie créée avec succès');
      setIsCategoryDialogOpen(false);
      setCategoryForm({ title: '', url: '', subcategories: [] });
      clearApiCache('/api/categories');
      await loadData();
    } catch (error: any) {
      console.error('Error creating category:', error);
      toast.error(error?.message || 'Erreur lors de la création de la catégorie');
    }
  }

  function handleEditCategory(category: any) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      title: category.title || '',
      url: category.url || '',
      subcategories: category.subcategories || []
    });
    setIsEditCategoryDialogOpen(true);
  }

  async function handleUpdateCategory(e: React.FormEvent) {
    e.preventDefault();
    
    if (!editingCategoryId) return;
    
    try {
      await apiCall(`/api/categories/${editingCategoryId}/update/`, {
        method: 'PUT',
        body: JSON.stringify(categoryForm)
      });
      
      toast.success('Catégorie mise à jour avec succès');
      setIsEditCategoryDialogOpen(false);
      setEditingCategoryId(null);
      setCategoryForm({ title: '', url: '', subcategories: [] });
      clearApiCache('/api/categories');
      await loadData();
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour de la catégorie');
    }
  }


  async function handleToggleProductActive(productId: string) {
    try {
      await apiCall(`/api/products/${productId}/toggle-active/`, { method: 'POST' });
      toast.success('Statut du produit mis à jour');
      loadData();
    } catch (error: any) {
      console.error('Error toggling product status:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour du statut');
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm('Supprimer cette catégorie ?')) return;
    
    try {
      await apiCall(`/api/categories/${categoryId}/delete/`, { method: 'DELETE' });
      toast.success('Catégorie supprimée avec succès');
      clearApiCache('/api/categories');
      await loadData();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error(error?.message || 'Erreur lors de la suppression de la catégorie');
    }
  }

  async function handleDeleteProduct(productId: string) {
    if (!confirm('Supprimer ce produit ?')) return;
    
    try {
      await apiCall(`/api/products/${productId}/delete/`, { method: 'DELETE' });
      toast.success('Produit supprimé avec succès');
      loadData();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(error?.message || 'Erreur lors de la suppression du produit');
    }
  }

  async function handleDuplicateProduct(productId: string) {
    try {
      await apiCall(`/api/products/${productId}/duplicate/`, { method: 'POST' });
      toast.success('Produit dupliqué avec succès');
      clearApiCache('/api/products');
      await loadData();
    } catch (error: any) {
      console.error('Error duplicating product:', error);
      toast.error(error?.message || 'Erreur lors de la duplication du produit');
    }
  }

  function addSubcategory() {
    setCategoryForm({
      ...categoryForm,
      subcategories: [...categoryForm.subcategories, '']
    });
  }

  function updateSubcategory(index: number, value: string) {
    const newSubcategories = [...categoryForm.subcategories];
    newSubcategories[index] = value;
    setCategoryForm({ ...categoryForm, subcategories: newSubcategories });
  }

  function removeSubcategory(index: number) {
    const newSubcategories = categoryForm.subcategories.filter((_, i) => i !== index);
    setCategoryForm({ ...categoryForm, subcategories: newSubcategories });
  }

  function parseSubcategories(rawSubcategory: any): string[] {
    const cleanSpecialChars = (s: string) =>
      s.replace(/[\[\]"'\n\r]/g, '').trim();
    const parseStringValue = (value: string): string[] => {
      const trimmed = value.trim();
      if (!trimmed) return [];

      // Handle JSON array strings first.
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((item) => cleanSpecialChars(String(item))).filter(Boolean);
          }
        } catch {
          // Fallback below for python-style list strings.
        }

        // Handle python-style: "['A', 'B']" or "['A'\n'B'\n'C']" (comma or newline separated)
        const inner = trimmed.slice(1, -1).trim();
        if (!inner) return [];
        return inner
          .split(/[,\n]+/)
          .map((item) => cleanSpecialChars(item))
          .filter(Boolean);
      }

      return [cleanSpecialChars(trimmed)];
    };

    const values = Array.isArray(rawSubcategory)
      ? rawSubcategory.flatMap((item) => parseStringValue(String(item ?? '')))
      : parseStringValue(String(rawSubcategory ?? ''));

    // Keep insertion order while removing duplicates.
    return Array.from(new Set(values));
  }

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      const categoryMatch =
        filterCategory === 'all'
          ? true
          : filterCategory === 'none'
            ? !product.categoryId
            : product.categoryId === filterCategory;

      if (!categoryMatch) return false;
      if (!query) return true;

      const categoryTitle = categories.find((c) => c.id === product.categoryId)?.title || '';
      const subcategories = parseSubcategories(product.subcategory);
      const searchHaystack = [
        product.name,
        product.reference,
        product.type,
        categoryTitle,
        ...subcategories,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchHaystack.includes(query);
    });
  }, [products, categories, filterCategory, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <h1 className="page-title">Produits financiers internes</h1>
        <p className="page-subtitle">Gérer les produits financiers créés par l'établissement (épargnes, livrets, PEA, etc.)</p>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList>
          <TabsTrigger value="products">Produits financiers</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label htmlFor="search-product">Recherche</Label>
                <Input
                  id="search-product"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nom, référence, type, catégorie..."
                  className="w-[280px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-category">Catégorie</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger id="filter-category" className="w-[200px]">
                    <SelectValue placeholder="Toutes les catégories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les catégories</SelectItem>
                    <SelectItem value="none">Sans catégorie</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => navigate('/admin/produits-investissements/add')}>
              <Plus className="w-4 h-4 mr-2" />
              Créer un produit
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Liste des produits ({filteredProducts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingIndicator />
                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4">Image</th>
                        <th className="text-left py-3 px-4">Référence</th>
                        <th className="text-left py-3 px-4">Nom</th>
                        <th className="text-left py-3 px-4">Catégorie</th>
                        <th className="text-left py-3 px-4">Investissement minimum</th>
                        <th className="text-left py-3 px-4">Plafond de souscription</th>
                        <th className="text-left py-3 px-4">Rentabilité</th>
                        <th className="text-left py-3 px-4">Périodes de rentabilité disponibles</th>
                        <th className="text-left py-3 px-4">Période de rentabilité</th>
                        <th className="text-left py-3 px-4">Fonds disponible</th>
                        <th className="text-left py-3 px-4 min-w-[140px]">Durée</th>
                        <th className="text-left py-3 px-4">Statut</th>
                        <th className="text-right py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => {
                        const category = categories.find(c => c.id === product.categoryId);
                        
                        return (
                          <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              {product.imageUrl ? (
                                <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100" style={{ position: 'relative' }}>
                                  <img 
                                    src={product.imageUrl} 
                                    alt={product.name || 'Product image'}
                                    style={{ 
                                      width: '100%', 
                                      height: '100%', 
                                      objectFit: 'cover',
                                      objectPosition: 'center',
                                      display: 'block'
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const parent = e.currentTarget.parentElement;
                                      if (parent) {
                                        parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs">No image</div>';
                                      }
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                                  No image
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{product.reference}</td>
                            <td className="py-3 px-4">{product.name}</td>
                            <td className="py-3 px-4">
                              {(() => {
                                const subcategories = parseSubcategories(product.subcategory);
                                const categoryLabel = category?.title || null;
                                if (!categoryLabel && subcategories.length === 0) {
                                  return '-';
                                }
                                return (
                                  <div className="flex flex-col gap-1">
                                    {categoryLabel && <Badge variant="outline">{categoryLabel}</Badge>}
                                    {subcategories.length > 0 && (
                                      <div className="flex gap-1 flex-wrap">
                                        {subcategories.map((subcategory) => (
                                          <Badge key={subcategory} variant="secondary" className="text-xs">
                                            {subcategory}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4">
                              {product.minEntryValue ? (
                                `${product.minEntryValue.toLocaleString('fr-FR')} €`
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {product.maxEntryValue ? (
                                `${product.maxEntryValue.toLocaleString('fr-FR')} €`
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-3 px-4 text-green-600">
                              {product.isVariableProfitability === 'Oui' && product.variableProfitability ? (
                                <span>
                                  {product.profitability}% | {product.variableProfitability}%
                                </span>
                              ) : (
                                product.profitability ? `${product.profitability}%` : '-'
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {(() => {
                                const rawPeriods = product.interestPeriod || product.interest_period || '';
                                const periods = String(rawPeriods)
                                  .split(',')
                                  .map((p) => p.trim())
                                  .filter((p) => p.length > 0);
                                if (periods.length === 0) {
                                  return '-';
                                }
                                return (
                                  <div className="flex gap-1 flex-wrap">
                                    {periods.map((period) => (
                                      <Badge key={period} variant="outline" className="text-xs">
                                        {period}
                                      </Badge>
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4">
                              {product.profitabilityPeriod || product.profitability_period || '-'}
                            </td>
                            <td className="py-3 px-4">
                              {(product.availableFunds ?? product.available_funds) ? 'Oui' : 'Non'}
                            </td>
                            <td className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                              {product.duration ? (() => {
                                const days = parseInt(String(product.duration).replace(/\D/g, ''), 10) || 0;
                                if (days <= 0) return 'Durée indéterminée';
                                const months = Math.round(days / 30);
                                return `${days} Jours (${months} mois)`;
                              })() : 'Durée indéterminée'}
                            </td>
                            <td className="py-3 px-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleProductActive(product.id)}
                                className={product.status === 'Actif' ? 'text-green-600' : 'text-red-600'}
                              >
                                {product.status === 'Actif' ? 'Actif' : product.status === 'Inactif' ? 'Inactif' : 'Brouillon'}
                              </Button>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-2 justify-end">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => navigate(`/admin/produits-investissements/edit/${product.id}`)}
                                  title="Modifier le produit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDuplicateProduct(product.id)}
                                  title="Dupliquer le produit"
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleDeleteProduct(product.id)}
                                    className="text-red-600 hover:text-red-700"
                                    title="Supprimer le produit"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  {products.length === 0 ? 'Aucun produit créé' : 'Aucun produit ne correspond à la recherche/filtres'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setIsCategoryDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Créer une catégorie
            </Button>
          </div>

          {isCategoryDialogOpen && (
            <div className="modal-overlay" onClick={() => setIsCategoryDialogOpen(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
                <div className="modal-header">
                  <h2 className="modal-title">Nouvelle catégorie</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="modal-close"
                    onClick={() => setIsCategoryDialogOpen(false)}
                  >
                    <X className="planning-icon-md" />
                  </Button>
                </div>
                <form onSubmit={handleCreateCategory} className="modal-form">
                  <div className="modal-form-field">
                    <Label htmlFor="category-title">Titre *</Label>
                    <Input
                      id="category-title"
                      value={categoryForm.title}
                      onChange={(e) => setCategoryForm({ ...categoryForm, title: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div className="modal-form-field">
                    <Label htmlFor="category-url">URL *</Label>
                    <Input
                      id="category-url"
                      value={categoryForm.url}
                      onChange={(e) => setCategoryForm({ ...categoryForm, url: e.target.value })}
                      placeholder="Ex: actions-francaises"
                      required
                    />
                  </div>
                  
                  <div className="modal-form-field">
                    <div className="flex items-center justify-between mb-2">
                      <Label>Sous-catégories</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addSubcategory}>
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter
                      </Button>
                    </div>
                    
                    {categoryForm.subcategories.length > 0 && (
                      <div className="space-y-2">
                        {categoryForm.subcategories.map((sub, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              value={sub}
                              onChange={(e) => updateSubcategory(index, e.target.value)}
                              placeholder="Nom de la sous-catégorie"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeSubcategory(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="modal-form-actions">
                    <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">Créer</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {isEditCategoryDialogOpen && (
            <div className="modal-overlay" onClick={() => {
              setIsEditCategoryDialogOpen(false);
              setEditingCategoryId(null);
              setCategoryForm({ title: '', url: '', subcategories: [] });
            }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
                <div className="modal-header">
                  <h2 className="modal-title">Modifier la catégorie</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="modal-close"
                    onClick={() => {
                      setIsEditCategoryDialogOpen(false);
                      setEditingCategoryId(null);
                      setCategoryForm({ title: '', url: '', subcategories: [] });
                    }}
                  >
                    <X className="planning-icon-md" />
                  </Button>
                </div>
                <form onSubmit={handleUpdateCategory} className="modal-form">
                  <div className="modal-form-field">
                    <Label htmlFor="edit-category-title">Titre *</Label>
                    <Input
                      id="edit-category-title"
                      value={categoryForm.title}
                      onChange={(e) => setCategoryForm({ ...categoryForm, title: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div className="modal-form-field">
                    <Label htmlFor="edit-category-url">URL *</Label>
                    <Input
                      id="edit-category-url"
                      value={categoryForm.url}
                      onChange={(e) => setCategoryForm({ ...categoryForm, url: e.target.value })}
                      placeholder="Ex: actions-francaises"
                      required
                    />
                  </div>
                  
                  <div className="modal-form-field">
                    <div className="flex items-center justify-between mb-2">
                      <Label>Sous-catégories</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addSubcategory}>
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter
                      </Button>
                    </div>
                    
                    {categoryForm.subcategories.length > 0 && (
                      <div className="space-y-2">
                        {categoryForm.subcategories.map((sub, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              value={sub}
                              onChange={(e) => updateSubcategory(index, e.target.value)}
                              placeholder="Nom de la sous-catégorie"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeSubcategory(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="modal-form-actions">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setIsEditCategoryDialogOpen(false);
                        setEditingCategoryId(null);
                        setCategoryForm({ title: '', url: '', subcategories: [] });
                      }}
                    >
                      Annuler
                    </Button>
                    <Button type="submit">Enregistrer</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Liste des catégories</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingIndicator />
                </div>
              ) : categories.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4">ID</th>
                        <th className="text-left py-3 px-4">Catégorie</th>
                        <th className="text-left py-3 px-4">Sous-catégories</th>
                        <th className="text-right py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category) => (
                        <tr key={category.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4 text-slate-500">
                            {category.id.substring(0, 8)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Folder className="w-4 h-4 text-blue-600" />
                              {category.title}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {category.subcategories && category.subcategories.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {category.subcategories.map((sub: string, index: number) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {sub}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2 justify-end">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditCategory(category)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDeleteCategory(category.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucune catégorie créée</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default ProduitsInvestissements;