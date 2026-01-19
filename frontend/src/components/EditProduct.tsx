import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, Save, RefreshCw, Trash2 } from 'lucide-react';
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
  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [shouldRemoveImage, setShouldRemoveImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  
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
    noProfitability: 'Oui',
    isVariableProfitability: 'Non', // Rentabilité variable (Oui/Non)
    profitabilityRate: '', // Taux de rentabilité unique (si non variable)
    profitabilityMin: '', // Taux minimum (si variable) - valeur du taux de rentabilité
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
    enablePriceVariation: 'Non',
    minEntryValue: '',
    maxEntryValue: '',
    minPriceVariation: '',
    maxPriceVariation: '',
    currentPriceVariation: ''
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
                        (product.variableProfitability && product.variableProfitability !== '' && !isNaN(parseFloat(product.variableProfitability)));
      
      // Formater la rentabilité correctement
      let profitabilityValue = '';
      if (product.profitability !== null && product.profitability !== undefined) {
        const profitNum = typeof product.profitability === 'number' ? product.profitability : parseFloat(product.profitability);
        if (!isNaN(profitNum)) {
          profitabilityValue = profitNum.toString();
        }
      }
      
      // Formater variableProfitability si disponible
      let variableProfitabilityValue = '';
      if (product.variableProfitability && product.variableProfitability !== '') {
        const varProfitNum = typeof product.variableProfitability === 'number' ? product.variableProfitability : parseFloat(product.variableProfitability);
        if (!isNaN(varProfitNum)) {
          variableProfitabilityValue = varProfitNum.toString();
        } else {
          variableProfitabilityValue = product.variableProfitability.toString();
        }
      }
      
      // Déterminer si le produit a une rentabilité
      // Si profitability existe et n'est pas 0/null, alors noProfitability devrait être 'Non'
      const hasProfitability = profitabilityValue !== '' && parseFloat(profitabilityValue) !== 0;
      const finalNoProfitability = hasProfitability ? 'Non' : (product.noProfitability || 'Oui');
      
      // Déterminer isVariableProfitability pour le formulaire
      // Utiliser la valeur du backend si disponible, sinon déduire de isVariable
      const finalIsVariableProfitability = (product.isVariableProfitability && product.isVariableProfitability !== '' && ['Oui', 'Non'].includes(product.isVariableProfitability.trim()))
        ? product.isVariableProfitability.trim()
        : (isVariable ? 'Oui' : 'Non');

      // Debug: Log les valeurs de rentabilité
      console.log('=== PRODUCT PROFITABILITY DEBUG ===');
      console.log('Raw product data:', {
        profitability: product.profitability,
        noProfitability: product.noProfitability,
        isVariableProfitability: product.isVariableProfitability,
        variableProfitability: product.variableProfitability,
        interestPeriod: product.interestPeriod,
      });
      const processedInterestPeriod = product.interestPeriod ? String(product.interestPeriod).trim() : '';
      console.log('Processed values:', {
        profitabilityValue,
        hasProfitability,
        isVariable,
        finalNoProfitability,
        finalIsVariableProfitability,
        variableProfitabilityValue,
        profitabilityRate: (finalNoProfitability === 'Non' && finalIsVariableProfitability === 'Non') ? profitabilityValue : '',
        profitabilityMin: (finalNoProfitability === 'Non' && finalIsVariableProfitability === 'Oui') ? profitabilityValue : '',
        profitabilityMax: (finalNoProfitability === 'Non' && finalIsVariableProfitability === 'Oui') ? variableProfitabilityValue : '',
        interestPeriod: processedInterestPeriod,
        interestPeriodRaw: product.interestPeriod,
        interestPeriodType: typeof product.interestPeriod,
      });
      
      setFormData({
        name: product.name || '',
        reference: product.reference || '',
        type: product.type || '', // Now available from serializer (maps to subcategory)
        categoryId: product.categoryId || '',
        subcategory: product.subcategory || '',
        status: product.status || 'Brouillon',
        price: product.price?.toString() || '',
        profitability: profitabilityValue,
        duration: product.duration || '',
        description: product.description || '',
        cgv: product.cgv || '',
        noProfitability: finalNoProfitability,
        isVariableProfitability: finalIsVariableProfitability || 'Non', // Ensure it's always 'Oui' or 'Non'
        // Préremplir profitabilityRate si rentabilité fixe (isVariableProfitability === 'Non') et le produit a une rentabilité
        profitabilityRate: (finalNoProfitability === 'Non' && finalIsVariableProfitability === 'Non' && profitabilityValue !== '') ? profitabilityValue : '',
        // Préremplir profitabilityMin et profitabilityMax si rentabilité variable (isVariableProfitability === 'Oui') et le produit a une rentabilité
        profitabilityMin: (finalNoProfitability === 'Non' && finalIsVariableProfitability === 'Oui' && profitabilityValue !== '') ? profitabilityValue : '',
        profitabilityMax: (finalNoProfitability === 'Non' && finalIsVariableProfitability === 'Oui' && variableProfitabilityValue !== '') ? variableProfitabilityValue : '',
        profitabilityPeriod: product.profitabilityPeriod || '',
        showMinProfitability: product.showMinProfitability || 'Non',
        interestPeriod: processedInterestPeriod,
        capitalisationFonds: product.capitalisationFonds || 'Non',
        showOnLaunch: product.showOnLaunch || 'Non',
        availabilityStart: formatDate(product.availabilityStart),
        availabilityEnd: formatDate(product.availabilityEnd),
        isSavings: product.isSavings || false,
        linkToAssets: product.linkToAssets || 'Non',
        enablePriceVariation: product.enablePriceVariation || 'Non',
        minEntryValue: product.minEntryValue?.toString() || '',
        maxEntryValue: product.maxEntryValue?.toString() || '',
        minPriceVariation: product.minPriceVariation?.toString() || '',
        maxPriceVariation: product.maxPriceVariation?.toString() || '',
        currentPriceVariation: product.currentPriceVariation?.toString() || ''
      });
      
      // Set image preview if product has an image
      console.log('Product imageUrl:', product.imageUrl);
      console.log('Product image field:', product.image);
      if (product.imageUrl && product.imageUrl.trim() !== '') {
        // Only set preview if imageUrl is valid and not empty
        setCurrentImageUrl(product.imageUrl);
        setImagePreview(product.imageUrl);
      } else {
        // No valid image URL - clear preview to show file input
        setCurrentImageUrl(null);
        setImagePreview(null);
        if (product.image) {
          console.warn(`Product has image field but no valid imageUrl. Image may not exist in storage: ${product.image}`);
        }
      }
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
      setShouldRemoveImage(false); // Reset remove flag when new file is selected
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
    setCurrentImageUrl(null);
    setShouldRemoveImage(true);
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

    // Validation des champs obligatoires
    if (!formData.name || !formData.reference || !formData.type) {
      toast.error('Veuillez remplir tous les champs obligatoires (nom, référence, type)');
      setLoading(false);
      return;
    }

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
          toast.error('Le taux minimum et le taux maximum sont requis pour une rentabilité variable');
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

      // Use FormData if image is uploaded or removed, otherwise use JSON
      if (productImage || shouldRemoveImage) {
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name);
        formDataToSend.append('reference', formData.reference);
        if (formData.type) formDataToSend.append('type', formData.type);
        if (formData.categoryId) formDataToSend.append('categoryId', formData.categoryId);
        if (formData.subcategory || formData.type) formDataToSend.append('subcategory', formData.subcategory || formData.type || '');
        formDataToSend.append('status', formData.status);
        formDataToSend.append('price', formData.price);
        // Toujours envoyer profitability si une valeur existe, même si noProfitability est 'Oui'
        // Cela permet de préserver la valeur existante dans la base de données
        if (profitabilityValue !== undefined && !isNaN(profitabilityValue)) {
          formDataToSend.append('profitability', profitabilityValue.toString());
        } else if (formData.profitability && formData.profitability !== '') {
          // Si profitabilityValue n'est pas défini mais qu'il y a une valeur dans formData.profitability, l'envoyer
          const existingProfit = parseFloat(formData.profitability);
          if (!isNaN(existingProfit)) {
            formDataToSend.append('profitability', existingProfit.toString());
          }
        }
        // Always send duration, even if empty
        formDataToSend.append('duration', formData.duration || '');
        // Always send description and cgv, even if empty
        formDataToSend.append('description', formData.description || '');
        formDataToSend.append('cgv', formData.cgv || '');
        formDataToSend.append('active', (formData.status === 'Actif').toString());
        formDataToSend.append('noProfitability', formData.noProfitability);
        formDataToSend.append('isVariableProfitability', formData.isVariableProfitability || 'Non');
        // Always send variableProfitability, even if empty
        formDataToSend.append('variableProfitability', variableProfitabilityValue || '');
        // Always send profitabilityPeriod, even if empty
        formDataToSend.append('profitabilityPeriod', formData.profitabilityPeriod || '');
        formDataToSend.append('showMinProfitability', formData.showMinProfitability);
        // Always send interestPeriod, even if empty - trim to ensure exact matching
        formDataToSend.append('interestPeriod', formData.interestPeriod ? String(formData.interestPeriod).trim() : '');
        formDataToSend.append('capitalisationFonds', formData.capitalisationFonds);
        formDataToSend.append('showOnLaunch', formData.showOnLaunch);
        // Always send availability dates, even if empty
        formDataToSend.append('availabilityStart', formData.availabilityStart || '');
        formDataToSend.append('availabilityEnd', formData.availabilityEnd || '');
        formDataToSend.append('isSavings', formData.isSavings.toString());
        formDataToSend.append('linkToAssets', formData.linkToAssets);
        formDataToSend.append('enablePriceVariation', formData.enablePriceVariation);
        // Always send entry values, even if empty
        formDataToSend.append('minEntryValue', formData.minEntryValue || '');
        formDataToSend.append('maxEntryValue', formData.maxEntryValue || '');
        // Always send price variation fields, even if empty or enablePriceVariation is 'Non'
        formDataToSend.append('minPriceVariation', formData.minPriceVariation || '');
        formDataToSend.append('maxPriceVariation', formData.maxPriceVariation || '');
        formDataToSend.append('currentPriceVariation', formData.currentPriceVariation || '');
        if (productImage) {
          formDataToSend.append('image', productImage);
        }
        if (shouldRemoveImage && !productImage) {
          formDataToSend.append('removeImage', 'true');
        }
        
        await apiCall(`/api/products/${id}/update/`, {
          method: 'PUT',
          body: formDataToSend
        });
      } else {
        // S'assurer que profitability est toujours envoyé si une valeur existe
        let finalProfitabilityValue = profitabilityValue;
        if (finalProfitabilityValue === undefined && formData.profitability && formData.profitability !== '') {
          const existingProfit = parseFloat(formData.profitability);
          if (!isNaN(existingProfit)) {
            finalProfitabilityValue = existingProfit;
          }
        }
        
        // Construire le payload JSON - inclure explicitement tous les champs
        const payload: any = {
          name: formData.name,
          reference: formData.reference,
          type: formData.type || undefined,
          price: parseFloat(formData.price),
          categoryId: formData.categoryId || undefined,
          subcategory: formData.subcategory || formData.type || undefined,
          status: formData.status,
          description: formData.description || undefined,
          cgv: formData.cgv || undefined,
          active: formData.status === 'Actif',
          // Gestion de la rentabilité
          noProfitability: formData.noProfitability,
          isVariableProfitability: formData.isVariableProfitability || 'Non',
          variableProfitability: variableProfitabilityValue || undefined,
          profitabilityPeriod: formData.profitabilityPeriod || undefined,
          showMinProfitability: formData.showMinProfitability,
          interestPeriod: formData.interestPeriod ? String(formData.interestPeriod).trim() : undefined,
          capitalisationFonds: formData.capitalisationFonds,
          duration: formData.duration || undefined,
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
        };
        
        // Toujours inclure profitability si une valeur existe
        if (finalProfitabilityValue !== undefined && !isNaN(finalProfitabilityValue)) {
          payload.profitability = finalProfitabilityValue;
        } else if (formData.profitability && formData.profitability !== '') {
          const existingProfit = parseFloat(formData.profitability);
          if (!isNaN(existingProfit)) {
            payload.profitability = existingProfit;
          }
        }
        
        await apiCall(`/api/products/${id}/update/`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      }

      toast.success('Produit mis à jour avec succès');
      
      // Reload the product data to get the updated image URL
      if (id) {
        await loadProduct(id);
      }
      
      // Small delay to ensure image URL is updated before navigating
      setTimeout(() => {
        navigate('/admin/produits-investissements');
      }, 500);
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
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/produits-investissements')}
          className="page-header-back-button"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="page-title">Modifier le produit financier interne</h1>
          <p className="page-subtitle">Modifier les informations du produit de l'établissement</p>
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
                      onError={(e) => {
                        // If image fails to load, check if it's a URL (not base64)
                        const isUrl = imagePreview && (imagePreview.startsWith('http://') || imagePreview.startsWith('https://'));
                        
                        if (isUrl) {
                          // S3 URL failed - try to get more details about the error
                          console.error('Failed to load image from URL:', imagePreview);
                          console.error('Image element:', e.currentTarget);
                          console.error('Error event:', e);
                          
                          // Try to fetch the URL to see what the actual error is
                          fetch(imagePreview, { method: 'HEAD', mode: 'no-cors' })
                            .then(() => {
                              console.log('HEAD request succeeded (but image still failed to load - might be CORS issue)');
                            })
                            .catch((fetchError) => {
                              console.error('HEAD request also failed:', fetchError);
                            });
                          
                          // Check if URL has query parameters (presigned URL)
                          const hasQueryParams = imagePreview.includes('?');
                          if (hasQueryParams) {
                            console.warn('Presigned URL failed - file may not exist or URL is invalid');
                            console.warn('URL signature might be incorrect or file was deleted');
                          } else {
                            console.warn('Regular URL failed - file may not exist');
                          }
                          
                          // Don't clear immediately - let user see the error
                          // They can manually remove it if needed
                          toast.error('Impossible de charger l\'image. Vérifiez que le fichier existe dans le stockage.');
                        } else {
                          // Base64 preview failed (shouldn't happen, but handle it)
                          console.error('Failed to load base64 preview');
                          setImagePreview(null);
                        }
                      }}
                      onLoad={() => {
                        // Only log for URL images, not base64 previews
                        if (imagePreview && (imagePreview.startsWith('http://') || imagePreview.startsWith('https://'))) {
                          console.log('Image loaded successfully from URL:', imagePreview.substring(0, 100) + '...');
                        }
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const input = document.getElementById('product-image-change') as HTMLInputElement;
                        if (input) {
                          input.click();
                        }
                      }}
                    >
                      Changer l'image
                    </Button>
                    <Input
                      id="product-image-change"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveImage}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer
                    </Button>
                  </div>
                  {currentImageUrl && (
                    <p className="text-xs text-gray-400 break-all">URL: {currentImageUrl}</p>
                  )}
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
                      value={formData.isVariableProfitability || 'Non'} 
                      onValueChange={(value) => {
                        // Ensure value is always 'Oui' or 'Non'
                        const validValue = (value === 'Oui' || value === 'Non') ? value : 'Non';
                        // Transfer value between profitabilityRate and profitabilityMin when switching
                        if (validValue === 'Oui' && formData.isVariableProfitability === 'Non' && formData.profitabilityRate) {
                          // Switching from fixed to variable: transfer taux de rentabilité to taux minimum
                          setFormData({ ...formData, isVariableProfitability: validValue, profitabilityMin: formData.profitabilityRate });
                        } else if (validValue === 'Non' && formData.isVariableProfitability === 'Oui' && formData.profitabilityMin) {
                          // Switching from variable to fixed: transfer taux minimum to taux de rentabilité
                          setFormData({ ...formData, isVariableProfitability: validValue, profitabilityRate: formData.profitabilityMin });
                        } else {
                          setFormData({ ...formData, isVariableProfitability: validValue });
                        }
                      }}
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
                      value={(() => {
                        const validOptions = ['Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Fin de contrat', 'Capitalisation des fonds'];
                        const trimmedValue = formData.interestPeriod ? String(formData.interestPeriod).trim() : '';
                        // Only use the value if it matches a valid option exactly
                        return validOptions.includes(trimmedValue) ? trimmedValue : 'none';
                      })()}
                      onValueChange={(value) => {
                        const newValue = value === 'none' ? '' : value;
                        console.log('interestPeriod changed:', { oldValue: formData.interestPeriod, newValue, value });
                        setFormData({ ...formData, interestPeriod: newValue });
                      }}
                      required
                    >
                      <SelectTrigger id="product-interest-period">
                        <SelectValue placeholder="Sélectionner une période" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sélectionner une période</SelectItem>
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
