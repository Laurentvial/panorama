import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronLeft } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';

export function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [product, setProduct] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    type: '',
    subcategory: '',
    categoryId: '',
    status: 'Brouillon',
    profitability: '',
    duration: '',
    description: '',
    cgv: '',
    noProfitability: true,
    isVariableProfitability: 'Non',
    variableProfitability: '',
    profitabilityPeriod: '',
    interestPeriod: '',
    capitalisationFonds: false,
    availabilityStart: '',
    availabilityEnd: '',
    linkToAssets: 'Non',
    minEntryValue: '',
    maxEntryValue: '',
    default: false,
    availableFunds: false,
  });

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const [productData, categoriesData] = await Promise.all([
        apiCall(`/api/products/${id}/`),
        apiCall('/api/categories/').catch(() => ({ categories: [] }))
      ]);
      
      setProduct(productData);
      setCategories(categoriesData?.categories || categoriesData || []);
      
      // Populate form with product data
      if (productData) {
        setFormData({
          name: productData.name || '',
          reference: productData.reference || '',
          type: productData.type || '',
          subcategory: productData.subcategory || '',
          categoryId: productData.categoryId || '',
          status: productData.status || 'Brouillon',
          profitability: productData.profitability?.toString() || '',
          duration: productData.duration || '',
          description: productData.description || '',
          cgv: productData.cgv || '',
          noProfitability: productData.noProfitability !== undefined ? productData.noProfitability : true,
          isVariableProfitability: productData.isVariableProfitability || 'Non',
          variableProfitability: productData.variableProfitability || '',
          profitabilityPeriod: productData.profitabilityPeriod || '',
          interestPeriod: productData.interestPeriod || '',
          capitalisationFonds: productData.capitalisationFonds || false,
          availabilityStart: productData.availabilityStart || '',
          availabilityEnd: productData.availabilityEnd || '',
          linkToAssets: productData.linkToAssets || 'Non',
          minEntryValue: productData.minEntryValue?.toString() || '',
          maxEntryValue: productData.maxEntryValue?.toString() || '',
          default: productData.default || false,
          availableFunds: productData.availableFunds || false,
        });
      }
    } catch (error: any) {
      console.error('Error loading product:', error);
      toast.error(error?.message || 'Erreur lors du chargement du produit');
      navigate('/admin/produits-investissements');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!id) return;
    
    try {
      setSaving(true);
      
      const updateData: any = {
        name: formData.name,
        reference: formData.reference,
        type: formData.type,
        subcategory: formData.subcategory,
        status: formData.status,
        description: formData.description,
        cgv: formData.cgv,
        duration: formData.duration,
        noProfitability: formData.noProfitability,
        isVariableProfitability: formData.isVariableProfitability,
        variableProfitability: formData.variableProfitability,
        profitabilityPeriod: formData.profitabilityPeriod,
        interestPeriod: formData.interestPeriod,
        capitalisationFonds: formData.capitalisationFonds,
        linkToAssets: formData.linkToAssets,
        default: formData.default,
        availableFunds: formData.availableFunds,
      };
      
      if (formData.categoryId) {
        updateData.categoryId = formData.categoryId;
      }
      
      if (formData.profitability && !formData.noProfitability) {
        updateData.profitability = parseFloat(formData.profitability);
      }
      
      if (formData.minEntryValue) {
        updateData.minEntryValue = parseFloat(formData.minEntryValue);
      }
      
      if (formData.maxEntryValue) {
        updateData.maxEntryValue = parseFloat(formData.maxEntryValue);
      }
      
      if (formData.availabilityStart) {
        updateData.availabilityStart = formData.availabilityStart;
      }
      
      if (formData.availabilityEnd) {
        updateData.availabilityEnd = formData.availabilityEnd;
      }
      
      await apiCall(`/api/products/${id}/update/`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });
      
      toast.success('Produit mis à jour avec succès');
      navigate('/admin/produits-investissements');
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour du produit');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingIndicator />;
  }

  if (!product) {
    return (
      <div className="p-6">
        <p>Produit non trouvé</p>
        <Button onClick={() => navigate('/admin/produits-investissements')}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/produits-investissements')}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <h1 className="text-2xl font-bold">Modifier le produit</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Nom du produit *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="reference">Référence</Label>
            <Input
              id="reference"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="type">Type</Label>
            <Input
              id="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            />
          </div>
          
          <div>
            <Label htmlFor="subcategory">Sous-catégorie</Label>
            <Input
              id="subcategory"
              value={formData.subcategory}
              onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="categoryId">Catégorie</Label>
            <Select
              value={formData.categoryId || 'none'}
              onValueChange={(value) => setFormData({ ...formData, categoryId: value === 'none' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune catégorie</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="status">Statut</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Actif">Actif</SelectItem>
                <SelectItem value="Brouillon">Brouillon</SelectItem>
                <SelectItem value="Inactif">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="duration">Durée</Label>
          <Input
            id="duration"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            placeholder="ex: 12 mois"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
          />
        </div>

        <div>
          <Label htmlFor="cgv">CGV</Label>
          <Textarea
            id="cgv"
            value={formData.cgv}
            onChange={(e) => setFormData({ ...formData, cgv: e.target.value })}
            rows={6}
          />
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/admin/produits-investissements')}
          >
            Annuler
          </Button>
        </div>
      </form>
    </div>
  );
}

export default EditProduct;
