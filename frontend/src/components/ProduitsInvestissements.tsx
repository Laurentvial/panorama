import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Plus, Pencil, Trash2, Folder, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/PageHeader.css';
import '../styles/Modal.css';

interface ProduitsInvestissementsProps {
  user?: any;
}

export function ProduitsInvestissements({ user }: ProduitsInvestissementsProps) {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
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
      loadData();
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
      loadData();
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
      loadData();
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

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <h1 className="page-title">Produits d'investissements</h1>
        <p className="page-subtitle">Gestion des produits financiers et catégories</p>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList>
          <TabsTrigger value="products">Produits financiers</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => navigate('/admin/produits-investissements/add')}>
              <Plus className="w-4 h-4 mr-2" />
              Créer un produit
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Liste des produits</CardTitle>
            </CardHeader>
            <CardContent>
              {products.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4">Référence</th>
                        <th className="text-left py-3 px-4">Nom</th>
                        <th className="text-left py-3 px-4">Catégorie</th>
                        <th className="text-left py-3 px-4">Prix</th>
                        <th className="text-left py-3 px-4">Rentabilité</th>
                        <th className="text-left py-3 px-4">Durée</th>
                        <th className="text-left py-3 px-4">Statut</th>
                        <th className="text-right py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const category = categories.find(c => c.id === product.categoryId);
                        
                        return (
                          <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4 text-slate-600">{product.reference}</td>
                            <td className="py-3 px-4">{product.name}</td>
                            <td className="py-3 px-4">
                              {category ? (
                                <Badge variant="outline">{category.title}</Badge>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-3 px-4">{product.price?.toLocaleString('fr-FR')} €</td>
                            <td className="py-3 px-4 text-green-600">{product.profitability}%</td>
                            <td className="py-3 px-4">{product.duration || '-'}</td>
                            <td className="py-3 px-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleProductActive(product.id)}
                                className={product.active ? 'text-green-600' : 'text-red-600'}
                              >
                                {product.active ? 'Actif' : 'Inactif'}
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
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="text-red-600 hover:text-red-700"
                                  title="Supprimer le produit"
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
              ) : (
                <p className="text-sm text-slate-500">Aucun produit créé</p>
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
              {categories.length > 0 ? (
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