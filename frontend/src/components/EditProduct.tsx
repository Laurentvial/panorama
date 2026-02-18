import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { ArrowLeft, Save, RefreshCw, Trash2, Plus, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RichTextEditor } from './RichTextEditor';
import { DateInput } from './ui/date-input';
import '../styles/PageHeader.css';
import '../styles/Modal.css';

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
  const [assets, setAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetAllocations, setAssetAllocations] = useState<Array<{ assetId: string; proportion: string; asset?: any }>>([]);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [selectedAssetsInModal, setSelectedAssetsInModal] = useState<string[]>([]);
  // États pour le modal "Ajouter plusieurs actifs"
  const [showBulkAssetModal, setShowBulkAssetModal] = useState(false);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [loadingAllAssets, setLoadingAllAssets] = useState(false);
  const [selectedAssetsInBulkModal, setSelectedAssetsInBulkModal] = useState<string[]>([]);
  const [bulkFilterType, setBulkFilterType] = useState<string>('all');
  const [bulkFilterCategory, setBulkFilterCategory] = useState<string>('all');
  const [bulkFilterSubcategory, setBulkFilterSubcategory] = useState<string>('all');
  const [bulkFilterExchange, setBulkFilterExchange] = useState<string>('all');
  const [bulkFilterIndex, setBulkFilterIndex] = useState<string>('all');
  
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    type: '',
    categoryId: '',
    subcategory: [] as string[],
    status: 'Brouillon',
    profitability: '',
    duration: '',
    description: '',
    cgv: '',
    // Gestion de la rentabilité
    noProfitability: true, // Par défaut true (pas de rentabilité)
    isVariableProfitability: 'Non', // Rentabilité variable (Oui/Non)
    profitabilityRate: '', // Taux de rentabilité unique (si non variable)
    profitabilityMin: '', // Taux minimum (si variable) - valeur du taux de rentabilité
    profitabilityMax: '', // Taux maximum (si variable)
    profitabilityPeriod: '',
    interestPeriod: [] as string[],
    // Gestion du produit
    availabilityStart: '',
    availabilityEnd: '',
    linkToAssets: false,
    default: false, // Afficher par défaut pour tous les clients
    availableFunds: false, // Fonds disponibles
    // Gestion des prix
    minEntryValue: '',
    maxEntryValue: ''
  });

  useEffect(() => {
    loadCategories();
    if (id) {
      loadProduct(id);
    } else {
      // If no ID is provided, redirect to products list
      setLoadingProduct(false);
      toast.error('ID de produit manquant');
      navigate('/admin/produits-investissements');
    }
  }, [id]);

  useEffect(() => {
    if (!formData.linkToAssets) {
      // Reset allocations when disabled
      setAssetAllocations([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.linkToAssets]);

  async function loadCategories() {
    try {
      const categoriesData = await apiCall('/api/categories/').catch(() => ({ categories: [] }));
      setCategories(categoriesData?.categories || categoriesData || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    }
  }

  const loadAssets = useCallback(async (searchQuery?: string) => {
    try {
      setLoadingAssets(true);
      const url = searchQuery && searchQuery.trim() 
        ? `/api/assets/?search=${encodeURIComponent(searchQuery.trim())}`
        : '/api/assets/';
      const data = await apiCall(url);
      setAssets((data as any)?.assets || []);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Erreur lors du chargement des actifs');
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const loadAllAssets = useCallback(async () => {
    try {
      setLoadingAllAssets(true);
      const data = await apiCall('/api/assets/');
      setAllAssets((data as any)?.assets || []);
    } catch (error) {
      console.error('Error loading all assets:', error);
      toast.error('Erreur lors du chargement des actifs');
      setAllAssets([]);
    } finally {
      setLoadingAllAssets(false);
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    if (!showAssetModal) {
      setAssets([]);
      setAssetSearchQuery('');
      return;
    }

    const timeoutId = setTimeout(() => {
      if (assetSearchQuery.trim().length >= 2) {
        loadAssets(assetSearchQuery);
      } else if (assetSearchQuery.trim().length === 0) {
        setAssets([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [assetSearchQuery, showAssetModal, loadAssets]);

  // Charger tous les actifs quand le modal bulk s'ouvre
  useEffect(() => {
    if (showBulkAssetModal) {
      loadAllAssets();
    } else {
      setAllAssets([]);
      setSelectedAssetsInBulkModal([]);
      setBulkFilterType('all');
      setBulkFilterCategory('all');
      setBulkFilterSubcategory('all');
    }
  }, [showBulkAssetModal, loadAllAssets]);

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
      // Si profitability existe et n'est pas 0/null, alors noProfitability devrait être false
      const hasProfitability = profitabilityValue !== '' && parseFloat(profitabilityValue) !== 0;
      // Convert 'Oui'/'Non' to boolean, or use product.noProfitability if it's already boolean
      let finalNoProfitability: boolean;
      if (typeof product.noProfitability === 'boolean') {
        finalNoProfitability = hasProfitability ? false : product.noProfitability;
      } else {
        // Legacy: convert 'Oui'/'Non' to boolean
        finalNoProfitability = hasProfitability ? false : (product.noProfitability === 'Oui' || product.noProfitability === true);
      }
      
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
        interestPeriod: product.interestPeriod ? String(product.interestPeriod).split(',').map(p => {
          const trimmed = p.trim();
          // Normalize legacy values (masculine -> feminine)
          const legacyMapping: Record<string, string> = {
            'Trimestriel': 'Trimestrielle',
            'Semestriel': 'Semestrielle',
            'Annuel': 'Annuelle',
          };
          return legacyMapping[trimmed] || trimmed;
        }).filter(p => p) : [],
      });
      const processedInterestPeriod = product.interestPeriod ? String(product.interestPeriod).trim() : '';
      console.log('Processed values:', {
        profitabilityValue,
        hasProfitability,
        isVariable,
        finalNoProfitability,
        finalIsVariableProfitability,
        variableProfitabilityValue,
        profitabilityRate: (!finalNoProfitability && finalIsVariableProfitability === 'Non') ? profitabilityValue : '',
        profitabilityMin: profitabilityValue !== '' ? profitabilityValue : '',
        profitabilityMax: variableProfitabilityValue !== '' ? variableProfitabilityValue : '',
        interestPeriod: processedInterestPeriod,
        interestPeriodRaw: product.interestPeriod,
        interestPeriodType: typeof product.interestPeriod,
      });
      
      // Handle type field - use type if available, otherwise fall back to subcategory for display only
      // For existing products created before type field was added, type might be empty
      // We'll use subcategory as a fallback for initial display, but save type separately
      const productTypeFromDB = (product.type || '').trim();
      const productSubcategory = product.subcategory;
      // Convert subcategory to array if it's a string (backward compatibility)
      let subcategoryArray: string[] = [];
      if (Array.isArray(productSubcategory)) {
        subcategoryArray = productSubcategory;
      } else if (typeof productSubcategory === 'string' && productSubcategory.trim()) {
        subcategoryArray = [productSubcategory.trim()];
      }
      // For display: if type is empty but subcategory exists, use subcategory as fallback
      const displayType = productTypeFromDB || (subcategoryArray.length > 0 ? subcategoryArray[0] : '');
      
      console.log('=== PRODUCT TYPE DEBUG ===');
      console.log('Product type field:', product.type);
      console.log('Product subcategory field:', product.subcategory);
      console.log('Subcategory array:', subcategoryArray);
      console.log('Type from DB:', productTypeFromDB);
      console.log('Display type (with fallback):', displayType);
      
      setFormData({
        name: product.name || '',
        reference: product.reference || '',
        // Store the actual type from DB (empty if not set), not the fallback
        // The fallback will be used only for display in the Select component
        type: productTypeFromDB, // Use type from serializer or fall back to subcategory
        categoryId: product.categoryId || '',
        subcategory: subcategoryArray,
        status: product.status || 'Brouillon',
        profitability: profitabilityValue,
        duration: product.duration || '',
        description: product.description || '',
        cgv: product.cgv || '',
        noProfitability: finalNoProfitability,
        isVariableProfitability: finalIsVariableProfitability || 'Non', // Ensure it's always 'Oui' or 'Non'
        // Préremplir profitabilityRate si rentabilité fixe (isVariableProfitability === 'Non') et le produit a une rentabilité
        // finalNoProfitability is boolean: true = no profitability, false = has profitability
        profitabilityRate: (!finalNoProfitability && finalIsVariableProfitability === 'Non' && profitabilityValue !== '') ? profitabilityValue : '',
        // Always load profitabilityMin and profitabilityMax from database columns (profitability and variable_profitability)
        // profitability column = minimum rate, variable_profitability column = maximum rate
        profitabilityMin: profitabilityValue !== '' ? profitabilityValue : '',
        profitabilityMax: variableProfitabilityValue !== '' ? variableProfitabilityValue : '',
        profitabilityPeriod: product.profitabilityPeriod || '',
        interestPeriod: product.interestPeriod ? String(product.interestPeriod).split(',').map(p => {
          const trimmed = p.trim();
          // Normalize legacy values (masculine -> feminine)
          const legacyMapping: Record<string, string> = {
            'Trimestriel': 'Trimestrielle',
            'Semestriel': 'Semestrielle',
            'Annuel': 'Annuelle',
          };
          return legacyMapping[trimmed] || trimmed;
        }).filter(p => p) : [],
        availabilityStart: formatDate(product.availabilityStart),
        availabilityEnd: formatDate(product.availabilityEnd),
        linkToAssets: product.linkToAssets === 'Oui' || product.linkToAssets === true,
        default: product.default || false,
        availableFunds: (product as any).availableFunds ?? (product as any).available_funds ?? false,
        minEntryValue: product.minEntryValue?.toString() || '',
        maxEntryValue: product.maxEntryValue?.toString() || ''
      });

      // Asset allocations (if product is linked to assets)
      const allocationsFromProduct = Array.isArray((product as any).assetAllocations) ? (product as any).assetAllocations : [];
      if (product.linkToAssets === 'Oui' || product.linkToAssets === true) {
        setAssetAllocations(
          allocationsFromProduct.length > 0
            ? allocationsFromProduct.map((a: any) => ({
                assetId: a.assetId || '',
                proportion: (a.proportion ?? '').toString(),
                asset: a.asset || null
              }))
            : []
        );
      } else {
        setAssetAllocations([]);
      }
      
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
          minEntryValue: formData.minEntryValue,
          profitability: profitabilityText
        })
      });
      return response?.description || response?.text || '';
    } catch (error) {
      const parts: string[] = [];
      if (formData.name) parts.push(`Le produit "${formData.name}"`);
      if (formData.minEntryValue) parts.push(`avec un investissement minimum de ${formData.minEntryValue}€`);
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

  // Fonction helper pour vérifier si une valeur est valide
  function isValidValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      const invalidValues = [
        '', 'non défini', 'non définie', 'non spécifié', 'non spécifiée',
        'non renseigné', 'non renseignée', 'aucun', 'aucune', 'null',
        'undefined', 'none', 'n/a', 'na', 'non', 'non applicable'
      ];
      return !invalidValues.includes(trimmed) && trimmed.length > 0;
    }
    if (typeof value === 'number') return !isNaN(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  }

  async function generateAICGV(): Promise<string> {
    try {
      // Filtrer les valeurs invalides avant l'envoi
      const payload: any = {
        name: isValidValue(formData.name) ? formData.name : '',
        reference: isValidValue(formData.reference) ? formData.reference : '',
        type: isValidValue(formData.type) ? formData.type : '',
        categoryId: isValidValue(formData.categoryId) ? formData.categoryId : '',
        subcategory: Array.isArray(formData.subcategory) && formData.subcategory.length > 0 
          ? formData.subcategory.filter(s => isValidValue(s)) 
          : [],
        description: isValidValue(formData.description) ? formData.description : '',
        // Gestion de la rentabilité
        noProfitability: formData.noProfitability,
        isVariableProfitability: formData.isVariableProfitability,
        profitabilityRate: isValidValue(formData.profitabilityRate) ? formData.profitabilityRate : '',
        profitabilityMin: isValidValue(formData.profitabilityMin) ? formData.profitabilityMin : '',
        profitabilityMax: isValidValue(formData.profitabilityMax) ? formData.profitabilityMax : '',
        profitabilityPeriod: isValidValue(formData.profitabilityPeriod) ? formData.profitabilityPeriod : '',
        interestPeriod: Array.isArray(formData.interestPeriod) && formData.interestPeriod.length > 0 
          ? formData.interestPeriod.filter(p => isValidValue(p)) 
          : [],
        // Gestion des prix
        minEntryValue: isValidValue(formData.minEntryValue) ? formData.minEntryValue : '',
        maxEntryValue: isValidValue(formData.maxEntryValue) ? formData.maxEntryValue : '',
        // Durée et disponibilité
        duration: isValidValue(formData.duration) ? formData.duration : '',
        availabilityStart: isValidValue(formData.availabilityStart) ? formData.availabilityStart : '',
        availabilityEnd: isValidValue(formData.availabilityEnd) ? formData.availabilityEnd : '',
        // Options du produit
        linkToAssets: formData.linkToAssets,
        default: formData.default,
        availableFunds: formData.availableFunds
      };

      const response = await apiCall('/api/products/generate-cgv/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      // Vérifier que la réponse contient bien du contenu généré
      const generatedText = response?.cgv || response?.text || '';
      if (!generatedText || generatedText.trim().length === 0) {
        throw new Error('L\'IA n\'a pas généré de contenu. Veuillez réessayer.');
      }
      
      return generatedText;
    } catch (error: any) {
      // Logger l'erreur pour le débogage
      console.error('Erreur lors de la génération des CGV par IA:', error);
      
      // Propager l'erreur au lieu de retourner un texte pré-rempli
      // Le composant RichTextEditor affichera l'erreur via toast
      const errorMessage = error?.message || error?.response?.error || 'Erreur lors de la génération des CGV par IA';
      throw new Error(errorMessage);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    
    setLoading(true);

    // Validation: allocations si produit lié à des actifs
    if (formData.linkToAssets) {
      const cleaned = assetAllocations
        .map((row) => ({
          assetId: (row.assetId || '').trim(),
          proportion: row.proportion
        }))
        .filter((row) => row.assetId || row.proportion);

      if (cleaned.length === 0) {
        toast.error('Veuillez ajouter au moins un actif et une proportion');
        setLoading(false);
        return;
      }

      const ids = cleaned.map((r) => r.assetId).filter(Boolean);
      if (ids.length !== new Set(ids).size) {
        toast.error('Un actif ne peut être sélectionné qu’une seule fois');
        setLoading(false);
        return;
      }

      const proportions = cleaned.map((r) => parseFloat(String(r.proportion)));
      if (proportions.some((p) => isNaN(p) || p <= 0 || p > 100)) {
        toast.error('Chaque proportion doit être un nombre entre 0 et 100');
        setLoading(false);
        return;
      }

      const total = proportions.reduce((acc, p) => acc + p, 0);
      if (Math.abs(total - 100) > 0.01) {
        toast.error('La somme des proportions doit être égale à 100%');
        setLoading(false);
        return;
      }
    }

    // Validation des champs obligatoires
    if (!formData.name || !formData.reference || !formData.type) {
      toast.error('Veuillez remplir tous les champs obligatoires (nom, référence, type)');
      setLoading(false);
      return;
    }

    if (!formData.noProfitability) {
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
      if (!Array.isArray(formData.interestPeriod) || formData.interestPeriod.length === 0) {
        toast.error('Au moins une période d\'intérêt disponible est requise');
        setLoading(false);
        return;
      }
    }

    try {
      // Calculer profitability et variableProfitability selon le type
      let profitabilityValue: number | undefined = undefined;
      let variableProfitabilityValue: string | undefined = undefined;
      
      if (!formData.noProfitability) {
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
        // Always send type, even if empty
        formDataToSend.append('type', formData.type || '');
        if (formData.categoryId) formDataToSend.append('categoryId', formData.categoryId);
        // Send subcategory as JSON array if multiple, otherwise as string
        if (Array.isArray(formData.subcategory) && formData.subcategory.length > 0) {
          formDataToSend.append('subcategory', JSON.stringify(formData.subcategory));
        } else {
          formDataToSend.append('subcategory', '');
        }
        formDataToSend.append('status', formData.status);
        // Price field removed - no longer used in Product model
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
        // Always send interestPeriod, even if empty - join array with comma and space
        formDataToSend.append('interestPeriod', Array.isArray(formData.interestPeriod) && formData.interestPeriod.length > 0 ? formData.interestPeriod.join(', ') : '');
        // Always send availability dates, even if empty
        formDataToSend.append('availabilityStart', formData.availabilityStart || '');
        formDataToSend.append('availabilityEnd', formData.availabilityEnd || '');
        const linkToAssetsValue = formData.linkToAssets ? 'Oui' : 'Non';
        formDataToSend.append('linkToAssets', linkToAssetsValue);
        formDataToSend.append('default', formData.default.toString());
        formDataToSend.append('availableFunds', formData.availableFunds.toString());
        if (formData.linkToAssets) {
          const allocationsPayload = assetAllocations
            .map((row) => ({
              assetId: (row.assetId || '').trim(),
              proportion: parseFloat(String(row.proportion || '0'))
            }))
            .filter((row) => row.assetId && !isNaN(row.proportion) && row.proportion > 0);
          if (allocationsPayload.length > 0) {
            formDataToSend.append('assetAllocations', JSON.stringify(allocationsPayload));
          }
        }
        // Always send entry values, even if empty
        formDataToSend.append('minEntryValue', formData.minEntryValue || '');
        formDataToSend.append('maxEntryValue', formData.maxEntryValue || '');
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
        const typeToSend = formData.type || '';
        console.log('=== SAVING TYPE (JSON) ===');
        console.log('formData.type:', formData.type);
        console.log('Type being sent:', typeToSend);
        const payload: any = {
          name: formData.name,
          reference: formData.reference,
          type: typeToSend,
          // Price field removed - using minEntryValue instead
          categoryId: formData.categoryId || undefined,
          subcategory: Array.isArray(formData.subcategory) && formData.subcategory.length > 0 
            ? formData.subcategory 
            : '',
          status: formData.status,
          description: formData.description || undefined,
          cgv: formData.cgv || undefined,
          // active field removed - using status instead
          // Gestion de la rentabilité
          noProfitability: formData.noProfitability,
          isVariableProfitability: formData.isVariableProfitability || 'Non',
          variableProfitability: variableProfitabilityValue || undefined,
          profitabilityPeriod: formData.profitabilityPeriod || undefined,
          interestPeriod: Array.isArray(formData.interestPeriod) && formData.interestPeriod.length > 0 ? formData.interestPeriod.join(', ') : undefined,
          duration: formData.duration || undefined,
          // Gestion du produit
          availabilityStart: formData.availabilityStart || undefined,
          availabilityEnd: formData.availabilityEnd || undefined,
          linkToAssets: formData.linkToAssets ? 'Oui' : 'Non',
          default: formData.default,
          availableFunds: formData.availableFunds,
          assetAllocations: formData.linkToAssets && assetAllocations.length > 0
            ? assetAllocations
                .map((row) => ({
                  assetId: (row.assetId || '').trim(),
                  proportion: parseFloat(String(row.proportion || '0'))
                }))
                .filter((row) => row.assetId && !isNaN(row.proportion) && row.proportion > 0)
            : undefined,
          // Gestion des prix
          minEntryValue: formData.minEntryValue ? parseFloat(formData.minEntryValue) : undefined,
          maxEntryValue: formData.maxEntryValue ? parseFloat(formData.maxEntryValue) : undefined
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
          <p className="text-accent-foreground">Chargement du produit...</p>
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
                  value={formData.type || (Array.isArray(formData.subcategory) && formData.subcategory.length > 0 ? formData.subcategory[0] : 'none')} 
                  onValueChange={(value) => {
                    const newType = value === 'none' ? '' : value;
                    console.log('Type changed from', formData.type, 'to', newType);
                    setFormData({ ...formData, type: newType });
                  }}
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
                    
                    {/* Produits de placement */}
                    <SelectItem value="ETF">ETF</SelectItem>
                    
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
                    setFormData({ ...formData, categoryId: newCategoryId, subcategory: [] });
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

            <div className="space-y-2">
              <Label htmlFor="product-subcategory">Sous-catégories (optionnel)</Label>
              <Select 
                value=""
                onValueChange={(value) => {
                  if (value && !formData.subcategory.includes(value)) {
                    setFormData({ ...formData, subcategory: [...formData.subcategory, value] });
                  }
                }}
                disabled={!formData.categoryId}
              >
                <SelectTrigger id="product-subcategory">
                  <SelectValue placeholder={formData.categoryId ? "Sélectionner une sous-catégorie" : "Sélectionnez d'abord une catégorie"} />
                </SelectTrigger>
                <SelectContent>
                  {getSubcategoriesForCategory(formData.categoryId)
                    .filter(subcategory => !formData.subcategory.includes(subcategory))
                    .map((subcategory, index) => (
                      <SelectItem key={index} value={subcategory}>
                        {subcategory}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              
              {formData.subcategory.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.subcategory.map((subcategory, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-md text-sm border border-slate-200"
                    >
                      <span>{subcategory}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ 
                            ...formData, 
                            subcategory: formData.subcategory.filter(s => s !== subcategory) 
                          });
                        }}
                        className="ml-1 hover:text-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                    <p className="text-xs text-accent-foreground break-all">URL: {currentImageUrl}</p>
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
              <p className="text-sm text-accent-foreground">Formats acceptés: JPG, PNG, GIF (max 5MB)</p>
            </div>

            <RichTextEditor
              id="product-description"
              label="Description"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Description détaillée du produit d'investissement..."
              rows={10}
              onGenerateAI={generateAIDescription}
            />

            <RichTextEditor
              id="product-cgv"
              label="CGV (Conditions Générales de Vente)"
              value={formData.cgv}
              onChange={(value) => setFormData({ ...formData, cgv: value })}
              placeholder="Conditions générales de vente du produit..."
              rows={10}
              onGenerateAI={generateAICGV}
            />

            {/* Gestion des prix */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-accent-foreground">Gestion des prix</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product-min-entry-value">Investissement minimum (€)</Label>
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
                  <Label htmlFor="product-max-entry-value">Plafond de souscription (€)</Label>
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

            </div>

            {/* Gestion de la rentabilité */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-accent-foreground">Gestion de la rentabilité</h3>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="product-no-profitability"
                    checked={formData.noProfitability}
                    onCheckedChange={(checked) => setFormData({ ...formData, noProfitability: checked === true })}
                  />
                  <Label htmlFor="product-no-profitability" className="cursor-pointer">
                    Produit sans rentabilité
                  </Label>
                </div>
              </div>

              {!formData.noProfitability && (
                <div className="space-y-4 pl-4 border-l-2 border-slate-200">
                  <div className="space-y-2">
                    <Label htmlFor="product-duration-profitability">Durée (en jours) *</Label>
                    <Input
                      id="product-duration-profitability"
                      type="number"
                      min="1"
                      step="1"
                      value={formData.duration}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          duration: e.target.value.replace(/[^0-9]/g, ''),
                        })
                      }
                      required
                      placeholder="Ex: 365"
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
                        <SelectItem value="Quotidien">Quotidien</SelectItem>
                        <SelectItem value="Hebdomadaire">Hebdomadaire</SelectItem>
                        <SelectItem value="Mensuel">Mensuel</SelectItem>
                        <SelectItem value="Trimestrielle">Trimestrielle</SelectItem>
                        <SelectItem value="Semestrielle">Semestrielle</SelectItem>
                        <SelectItem value="Annuelle">Annuelle</SelectItem>
                        <SelectItem value="Fin de contrat">Fin de contrat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-interest-period">Période d'intérêt disponible *</Label>
                    <Select 
                      value=""
                      onValueChange={(value) => {
                        if (value) {
                          // Ensure interestPeriod is always an array
                          const currentArray = Array.isArray(formData.interestPeriod) 
                            ? formData.interestPeriod 
                            : (formData.interestPeriod ? [String(formData.interestPeriod).trim()] : []);
                          
                          if (!currentArray.includes(value)) {
                            setFormData({ ...formData, interestPeriod: [...currentArray, value] });
                          }
                        }
                      }}
                    >
                      <SelectTrigger id="product-interest-period">
                        <SelectValue placeholder="Sélectionner une période" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Quotidien', 'Hebdomadaire', 'Mensuel', 'Trimestrielle', 'Semestrielle', 'Annuelle', 'Fin de contrat']
                          .filter(option => {
                            const currentArray = Array.isArray(formData.interestPeriod) 
                              ? formData.interestPeriod 
                              : (formData.interestPeriod ? [String(formData.interestPeriod).trim()] : []);
                            return !currentArray.includes(option);
                          })
                          .map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    
                    {(() => {
                      const currentArray = Array.isArray(formData.interestPeriod) 
                        ? formData.interestPeriod 
                        : (formData.interestPeriod ? [String(formData.interestPeriod).trim()] : []);
                      
                      return currentArray.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {currentArray.map((period) => (
                            <div
                              key={period}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-accent-foreground rounded-md text-sm border border-slate-200"
                            >
                              <span>{period}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedArray = currentArray.filter(p => p !== period);
                                  setFormData({ ...formData, interestPeriod: updatedArray });
                                }}
                                className="ml-1 hover:text-red-600 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                </div>
              )}
            </div>

            {/* Gestion du produit */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-accent-foreground">Gestion du produit</h3>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="product-default"
                    checked={formData.default}
                    onCheckedChange={(checked) => setFormData({ ...formData, default: checked === true })}
                  />
                  <Label htmlFor="product-default" className="cursor-pointer">
                    Afficher par défaut (ce produit sera ajouté aux produits actifs de tous les clients)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="product-available-funds"
                    checked={formData.availableFunds}
                    onCheckedChange={(checked) => setFormData({ ...formData, availableFunds: checked === true })}
                  />
                  <Label htmlFor="product-available-funds" className="cursor-pointer">
                    Fonds disponibles
                  </Label>
                </div>
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
            </div>

            {/* Lier le produit à des actifs */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="product-link-to-assets"
                  checked={formData.linkToAssets}
                  onCheckedChange={(checked) => setFormData({ ...formData, linkToAssets: checked === true })}
                />
                <Label htmlFor="product-link-to-assets" className="text-base font-semibold cursor-pointer">
                  Lier le produit à des actifs
                </Label>
              </div>

              {formData.linkToAssets && (
                <div className="space-y-4 pl-4 border-l-2 border-slate-200 mt-4">
                  <div className="text-sm text-accent-foreground">
                    Sélectionnez les actifs composant le produit et définissez leur proportion (la somme doit faire 100%).
                  </div>

                  {assetAllocations.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 text-sm font-semibold text-accent-foreground">Logo</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-accent-foreground">Nom</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-accent-foreground">Référence</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-accent-foreground">Proportion (%)</th>
                            <th className="text-right py-2 px-3 text-sm font-semibold text-accent-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assetAllocations.map((row, idx) => {
                            const asset = assets.find(a => a.id === row.assetId) || row.asset;
                            return (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-3 px-3">
                                  {asset?.logoUrl ? (
                                    <img 
                                      src={asset.logoUrl} 
                                      alt={asset.name || ''} 
                                      className="w-8 h-8 object-contain rounded"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center text-xs text-accent-foreground">
                                      {asset?.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-sm text-accent-foreground">{asset?.name || '-'}</td>
                                <td className="py-3 px-3 text-sm text-accent-foreground">{asset?.reference || '-'}</td>
                                <td className="py-3 px-3">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={row.proportion}
                                    onChange={(e) => {
                                      const next = [...assetAllocations];
                                      next[idx] = { ...next[idx], proportion: e.target.value };
                                      setAssetAllocations(next);
                                    }}
                                    placeholder="0"
                                    className="w-24"
                                  />
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setAssetAllocations(assetAllocations.filter((_, i) => i !== idx));
                                    }}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedAssetsInModal([]);
                          setAssetSearchQuery('');
                          setShowAssetModal(true);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter un actif
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowBulkAssetModal(true);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter plusieurs actifs
                      </Button>
                    </div>

                    {(() => {
                      const total = assetAllocations.reduce((acc, r) => acc + (parseFloat(String(r.proportion)) || 0), 0);
                      const ok = Math.abs(total - 100) <= 0.01;
                      return (
                        <div className={`text-sm font-medium ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                          Total: {Number.isFinite(total) ? total.toFixed(2) : '0.00'}%
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Modal pour sélectionner des actifs */}
            {showAssetModal && (
              <div className="modal-overlay" onClick={() => setShowAssetModal(false)}>
                <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '42rem', maxHeight: '90vh' }}>
                  <div className="modal-header">
                    <h2 className="modal-title">Sélectionner des actifs</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={() => setShowAssetModal(false)}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>
                  <div className="modal-form-field">
                    <Input
                      type="text"
                      placeholder="Rechercher un actif... (minimum 2 caractères)"
                      value={assetSearchQuery}
                      onChange={(e) => setAssetSearchQuery(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: '1rem' }}>
                    {!assetSearchQuery || assetSearchQuery.trim().length < 2 ? (
                      <div className="text-center py-8 text-accent-foreground">
                        Tapez au moins 2 caractères pour rechercher des actifs
                      </div>
                    ) : loadingAssets ? (
                      <div className="text-center py-8 text-accent-foreground">Chargement...</div>
                    ) : (
                      <div className="space-y-2">
                        {assets.map((asset: any) => {
                            const isSelected = selectedAssetsInModal.includes(asset.id);
                            const isAlreadyAdded = assetAllocations.some(a => a.assetId === asset.id);
                            return (
                              <div
                                key={asset.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50'
                                    : isAlreadyAdded
                                    ? 'border-slate-200 bg-slate-50 opacity-50'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    if (isAlreadyAdded) return;
                                    if (checked) {
                                      setSelectedAssetsInModal(prev => [...prev, asset.id]);
                                    } else {
                                      setSelectedAssetsInModal(prev => prev.filter(id => id !== asset.id));
                                    }
                                  }}
                                  disabled={isAlreadyAdded}
                                />
                                {asset.logoUrl ? (
                                  <img 
                                    src={asset.logoUrl} 
                                    alt={asset.name || ''} 
                                    className="w-10 h-10 object-contain rounded"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-sm text-accent-foreground">
                                    {asset.name?.charAt(0)?.toUpperCase() || '?'}
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="font-medium text-accent-foreground">{asset.name}</div>
                                  <div className="text-sm text-accent-foreground">
                                    {asset.reference && `${asset.reference} • `}
                                    {asset.type}
                                  </div>
                                </div>
                                {isAlreadyAdded && (
                                  <span className="text-xs text-accent-foreground">Déjà ajouté</span>
                                )}
                              </div>
                            );
                          })}
                        {assets.length === 0 && !loadingAssets && (
                          <div className="text-center py-8 text-accent-foreground">Aucun actif trouvé</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="modal-form-actions" style={{ marginTop: '1rem' }}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAssetModal(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const newAllocations = selectedAssetsInModal.map(assetId => {
                          const asset = assets.find(a => a.id === assetId);
                          return {
                            assetId,
                            proportion: '',
                            asset
                          };
                        });
                        
                        // Calculer automatiquement les proportions
                        const totalAssets = assetAllocations.length + newAllocations.length;
                        const proportionPerAsset = totalAssets > 0 ? (100 / totalAssets).toFixed(2) : '0';
                        
                        // Mettre à jour les proportions existantes et nouvelles
                        const updatedExisting = assetAllocations.map(a => ({
                          ...a,
                          proportion: proportionPerAsset
                        }));
                        const updatedNew = newAllocations.map(a => ({
                          ...a,
                          proportion: proportionPerAsset
                        }));
                        
                        setAssetAllocations([...updatedExisting, ...updatedNew]);
                        // S'assurer que la checkbox "Lier le produit à des actifs" est cochée
                        if (!formData.linkToAssets) {
                          setFormData({ ...formData, linkToAssets: true });
                        }
                        setSelectedAssetsInModal([]);
                        setAssetSearchQuery('');
                        setShowAssetModal(false);
                      }}
                      disabled={selectedAssetsInModal.length === 0}
                    >
                      Ajouter ({selectedAssetsInModal.length})
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal pour ajouter plusieurs actifs avec filtres */}
            {showBulkAssetModal && (
              <div className="modal-overlay" onClick={() => setShowBulkAssetModal(false)}>
                <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '50rem', maxHeight: '90vh' }}>
                  <div className="modal-header">
                    <h2 className="modal-title">Ajouter plusieurs actifs</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={() => setShowBulkAssetModal(false)}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>
                  
                  {/* Filtres */}
                  <div className="space-y-4 mb-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bulk-filter-type">Type</Label>
                        <Select 
                          value={bulkFilterType} 
                          onValueChange={(value) => {
                            setBulkFilterType(value);
                            setBulkFilterSubcategory('all'); // Reset subcategory when type changes
                          }}
                        >
                          <SelectTrigger id="bulk-filter-type">
                            <SelectValue placeholder="Tous les types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous les types</SelectItem>
                            {(Array.from(new Set(allAssets.map((a: any) => a.type).filter(Boolean))) as string[]).sort().map((type: string) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="bulk-filter-exchange">Exchange (Bourse)</Label>
                        <Select 
                          value={bulkFilterExchange} 
                          onValueChange={setBulkFilterExchange}
                        >
                          <SelectTrigger id="bulk-filter-exchange">
                            <SelectValue placeholder="Toutes les bourses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les bourses</SelectItem>
                            {(Array.from(new Set(allAssets.map((a: any) => a.exchange).filter(Boolean))) as string[]).sort().map((exchange: string) => (
                              <SelectItem key={exchange} value={exchange}>{exchange}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="bulk-filter-index">Indice</Label>
                        <Select 
                          value={bulkFilterIndex} 
                          onValueChange={setBulkFilterIndex}
                        >
                          <SelectTrigger id="bulk-filter-index">
                            <SelectValue placeholder="Tous les indices" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous les indices</SelectItem>
                            <SelectItem value="nasdaq">NASDAQ Composite</SelectItem>
                            <SelectItem value="sp500">S&P 500</SelectItem>
                            <SelectItem value="dowjones">Dow Jones Industrial Average</SelectItem>
                            <SelectItem value="cac40">CAC 40</SelectItem>
                            <SelectItem value="dax">DAX</SelectItem>
                            <SelectItem value="ftse100">FTSE 100</SelectItem>
                            <SelectItem value="cacmid60">CAC Mid 60</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="bulk-filter-category">Catégorie</Label>
                        <Select 
                          value={bulkFilterCategory} 
                          onValueChange={(value) => {
                            setBulkFilterCategory(value);
                            setBulkFilterSubcategory('all'); // Reset subcategory when category changes
                          }}
                        >
                          <SelectTrigger id="bulk-filter-category">
                            <SelectValue placeholder="Toutes les catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les catégories</SelectItem>
                            {(Array.from(new Set(allAssets.map((a: any) => a.category).filter(Boolean))) as string[]).sort().map((category: string) => (
                              <SelectItem key={category} value={category}>{category}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="bulk-filter-subcategory">Sous-catégorie</Label>
                        <Select 
                          value={bulkFilterSubcategory} 
                          onValueChange={setBulkFilterSubcategory}
                          disabled={bulkFilterCategory === 'all'}
                        >
                          <SelectTrigger id="bulk-filter-subcategory">
                            <SelectValue placeholder={bulkFilterCategory === 'all' ? "Sélectionnez d'abord une catégorie" : "Toutes les sous-catégories"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                            {(() => {
                              const filteredForSubcategory = allAssets.filter((a: any) => 
                                bulkFilterCategory === 'all' || a.category === bulkFilterCategory
                              );
                              return (Array.from(new Set(filteredForSubcategory.map((a: any) => a.subcategory).filter(Boolean))) as string[]).sort().map((subcategory: string) => (
                                <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Liste des actifs filtrés */}
                  {(() => {
                    // Filtrer les actifs selon les critères
                    const filteredAssets = allAssets.filter((asset: any) => {
                      const typeMatch = bulkFilterType === 'all' || asset.type === bulkFilterType;
                      const exchangeMatch = bulkFilterExchange === 'all' || asset.exchange === bulkFilterExchange;
                      const indexMatch = bulkFilterIndex === 'all' || asset.sourceIndex === bulkFilterIndex;
                      const categoryMatch = bulkFilterCategory === 'all' || asset.category === bulkFilterCategory;
                      const subcategoryMatch = bulkFilterSubcategory === 'all' || asset.subcategory === bulkFilterSubcategory;
                      return typeMatch && exchangeMatch && indexMatch && categoryMatch && subcategoryMatch;
                    });

                    // Actifs disponibles (non déjà ajoutés)
                    const availableAssets = filteredAssets.filter((asset: any) => 
                      !assetAllocations.some(a => a.assetId === asset.id)
                    );
                    const availableAssetIds = availableAssets.map((a: any) => a.id);
                    const allAvailableSelected = availableAssetIds.length > 0 && 
                      availableAssetIds.every(id => selectedAssetsInBulkModal.includes(id));

                    return (
                      <>
                        {!loadingAllAssets && filteredAssets.length > 0 && availableAssets.length > 0 && (
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-accent-foreground">
                              {filteredAssets.length} actif{filteredAssets.length > 1 ? 's' : ''} trouvé{filteredAssets.length > 1 ? 's' : ''}
                              {availableAssets.length < filteredAssets.length && (
                                <span className="text-slate-500"> ({availableAssets.length} disponible{availableAssets.length > 1 ? 's' : ''})</span>
                              )}
                            </span>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (allAvailableSelected) {
                                  // Désélectionner tous les actifs disponibles
                                  setSelectedAssetsInBulkModal(prev => 
                                    prev.filter(id => !availableAssetIds.includes(id))
                                  );
                                } else {
                                  // Sélectionner tous les actifs disponibles
                                  setSelectedAssetsInBulkModal(prev => {
                                    const newIds = availableAssetIds.filter(id => !prev.includes(id));
                                    return [...prev, ...newIds];
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
                          {loadingAllAssets ? (
                            <div className="text-center py-8 text-accent-foreground">Chargement...</div>
                          ) : (
                            filteredAssets.length > 0 ? (
                              <div className="space-y-2">
                                {filteredAssets.map((asset: any) => {
                                  const isSelected = selectedAssetsInBulkModal.includes(asset.id);
                                  const isAlreadyAdded = assetAllocations.some(a => a.assetId === asset.id);
                                  return (
                                    <div
                                      key={asset.id}
                                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                        isSelected
                                          ? 'border-blue-500 bg-blue-50'
                                          : isAlreadyAdded
                                          ? 'border-slate-200 bg-slate-50 opacity-50'
                                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                      }`}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          if (isAlreadyAdded) return;
                                          if (checked) {
                                            setSelectedAssetsInBulkModal(prev => [...prev, asset.id]);
                                          } else {
                                            setSelectedAssetsInBulkModal(prev => prev.filter(id => id !== asset.id));
                                          }
                                        }}
                                        disabled={isAlreadyAdded}
                                      />
                                      {asset.logoUrl ? (
                                        <img 
                                          src={asset.logoUrl} 
                                          alt={asset.name || ''} 
                                          className="w-10 h-10 object-contain rounded"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-sm text-accent-foreground">
                                          {asset.name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                      )}
                                      <div className="flex-1">
                                        <div className="font-medium text-accent-foreground">{asset.name}</div>
                                        <div className="text-sm text-accent-foreground">
                                          {asset.reference && `${asset.reference} • `}
                                          {asset.type}
                                          {asset.category && ` • ${asset.category}`}
                                          {asset.subcategory && ` • ${asset.subcategory}`}
                                        </div>
                                      </div>
                                      {isAlreadyAdded && (
                                        <span className="text-xs text-accent-foreground">Déjà ajouté</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-accent-foreground">Aucun actif trouvé avec ces filtres</div>
                            )
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <div className="modal-form-actions" style={{ marginTop: '1rem' }}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowBulkAssetModal(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const newAllocations = selectedAssetsInBulkModal.map(assetId => {
                          const asset = allAssets.find(a => a.id === assetId);
                          return {
                            assetId,
                            proportion: '',
                            asset
                          };
                        });
                        
                        // Calculer automatiquement les proportions
                        const totalAssets = assetAllocations.length + newAllocations.length;
                        const proportionPerAsset = totalAssets > 0 ? (100 / totalAssets).toFixed(2) : '0';
                        
                        // Mettre à jour les proportions existantes et nouvelles
                        const updatedExisting = assetAllocations.map(a => ({
                          ...a,
                          proportion: proportionPerAsset
                        }));
                        const updatedNew = newAllocations.map(a => ({
                          ...a,
                          proportion: proportionPerAsset
                        }));
                        
                        setAssetAllocations([...updatedExisting, ...updatedNew]);
                        // S'assurer que la checkbox "Lier le produit à des actifs" est cochée
                        if (!formData.linkToAssets) {
                          setFormData({ ...formData, linkToAssets: true });
                        }
                        setSelectedAssetsInBulkModal([]);
                        setShowBulkAssetModal(false);
                      }}
                      disabled={selectedAssetsInBulkModal.length === 0}
                    >
                      Ajouter ({selectedAssetsInBulkModal.length})
                    </Button>
                  </div>
                </div>
              </div>
            )}

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
