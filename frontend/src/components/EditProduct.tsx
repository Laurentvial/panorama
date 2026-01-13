import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RichTextEditor } from './RichTextEditor';
import { DateInput } from './ui/date-input';
import '../styles/PageHeader.css';

export function EditProduct() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    categoryId: '',
    subcategory: '',
    status: 'Brouillon',
    price: '',
    profitability: '',
    duration: '',
    description: '',
    cgv: '',
    // Gestion de la rentabilité
    noProfitability: 'Oui',
    isVariableProfitability: 'Non', // Rentabilité variable (Oui/Non)
    profitabilityRate: '', // Taux de rentabilité unique (si non variable)
    profitabilityMin: '', // Taux minimum (si variable)
    profitabilityMax: '', // Taux maximum (si variable)
    profitabilityPeriod: '',
    showMinProfitability: 'Non',
    interestPeriod: '',
    capitalisationFonds: 'Non',
    // Gestion du produit
    showOnLaunch: 'Non',
    availabilityStart: '',
    availabilityEnd: '',
    isSavings: false,
    linkToAssets: 'Non',
    // Gestion des prix
    enablePriceVariation: 'Non'
  });

  useEffect(() => {
    loadCategories();
    if (id) {
      loadProduct(id);
    }
  }, [id]);

  async function loadCategories() {
    try {
      const categoriesData = await apiCall('/api/categories/').catch(() => ({ categories: [] }));
      setCategories(categoriesData?.categories || categoriesData || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    }
  }

  async function loadProduct(productId: string) {
    try {
      setLoadingProduct(true);
      const productsData = await apiCall('/api/products/').catch(() => ({ products: [] }));
      const products = productsData?.products || productsData || [];
      const product = products.find((p: any) => p.id === productId);
      
      if (!product) {
        toast.error('Produit non trouvé');
        navigate('/admin/produits-investissements');
        return;
      }

      // Formater les dates pour les inputs de date
      const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
      };

      // Déterminer si la rentabilité est variable
      // Utiliser isVariableProfitability du backend si disponible, sinon déduire de variableProfitability
      const isVariable = product.isVariableProfitability === 'Oui' || 
                        (product.variableProfitability && !isNaN(parseFloat(product.variableProfitability)));
      const profitabilityValue = product.profitability?.toString() || '';
      
      setFormData({
        name: product.name || '',
        reference: product.reference || '',
        categoryId: product.categoryId || '',
        subcategory: product.subcategory || '',
        status: product.status || 'Brouillon',
        price: product.price?.toString() || '',
        profitability: profitabilityValue,
        duration: product.duration || '',
        description: product.description || '',
        cgv: product.cgv || '',
        noProfitability: product.noProfitability || 'Oui',
        isVariableProfitability: product.isVariableProfitability || (isVariable ? 'Oui' : 'Non'),
        profitabilityRate: isVariable ? '' : profitabilityValue,
        profitabilityMin: isVariable ? profitabilityValue : '',
        profitabilityMax: isVariable ? (product.variableProfitability || '') : '',
        profitabilityPeriod: product.profitabilityPeriod || '',
        showMinProfitability: product.showMinProfitability || 'Non',
        interestPeriod: product.interestPeriod || '',
        capitalisationFonds: product.capitalisationFonds || 'Non',
        showOnLaunch: product.showOnLaunch || 'Non',
        availabilityStart: formatDate(product.availabilityStart),
        availabilityEnd: formatDate(product.availabilityEnd),
        isSavings: product.isSavings || false,
        linkToAssets: product.linkToAssets || 'Non',
        enablePriceVariation: product.enablePriceVariation || 'Non'
      });
    } catch (error: any) {
      console.error('Error loading product:', error);
      toast.error(error?.message || 'Erreur lors du chargement du produit');
      navigate('/admin/produits-investissements');
    } finally {
      setLoadingProduct(false);
    }
  }

  function getSubcategoriesForCategory(categoryId: string): string[] {
    if (!categoryId) return [];
    const category = categories.find(c => c.id === categoryId);
    return category?.subcategories || [];
  }

  function generateRandomReference() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomLetters = Array.from({ length: 3 }, () => 
      letters[Math.floor(Math.random() * letters.length)]
    ).join('');
    const year = new Date().getFullYear();
    const randomNumbers = Math.floor(Math.random() * 900) + 100;
    return `${randomLetters}-${year}-${randomNumbers}`;
  }

  function handleGenerateReference() {
    setFormData({ ...formData, reference: generateRandomReference() });
  }

  async function generateAIDescription(): Promise<string> {
    try {
      const profitabilityText = formData.isVariableProfitability === 'Non' 
        ? formData.profitabilityRate 
        : `${formData.profitabilityMin}% - ${formData.profitabilityMax}%`;
      
      const response = await apiCall('/api/products/generate-description/', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          categoryId: formData.categoryId,
          price: formData.price,
          profitability: profitabilityText
        })
      });
      return response?.description || response?.text || '';
    } catch (error) {
      const parts: string[] = [];
      if (formData.name) parts.push(`Le produit "${formData.name}"`);
      if (formData.price) parts.push(`avec un prix de ${formData.price}€`);
      const profitabilityText = formData.isVariableProfitability === 'Non' 
        ? formData.profitabilityRate 
        : `${formData.profitabilityMin}% - ${formData.profitabilityMax}%`;
      if (profitabilityText) parts.push(`offre une rentabilité de ${profitabilityText}`);
      if (formData.duration) parts.push(`sur une durée de ${formData.duration}`);
      
      return parts.length > 0 
        ? `${parts.join(', ')}.\n\nCe produit d'investissement est conçu pour répondre aux besoins de nos clients en offrant un équilibre optimal entre rendement et sécurité.`
        : 'Description générée automatiquement pour ce produit d\'investissement.';
    }
  }

  async function generateAICGV(): Promise<string> {
    try {
      const response = await apiCall('/api/products/generate-cgv/', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          categoryId: formData.categoryId
        })
      });
      return response?.cgv || response?.text || '';
    } catch (error) {
      return `CONDITIONS GÉNÉRALES DE VENTE

1. OBJET
Les présentes conditions générales de vente régissent la commercialisation du produit "${formData.name || 'd\'investissement'}".

2. CARACTÉRISTIQUES DU PRODUIT
• Prix: ${formData.price || 'Non défini'}€
• Rentabilité: ${formData.profitability || 'Non définie'}%
${formData.duration ? `• Durée: ${formData.duration}` : ''}

3. CONDITIONS D'ACQUISITION
L'acquisition de ce produit est soumise à l'acceptation des présentes conditions générales.

4. DROIT DE RÉTRACTATION
Conformément à la législation en vigueur, le client dispose d'un délai de rétractation.

5. RESPONSABILITÉ
La responsabilité de l'établissement est limitée aux conditions prévues par la réglementation en vigueur.`;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    
    setLoading(true);

    if (formData.noProfitability === 'Non') {
      if (!formData.duration) {
        toast.error('La durée est requise pour un produit avec rentabilité');
        setLoading(false);
        return;
      }
      if (formData.isVariableProfitability === 'Non') {
        if (!formData.profitabilityRate) {
          toast.error('Le taux de rentabilité est requis');
          setLoading(false);
          return;
        }
      } else {
        if (!formData.profitabilityMin || !formData.profitabilityMax) {
          toast.error('Les taux minimum et maximum sont requis pour une rentabilité variable');
          setLoading(false);
          return;
        }
        if (parseFloat(formData.profitabilityMin) >= parseFloat(formData.profitabilityMax)) {
          toast.error('Le taux minimum doit être inférieur au taux maximum');
          setLoading(false);
          return;
        }
      }
      if (!formData.interestPeriod) {
        toast.error('La période d\'intérêt disponible est requise');
        setLoading(false);
        return;
      }
    }

    try {
      // Calculer profitability et variableProfitability selon le type
      let profitabilityValue: number | undefined = undefined;
      let variableProfitabilityValue: string | undefined = undefined;
      
      if (formData.noProfitability === 'Non') {
        if (formData.isVariableProfitability === 'Non') {
          // Rentabilité fixe : utiliser profitabilityRate
          profitabilityValue = parseFloat(formData.profitabilityRate);
        } else {
          // Rentabilité variable : utiliser profitabilityMin pour profitability et profitabilityMax pour variableProfitability
          profitabilityValue = parseFloat(formData.profitabilityMin);
          variableProfitabilityValue = formData.profitabilityMax;
        }
      }

      await apiCall(`/api/products/${id}/update/`, {
        method: 'PUT',
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          profitability: profitabilityValue,
          duration: formData.noProfitability === 'Non' ? formData.duration : undefined,
          categoryId: formData.categoryId || undefined,
          subcategory: formData.subcategory || undefined,
          status: formData.status,
          cgv: formData.cgv || undefined,
          active: formData.status === 'Actif',
          noProfitability: formData.noProfitability,
          variableProfitability: variableProfitabilityValue,
          profitabilityPeriod: formData.noProfitability === 'Non' ? formData.profitabilityPeriod || undefined : undefined,
          showMinProfitability: formData.noProfitability === 'Non' ? formData.showMinProfitability : undefined,
          interestPeriod: formData.noProfitability === 'Non' ? formData.interestPeriod : undefined,
          capitalisationFonds: formData.noProfitability === 'Non' ? formData.capitalisationFonds : undefined,
          showOnLaunch: formData.showOnLaunch,
          availabilityStart: formData.availabilityStart || undefined,
          availabilityEnd: formData.availabilityEnd || undefined,
          isSavings: formData.isSavings,
          linkToAssets: formData.linkToAssets,
          enablePriceVariation: formData.enablePriceVariation
        })
      });

      toast.success('Produit mis à jour avec succès');
      navigate('/admin/produits-investissements');
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour du produit');
    } finally {
      setLoading(false);
    }
  }

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du produit...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/produits-investissements')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="page-title">Modifier le produit d'investissement</h1>
            <p className="page-subtitle">Modifier les informations du produit</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations du produit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-name">Nom du produit *</Label>
                <Input
                  id="product-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Fonds Actions Européennes"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="product-reference">Référence *</Label>
                <div className="flex gap-2">
                  <Input
                    id="product-reference"
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                    required
                    placeholder="Ex: FAE-2024-001"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateReference}
                    title="Générer une référence aléatoire"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-category">Catégorie (optionnel)</Label>
                <Select 
                  value={formData.categoryId || 'none'} 
                  onValueChange={(value) => {
                    const newCategoryId = value === 'none' ? '' : value;
                    setFormData({ ...formData, categoryId: newCategoryId, subcategory: '' });
                  }}
                >
                  <SelectTrigger id="product-category">
                    <SelectValue placeholder="Sélectionner une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune catégorie</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-subcategory">Sous-catégorie (optionnel)</Label>
                <Select 
                  value={formData.subcategory || 'none'} 
                  onValueChange={(value) => setFormData({ ...formData, subcategory: value === 'none' ? '' : value })}
                  disabled={!formData.categoryId}
                >
                  <SelectTrigger id="product-subcategory">
                    <SelectValue placeholder={formData.categoryId ? "Sélectionner une sous-catégorie" : "Sélectionnez d'abord une catégorie"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune sous-catégorie</SelectItem>
                    {getSubcategoriesForCategory(formData.categoryId).map((subcategory, index) => (
                      <SelectItem key={index} value={subcategory}>
                        {subcategory}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-status">Statut *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="product-status">
                  <SelectValue placeholder="Sélectionner un statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Actif">Actif</SelectItem>
                  <SelectItem value="Brouillon">Brouillon</SelectItem>
                  <SelectItem value="Inactif">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <RichTextEditor
              id="product-description"
              label="Description"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Description détaillée du produit d'investissement..."
              rows={6}
              onGenerateAI={generateAIDescription}
            />

            <RichTextEditor
              id="product-cgv"
              label="CGV (Conditions Générales de Vente)"
              value={formData.cgv}
              onChange={(value) => setFormData({ ...formData, cgv: value })}
              placeholder="Conditions générales de vente du produit..."
              rows={6}
              onGenerateAI={generateAICGV}
            />

            {/* Gestion des prix */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Gestion des prix</h3>
              
              <div className="space-y-2">
                <Label htmlFor="product-base-price">Prix de base (€) *</Label>
                <Input
                  id="product-base-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-300">
                <h4 className="text-md font-medium text-slate-700">Gestion des variations</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="product-enable-price-variation">Activer variation du prix sur le produit</Label>
                  <Select 
                    value={formData.enablePriceVariation} 
                    onValueChange={(value) => setFormData({ ...formData, enablePriceVariation: value })}
                  >
                    <SelectTrigger id="product-enable-price-variation">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Oui">Oui</SelectItem>
                      <SelectItem value="Non">Non</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Gestion de la rentabilité */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Gestion de la rentabilité</h3>
              
              <div className="space-y-2">
                <Label htmlFor="product-no-profitability">Produit sans rentabilité *</Label>
                <Select 
                  value={formData.noProfitability} 
                  onValueChange={(value) => setFormData({ ...formData, noProfitability: value })}
                >
                  <SelectTrigger id="product-no-profitability">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oui">Oui</SelectItem>
                    <SelectItem value="Non">Non</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.noProfitability === 'Non' && (
                <div className="space-y-4 pl-4 border-l-2 border-slate-200">
                  <div className="space-y-2">
                    <Label htmlFor="product-duration-profitability">Durée *</Label>
                    <Input
                      id="product-duration-profitability"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      required
                      placeholder="Ex: 12 mois"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-is-variable-profitability">Rentabilité variable *</Label>
                    <Select 
                      value={formData.isVariableProfitability} 
                      onValueChange={(value) => setFormData({ ...formData, isVariableProfitability: value })}
                    >
                      <SelectTrigger id="product-is-variable-profitability">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Oui">Oui</SelectItem>
                        <SelectItem value="Non">Non</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.isVariableProfitability === 'Non' ? (
                    <div className="space-y-2">
                      <Label htmlFor="product-profitability-rate">Taux de rentabilité (%) *</Label>
                      <Input
                        id="product-profitability-rate"
                        type="number"
                        step="0.01"
                        value={formData.profitabilityRate}
                        onChange={(e) => setFormData({ ...formData, profitabilityRate: e.target.value })}
                        required
                        placeholder="0.00"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="product-profitability-min">Taux minimum (%) *</Label>
                        <Input
                          id="product-profitability-min"
                          type="number"
                          step="0.01"
                          value={formData.profitabilityMin}
                          onChange={(e) => setFormData({ ...formData, profitabilityMin: e.target.value })}
                          required
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-profitability-max">Taux maximum (%) *</Label>
                        <Input
                          id="product-profitability-max"
                          type="number"
                          step="0.01"
                          value={formData.profitabilityMax}
                          onChange={(e) => setFormData({ ...formData, profitabilityMax: e.target.value })}
                          required
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="product-profitability-period">Période de rentabilité</Label>
                    <Select 
                      value={formData.profitabilityPeriod || 'none'} 
                      onValueChange={(value) => setFormData({ ...formData, profitabilityPeriod: value === 'none' ? '' : value })}
                    >
                      <SelectTrigger id="product-profitability-period">
                        <SelectValue placeholder="Sélectionner une période" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucune période</SelectItem>
                        <SelectItem value="Mensuelle">Mensuelle</SelectItem>
                        <SelectItem value="Trimestrielle">Trimestrielle</SelectItem>
                        <SelectItem value="Semestrielle">Semestrielle</SelectItem>
                        <SelectItem value="Annuelle">Annuelle</SelectItem>
                        <SelectItem value="Fin de contrat">Fin de contrat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-show-min-profitability">Afficher rentabilité minimum</Label>
                    <Select 
                      value={formData.showMinProfitability} 
                      onValueChange={(value) => setFormData({ ...formData, showMinProfitability: value })}
                    >
                      <SelectTrigger id="product-show-min-profitability">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Oui">Oui</SelectItem>
                        <SelectItem value="Non">Non</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-interest-period">Période d'intérêt disponible *</Label>
                    <Select 
                      value={formData.interestPeriod} 
                      onValueChange={(value) => setFormData({ ...formData, interestPeriod: value })}
                      required
                    >
                      <SelectTrigger id="product-interest-period">
                        <SelectValue placeholder="Sélectionner une période" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mensuel">Mensuel</SelectItem>
                        <SelectItem value="Trimestriel">Trimestriel</SelectItem>
                        <SelectItem value="Semestriel">Semestriel</SelectItem>
                        <SelectItem value="Annuel">Annuel</SelectItem>
                        <SelectItem value="Fin de contrat">Fin de contrat</SelectItem>
                        <SelectItem value="Capitalisation des fonds">Capitalisation des fonds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-capitalisation-fonds">Capitalisation des fonds</Label>
                    <Select 
                      value={formData.capitalisationFonds} 
                      onValueChange={(value) => setFormData({ ...formData, capitalisationFonds: value })}
                    >
                      <SelectTrigger id="product-capitalisation-fonds">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Oui">Oui</SelectItem>
                        <SelectItem value="Non">Non</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Gestion du produit */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Gestion du produit</h3>
              
              <div className="space-y-2">
                <Label htmlFor="product-show-on-launch">Afficher au lancement du produit</Label>
                <Select 
                  value={formData.showOnLaunch} 
                  onValueChange={(value) => setFormData({ ...formData, showOnLaunch: value })}
                >
                  <SelectTrigger id="product-show-on-launch">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oui">Oui</SelectItem>
                    <SelectItem value="Non">Non</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product-availability-start">Début de disponibilité</Label>
                  <DateInput
                    id="product-availability-start"
                    value={formData.availabilityStart}
                    onChange={(value) => setFormData({ ...formData, availabilityStart: value })}
                    placeholder="JJ/MM/AAAA"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product-availability-end">Fin de disponibilité</Label>
                  <DateInput
                    id="product-availability-end"
                    value={formData.availabilityEnd}
                    onChange={(value) => setFormData({ ...formData, availabilityEnd: value })}
                    placeholder="JJ/MM/AAAA"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-is-savings">Ce produit est une épargne</Label>
                <Select 
                  value={formData.isSavings ? 'Oui' : 'Non'} 
                  onValueChange={(value) => setFormData({ ...formData, isSavings: value === 'Oui' })}
                >
                  <SelectTrigger id="product-is-savings">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oui">Oui</SelectItem>
                    <SelectItem value="Non">Non</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-link-to-assets">Lie le produit à des actifs</Label>
                <Select 
                  value={formData.linkToAssets} 
                  onValueChange={(value) => setFormData({ ...formData, linkToAssets: value })}
                >
                  <SelectTrigger id="product-link-to-assets">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oui">Oui</SelectItem>
                    <SelectItem value="Non">Non</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/admin/produits-investissements')}
                disabled={loading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Mise à jour...' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default EditProduct;
