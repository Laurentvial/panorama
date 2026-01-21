import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { ArrowLeft, Save, RefreshCw, Trash2 } from '../utils/iconMapping';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RichTextEditor } from './RichTextEditor';
import { DateInput } from './ui/date-input';
import '../styles/PageHeader.css';

export function AddProduct() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    type: '',
    categoryId: '',
    subcategory: '',
    status: 'Brouillon',
    price: '',
    profitability: '',
    duration: '',
    description: '',
    cgv: '',
    // Gestion de la rentabilité
    noProfitability: 'Oui', // Par défaut Oui
    isVariableProfitability: 'Non', // Rentabilité variable (Oui/Non)
    profitabilityRate: '', // Taux de rentabilité unique (si non variable)
    profitabilityMin: '', // Taux minimum (si variable)
    profitabilityMax: '', // Taux maximum (si variable)
    profitabilityPeriod: '',
    showMinProfitability: 'Non',
    interestPeriod: [] as string[],
    capitalisationFonds: 'Non',
    // Gestion du produit
    showOnLaunch: 'Non',
    availabilityStart: '',
    availabilityEnd: '',
    isSavings: false,
    linkToAssets: 'Non',
    // Gestion des prix
    enablePriceVariation: 'Non',
    minEntryValue: '',
    maxEntryValue: '',
    minPriceVariation: '',
    maxPriceVariation: '',
    currentPriceVariation: ''
  });

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const categoriesData = await apiCall('/api/categories/').catch(() => ({ categories: [] }));
      setCategories(categoriesData?.categories || categoriesData || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    }
  }

  function getSubcategoriesForCategory(categoryId: string): string[] {
    if (!categoryId) return [];
    const category = categories.find(c => c.id === categoryId);
    return category?.subcategories || [];
  }

  function generateRandomReference() {
    // Génère une référence au format: XXX-YYYY-NNN
    // XXX = 3 lettres majuscules aléatoires
    // YYYY = année actuelle
    // NNN = 3 chiffres aléatoires
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomLetters = Array.from({ length: 3 }, () => 
      letters[Math.floor(Math.random() * letters.length)]
    ).join('');
    const year = new Date().getFullYear();
    const randomNumbers = Math.floor(Math.random() * 900) + 100; // 100-999
    return `${randomLetters}-${year}-${randomNumbers}`;
  }

  function handleGenerateReference() {
    setFormData({ ...formData, reference: generateRandomReference() });
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      setProductImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleRemoveImage() {
    setProductImage(null);
    setImagePreview(null);
  }

  async function generateAIDescription(): Promise<string> {
    try {
      // Appel à l'API pour générer une description avec l'IA
      // Pour l'instant, on simule une réponse. Vous pouvez remplacer par un vrai appel API
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
      // Si l'API n'existe pas encore, générer un texte de base
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
      // Appel à l'API pour générer les CGV avec l'IA
      const response = await apiCall('/api/products/generate-cgv/', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          categoryId: formData.categoryId
        })
      });
      return response?.cgv || response?.text || '';
    } catch (error) {
      // Si l'API n'existe pas encore, générer un texte de base
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
    setLoading(true);

    // Validation: si produit avec rentabilité, les champs requis doivent être remplis
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
          if (isNaN(profitabilityValue)) profitabilityValue = undefined;
        } else {
          // Rentabilité variable : utiliser profitabilityMin pour profitability et profitabilityMax pour variableProfitability
          profitabilityValue = parseFloat(formData.profitabilityMin);
          if (isNaN(profitabilityValue)) profitabilityValue = undefined;
          variableProfitabilityValue = formData.profitabilityMax;
        }
      }

      // Use FormData if image is uploaded, otherwise use JSON
      if (productImage) {
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name);
        formDataToSend.append('reference', formData.reference);
        if (formData.type) formDataToSend.append('type', formData.type);
        if (formData.categoryId) formDataToSend.append('categoryId', formData.categoryId);
        if (formData.subcategory || formData.type) formDataToSend.append('subcategory', formData.subcategory || formData.type || '');
        formDataToSend.append('status', formData.status);
        formDataToSend.append('price', formData.price);
        if (profitabilityValue !== undefined && !isNaN(profitabilityValue)) {
          formDataToSend.append('profitability', profitabilityValue.toString());
        }
        if (formData.noProfitability === 'Non' && formData.duration) formDataToSend.append('duration', formData.duration);
        if (formData.description) formDataToSend.append('description', formData.description);
        if (formData.cgv) formDataToSend.append('cgv', formData.cgv);
        formDataToSend.append('active', (formData.status === 'Actif').toString());
        formDataToSend.append('noProfitability', formData.noProfitability);
        formDataToSend.append('isVariableProfitability', formData.isVariableProfitability);
        if (variableProfitabilityValue) formDataToSend.append('variableProfitability', variableProfitabilityValue);
        if (formData.noProfitability === 'Non') {
          if (formData.profitabilityPeriod) formDataToSend.append('profitabilityPeriod', formData.profitabilityPeriod);
          formDataToSend.append('showMinProfitability', formData.showMinProfitability);
          formDataToSend.append('interestPeriod', formData.interestPeriod.join(', '));
          formDataToSend.append('capitalisationFonds', formData.capitalisationFonds);
        }
        formDataToSend.append('showOnLaunch', formData.showOnLaunch);
        if (formData.availabilityStart) formDataToSend.append('availabilityStart', formData.availabilityStart);
        if (formData.availabilityEnd) formDataToSend.append('availabilityEnd', formData.availabilityEnd);
        formDataToSend.append('isSavings', formData.isSavings.toString());
        formDataToSend.append('linkToAssets', formData.linkToAssets);
        formDataToSend.append('enablePriceVariation', formData.enablePriceVariation);
        if (formData.minEntryValue) formDataToSend.append('minEntryValue', formData.minEntryValue);
        if (formData.maxEntryValue) formDataToSend.append('maxEntryValue', formData.maxEntryValue);
        if (formData.enablePriceVariation === 'Oui') {
          if (formData.minPriceVariation) formDataToSend.append('minPriceVariation', formData.minPriceVariation);
          if (formData.maxPriceVariation) formDataToSend.append('maxPriceVariation', formData.maxPriceVariation);
          if (formData.currentPriceVariation) formDataToSend.append('currentPriceVariation', formData.currentPriceVariation);
        }
        formDataToSend.append('image', productImage);
        
        await apiCall('/api/products/create/', {
          method: 'POST',
          body: formDataToSend
        });
      } else {
        await apiCall('/api/products/create/', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            type: formData.type || undefined,
            price: parseFloat(formData.price),
            profitability: profitabilityValue,
            duration: formData.noProfitability === 'Non' ? formData.duration : undefined,
            categoryId: formData.categoryId || undefined,
            // Use type as subcategory if subcategory is not provided (for Smart Portfolio and other types)
            subcategory: formData.subcategory || formData.type || undefined,
            status: formData.status,
            cgv: formData.cgv || undefined,
            active: formData.status === 'Actif',
            noProfitability: formData.noProfitability,
            variableProfitability: variableProfitabilityValue,
            profitabilityPeriod: formData.noProfitability === 'Non' ? formData.profitabilityPeriod || undefined : undefined,
            showMinProfitability: formData.noProfitability === 'Non' ? formData.showMinProfitability : undefined,
            interestPeriod: formData.noProfitability === 'Non' ? (formData.interestPeriod.length > 0 ? formData.interestPeriod.join(', ') : undefined) : undefined,
            capitalisationFonds: formData.noProfitability === 'Non' ? formData.capitalisationFonds : undefined,
            // Gestion du produit
            showOnLaunch: formData.showOnLaunch,
            availabilityStart: formData.availabilityStart || undefined,
            availabilityEnd: formData.availabilityEnd || undefined,
            isSavings: formData.isSavings,
            linkToAssets: formData.linkToAssets,
            // Gestion des prix
            enablePriceVariation: formData.enablePriceVariation,
            minEntryValue: formData.minEntryValue ? parseFloat(formData.minEntryValue) : undefined,
            maxEntryValue: formData.maxEntryValue ? parseFloat(formData.maxEntryValue) : undefined,
            minPriceVariation: formData.enablePriceVariation === 'Oui' && formData.minPriceVariation ? parseFloat(formData.minPriceVariation) : undefined,
            maxPriceVariation: formData.enablePriceVariation === 'Oui' && formData.maxPriceVariation ? parseFloat(formData.maxPriceVariation) : undefined,
            currentPriceVariation: formData.enablePriceVariation === 'Oui' && formData.currentPriceVariation ? parseFloat(formData.currentPriceVariation) : undefined
          })
        });
      }

      toast.success('Produit créé avec succès');
      navigate('/admin/produits-investissements');
    } catch (error: any) {
      console.error('Error creating product:', error);
      toast.error(error?.message || 'Erreur lors de la création du produit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/produits-investissements')}
          className="page-header-back-button"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="page-title">Nouveau produit financier interne</h1>
          <p className="page-subtitle">Créer un nouveau produit financier de l'établissement</p>
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
                <Label htmlFor="product-type">Type de produit *</Label>
                <Select 
                  value={formData.type || 'none'} 
                  onValueChange={(value) => setFormData({ ...formData, type: value === 'none' ? '' : value })}
                  required
                >
                  <SelectTrigger id="product-type">
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sélectionner un type</SelectItem>
                    {/* Produits d'épargne */}
                    <SelectItem value="Épargne">Épargne</SelectItem>
                    <SelectItem value="Livret">Livret</SelectItem>
                    <SelectItem value="Livret A">Livret A</SelectItem>
                    <SelectItem value="Livret de Développement Durable">Livret de Développement Durable</SelectItem>
                    <SelectItem value="Compte Sur Livret">Compte Sur Livret</SelectItem>
                    
                    {/* Plans d'épargne */}
                    <SelectItem value="PEA">PEA (Plan d'Épargne en Actions)</SelectItem>
                    <SelectItem value="PEL">PEL (Plan d'Épargne Logement)</SelectItem>
                    <SelectItem value="CEL">CEL (Compte Épargne Logement)</SelectItem>
                    
                    {/* Assurance */}
                    <SelectItem value="Assurance vie">Assurance vie</SelectItem>
                    
                    {/* Comptes */}
                    <SelectItem value="Compte titres">Compte titres</SelectItem>
                    
                    {/* Portefeuilles intelligents */}
                    <SelectItem value="Smart Portfolio">Smart Portfolio</SelectItem>
                    
                    {/* Autres produits internes */}
                    <SelectItem value="Autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
            </div>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="product-image">Image du produit</Label>
              {imagePreview ? (
                <div className="space-y-2">
                  <div className="inline-block w-80">
                    <img
                      src={imagePreview}
                      alt="Aperçu"
                      className="h-80 w-80 max-w-80 object-cover rounded-lg border border-gray-300"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Input
                    id="product-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="cursor-pointer max-w-xs"
                  />
                </div>
              )}
              <p className="text-sm text-gray-500">Formats acceptés: JPG, PNG, GIF (max 5MB)</p>
            </div>

            <RichTextEditor
              id="product-description"
              label="Description"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Description détaillée du produit d'investissement..."
              rows={4}
              onGenerateAI={generateAIDescription}
            />

            <RichTextEditor
              id="product-cgv"
              label="CGV (Conditions Générales de Vente)"
              value={formData.cgv}
              onChange={(value) => setFormData({ ...formData, cgv: value })}
              placeholder="Conditions générales de vente du produit..."
              rows={4}
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product-min-entry-value">Valeur minimum d'entrée (€)</Label>
                  <Input
                    id="product-min-entry-value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.minEntryValue}
                    onChange={(e) => setFormData({ ...formData, minEntryValue: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-max-entry-value">Valeur maximum d'entrée (€)</Label>
                  <Input
                    id="product-max-entry-value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.maxEntryValue}
                    onChange={(e) => setFormData({ ...formData, maxEntryValue: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
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

                {formData.enablePriceVariation === 'Oui' && (
                  <div className="grid grid-cols-3 gap-4 pl-4 border-l-2 border-slate-200">
                    <div className="space-y-2">
                      <Label htmlFor="product-min-price-variation">Variation Minimum (€)</Label>
                      <Input
                        id="product-min-price-variation"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.minPriceVariation}
                        onChange={(e) => setFormData({ ...formData, minPriceVariation: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-max-price-variation">Variation Maximum (€)</Label>
                      <Input
                        id="product-max-price-variation"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.maxPriceVariation}
                        onChange={(e) => setFormData({ ...formData, maxPriceVariation: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-current-price-variation">Variation actuelle (€)</Label>
                      <Input
                        id="product-current-price-variation"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.currentPriceVariation}
                        onChange={(e) => setFormData({ ...formData, currentPriceVariation: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
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
                        <SelectItem value="Mensuel">Mensuel</SelectItem>
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
                    <div className="space-y-2 border rounded-md p-4">
                      {['Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Fin de contrat', 'Capitalisation des fonds'].map((option) => (
                        <div key={option} className="flex items-center space-x-2">
                          <Checkbox
                            id={`interest-period-${option}`}
                            checked={formData.interestPeriod.includes(option)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({ ...formData, interestPeriod: [...formData.interestPeriod, option] });
                              } else {
                                setFormData({ ...formData, interestPeriod: formData.interestPeriod.filter(p => p !== option) });
                              }
                            }}
                          />
                          <label
                            htmlFor={`interest-period-${option}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {option}
                          </label>
                        </div>
                      ))}
                    </div>
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
                {loading ? 'Création...' : 'Créer le produit'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default AddProduct;
