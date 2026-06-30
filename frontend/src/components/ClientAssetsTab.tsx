import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import { TrendingUp, Plus, Trash2, X, Star, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { AssetAvailabilityModal } from './AssetAvailabilityModal';
import { ProductAvailabilityModal } from './ProductAvailabilityModal';
import LoadingIndicator from './LoadingIndicator';
import {
  AssetNameWithLogo,
  getAssetLogoUrl,
  positionsTableBodyClass,
  positionsTableCellClass,
  positionsTableClass,
  positionsTableHeadCellClass,
  positionsTableHeadClass,
  positionsTableHeadRowClass,
  positionsTableRowClass,
  positionsTableShellClass,
} from './positionUtils';
import '../styles/Modal.css';

const TABLE_PAGE_SIZE = 50;

const TABLE_ACTION_CONFIGURE_CLASS =
  'h-8 rounded-md border border-purple-200/80 bg-purple-50/40 px-2.5 text-slate-700 shadow-sm hover:!bg-purple-50 hover:!text-purple-800 transition-colors duration-200';
const TABLE_ACTION_DELETE_CLASS =
  'h-8 rounded-md border border-red-200/80 bg-red-50/40 px-2.5 text-slate-700 shadow-sm hover:!bg-red-50 hover:!text-red-700 transition-colors duration-200';

type InnerAssetsTab = 'products' | 'assets';

interface ClientAssetsTabProps {
  clientId: string;
  client?: any;
  onRefresh?: () => void;
  refreshToken?: number;
}

export function ClientAssetsTab({ clientId, client, onRefresh, refreshToken = 0 }: ClientAssetsTabProps) {
  const [activeInnerTab, setActiveInnerTab] = useState<InnerAssetsTab>('products');
  const [loadedInnerTabs, setLoadedInnerTabs] = useState<Set<InnerAssetsTab>>(new Set());
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [isAddAssetDialogOpen, setIsAddAssetDialogOpen] = useState(false);
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isProductAvailabilityModalOpen, setIsProductAvailabilityModalOpen] = useState(false);
  const [selectedClientAsset, setSelectedClientAsset] = useState<any>(null);
  const [selectedClientProduct, setSelectedClientProduct] = useState<any>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [localClientAssets, setLocalClientAssets] = useState<any[]>([]);
  const [localClientProducts, setLocalClientProducts] = useState<any[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  // Add asset modal: filters + search + multi-select (modal-only; ne pas mélanger avec filterType/filterCategory du tableau)
  const [assetSearchQuery, setAssetSearchQuery] = useState<string>('');
  const [selectedAssetIdsInModal, setSelectedAssetIdsInModal] = useState<Set<string>>(new Set());
  const [filterAssetTypeInModal, setFilterAssetTypeInModal] = useState<string>('all');
  const [filterAssetCategoryInModal, setFilterAssetCategoryInModal] = useState<string>('all');
  const [filterAssetSubcategoryInModal, setFilterAssetSubcategoryInModal] = useState<string>('all');
  // Add product modal: multi-select state (productSearchQuery is modal-only)
  const [selectedProductIdsInModal, setSelectedProductIdsInModal] = useState<Set<string>>(new Set());
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  // Shared product filters for both table and add-product modal
  const [filterProductType, setFilterProductType] = useState<string>('all');
  const [filterProductCategory, setFilterProductCategory] = useState<string>('all');
  const [filterProductSubcategory, setFilterProductSubcategory] = useState<string>('all');
  const [assetsPage, setAssetsPage] = useState(1);
  const [productsPage, setProductsPage] = useState(1);
  const [showTermGains, setShowTermGains] = useState(false);
  const [savingShowTermGains, setSavingShowTermGains] = useState(false);

  useEffect(() => {
    if (client?.showTermGains !== undefined) {
      setShowTermGains(Boolean(client.showTermGains));
    }
  }, [client?.showTermGains]);

  const loadProductsTabData = useCallback(async (options?: { silent?: boolean }) => {
    if (!clientId) {
      setLocalClientProducts([]);
      setAvailableProducts([]);
      setSelectedProductIds(new Set());
      setLoadingProducts(false);
      return;
    }

    if (!options?.silent) {
      setLoadingProducts(true);
    }

    try {
      const [productsData, availableProductsData] = await Promise.all([
        apiCall(`/api/clients/${clientId}/products/`),
        apiCall(`/api/products/`),
      ]);

      setLocalClientProducts((productsData as any)?.products || []);
      setAvailableProducts((availableProductsData as any)?.products || []);
      if (!options?.silent) {
        setSelectedProductIds(new Set());
      }
      setLoadedInnerTabs((prev) => new Set(prev).add('products'));
    } catch (error) {
      console.error('Error loading client products tab data:', error);
      toast.error('Erreur lors du chargement des produits visibles');
    } finally {
      if (!options?.silent) {
        setLoadingProducts(false);
      }
    }
  }, [clientId]);

  const loadAssetsTabData = useCallback(async (options?: { silent?: boolean }) => {
    if (!clientId) {
      setLocalClientAssets([]);
      setAvailableAssets([]);
      setSelectedAssetIds(new Set());
      setLoadingAssets(false);
      return;
    }

    if (!options?.silent) {
      setLoadingAssets(true);
    }

    try {
      const [assetsData, availableAssetsData] = await Promise.all([
        apiCall(`/api/clients/${clientId}/assets/`),
        apiCall(`/api/assets/`),
      ]);

      setLocalClientAssets((assetsData as any)?.assets || []);
      setAvailableAssets((availableAssetsData as any)?.assets || []);
      if (!options?.silent) {
        setSelectedAssetIds(new Set());
      }
      setLoadedInnerTabs((prev) => new Set(prev).add('assets'));
    } catch (error) {
      console.error('Error loading client assets tab data:', error);
      toast.error('Erreur lors du chargement des actifs visibles');
    } finally {
      if (!options?.silent) {
        setLoadingAssets(false);
      }
    }
  }, [clientId]);

  const prevRefreshTokenRef = useRef(refreshToken);
  const loadedInnerTabsRef = useRef(loadedInnerTabs);
  loadedInnerTabsRef.current = loadedInnerTabs;

  useEffect(() => {
    setLoadedInnerTabs(new Set());
    setActiveInnerTab('products');
    void loadProductsTabData();
  }, [clientId, loadProductsTabData]);

  useEffect(() => {
    const isExternalRefresh =
      prevRefreshTokenRef.current !== refreshToken && refreshToken > 0;
    prevRefreshTokenRef.current = refreshToken;
    if (!isExternalRefresh) return;

    if (loadedInnerTabsRef.current.has('products')) {
      void loadProductsTabData({ silent: true });
    }
    if (loadedInnerTabsRef.current.has('assets')) {
      void loadAssetsTabData({ silent: true });
    }
  }, [refreshToken, loadProductsTabData, loadAssetsTabData]);

  function handleInnerTabChange(value: string) {
    const tab = value as InnerAssetsTab;
    setActiveInnerTab(tab);
    if (tab === 'products' && !loadedInnerTabsRef.current.has('products')) {
      void loadProductsTabData();
    } else if (tab === 'assets' && !loadedInnerTabsRef.current.has('assets')) {
      void loadAssetsTabData();
    }
  }

  const getProductSubcategoryList = (productSub: any): string[] => {
    if (Array.isArray(productSub)) return productSub.filter(Boolean).map(String);
    if (productSub === null || productSub === undefined || productSub === '') return [];
    return [String(productSub)];
  };

  const filteredClientAssets = useMemo(() => {
    return localClientAssets.filter((clientAsset: any) => {
      const asset = clientAsset.asset;
      if (!asset) return false;
      const typeMatch = filterType === 'all' || asset.type === filterType;
      const categoryMatch = filterCategory === 'all' || asset.category === filterCategory;
      const subcategoryMatch = filterSubcategory === 'all' || asset.subcategory === filterSubcategory;
      return typeMatch && categoryMatch && subcategoryMatch;
    });
  }, [localClientAssets, filterType, filterCategory, filterSubcategory]);

  const filteredClientProducts = useMemo(() => {
    return localClientProducts.filter((clientProduct: any) => {
      const product = clientProduct.product;
      if (!product) return false;
      const typeMatch = filterProductType === 'all' || product.type === filterProductType;
      const categoryMatch =
        filterProductCategory === 'all' ||
        (product.categoryTitle || product.category?.title) === filterProductCategory;
      const productSubList = getProductSubcategoryList(product.subcategory);
      const subcategoryMatch =
        filterProductSubcategory === 'all' ||
        productSubList.includes(filterProductSubcategory) ||
        product.subcategory === filterProductSubcategory;
      return typeMatch && categoryMatch && subcategoryMatch;
    });
  }, [localClientProducts, filterProductType, filterProductCategory, filterProductSubcategory]);

  const assetsPagination = useMemo(() => {
    const total = filteredClientAssets.length;
    const total_pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    const page = Math.min(Math.max(1, assetsPage), total_pages);
    const start = (page - 1) * TABLE_PAGE_SIZE;
    return {
      page,
      limit: TABLE_PAGE_SIZE,
      total,
      total_pages,
      items: filteredClientAssets.slice(start, start + TABLE_PAGE_SIZE),
    };
  }, [filteredClientAssets, assetsPage]);

  const productsPagination = useMemo(() => {
    const total = filteredClientProducts.length;
    const total_pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    const page = Math.min(Math.max(1, productsPage), total_pages);
    const start = (page - 1) * TABLE_PAGE_SIZE;
    return {
      page,
      limit: TABLE_PAGE_SIZE,
      total,
      total_pages,
      items: filteredClientProducts.slice(start, start + TABLE_PAGE_SIZE),
    };
  }, [filteredClientProducts, productsPage]);

  const assetsPageCheckboxState = useMemo(() => {
    const pageIds = assetsPagination.items
      .map((ca: any) => ca.asset?.id)
      .filter(Boolean) as string[];
    if (pageIds.length === 0) return false;
    const selectedOnPage = pageIds.filter((id) => selectedAssetIds.has(id)).length;
    if (selectedOnPage === 0) return false;
    if (selectedOnPage === pageIds.length) return true;
    return 'indeterminate';
  }, [assetsPagination.items, selectedAssetIds]);

  const productsPageCheckboxState = useMemo(() => {
    const pageIds = productsPagination.items
      .map((cp: any) => cp.product?.id)
      .filter(Boolean) as string[];
    if (pageIds.length === 0) return false;
    const selectedOnPage = pageIds.filter((id) => selectedProductIds.has(id)).length;
    if (selectedOnPage === 0) return false;
    if (selectedOnPage === pageIds.length) return true;
    return 'indeterminate';
  }, [productsPagination.items, selectedProductIds]);

  useEffect(() => {
    setAssetsPage(1);
  }, [filterType, filterCategory, filterSubcategory]);

  useEffect(() => {
    setProductsPage(1);
  }, [filterProductType, filterProductCategory, filterProductSubcategory]);

  useEffect(() => {
    if (assetsPage > assetsPagination.total_pages) {
      setAssetsPage(assetsPagination.total_pages);
    }
  }, [assetsPage, assetsPagination.total_pages]);

  useEffect(() => {
    if (productsPage > productsPagination.total_pages) {
      setProductsPage(productsPagination.total_pages);
    }
  }, [productsPage, productsPagination.total_pages]);

  // Selection handlers for assets
  function handleSelectAsset(assetId: string) {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function handleSelectAllAssets(pageItems: any[]) {
    const pageIds = pageItems.map((ca: any) => ca.asset?.id).filter(Boolean) as string[];
    setSelectedAssetIds((prev) => {
      const allPageSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
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

  function handleSelectAllProducts(pageItems: any[]) {
    const pageIds = pageItems.map((cp: any) => cp.product?.id).filter(Boolean) as string[];
    setSelectedProductIds((prev) => {
      const allPageSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
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
      void loadAssetsTabData({ silent: true });
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
      void loadProductsTabData({ silent: true });
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

  const formatEur = (value: any): string => {
    if (value === null || value === undefined || value === '') return '-';
    const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  };

  const formatSubscriptionText = (minEntry: any, maxEntry: any): string => {
    const hasMin = !(minEntry === null || minEntry === undefined || minEntry === '');
    const hasMax = !(maxEntry === null || maxEntry === undefined || maxEntry === '');
    if (hasMin && hasMax) return `${formatEur(minEntry)} → ${formatEur(maxEntry)}`;
    if (hasMin) return `À partir de ${formatEur(minEntry)}`;
    if (hasMax) return `Jusqu’à ${formatEur(maxEntry)}`;
    return '-';
  };

  const formatProductProfitability = (product: any): { main: string; sub?: string } => {
    if (!product) return { main: '-' };
    if (product.noProfitability === true) return { main: '-' };

    const profitNum =
      product.profitability === null || product.profitability === undefined || product.profitability === ''
        ? NaN
        : typeof product.profitability === 'number'
          ? product.profitability
          : parseFloat(String(product.profitability).replace(',', '.'));

    const isVariable = String(product.isVariableProfitability || '').toLowerCase() === 'oui';
    if (isVariable) {
      const maxNum =
        product.variableProfitability === null || product.variableProfitability === undefined || product.variableProfitability === ''
          ? NaN
          : typeof product.variableProfitability === 'number'
            ? product.variableProfitability
            : parseFloat(String(product.variableProfitability).replace(',', '.'));

      const hasMin = Number.isFinite(profitNum) && profitNum !== 0;
      const hasMax = Number.isFinite(maxNum) && maxNum !== 0;
      if (!hasMin && !hasMax) return { main: '-' };

      const minText = hasMin ? `${profitNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-';
      const maxText = hasMax ? `${maxNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-';
      return { main: `${minText} à ${maxText}`, sub: product.profitabilityPeriod || undefined };
    }

    if (!Number.isFinite(profitNum) || profitNum === 0) return { main: '-' };
    return {
      main: `${profitNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`,
      sub: product.profitabilityPeriod || undefined,
    };
  };

  const openAvailabilityModal = (clientAsset: any) => {
    setSelectedClientAsset(clientAsset);
    setIsAvailabilityModalOpen(true);
  };

  const openProductAvailabilityModal = (clientProduct: any) => {
    setSelectedClientProduct(clientProduct);
    setIsProductAvailabilityModalOpen(true);
  };

  function closeAddAssetModal() {
    setIsAddAssetDialogOpen(false);
    setAssetSearchQuery('');
    setSelectedAssetIdsInModal(new Set());
    setFilterAssetTypeInModal('all');
    setFilterAssetCategoryInModal('all');
    setFilterAssetSubcategoryInModal('all');
  }

  async function handleAddAssets(assetIds: string[]) {
    if (assetIds.length === 0) return;
    const baseTime = Date.now();
    const assetsToAdd = assetIds
      .map((id) => availableAssets.find((a: any) => a.id === id))
      .filter(Boolean) as any[];
    const tempItems = assetsToAdd.map((asset: any, i: number) => ({
      id: `pending-${asset.id}-${baseTime}-${i}`,
      asset,
      featured: false,
    }));
    setLocalClientAssets((prev) => [...prev, ...tempItems]);
    closeAddAssetModal();
    let addedCount = 0;
    let skippedCount = 0;
    try {
      const results = await Promise.allSettled(
        assetIds.map((assetId) =>
          apiCall(`/api/clients/${clientId}/assets/add/`, {
            method: 'POST',
            body: JSON.stringify({ assetId }),
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      results.forEach((result) => {
        if (result.status === 'fulfilled') addedCount++;
        else {
          const err = (result as PromiseRejectedResult).reason;
          const msg = String(err?.message || err || '');
          if (msg.includes('already') || msg.includes('déjà') || msg.includes('assign')) skippedCount++;
        }
      });
      void loadAssetsTabData({ silent: true });
      if (skippedCount > 0) {
        toast.success(`${addedCount} actif(s) ajouté(s), ${skippedCount} déjà assigné(s)`);
      } else {
        toast.success(`${addedCount} actif(s) ajouté(s) avec succès`);
      }
    } catch (error: any) {
      void loadAssetsTabData({ silent: true });
      console.error('Error adding assets:', error);
      toast.error(error.message || "Erreur lors de l'ajout des actifs");
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
      featured: false,
      showRates: true,
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
      void loadProductsTabData({ silent: true });
      if (skippedCount > 0) {
        toast.success(`${addedCount} produit(s) ajouté(s), ${skippedCount} déjà assigné(s)`);
      } else {
        toast.success(`${addedCount} produit(s) ajouté(s) avec succès`);
      }
    } catch (error: any) {
      void loadProductsTabData({ silent: true });
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
      void loadAssetsTabData({ silent: true });
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
      void loadProductsTabData({ silent: true });
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

  async function handleToggleProductRates(clientProductId: string, productId: string, currentShowRates: boolean) {
    const nextShowRates = !currentShowRates;
    setLocalClientProducts((prev) =>
      prev.map((cp: any) =>
        String(cp?.id) === String(clientProductId)
          ? { ...cp, showRates: nextShowRates }
          : cp
      )
    );

    try {
      await apiCall(`/api/clients/${clientId}/products/${productId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showRates: nextShowRates }),
      });
      toast.success(nextShowRates ? 'Taux affichés pour ce produit' : 'Taux masqués pour ce produit');
    } catch (error: any) {
      setLocalClientProducts((prev) =>
        prev.map((cp: any) =>
          String(cp?.id) === String(clientProductId)
            ? { ...cp, showRates: currentShowRates }
            : cp
        )
      );
      console.error('Error toggling product rates:', error);
      toast.error(error.message || 'Erreur lors de la modification des taux');
    }
  }

  function handleAssetAvailabilitySuccess(updatedClientAsset?: any) {
    if (!updatedClientAsset || typeof updatedClientAsset !== 'object') {
      void loadAssetsTabData({ silent: true });
      return;
    }

    const updatedId = String(updatedClientAsset.id || '').trim();
    const updatedAssetId = String(updatedClientAsset.assetId || updatedClientAsset.asset?.id || '').trim();

    setLocalClientAssets((prev) =>
      prev.map((ca: any) => {
        const caId = String(ca?.id || '').trim();
        const caAssetId = String(ca?.assetId || ca?.asset?.id || '').trim();
        const sameClientAsset = updatedId && caId === updatedId;
        const sameAsset = updatedAssetId && caAssetId === updatedAssetId;
        return sameClientAsset || sameAsset ? { ...ca, ...updatedClientAsset } : ca;
      })
    );

    void loadAssetsTabData({ silent: true });
  }

  function handleProductAvailabilitySuccess(updatedClientProduct?: any) {
    if (!updatedClientProduct || typeof updatedClientProduct !== 'object') {
      void loadProductsTabData({ silent: true });
      return;
    }

    const updatedId = String(updatedClientProduct.id || '').trim();
    const updatedProductId = String(updatedClientProduct.productId || updatedClientProduct.product?.id || '').trim();

    setLocalClientProducts((prev) =>
      prev.map((cp: any) => {
        const cpId = String(cp?.id || '').trim();
        const cpProductId = String(cp?.productId || cp?.product?.id || '').trim();
        const sameClientProduct = updatedId && cpId === updatedId;
        const sameProduct = updatedProductId && cpProductId === updatedProductId;
        return sameClientProduct || sameProduct ? { ...cp, ...updatedClientProduct } : cp;
      })
    );

    // Background sync to keep local cache aligned with server.
    void loadProductsTabData({ silent: true });
  }

  async function handleSaveShowTermGains() {
    setSavingShowTermGains(true);
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ showTermGains }),
        headers: { 'Content-Type': 'application/json' },
      });
      toast.success('Affichage des gains au terme mis à jour avec succès');
      onRefresh?.();
    } catch (error: any) {
      console.error('Error saving term gains visibility:', error);
      toast.error(error.message || "Erreur lors de la mise à jour de l'affichage des gains au terme");
      if (client?.showTermGains !== undefined) {
        setShowTermGains(Boolean(client.showTermGains));
      }
    } finally {
      setSavingShowTermGains(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="tab-section-title">Portefeuille client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Si activé, le client verra une colonne « Gains au terme » dans la section Actifs détenus de son portefeuille
              (produits d'investissement uniquement).
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showTermGains"
                checked={showTermGains}
                onCheckedChange={(checked) => setShowTermGains(checked === true)}
              />
              <Label htmlFor="showTermGains" className="font-normal cursor-pointer">
                Afficher les gains au terme
              </Label>
            </div>
            <div className="pt-2">
              <Button onClick={handleSaveShowTermGains} disabled={savingShowTermGains} size="sm">
                {savingShowTermGains ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeInnerTab} onValueChange={handleInnerTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="products">Produits</TabsTrigger>
          <TabsTrigger value="assets">Actifs</TabsTrigger>
        </TabsList>

        {/* Assets Tab */}
        <TabsContent value="assets">
          {loadingAssets && !loadedInnerTabs.has('assets') ? (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingIndicator />
              <p className="mt-4 text-slate-500">Chargement des actifs...</p>
            </div>
          ) : (
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
                      void loadAssetsTabData({ silent: true });
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
              <div className="modal-overlay" onClick={closeAddAssetModal}>
                <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '50rem', maxHeight: '90vh' }}>
                  <div className="modal-header">
                    <h2 className="modal-title">Ajouter un actif</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="modal-close"
                      onClick={closeAddAssetModal}
                    >
                      <X className="planning-icon-md" />
                    </Button>
                  </div>

                  <div className="space-y-4 mb-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="asset-filter-type">Type</Label>
                        <Select
                          value={filterAssetTypeInModal}
                          onValueChange={(value) => {
                            setFilterAssetTypeInModal(value);
                            setFilterAssetSubcategoryInModal('all');
                          }}
                        >
                          <SelectTrigger id="asset-filter-type">
                            <SelectValue placeholder="Tous les types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous les types</SelectItem>
                            {(Array.from(new Set(availableAssets.map((a: any) => a.type).filter(Boolean))) as string[])
                              .sort()
                              .map((type: string) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="asset-filter-category">Catégorie</Label>
                        <Select
                          value={filterAssetCategoryInModal}
                          onValueChange={(value) => {
                            setFilterAssetCategoryInModal(value);
                            setFilterAssetSubcategoryInModal('all');
                          }}
                        >
                          <SelectTrigger id="asset-filter-category">
                            <SelectValue placeholder="Toutes les catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les catégories</SelectItem>
                            {(
                              Array.from(
                                new Set(
                                  availableAssets
                                    .map((a: any) => a.category)
                                    .filter((c: any) => {
                                      if (!c) return false;
                                      const label = String(c).trim().toLowerCase();
                                      return !['sous catégorie', 'sous-catégorie', 'sous categorie'].includes(label);
                                    })
                                )
                              ) as string[]
                            )
                              .sort()
                              .map((cat: string) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="asset-filter-subcategory">Sous-catégorie</Label>
                        <Select value={filterAssetSubcategoryInModal} onValueChange={setFilterAssetSubcategoryInModal}>
                          <SelectTrigger id="asset-filter-subcategory">
                            <SelectValue placeholder="Toutes les sous-catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                            {(() => {
                              const assignedIds = new Set(localClientAssets.map((ca: any) => ca.asset?.id).filter(Boolean));
                              const unassigned = availableAssets.filter((a: any) => !assignedIds.has(a.id));
                              const filteredForSub = unassigned.filter(
                                (a: any) =>
                                  (filterAssetTypeInModal === 'all' || a.type === filterAssetTypeInModal) &&
                                  (filterAssetCategoryInModal === 'all' || a.category === filterAssetCategoryInModal)
                              );
                              return (Array.from(new Set(filteredForSub.map((a: any) => a.subcategory).filter(Boolean))) as string[])
                                .sort()
                                .map((sub: string) => (
                                  <SelectItem key={sub} value={sub}>
                                    {sub}
                                  </SelectItem>
                                ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="asset-search">Rechercher</Label>
                      <Input
                        id="asset-search"
                        type="text"
                        placeholder="Rechercher par nom, type, référence ou catégorie..."
                        value={assetSearchQuery}
                        onChange={(e) => setAssetSearchQuery(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {(() => {
                    const assignedIds = new Set(localClientAssets.map((ca: any) => ca.asset?.id).filter(Boolean));
                    const q = assetSearchQuery.trim().toLowerCase();
                    const filteredAssets = availableAssets.filter((asset: any) => {
                      if (assignedIds.has(asset.id)) return false;
                      const typeMatch = filterAssetTypeInModal === 'all' || asset.type === filterAssetTypeInModal;
                      const categoryMatch = filterAssetCategoryInModal === 'all' || asset.category === filterAssetCategoryInModal;
                      const subMatch = filterAssetSubcategoryInModal === 'all' || asset.subcategory === filterAssetSubcategoryInModal;
                      const searchMatch =
                        !q ||
                        (asset.name || '').toLowerCase().includes(q) ||
                        (asset.type || '').toLowerCase().includes(q) ||
                        (asset.reference || '').toLowerCase().includes(q) ||
                        (asset.category || '').toLowerCase().includes(q) ||
                        (asset.subcategory || '').toLowerCase().includes(q);
                      return typeMatch && categoryMatch && subMatch && searchMatch;
                    });
                    const availableIds = filteredAssets.map((a: any) => a.id);
                    const allAvailableSelected =
                      availableIds.length > 0 && availableIds.every((id: string) => selectedAssetIdsInModal.has(id));

                    return (
                      <>
                        {filteredAssets.length > 0 && (
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-600">
                              {filteredAssets.length} actif{filteredAssets.length > 1 ? 's' : ''} trouvé
                              {filteredAssets.length > 1 ? 's' : ''}
                            </span>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (allAvailableSelected) {
                                  setSelectedAssetIdsInModal((prev) => {
                                    const next = new Set(prev);
                                    availableIds.forEach((id: string) => next.delete(id));
                                    return next;
                                  });
                                } else {
                                  setSelectedAssetIdsInModal((prev) => {
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
                          {filteredAssets.length > 0 ? (
                            <div className="space-y-2">
                              {filteredAssets.map((asset: any) => {
                                const isSelected = selectedAssetIdsInModal.has(asset.id);
                                return (
                                  <div
                                    key={asset.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                      isSelected
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        setSelectedAssetIdsInModal((prev) => {
                                          const next = new Set(prev);
                                          if (checked) next.add(asset.id);
                                          else next.delete(asset.id);
                                          return next;
                                        });
                                      }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-slate-900">{asset.name}</div>
                                      <div className="text-sm text-slate-500">
                                        {asset.type || 'Aucun'} • {asset.reference || 'Aucune référence'}
                                        {asset.category && ` • ${asset.category}`}
                                        {asset.subcategory && ` • ${asset.subcategory}`}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-500">
                              {assetSearchQuery.trim() || filterAssetTypeInModal !== 'all' || filterAssetCategoryInModal !== 'all' || filterAssetSubcategoryInModal !== 'all'
                                ? 'Aucun actif trouvé avec ces filtres'
                                : 'Aucun actif disponible à ajouter'}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <div className="modal-form-actions" style={{ marginTop: '1rem' }}>
                    <Button type="button" variant="outline" onClick={closeAddAssetModal}>
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleAddAssets(Array.from(selectedAssetIdsInModal))}
                      disabled={selectedAssetIdsInModal.size === 0}
                    >
                      Ajouter la sélection ({selectedAssetIdsInModal.size})
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="tab-section-title">
                  Actifs visibles par le client ({filteredClientAssets.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredClientAssets.length > 0 ? (
                  <div className="space-y-4">
                    <div className={positionsTableShellClass}>
                      <div className="overflow-x-auto">
                        <table className={positionsTableClass}>
                          <thead className={positionsTableHeadClass}>
                            <tr className={positionsTableHeadRowClass}>
                              <th className={`${positionsTableHeadCellClass} w-10 pr-0`}>
                                <Checkbox
                                  checked={assetsPageCheckboxState}
                                  onCheckedChange={() => handleSelectAllAssets(assetsPagination.items)}
                                  aria-label="Tout sélectionner"
                                />
                              </th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Type</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Nom</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Référence</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Catégorie</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Sous-catégorie</th>
                              <th className={`${positionsTableHeadCellClass} text-center`}>Mis en avant</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Dates de disponibilité</th>
                              <th className={`${positionsTableHeadCellClass} text-right`}>Actions</th>
                            </tr>
                          </thead>
                          <tbody className={positionsTableBodyClass}>
                            {assetsPagination.items.map((clientAsset: any) => {
                              const asset = clientAsset.asset;
                              if (!asset) return null;
                              const isFeatured = clientAsset.featured || false;
                              return (
                                <tr key={clientAsset.id} className={positionsTableRowClass}>
                                  <td className={`${positionsTableCellClass} w-10 pr-0`}>
                                    <Checkbox
                                      checked={selectedAssetIds.has(asset.id)}
                                      onCheckedChange={() => handleSelectAsset(asset.id)}
                                      aria-label={`Sélectionner ${asset.name}`}
                                    />
                                  </td>
                                  <td className={`${positionsTableCellClass} text-slate-600`}>{asset.type || '-'}</td>
                                  <td className={positionsTableCellClass}>
                                    <AssetNameWithLogo
                                      name={asset.name}
                                      logoUrl={getAssetLogoUrl(asset)}
                                    />
                                  </td>
                                  <td className={`${positionsTableCellClass} font-mono text-xs text-slate-600`}>
                                    {asset.reference || '-'}
                                  </td>
                                  <td className={`${positionsTableCellClass} text-slate-600`}>{asset.category || '-'}</td>
                                  <td className={`${positionsTableCellClass} text-slate-600`}>{asset.subcategory || '-'}</td>
                                  <td className={`${positionsTableCellClass} text-center`}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleFeaturedAsset(clientAsset.id, asset.id, isFeatured)}
                                      className="p-1 hover:bg-transparent cursor-pointer"
                                    >
                                      {isFeatured ? (
                                        <Star className="w-5 h-5 transition-colors" fill="#facc15" stroke="#facc15" />
                                      ) : (
                                        <Star
                                          className="w-5 h-5 transition-colors text-slate-400 hover:text-yellow-300"
                                          fill="none"
                                          stroke="currentColor"
                                        />
                                      )}
                                    </Button>
                                  </td>
                                  <td className={positionsTableCellClass}>
                                    {clientAsset.availabilityStart || clientAsset.availabilityEnd ? (
                                      <div className="text-xs text-slate-600">
                                        {clientAsset.availabilityStart && (
                                          <div>Début: {formatDate(clientAsset.availabilityStart)}</div>
                                        )}
                                        {clientAsset.availabilityEnd && (
                                          <div>Fin: {formatDate(clientAsset.availabilityEnd)}</div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">Toujours visible</span>
                                    )}
                                  </td>
                                  <td className={`${positionsTableCellClass} text-right whitespace-nowrap`}>
                                    <div className="relative flex flex-nowrap justify-end gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openAvailabilityModal(clientAsset)}
                                        className={TABLE_ACTION_CONFIGURE_CLASS}
                                        title="Configurer (disponibilité + personnalisation)"
                                        aria-label="Configurer (disponibilité + personnalisation)"
                                      >
                                        <SlidersHorizontal className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveAsset(asset.id)}
                                        className={TABLE_ACTION_DELETE_CLASS}
                                        title="Retirer l'actif"
                                        aria-label="Retirer l'actif"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <ClientAssetsTablePagination
                      page={assetsPagination.page}
                      totalPages={assetsPagination.total_pages}
                      total={assetsPagination.total}
                      itemLabel="actifs"
                      onPageChange={setAssetsPage}
                    />
                  </div>
                ) : localClientAssets.length > 0 ? (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucun actif ne correspond aux filtres sélectionnés
                  </div>
                ) : (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucun actif assigné
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products">
          {loadingProducts && !loadedInnerTabs.has('products') ? (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingIndicator />
              <p className="mt-4 text-slate-500">Chargement des produits...</p>
            </div>
          ) : (
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
                      void loadProductsTabData({ silent: true });
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
                              const allSubcategories = filteredForSub.flatMap((p: any) => getProductSubcategoryList(p.subcategory));
                              return (Array.from(new Set(allSubcategories)).sort() as string[]).map((sub: string) => (
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
                      const productSubList = getProductSubcategoryList(product.subcategory);
                      const subMatch = filterProductSubcategory === 'all' || productSubList.includes(filterProductSubcategory);
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
                                const profitability = formatProductProfitability(product);
                                const minEntry = product.minEntryValue;
                                const maxEntry = product.maxEntryValue;
                                const subscriptionText = formatSubscriptionText(minEntry, maxEntry);
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
                                      <div className="text-xs text-slate-600 mt-1 flex flex-wrap">
                                        <span>
                                          <span className="text-slate-500">Rentabilité:</span>{' '}{profitability.main}
                                        </span>
                                        <span>{' • '}</span>
                                        <span>
                                          <span className="text-slate-500">Souscription:</span>{' '}{subscriptionText}
                                        </span>
                                        <span>{' • '}</span>
                                        <span>
                                          <span className="text-slate-500">Durée:</span>{' '}{product.duration || '-'}
                                        </span>
                                        {profitability.sub && (
                                          <>
                                            <span>{' • '}</span>
                                            <span>
                                              <span className="text-slate-500">Période:</span>{' '}{profitability.sub}
                                            </span>
                                          </>
                                        )}
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
                <CardTitle className="tab-section-title">
                  Produits visibles par le client ({filteredClientProducts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredClientProducts.length > 0 ? (
                  <div className="space-y-4">
                    <div className={positionsTableShellClass}>
                      <div className="overflow-x-auto">
                        <table className={positionsTableClass}>
                          <thead className={positionsTableHeadClass}>
                            <tr className={positionsTableHeadRowClass}>
                              <th className={`${positionsTableHeadCellClass} w-10 pr-0`}>
                                <Checkbox
                                  checked={productsPageCheckboxState}
                                  onCheckedChange={() => handleSelectAllProducts(productsPagination.items)}
                                  aria-label="Tout sélectionner"
                                />
                              </th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Type</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Nom</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Référence</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Rentabilité</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Souscription</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Durée</th>
                              <th className={`${positionsTableHeadCellClass} text-center`}>Mis en avant</th>
                              <th className={`${positionsTableHeadCellClass} text-center`}>Afficher les taux</th>
                              <th className={`${positionsTableHeadCellClass} text-left`}>Dates de disponibilité</th>
                              <th className={`${positionsTableHeadCellClass} text-right`}>Actions</th>
                            </tr>
                          </thead>
                          <tbody className={positionsTableBodyClass}>
                            {productsPagination.items.map((clientProduct: any) => {
                              const product = clientProduct.product;
                              if (!product) return null;
                              const isFeatured = clientProduct.featured || false;
                              const showRates = clientProduct.showRates !== false;
                              const profitability = formatProductProfitability(product);
                              const minEntry = product.minEntryValue;
                              const maxEntry = product.maxEntryValue;
                              const subscriptionText = formatSubscriptionText(minEntry, maxEntry);
                              const productLogoUrl = String(product.imageUrl || product.image_url || '').trim();
                              return (
                                <tr key={clientProduct.id} className={positionsTableRowClass}>
                                  <td className={`${positionsTableCellClass} w-10 pr-0`}>
                                    <Checkbox
                                      checked={selectedProductIds.has(product.id)}
                                      onCheckedChange={() => handleSelectProduct(product.id)}
                                      aria-label={`Sélectionner ${product.name}`}
                                    />
                                  </td>
                                  <td className={`${positionsTableCellClass} text-slate-600`}>{product.type || '-'}</td>
                                  <td className={positionsTableCellClass}>
                                    <div className="flex min-w-0 items-center gap-2">
                                      <AssetNameWithLogo
                                        name={product.name}
                                        logoUrl={productLogoUrl}
                                        nameClassName="font-medium text-slate-900"
                                      />
                                      {clientProduct.isCustomized ? (
                                        <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                                          Personnalisé
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className={`${positionsTableCellClass} font-mono text-xs text-slate-600`}>
                                    {product.reference || '-'}
                                  </td>
                                  <td className={positionsTableCellClass}>
                                    <div className="text-sm font-medium text-slate-900">{profitability.main}</div>
                                    {profitability.sub && (
                                      <div className="text-xs text-slate-500">{profitability.sub}</div>
                                    )}
                                  </td>
                                  <td className={positionsTableCellClass}>
                                    <div className="text-sm text-slate-900">{subscriptionText}</div>
                                    {product.availableFunds === true && (
                                      <div className="text-xs text-slate-500">Fonds disponibles</div>
                                    )}
                                  </td>
                                  <td className={`${positionsTableCellClass} text-slate-600`}>{product.duration || '-'}</td>
                                  <td className={`${positionsTableCellClass} text-center`}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleFeaturedProduct(clientProduct.id, product.id, isFeatured)}
                                      className="p-1 hover:bg-transparent cursor-pointer"
                                    >
                                      {isFeatured ? (
                                        <Star className="w-5 h-5 transition-colors" fill="#facc15" stroke="#facc15" />
                                      ) : (
                                        <Star
                                          className="w-5 h-5 transition-colors text-slate-400 hover:text-yellow-300"
                                          fill="none"
                                          stroke="currentColor"
                                        />
                                      )}
                                    </Button>
                                  </td>
                                  <td className={`${positionsTableCellClass} text-center`}>
                                    <Checkbox
                                      checked={showRates}
                                      onCheckedChange={() =>
                                        handleToggleProductRates(clientProduct.id, product.id, showRates)
                                      }
                                      aria-label={`${showRates ? 'Masquer' : 'Afficher'} les taux de ${product.name}`}
                                    />
                                  </td>
                                  <td className={positionsTableCellClass}>
                                    {clientProduct.availabilityStart || clientProduct.availabilityEnd ? (
                                      <div className="text-xs text-slate-600">
                                        {clientProduct.availabilityStart && (
                                          <div className="font-medium text-green-600">
                                            Client: {formatDate(clientProduct.availabilityStart)}
                                          </div>
                                        )}
                                        {clientProduct.availabilityEnd && (
                                          <div className="font-medium text-green-600">
                                            Fin: {formatDate(clientProduct.availabilityEnd)}
                                          </div>
                                        )}
                                      </div>
                                    ) : product.availabilityStart || product.availabilityEnd ? (
                                      <div className="text-xs text-slate-500">
                                        {product.availabilityStart && (
                                          <div>Défaut: {formatDate(product.availabilityStart)}</div>
                                        )}
                                        {product.availabilityEnd && (
                                          <div>Fin: {formatDate(product.availabilityEnd)}</div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">Toujours visible</span>
                                    )}
                                  </td>
                                  <td className={`${positionsTableCellClass} text-right whitespace-nowrap`}>
                                    <div className="relative flex flex-nowrap justify-end gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openProductAvailabilityModal(clientProduct)}
                                        className={TABLE_ACTION_CONFIGURE_CLASS}
                                        title="Configurer (disponibilité + personnalisation)"
                                        aria-label="Configurer (disponibilité + personnalisation)"
                                      >
                                        <SlidersHorizontal className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveProduct(product.id)}
                                        className={TABLE_ACTION_DELETE_CLASS}
                                        title="Retirer le produit"
                                        aria-label="Retirer le produit"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <ClientAssetsTablePagination
                      page={productsPagination.page}
                      totalPages={productsPagination.total_pages}
                      total={productsPagination.total}
                      itemLabel="produits"
                      onPageChange={setProductsPage}
                    />
                  </div>
                ) : localClientProducts.length > 0 ? (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucun produit ne correspond aux filtres sélectionnés
                  </div>
                ) : (
                  <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
                    Aucun produit assigné
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}
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
          onSuccess={handleAssetAvailabilitySuccess}
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
          onSuccess={handleProductAvailabilitySuccess}
        />
      )}
    </div>
  );
}

function ClientAssetsTablePagination({
  page,
  totalPages,
  total,
  itemLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-4 sm:flex-row">
      <div className="text-sm text-slate-600">
        Page {page} sur {totalPages} ({total} {itemLabel})
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title="Première page"
        >
          <ChevronLeft className="h-4 w-4" />
          <ChevronLeft className="-ml-2 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Précédent
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }
            return (
              <Button
                key={pageNum}
                variant={page === pageNum ? 'default' : 'outline'}
                size="sm"
                className="min-w-[2.5rem]"
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Suivant
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title="Dernière page"
        >
          <ChevronRight className="h-4 w-4" />
          <ChevronRight className="-ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
