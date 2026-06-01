import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
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

/** Hauteur fixe (px) du tableau des actifs liés — styles inline pour éviter tout souci de purge Tailwind. */
const LINKED_ASSETS_TABLE_HEIGHT_PX = 360;

/** API may return numeric ids; state must compare consistently or unselect / select-all breaks. */
function formatAssetId(id: string | number | undefined | null): string {
  return id == null ? '' : String(id);
}

function isAssetIdInList(list: string[], assetId: string | number | undefined | null): boolean {
  const key = formatAssetId(assetId);
  return key !== '' && list.some((x) => formatAssetId(x) === key);
}

function toggleAssetIdInList(list: string[], assetId: string | number | undefined | null): string[] {
  const key = formatAssetId(assetId);
  if (!key) return list;
  return isAssetIdInList(list, key)
    ? list.filter((x) => formatAssetId(x) !== key)
    : [...list, key];
}

export function AddProduct() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [technicalSheet, setTechnicalSheet] = useState<File | null>(null);
  const [aiDescriptionContext, setAiDescriptionContext] = useState('');
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
    profitabilityMin: '', // Taux minimum (si variable)
    profitabilityMax: '', // Taux maximum (si variable)
    profitabilityPeriod: '',
    interestPeriod: [] as string[],
    availabilityStart: '',
    availabilityEnd: '',
    linkToAssets: false,
    availableFunds: false, // Fonds disponibles
    // Gestion des prix
    minEntryValue: '',
    maxEntryValue: ''
  });

  function recalibrateAssetAllocationsEqual(
    allocations: Array<{ assetId: string; proportion: string; asset?: any }>,
    decimals = 2
  ) {
    const n = allocations.length;
    if (n === 0) return allocations;

    const factor = Math.pow(10, decimals);
    const totalUnits = 100 * factor;
    const base = Math.floor(totalUnits / n);
    const remainder = totalUnits - base * n;

    return allocations.map((row, idx) => {
      const units = idx === n - 1 ? base + remainder : base;
      return { ...row, proportion: (units / factor).toFixed(decimals) };
    });
  }

  useEffect(() => {
    loadCategories();
  }, []);

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

  function handleTechnicalSheetChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Veuillez sélectionner un fichier PDF');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error('La fiche technique ne doit pas dépasser 20 Mo');
        return;
      }
      setTechnicalSheet(file);
    }
  }

  function handleRemoveTechnicalSheet() {
    setTechnicalSheet(null);
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
          type: formData.type,
          reference: formData.reference,
          categoryId: formData.categoryId,
          subcategory: Array.isArray(formData.subcategory) ? formData.subcategory : [],
          minEntryValue: formData.minEntryValue,
          maxEntryValue: formData.maxEntryValue,
          profitability: profitabilityText,
          noProfitability: formData.noProfitability,
          isVariableProfitability: formData.isVariableProfitability,
          profitabilityRate: formData.profitabilityRate,
          profitabilityMin: formData.profitabilityMin,
          profitabilityMax: formData.profitabilityMax,
          profitabilityPeriod: formData.profitabilityPeriod,
          interestPeriod: Array.isArray(formData.interestPeriod) ? formData.interestPeriod : [],
          duration: formData.duration,
          availableFunds: formData.availableFunds,
          availabilityStart: formData.availabilityStart,
          availabilityEnd: formData.availabilityEnd,
          existingDescription: (formData.description || '').trim(),
          userPrompt: (aiDescriptionContext || '').trim(),
        })
      });
      return response?.description || response?.text || '';
    } catch (error) {
      // Si l'API n'existe pas encore, générer un texte de base
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
        availableFunds: formData.availableFunds,
        // Texte existant pour amélioration (si non vide)
        existingCgv: (formData.cgv || '').trim()
      };

      // Appel à l'API pour générer les CGV avec l'IA
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

    // Validation: si produit avec rentabilité, les champs requis doivent être remplis
    if (!formData.noProfitability) {
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
      if (!Array.isArray(formData.interestPeriod) || formData.interestPeriod.length === 0) {
        toast.error('La période d\'intérêt disponible est requise');
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

      // Use FormData if image or fiche technique is uploaded, otherwise use JSON
      if (productImage || technicalSheet) {
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name);
        formDataToSend.append('reference', formData.reference);
        if (formData.type) formDataToSend.append('type', formData.type);
        if (formData.categoryId) formDataToSend.append('categoryId', formData.categoryId);
        if (Array.isArray(formData.subcategory) && formData.subcategory.length > 0) {
          formDataToSend.append('subcategory', JSON.stringify(formData.subcategory));
        } else {
          formDataToSend.append('subcategory', '');
        }
        formDataToSend.append('status', formData.status);
        // Price = minEntryValue if maxEntryValue is empty, otherwise use minEntryValue as base
        // Price is no longer used - removed from model
        if (profitabilityValue !== undefined && !isNaN(profitabilityValue)) {
          formDataToSend.append('profitability', profitabilityValue.toString());
        }
        // Always send duration (empty = durée indéterminée)
        formDataToSend.append('duration', formData.duration || '');
        if (formData.description) formDataToSend.append('description', formData.description);
        if (formData.cgv) formDataToSend.append('cgv', formData.cgv);
        formDataToSend.append('active', (formData.status === 'Actif').toString());
        formDataToSend.append('noProfitability', String(formData.noProfitability));
        formDataToSend.append('isVariableProfitability', String(formData.isVariableProfitability));
        if (variableProfitabilityValue) formDataToSend.append('variableProfitability', variableProfitabilityValue);
        if (!formData.noProfitability) {
          if (formData.profitabilityPeriod) formDataToSend.append('profitabilityPeriod', formData.profitabilityPeriod);
          formDataToSend.append('interestPeriod', formData.interestPeriod.join(', '));
        }
        if (formData.availabilityStart) formDataToSend.append('availabilityStart', formData.availabilityStart);
        if (formData.availabilityEnd) formDataToSend.append('availabilityEnd', formData.availabilityEnd);
        formDataToSend.append('linkToAssets', formData.linkToAssets ? 'Oui' : 'Non');
        if (formData.linkToAssets) {
          const allocationsPayload = assetAllocations
            .map((row) => ({
              assetId: (row.assetId || '').trim(),
              proportion: parseFloat(String(row.proportion))
            }))
            .filter((row) => row.assetId && !isNaN(row.proportion));
          formDataToSend.append('assetAllocations', JSON.stringify(allocationsPayload));
        }
        if (formData.minEntryValue) formDataToSend.append('minEntryValue', formData.minEntryValue);
        if (formData.maxEntryValue) formDataToSend.append('maxEntryValue', formData.maxEntryValue);
        if (productImage) {
          formDataToSend.append('image', productImage);
        }
        if (technicalSheet) {
          formDataToSend.append('technicalSheet', technicalSheet);
        }
        
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
            // Price field removed - using minEntryValue instead
            profitability: profitabilityValue,
            duration: formData.duration || '',
            categoryId: formData.categoryId || undefined,
            subcategory: Array.isArray(formData.subcategory) && formData.subcategory.length > 0 
              ? formData.subcategory 
              : [],
            status: formData.status,
            cgv: formData.cgv || undefined,
            // active field removed - using status instead
            noProfitability: formData.noProfitability,
            variableProfitability: variableProfitabilityValue,
            profitabilityPeriod: !formData.noProfitability ? formData.profitabilityPeriod || undefined : undefined,
            interestPeriod: !formData.noProfitability ? (formData.interestPeriod.length > 0 ? formData.interestPeriod.join(', ') : undefined) : undefined,
            availabilityStart: formData.availabilityStart || undefined,
            availabilityEnd: formData.availabilityEnd || undefined,
            linkToAssets: formData.linkToAssets ? 'Oui' : 'Non',
            availableFunds: formData.availableFunds,
            assetAllocations: formData.linkToAssets
              ? assetAllocations
                  .map((row) => ({
                    assetId: (row.assetId || '').trim(),
                    proportion: parseFloat(String(row.proportion))
                  }))
                  .filter((row) => row.assetId && !isNaN(row.proportion))
              : undefined,
            // Gestion des prix
            minEntryValue: formData.minEntryValue ? parseFloat(formData.minEntryValue) : undefined,
            maxEntryValue: formData.maxEntryValue ? parseFloat(formData.maxEntryValue) : undefined
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

  function preventSubmitOnEnter(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const target = e.target as Element | null;
    if (!(target instanceof HTMLInputElement)) return;
    const inputType = (target.type || 'text').toLowerCase();
    if (!['text', 'number', 'email', 'search'].includes(inputType)) return;
    e.preventDefault();
  }

  function renderSubmitActions() {
    const actionBar = (
      <div
        className="z-50 border-t border-slate-200 bg-white shadow-[0_-10px_24px_rgba(0,0,0,0.12)]"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}
      >
        <div
          className="mx-auto flex max-w-[1600px] justify-center gap-4 px-6 pt-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/admin/produits-investissements')}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            form="add-product-form"
            disabled={loading}
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Création...' : 'Créer le produit'}
          </Button>
        </div>
      </div>
    );

    if (typeof document !== 'undefined' && document.body) {
      return createPortal(actionBar, document.body);
    }
    return actionBar;
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
          <form id="add-product-form" onSubmit={handleSubmit} onKeyDown={preventSubmitOnEnter} className="space-y-6 pb-24">
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
                    
                    {/* Produits de placement */}
                    <SelectItem value="ETF">ETF</SelectItem>
                    <SelectItem value="Scalping">Scalping</SelectItem>
                    
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
                    .map((subcategory) => String(subcategory ?? '').trim())
                    .filter((subcategory) => subcategory.length > 0)
                    .filter((subcategory) => !formData.subcategory.includes(subcategory))
                    .map((subcategory) => (
                      <SelectItem key={subcategory} value={subcategory}>
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

            <div className="space-y-2">
              <Label htmlFor="product-technical-sheet">Fiche technique (PDF)</Label>
              {technicalSheet ? (
                <div className="space-y-2">
                  <div className="text-sm text-slate-700 border border-slate-200 rounded-md px-3 py-2 bg-slate-50">
                    {technicalSheet.name}
                  </div>
                  <Button type="button" variant="outline" onClick={handleRemoveTechnicalSheet}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Retirer le PDF
                  </Button>
                </div>
              ) : (
                <Input
                  id="product-technical-sheet"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleTechnicalSheetChange}
                  className="cursor-pointer max-w-xs"
                />
              )}
              <p className="text-sm text-gray-500">PDF uniquement (max 20 Mo)</p>
            </div>

            <RichTextEditor
              id="product-description"
              label="Description"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Description détaillée du produit d'investissement..."
              rows={10}
              fixedHeight
              onGenerateAI={generateAIDescription}
              aiContextSlot={
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/90 p-3">
                  <Label htmlFor="ai-description-context" className="text-sm font-medium">
                    Contexte pour la génération IA (recommandé)
                  </Label>
                  <Textarea
                    id="ai-description-context"
                    value={aiDescriptionContext}
                    onChange={(e) => setAiDescriptionContext(e.target.value)}
                    placeholder="Décrivez le produit, le public cible, les garanties, le secteur, ce qui le différencie… L’IA s’appuiera sur ce texte en plus des champs du formulaire (nom, durée, rentabilité, etc.)."
                    rows={4}
                    className="resize-y text-sm min-h-[88px]"
                    maxLength={6000}
                  />
                  <p className="text-xs text-slate-500">
                    Renseignez ce bloc si besoin, puis cliquez de nouveau sur l’icône ✨ pour lancer la génération. Laisser le contexte vide reste possible.
                  </p>
                </div>
              }
            />

            <RichTextEditor
              id="product-cgv"
              label="CGV (Conditions Générales de Vente)"
              value={formData.cgv}
              onChange={(value) => setFormData({ ...formData, cgv: value })}
              placeholder="Conditions générales de vente du produit..."
              rows={10}
              fixedHeight
              onGenerateAI={generateAICGV}
            />

            {/* Gestion des prix */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Gestion des prix</h3>
              
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
              <h3 className="text-lg font-semibold text-slate-800">Gestion de la rentabilité</h3>
              
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
                    <Label htmlFor="product-duration-profitability">Durée (en jours)</Label>
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
                      placeholder="Laisser vide pour durée indéterminée"
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
                        if (value && !formData.interestPeriod.includes(value)) {
                          setFormData({ ...formData, interestPeriod: [...formData.interestPeriod, value] });
                        }
                      }}
                    >
                      <SelectTrigger id="product-interest-period">
                        <SelectValue placeholder="Sélectionner une période" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Quotidien', 'Hebdomadaire', 'Mensuel', 'Trimestrielle', 'Semestrielle', 'Annuelle', 'Fin de contrat']
                          .filter(option => !formData.interestPeriod.includes(option))
                          .map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    
                    {formData.interestPeriod.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.interestPeriod.map((period) => (
                          <div
                            key={period}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-md text-sm border border-slate-200"
                          >
                            <span>{period}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ 
                                  ...formData, 
                                  interestPeriod: formData.interestPeriod.filter(p => p !== period) 
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

                </div>
              )}
            </div>

            {/* Gestion du produit */}
            <div className="space-y-4 pt-4 border-t bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Gestion du produit</h3>
              
              <div className="space-y-2">
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
                  <div className="text-sm text-slate-600">
                    Sélectionnez les actifs composant le produit et définissez leur proportion (la somme doit faire 100%).
                  </div>

                  {assetAllocations.length > 0 && (
                    <div
                      className="min-w-0 rounded-lg border border-slate-200 bg-white box-border"
                      style={{
                        height: LINKED_ASSETS_TABLE_HEIGHT_PX,
                        maxHeight: LINKED_ASSETS_TABLE_HEIGHT_PX,
                        overflow: 'hidden',
                        minHeight: 0,
                      }}
                      aria-label="Liste des actifs liés (zone défilante)"
                    >
                      <div
                        className="box-border"
                        style={{
                          height: '100%',
                          maxHeight: '100%',
                          minHeight: 0,
                          overflowY: 'auto',
                          overflowX: 'auto',
                          overscrollBehaviorY: 'contain',
                          WebkitOverflowScrolling: 'touch',
                        }}
                      >
                      <table className="w-full border-collapse">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Logo</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Nom</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Référence</th>
                            <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Proportion (%)</th>
                            <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Actions</th>
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
                                    <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center text-xs text-slate-500">
                                      {asset?.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-sm text-slate-900">{asset?.name || '-'}</td>
                                <td className="py-3 px-3 text-sm text-slate-600">{asset?.reference || '-'}</td>
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
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setAssetAllocations(recalibrateAssetAllocationsEqual(assetAllocations));
                        }}
                        disabled={assetAllocations.length === 0}
                        title="Répartit automatiquement à parts égales pour retomber sur 100%"
                      >
                        Recalibrer les proportions
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setAssetAllocations([]);
                          toast.success('Tous les actifs liés ont été retirés');
                        }}
                        disabled={assetAllocations.length === 0}
                        title="Retirer tous les actifs de la composition du produit"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Tout retirer
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
                      <div className="text-center py-8 text-slate-500">
                        Tapez au moins 2 caractères pour rechercher des actifs
                      </div>
                    ) : loadingAssets ? (
                      <div className="text-center py-8 text-slate-500">Chargement...</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedAssetsInModal.length > 0 && (
                          <div className="flex justify-end -mt-1 mb-1">
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setSelectedAssetsInModal([]);
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              Tout désélectionner
                            </a>
                          </div>
                        )}
                        {assets.map((asset: any) => {
                            const isSelected = isAssetIdInList(selectedAssetsInModal, asset.id);
                            const isAlreadyAdded = assetAllocations.some(
                              (a) => formatAssetId(a.assetId) === formatAssetId(asset.id)
                            );
                            return (
                              <div
                                key={asset.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                  isSelected && !isAlreadyAdded
                                    ? 'border-blue-500 bg-blue-50'
                                    : isAlreadyAdded
                                    ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                                title={
                                  isAlreadyAdded
                                    ? "Décocher pour retirer cet actif du produit"
                                    : undefined
                                }
                              >
                                <Checkbox
                                  checked={isSelected || isAlreadyAdded}
                                  onCheckedChange={() => {
                                    if (isAlreadyAdded) {
                                      setAssetAllocations((prev) => {
                                        const next = prev.filter(
                                          (a) =>
                                            formatAssetId(a.assetId) !== formatAssetId(asset.id)
                                        );
                                        return recalibrateAssetAllocationsEqual(next);
                                      });
                                      setSelectedAssetsInModal((prev) =>
                                        prev.filter(
                                          (x) => formatAssetId(x) !== formatAssetId(asset.id)
                                        )
                                      );
                                      return;
                                    }
                                    setSelectedAssetsInModal((prev) => toggleAssetIdInList(prev, asset.id));
                                  }}
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
                                  <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-sm text-slate-500">
                                    {asset.name?.charAt(0)?.toUpperCase() || '?'}
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="font-medium text-slate-900">{asset.name}</div>
                                  <div className="text-sm text-slate-500">
                                    {asset.reference && `${asset.reference} • `}
                                    {asset.type}
                                  </div>
                                </div>
                                {isAlreadyAdded && (
                                  <span className="text-xs text-emerald-800/90">
                                    Lié — décocher pour retirer
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        {assets.length === 0 && !loadingAssets && (
                          <div className="text-center py-8 text-slate-500">Aucun actif trouvé</div>
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
                        const newAllocations = selectedAssetsInModal.map((assetId) => {
                          const asset = assets.find(
                            (a) => formatAssetId(a.id) === formatAssetId(assetId)
                          );
                          return {
                            assetId,
                            proportion: '',
                            asset
                          };
                        });

                        setAssetAllocations(
                          recalibrateAssetAllocationsEqual([...assetAllocations, ...newAllocations])
                        );
                        setSelectedAssetsInModal([]);
                        setAssetSearchQuery('');
                        setShowAssetModal(false);
                      }}
                      disabled={selectedAssetsInModal.length === 0}
                    >
                      Mettre à jour ({selectedAssetsInModal.length})
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
                            <SelectItem value="ibex35">IBEX 35</SelectItem>
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
                            {(Array.from(new Set(
                              allAssets
                                .map((a: any) => a.category)
                                .filter((c: any) => {
                                  if (!c) return false;
                                  const label = String(c).trim().toLowerCase();
                                  // Some legacy/erroneous imports stored "Sous catégorie" as a category label.
                                  return !['sous catégorie', 'sous-catégorie', 'sous categorie'].includes(label);
                                })
                            )) as string[]).sort().map((category: string) => (
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
                    const availableAssets = filteredAssets.filter(
                      (asset: any) =>
                        !assetAllocations.some(
                          (a) => formatAssetId(a.assetId) === formatAssetId(asset.id)
                        )
                    );
                    const availableAssetIds = availableAssets.map((a: any) => a.id);
                    const allAvailableSelected =
                      availableAssetIds.length > 0 &&
                      availableAssetIds.every((id) => isAssetIdInList(selectedAssetsInBulkModal, id));

                    return (
                      <>
                        {!loadingAllAssets && filteredAssets.length > 0 && (
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <span className="text-sm text-slate-600">
                              {filteredAssets.length} actif{filteredAssets.length > 1 ? 's' : ''} trouvé{filteredAssets.length > 1 ? 's' : ''}
                              {availableAssets.length < filteredAssets.length && (
                                <span className="text-slate-500"> ({availableAssets.length} disponible{availableAssets.length > 1 ? 's' : ''})</span>
                              )}
                            </span>
                            <div className="flex items-center gap-3 text-sm">
                              {selectedAssetsInBulkModal.length > 0 && (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setSelectedAssetsInBulkModal([]);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                >
                                  Tout désélectionner
                                </a>
                              )}
                              {availableAssetIds.length > 0 && !allAvailableSelected && (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setSelectedAssetsInBulkModal((prev) => {
                                      const newIds = availableAssetIds.filter(
                                        (aid) => !isAssetIdInList(prev, aid)
                                      );
                                      return [...prev, ...newIds.map((x) => formatAssetId(x))];
                                    });
                                  }}
                                  className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                >
                                  Tout sélectionner
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: '0.5rem' }}>
                          {loadingAllAssets ? (
                            <div className="text-center py-8 text-slate-500">Chargement...</div>
                          ) : (
                            filteredAssets.length > 0 ? (
                              <div className="space-y-2">
                                {filteredAssets.map((asset: any) => {
                                  const isSelected = isAssetIdInList(
                                    selectedAssetsInBulkModal,
                                    asset.id
                                  );
                                  const isAlreadyAdded = assetAllocations.some(
                                    (a) => formatAssetId(a.assetId) === formatAssetId(asset.id)
                                  );
                                  return (
                                    <div
                                      key={asset.id}
                                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                        isSelected && !isAlreadyAdded
                                          ? 'border-blue-500 bg-blue-50'
                                          : isAlreadyAdded
                                          ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50'
                                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                      }`}
                                      title={
                                        isAlreadyAdded
                                          ? "Décocher pour retirer cet actif du produit"
                                          : undefined
                                      }
                                    >
                                      <Checkbox
                                        checked={isSelected || isAlreadyAdded}
                                        onCheckedChange={() => {
                                          if (isAlreadyAdded) {
                                            setAssetAllocations((prev) => {
                                              const next = prev.filter(
                                                (a) =>
                                                  formatAssetId(a.assetId) !== formatAssetId(asset.id)
                                              );
                                              return recalibrateAssetAllocationsEqual(next);
                                            });
                                            setSelectedAssetsInBulkModal((prev) =>
                                              prev.filter(
                                                (x) =>
                                                  formatAssetId(x) !== formatAssetId(asset.id)
                                              )
                                            );
                                            return;
                                          }
                                          setSelectedAssetsInBulkModal((prev) =>
                                            toggleAssetIdInList(prev, asset.id)
                                          );
                                        }}
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
                                        <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-sm text-slate-500">
                                          {asset.name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                      )}
                                      <div className="flex-1">
                                        <div className="font-medium text-slate-900">{asset.name}</div>
                                        <div className="text-sm text-slate-500">
                                          {asset.reference && `${asset.reference} • `}
                                          {asset.type}
                                          {asset.category && ` • ${asset.category}`}
                                          {asset.subcategory && ` • ${asset.subcategory}`}
                                        </div>
                                      </div>
                                      {isAlreadyAdded && (
                                        <span className="text-xs text-emerald-800/90">
                                          Lié — décocher pour retirer
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-slate-500">Aucun actif trouvé avec ces filtres</div>
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
                        const newAllocations = selectedAssetsInBulkModal.map((assetId) => {
                          const asset = allAssets.find(
                            (a) => formatAssetId(a.id) === formatAssetId(assetId)
                          );
                          return {
                            assetId,
                            proportion: '',
                            asset
                          };
                        });

                        setAssetAllocations(
                          recalibrateAssetAllocationsEqual([...assetAllocations, ...newAllocations])
                        );
                        // S'assurer que la checkbox "Lier le produit à des actifs" est cochée
                        if (!formData.linkToAssets) {
                          setFormData({ ...formData, linkToAssets: true });
                        }
                        setSelectedAssetsInBulkModal([]);
                        setShowBulkAssetModal(false);
                      }}
                      disabled={selectedAssetsInBulkModal.length === 0}
                    >
                      Mettre à jour ({selectedAssetsInBulkModal.length})
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </form>
        </CardContent>
      </Card>
      {renderSubmitActions()}
    </div>
  );
}

export default AddProduct;
