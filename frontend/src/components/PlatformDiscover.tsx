import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, TrendingUp, Coins, BarChart3, Building2, Wallet, DollarSign, Package, ChevronLeft, ChevronRight, Sparkles, CircleDollarSign, MoreHorizontal, Plus } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { MdPadding } from 'react-icons/md';
import { useIsMobile } from './ui/use-mobile';
import { logPlatformAction } from '../utils/platformLogger';

// Component for asset logo with fallback
function AssetLogo({ logoUrl, name, productType, typeColor, getProductTypeIcon }: any) {
  const [logoError, setLogoError] = useState(false);
  
  if (logoUrl && !logoError) {
    return (
      <img 
        src={logoUrl} 
        alt={name || 'Asset logo'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        onError={() => setLogoError(true)}
      />
    );
  }
  
  // Return null if no logo - container will be hidden
  return null;
}

export function PlatformDiscover() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [clientAssets, setClientAssets] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const featuredSliderRef = useRef<HTMLDivElement | null>(null);

  const parseFeatured = (value: any): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true' || value.trim() === '1';
    if (typeof value === 'number') return value === 1;
    return false;
  };

  const scrollFeaturedSlider = (direction: 'left' | 'right') => {
    const slider = featuredSliderRef.current;
    if (!slider) return;
    const step = isMobile ? 280 : 360;
    const delta = direction === 'left' ? -step : step;
    slider.scrollBy({ left: delta, behavior: 'smooth' });
  };

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadDiscoverData();
      
      // Refresh asset prices every 2 minutes (scheduler runs every 10 minutes)
      const priceRefreshInterval = setInterval(() => {
        loadDiscoverData();
      }, 120000); // 2 minutes
      
      return () => {
        clearInterval(priceRefreshInterval);
      };
    }
  }, [currentUser]);

  const loadDiscoverData = async () => {
    try {
      setLoading(true);
      const [clientAssetsResponse, clientProductsResponse, categoriesResponse, positionsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/assets/`),
        apiCall(`/api/clients/${currentUser.id}/products/`).catch((err) => {
          console.warn('Error loading client products:', err);
          return { products: [] };
        }),
        apiCall('/api/categories/').catch((err) => {
          console.warn('Error loading categories:', err);
          return { categories: [] };
        }),
        apiCall(`/api/clients/${currentUser.id}/positions/?status=open`).catch((err) => {
          console.warn('Error loading positions:', err);
          return { positions: [] };
        }),
      ]);
      
      // Extract assets from ClientAsset objects - only show assets the client has access to
      const clientAssets = (clientAssetsResponse as any)?.assets || [];
      console.log('=== PLATFORM DISCOVER DEBUG ===');
      console.log('ClientAssets raw response:', clientAssetsResponse);
      console.log('ClientAssets array:', clientAssets);
      console.log('ClientAssets length:', clientAssets.length);
      
      if (clientAssets.length > 0) {
        console.log('First ClientAsset example:', clientAssets[0]);
        console.log('First ClientAsset asset property:', clientAssets[0]?.asset);
      }
      
      const assetsList = clientAssets.map((ca: any) => {
        // ClientAssetSerializer returns {id, clientId, asset: {...}, featured, ...}
        const asset = ca.asset;
        if (!asset) {
          console.warn('ClientAsset without asset:', ca);
          return null;
        }
        console.log('Extracted asset:', asset.id, asset.name);
        return {
          ...asset,
          isFeatured: parseFeatured(ca.featured),
        };
      }).filter(Boolean);
      
      console.log('Extracted assets:', assetsList);
      console.log('Extracted assets length:', assetsList.length);
      console.log('=== END DEBUG ===');
      setAssets(assetsList);
      setClientAssets(clientAssets);
      
      // Extract products from ClientProduct objects - only show products the client has access to
      const clientProducts = (clientProductsResponse as any)?.products || [];
      const productsList = clientProducts.map((cp: any) => {
        if (!cp?.product) return null;
        return {
          ...cp.product,
          isFeatured: parseFeatured(cp.featured),
        };
      }).filter(Boolean);
      // Filter active products only
      const activeProducts = productsList.filter((p: any) => p.status === 'Actif');
      
      // Enrichir les produits avec le nom de la catégorie
      const categoriesData = categoriesResponse?.categories || categoriesResponse || [];
      setCategories(categoriesData);
      const enrichedProducts = activeProducts.map((p: any) => {
        if (p.categoryId) {
          const category = categoriesData.find((c: any) => c.id === p.categoryId);
          return { ...p, categoryName: category?.title || '' };
        }
        return p;
      });
      
      setProducts(enrichedProducts);
      console.log('Loaded client products:', enrichedProducts.length, 'products (total:', productsList.length, ')');
      console.log('Products details:', enrichedProducts.map((p: any) => ({ 
        id: p.id, 
        name: p.name, 
        type: p.type, 
        categoryName: p.categoryName,
        subcategory: p.subcategory,
        status: p.status
      })));
      
      // Load positions to check which assets are actually in portfolio
      const positionsData = (positionsResponse as any)?.positions || [];
      setPositions(positionsData);
      console.log('Loaded positions:', positionsData.length);
    } catch (error) {
      console.error('Error loading discover data:', error);
      toast.error('Erreur lors du chargement des produits');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAsset = async (assetId: string) => {
    try {
      await apiCall(`/api/clients/${currentUser.id}/assets/add/`, {
        method: 'POST',
        body: JSON.stringify({ assetId }),
      });
      toast.success('Produit ajouté à votre portefeuille');
      loadDiscoverData();
    } catch (error: any) {
      console.error('Error adding asset:', error);
      toast.error(error?.error || 'Erreur lors de l\'ajout du produit');
    }
  };

  // Map asset to product type category
  const getAssetProductType = (asset: any): string => {
    const type = asset.type?.toLowerCase() || '';
    const category = asset.category?.toLowerCase() || '';
    
    // Cryptomonnaies (priorité élevée car peut contenir "crypto" dans d'autres types)
    if (type.includes('crypto') || type.includes('cryptomonnaie') || type.includes('cryptocurrency') ||
        category.includes('crypto') || category.includes('cryptomonnaie') || category.includes('cryptocurrency')) {
      return 'cryptomonnaies';
    }
    
    // Actions (stocks)
    if (type.includes('action') || type.includes('stock') || type.includes('actions') || 
        category.includes('action') || category.includes('stock')) {
      return 'actions';
    }
    
    // ETF
    if (type.includes('etf') || category.includes('etf')) {
      return 'etf';
    }
    
    // Obligations (bonds)
    if (type.includes('obligation') || type.includes('obligations') || type.includes('bond') ||
        category.includes('obligation') || category.includes('bond')) {
      return 'obligations';
    }
    
    // Matières premières (commodities)
    if (type.includes('matiere') || type.includes('commodity') || type.includes('commodities') ||
        category.includes('matiere') || category.includes('commodity')) {
      return 'matieres_premieres';
    }
    
    // Devises (currencies)
    if (type.includes('devise') || type.includes('currency') || type.includes('forex') ||
        category.includes('devise') || category.includes('currency') || category.includes('forex')) {
      return 'devises';
    }
    
    // Épargne (savings)
    if (type.includes('epargne') || type.includes('savings') || type.includes('livret') ||
        category.includes('epargne') || category.includes('savings') || category.includes('livret')) {
      return 'epargne';
    }
    
    // Smart Portfolio
    if (type.includes('smart portfolio') || type.includes('smartportfolio') ||
        category.includes('smart portfolio') || category.includes('smartportfolio')) {
      return 'smart_portfolio';
    }
    
    // Autres produits financiers (other financial products)
    return 'autres';
  };

  // Get unique asset categories
  const assetCategories = Array.from(new Set(assets.map((a: any) => a.category).filter(Boolean)));

  // Filter assets by category and type filter (tabs)
  const filteredAssets = assets.filter((asset: any) => {
    // Filter by category if selected
    const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
    
    // Filter by type filter (tabs)
    if (selectedTypeFilter === 'all') {
      return matchesCategory;
    }
    
    const assetProductType = getAssetProductType(asset);
    const matchesType = assetProductType === selectedTypeFilter;
    
    return matchesCategory && matchesType;
  });

  const sortedFilteredAssets = useMemo(() => {
    const featuredFirst = [...filteredAssets].sort((a: any, b: any) => {
      const aFeatured = parseFeatured(a?.isFeatured);
      const bFeatured = parseFeatured(b?.isFeatured);
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', { sensitivity: 'base' });
    });
    return featuredFirst;
  }, [filteredAssets]);
  
  console.log('Total assets:', assets.length);
  console.log('Filtered assets:', filteredAssets.length);
  console.log('Selected type filter:', selectedTypeFilter);
  console.log('Selected category:', selectedCategory);

  // Map product to product type category (for internal products)
  const getProductType = (product: any): string => {
    // Normalize to handle accents: convert to lowercase and remove accents for comparison
    const normalize = (str: string) => str.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
    
    const type = normalize(product.type || product.subcategory || '');
    const subcategory = product.subcategory ? normalize(product.subcategory) : '';
    
    // Smart Portfolio
    if (type.includes('smart portfolio') || type.includes('smartportfolio')) {
      return 'smart_portfolio';
    }
    
    // Épargne (savings) - normalized comparison handles all variants: "Épargne", "Épargne Salariale", "épargne", etc.
    if (type.includes('epargne') || type.includes('savings') || type.includes('livret') ||
        subcategory.includes('epargne') || subcategory.includes('livret')) {
      return 'epargne';
    }
    
    // PEA, PEL, CEL
    if (type.includes('pea') || type.includes('pel') || type.includes('cel')) {
      return 'epargne';
    }
    
    // Assurance vie
    if (type.includes('assurance') || type.includes('vie')) {
      return 'epargne';
    }
    
    // Compte titres
    if (type.includes('compte titres') || type.includes('compte titres')) {
      return 'epargne';
    }
    
    // Par défaut, autres produits internes
    return 'autres';
  };

  // Filter Smart Portfolios (products with type "Smart Portfolio" stored in subcategory or type field)
  const allSmartPortfolios = products.filter((product: any) => {
    // Check both type (if exists) and subcategory for Smart Portfolio
    const productType = product.type || product.subcategory || '';
    const isSmartPortfolio = productType.toLowerCase().includes('smart portfolio') || 
                             productType.toLowerCase().includes('smartportfolio') ||
                             product.subcategory?.toLowerCase().includes('smart portfolio') ||
                             product.subcategory?.toLowerCase().includes('smartportfolio');
    
    return isSmartPortfolio;
  });

  // Filter Smart Portfolios by selected type filter
  const smartPortfolios = allSmartPortfolios.filter((product: any) => {
    if (selectedTypeFilter === 'all' || selectedTypeFilter === 'smart_portfolio') {
      return true;
    }
    return false;
  });

  const sortedSmartPortfolios = useMemo(() => {
    return [...smartPortfolios].sort((a: any, b: any) => {
      const aFeatured = parseFeatured(a?.isFeatured);
      const bFeatured = parseFeatured(b?.isFeatured);
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', { sensitivity: 'base' });
    });
  }, [smartPortfolios]);

  // Filter other internal products (non-Smart Portfolio products)
  const allOtherInternalProducts = products.filter((product: any) => {
    // Check if it's NOT a Smart Portfolio
    const productType = product.type || product.subcategory || '';
    const isSmartPortfolio = productType.toLowerCase().includes('smart portfolio') || 
                             productType.toLowerCase().includes('smartportfolio') ||
                             product.subcategory?.toLowerCase().includes('smart portfolio') ||
                             product.subcategory?.toLowerCase().includes('smartportfolio');
    
    // Exclude Smart Portfolios (they're shown separately)
    return !isSmartPortfolio;
  });

  // Filter other internal products by selected type filter
  const otherInternalProducts = allOtherInternalProducts.filter((product: any) => {
    if (selectedTypeFilter === 'all') {
      return true;
    }
    if (selectedTypeFilter === 'smart_portfolio') {
      return false; // Smart portfolios are shown separately
    }
    
    const productTypeCategory = getProductType(product);
    return productTypeCategory === selectedTypeFilter;
  });

  const sortedOtherInternalProducts = useMemo(() => {
    return [...otherInternalProducts].sort((a: any, b: any) => {
      const aFeatured = parseFeatured(a?.isFeatured);
      const bFeatured = parseFeatured(b?.isFeatured);
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', { sensitivity: 'base' });
    });
  }, [otherInternalProducts]);

  // Check if asset is actually in client's portfolio (has open positions)
  const isAssetInPortfolio = (assetId: string) => {
    // Check if there are any open positions for this asset
    return positions.some((p: any) => {
      const positionAssetId = p.assetId || p.asset_id || p.asset?.id;
      // Compare as strings to handle type mismatches
      return String(positionAssetId) === String(assetId) && p.status === 'open';
    });
  };

  // Check if product is already in client's portfolio
  const isProductInPortfolio = (productId: string) => {
    // All products shown are already accessible to the client
    return true;
  };

  // Count items per type based on filtered assets and products (respecting selectedCategory)
  const getItemCountByType = (type: string): number => {
    // Filter assets by category first (same logic as filteredAssets)
    const categoryFilteredAssets = assets.filter((asset: any) => {
      return selectedCategory === 'all' || asset.category === selectedCategory;
    });
    
    // Filter products by category (products don't have category filter yet, but we keep it consistent)
    // For now, products are not filtered by category, so we use all products
    // If products get category filtering in the future, apply it here
    
    if (type === 'all') {
      return categoryFilteredAssets.length + products.length;
    }
    if (type === 'smart_portfolio') {
      // Smart portfolios are not filtered by category currently
      return allSmartPortfolios.length;
    }
    // For other types, count assets and products matching the type AND category filter
    const assetsOfType = categoryFilteredAssets.filter((asset: any) => {
      const assetProductType = getAssetProductType(asset);
      return assetProductType === type;
    });
    const productsOfType = allOtherInternalProducts.filter((product: any) => {
      const productTypeCategory = getProductType(product);
      return productTypeCategory === type;
    });
    return assetsOfType.length + productsOfType.length;
  };

  // Available tabs with their labels
  const allTabs = [
    { value: 'all', label: 'Tous' },
    { value: 'smart_portfolio', label: 'Smart Portfolios' },
    { value: 'actions', label: 'Actions' },
    { value: 'cryptomonnaies', label: 'Cryptomonnaies' },
    { value: 'etf', label: 'ETF' },
    { value: 'obligations', label: 'Obligations' },
    { value: 'matieres_premieres', label: 'Matières premières' },
    { value: 'devises', label: 'Devises' },
    { value: 'epargne', label: 'Épargne' },
    { value: 'autres', label: 'Autres' },
  ];

  // Filter tabs to only show those with visible items
  const visibleTabs = allTabs.filter((tab) => {
    if (tab.value === 'all') {
      // Always show 'Tous' if there are any visible items at all
      return getItemCountByType('all') > 0;
    }
    return getItemCountByType(tab.value) > 0;
  });

  // If selected filter has no items, switch to 'all' if available, or first available tab
  useEffect(() => {
    if (visibleTabs.length > 0 && getItemCountByType(selectedTypeFilter) === 0) {
      const allTab = visibleTabs.find(t => t.value === 'all');
      if (allTab && getItemCountByType('all') > 0) {
        setSelectedTypeFilter('all');
      } else if (visibleTabs.length > 0) {
        setSelectedTypeFilter(visibleTabs[0].value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.length, products.length]);

  // If selected filter has no items, switch to 'all' if available, or first available tab
  useEffect(() => {
    if (getItemCountByType(selectedTypeFilter) === 0 && visibleTabs.length > 0) {
      const allTab = visibleTabs.find(t => t.value === 'all');
      if (allTab && getItemCountByType('all') > 0) {
        setSelectedTypeFilter('all');
      } else if (visibleTabs.length > 0) {
        setSelectedTypeFilter(visibleTabs[0].value);
      }
    }
  }, [visibleTabs.length, assets.length, products.length]);

  const getProductTypeIcon = (productType: string) => {
    switch (productType) {
      case 'actions':
        return <TrendingUp className="h-5 w-5" />;
      case 'cryptomonnaies':
        return <Sparkles className="h-5 w-5" />;
      case 'etf':
        return <BarChart3 className="h-5 w-5" />;
      case 'obligations':
        return <Building2 className="h-5 w-5" />;
      case 'matieres_premieres':
        return <Package className="h-5 w-5" />;
      case 'devises':
        return <DollarSign className="h-5 w-5" />;
      case 'epargne':
        return <CircleDollarSign className="h-5 w-5" />;
      case 'smart_portfolio':
        return <BarChart3 className="h-5 w-5" />;
      case 'autres':
        return <Wallet className="h-5 w-5" />;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  const getProductTypeColor = (productType: string) => {
    switch (productType) {
      case 'actions':
        return { bg: '#d1fae5', text: '#065f46', border: '#34d399' }; // Vert
      case 'cryptomonnaies':
        return { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' }; // Jaune/Or
      case 'etf':
        return { bg: '#e0e7ff', text: '#3730a3', border: '#818cf8' }; // Indigo
      case 'obligations':
        return { bg: '#fce7f3', text: '#831843', border: '#f472b6' }; // Rose
      case 'matieres_premieres':
        return { bg: '#fed7aa', text: '#9a3412', border: '#fb923c' }; // Orange
      case 'devises':
        return { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' }; // Bleu
      case 'epargne':
        return { bg: '#dcfce7', text: '#166534', border: '#86efac' }; // Vert clair
      case 'smart_portfolio':
        return { bg: '#f0f9ff', text: '#0c4a6e', border: '#7dd3fc' }; // Bleu ciel
      case 'autres':
        return { bg: '#e9d5ff', text: '#6b21a8', border: '#a78bfa' }; // Violet
      default:
        return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }; // Gris
    }
  };

  const getProductTypeLabel = (productType: string) => {
    switch (productType) {
      case 'actions':
        return 'Actions';
      case 'cryptomonnaies':
        return 'Cryptomonnaies';
      case 'etf':
        return 'ETF';
      case 'obligations':
        return 'Obligations';
      case 'matieres_premieres':
        return 'Matières premières';
      case 'devises':
        return 'Devises';
      case 'epargne':
        return 'Épargne';
      case 'smart_portfolio':
        return 'Smart Portfolio';
      case 'autres':
        return 'Autres produits financiers';
      default:
        return 'Autre';
    }
  };

  // Generate a simple waveform SVG pattern for card backgrounds
  const WaveformPattern = ({ color }: { color: string }) => (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0.3 }}
    >
      <path
        d="M 0 50 Q 25 30, 50 50 T 100 50 T 150 50 T 200 50 L 200 100 L 0 100 Z"
        fill={color}
      />
      <path
        d="M 0 50 Q 25 70, 50 50 T 100 50 T 150 50 T 200 50"
        stroke={color}
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );

  // Extract symbol from asset name or reference
  const getAssetSymbol = (asset: any): string => {
    // Always use reference if available, never use ID
    if (asset.reference) {
      return asset.reference.toUpperCase();
    }
    // Extract first word or acronym from name
    const name = asset.name || '';
    const words = name.split(' ');
    if (words.length > 1) {
      return words.map((w: string) => w[0]).join('').substring(0, 4).toUpperCase();
    }
    return name.substring(0, 4).toUpperCase();
  };

  // Truncate description to a maximum length and add trending label
  const truncateDescription = (description: string | null | undefined, maxLength: number = 150): { text: string; isTruncated: boolean } => {
    if (!description) return { text: '', isTruncated: false };
    if (description.length <= maxLength) return { text: description, isTruncated: false };
    return { text: description.substring(0, maxLength).trim(), isTruncated: true };
  };

  const parseNumber = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getProfitabilityDisplay = (product: any): { text: string; isPositive: boolean } => {
    const hasProfitability = product?.profitability !== null && product?.profitability !== undefined && product?.profitability !== '';
    const hasVariable =
      product?.isVariableProfitability === 'Oui' &&
      product?.variableProfitability !== null &&
      product?.variableProfitability !== undefined &&
      product?.variableProfitability !== '';

    if (!hasProfitability && !hasVariable) {
      return { text: '', isPositive: true };
    }

    const min = parseNumber(product?.profitability);
    const isPositive = min >= 0;
    const period = product?.profitabilityPeriod ? ` ${product.profitabilityPeriod}` : '';

    if (hasVariable) {
      const max = parseNumber(product?.variableProfitability);
      return { text: `${min.toFixed(2)}% - ${max.toFixed(2)}%${period}`, isPositive };
    }

    return { text: `${min.toFixed(2)}%${period}`, isPositive };
  };

  const visibleAssets = sortedFilteredAssets.filter((asset: any) => !parseFeatured(asset?.isFeatured));
  const visibleSmartPortfolios = sortedSmartPortfolios.filter((product: any) => !parseFeatured(product?.isFeatured));
  const visibleOtherInternalProducts = sortedOtherInternalProducts.filter((product: any) => !parseFeatured(product?.isFeatured));

  const featuredAssets = (assets || [])
    .filter((asset: any) => parseFeatured(asset?.isFeatured))
    .map((asset: any) => ({
      key: `asset-${asset.id}`,
      kind: 'asset' as const,
      data: asset,
    }));

  const featuredProducts = (products || [])
    .filter((product: any) => parseFeatured(product?.isFeatured))
    .map((product: any) => ({
      key: `product-${product.id}`,
      kind: 'product' as const,
      data: product,
    }));

  const featuredSliderItems = [...featuredAssets, ...featuredProducts].sort((a, b) =>
    String(a?.data?.name || '').localeCompare(String(b?.data?.name || ''), 'fr', { sensitivity: 'base' })
  );

  return (
    <div style={{ padding: '0' }}>
      {/* Navigation Tabs */}
      <div style={{ 
        marginBottom: isMobile ? 12 : 16,
        borderBottom: '1px solid #e5e7eb' 
      }}>
        <div style={{
          display: 'flex',
          gap: '0',
          justifyContent: 'flex-start',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '0',
        }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedTypeFilter(tab.value)}
              style={{
                border: 'none',
                borderBottom: selectedTypeFilter === tab.value ? '2px solid #030213' : '2px solid transparent',
                borderRadius: 0,
                padding: isMobile ? '10px 16px' : '12px 20px',
                backgroundColor: 'transparent',
                color: selectedTypeFilter === tab.value ? '#030213' : '#6b7280',
                fontWeight: selectedTypeFilter === tab.value ? '600' : '400',
                fontSize: isMobile ? '12px' : '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedTypeFilter !== tab.value) {
                  e.currentTarget.style.color = '#030213';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedTypeFilter !== tab.value) {
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          Chargement...
        </div>
      ) : (
        <>

          {/* Featured Top Slider */}
          {featuredSliderItems.length > 0 && (
            <div style={{ marginBottom: '36px' }}>
              <div style={{ marginBottom: '14px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tendance du moment
                </h2>
                <h3 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', margin: 0 }}>
                  Produits et actifs du moment
                </h3>
              </div>

              <div
                ref={featuredSliderRef}
                style={{
                  display: 'flex',
                  gap: '14px',
                  overflowX: 'auto',
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: '6px',
                }}
              >
                {featuredSliderItems.map((item) => {
                  if (item.kind === 'asset') {
                    const asset = item.data;
                    const isInPortfolio = isAssetInPortfolio(asset.id);
                    const productType = getAssetProductType(asset);

                    return (
                      <Card
                        key={item.key}
                        onClick={() => {
                          logPlatformAction('click', { element: 'asset', assetId: asset.id, source: 'featured_slider' });
                          navigate(`/platform/product/${asset.id}`);
                        }}
                        style={{
                          minWidth: isMobile ? '260px' : '300px',
                          maxWidth: isMobile ? '260px' : '300px',
                          position: 'relative',
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                          border: 'none',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          minHeight: '200px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                          <div style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#065f46',
                            fontSize: '11px',
                            fontWeight: '700',
                            zIndex: 2,
                          }}>
                            Tendance du moment
                          </div>
                          {isInPortfolio && (
                            <div style={{
                              position: 'absolute',
                              top: '44px',
                              right: '16px',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              backgroundColor: 'rgba(255, 255, 255, 0.9)',
                              color: '#065f46',
                              fontSize: '11px',
                              fontWeight: '600',
                              zIndex: 2,
                            }}>
                              Dans le portefeuille
                            </div>
                          )}

                          <div style={{
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '64px',
                            height: '64px',
                            borderRadius: '16px',
                            backgroundColor: asset.logoUrl ? 'rgba(255, 255, 255, 0.8)' : 'transparent',
                            overflow: 'hidden',
                          }}>
                            {asset.logoUrl && (
                              <AssetLogo
                                logoUrl={asset.logoUrl}
                                name={asset.name}
                                productType={productType}
                                typeColor={{ text: '#111827' }}
                                getProductTypeIcon={getProductTypeIcon}
                              />
                            )}
                          </div>

                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                              {asset.name || 'N/A'}
                            </div>
                            {asset.reference && (
                              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                {asset.reference}
                              </div>
                            )}
                          </div>
                          {(asset.category || asset.subcategory) && (
                            <div style={{
                              marginBottom: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}>
                              {asset.category && (
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                                  {asset.category}
                                </div>
                              )}
                              {asset.subcategory && (
                                <>
                                  {asset.category && (
                                    <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>
                                  )}
                                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                                    {asset.subcategory}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {(asset.lastPrice !== undefined && asset.lastPrice !== null) || (asset.price !== undefined) ? (
                            <div style={{ marginBottom: '16px' }}>
                              <div style={{
                                fontSize: '24px',
                                fontWeight: '700',
                                color: '#111827',
                                marginBottom: '8px',
                              }}>
                                {(asset.lastPrice !== undefined && asset.lastPrice !== null)
                                  ? typeof asset.lastPrice === 'number'
                                    ? asset.lastPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : asset.lastPrice
                                  : typeof asset.price === 'number'
                                    ? asset.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : asset.price}
                                {asset.currency && ` ${asset.currency}`}
                              </div>

                              {(asset.priceChangePercent !== undefined && asset.priceChangePercent !== null) ||
                               (asset.priceChange !== undefined && asset.priceChange !== null) ||
                               (asset.changePercent !== undefined) ? (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  flexWrap: 'wrap',
                                }}>
                                  {(asset.priceChange !== undefined && asset.priceChange !== null) && (
                                    <div style={{
                                      fontSize: '14px',
                                      fontWeight: '600',
                                      color: (asset.priceChange || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                      {(asset.priceChange || 0) >= 0 ? '+' : ''}
                                      {typeof asset.priceChange === 'number'
                                        ? asset.priceChange.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : asset.priceChange}
                                    </div>
                                  )}

                                  {(asset.priceChangePercent !== undefined && asset.priceChangePercent !== null) ? (
                                    <div style={{
                                      fontSize: '14px',
                                      fontWeight: '600',
                                      color: (asset.priceChangePercent || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                      ({(asset.priceChangePercent || 0) >= 0 ? '+' : ''}
                                      {typeof asset.priceChangePercent === 'number'
                                        ? asset.priceChangePercent.toFixed(2)
                                        : asset.priceChangePercent}%)
                                    </div>
                                  ) : asset.changePercent !== undefined && (
                                    <div style={{
                                      fontSize: '14px',
                                      fontWeight: '600',
                                      color: (asset.changePercent || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                      ({(asset.changePercent || 0) >= 0 ? '+' : ''}
                                      {typeof asset.changePercent === 'number'
                                        ? asset.changePercent.toFixed(2)
                                        : asset.changePercent}%)
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  }

                  const product = item.data;
                  const profitabilityInfo = getProfitabilityDisplay(product);
                  const isPositive = profitabilityInfo.isPositive;
                  const hasImage = Boolean(product.imageUrl);

                  if (!hasImage) {
                    return (
                      <Card
                        key={item.key}
                        onClick={() => {
                          logPlatformAction('click', { element: 'product', productId: product.id, source: 'featured_slider' });
                          navigate(`/platform/product/${product.id}`);
                        }}
                        style={{
                          minWidth: isMobile ? '260px' : '300px',
                          maxWidth: isMobile ? '260px' : '300px',
                          position: 'relative',
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                          border: 'none',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          minHeight: '200px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                          <div style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#065f46',
                            fontSize: '11px',
                            fontWeight: '700',
                            zIndex: 2,
                          }}>
                            Tendance du moment
                          </div>
                          <div style={{ marginBottom: '20px', width: '64px', height: '64px' }}></div>
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                              {product.name || 'N/A'}
                            </div>
                            {product.reference && (
                              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                {product.reference}
                              </div>
                            )}
                          </div>
                          {(product.categoryName || product.subcategory) && (
                            <div style={{
                              marginBottom: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}>
                              {product.categoryName && (
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                                  {product.categoryName}
                                </div>
                              )}
                              {product.subcategory && (
                                <>
                                  {product.categoryName && (
                                    <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>
                                  )}
                                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                                    {product.subcategory}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          <p style={{
                            fontSize: isMobile ? '13px' : '14px',
                            color: '#6b7280',
                            marginBottom: '16px',
                            lineHeight: '1.5',
                            minHeight: '40px',
                          }}>
                            {truncateDescription(product.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150).text}
                          </p>
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--secondary)' }}>
                              {isPositive ? '+' : ''}{profitabilityInfo.text ? profitabilityInfo.text : 'N/A'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  return (
                    <Card
                      key={item.key}
                      onClick={() => {
                        logPlatformAction('click', { element: 'product', productId: product.id, source: 'featured_slider' });
                        navigate(`/platform/product/${product.id}`);
                      }}
                      style={{
                        minWidth: isMobile ? '260px' : '320px',
                        maxWidth: isMobile ? '260px' : '320px',
                        position: 'relative',
                        overflow: 'hidden',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        backgroundColor: 'white',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{
                        position: 'relative',
                        height: '180px',
                        backgroundColor: '#ffffff',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-end',
                        padding: '12px',
                      }}>
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name || 'Product image'}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'center',
                              transform: 'scale(1.22)',
                              transformOrigin: 'center',
                              zIndex: 0,
                            }}
                          />
                        )}
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#065f46',
                          fontSize: '11px',
                          fontWeight: '700',
                          zIndex: 2,
                        }}>
                          Tendance du moment
                        </div>
                      </div>
                      <CardContent style={{ padding: isMobile ? '16px' : '20px' }}>
                        <h4 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: '#030213', marginBottom: '8px', marginTop: 0 }}>
                          {product.name || 'N/A'}
                        </h4>
                        {(product.categoryName || product.subcategory) && (
                          <div style={{
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap',
                          }}>
                            {product.categoryName && (
                              <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                                {product.categoryName}
                              </div>
                            )}
                            {product.subcategory && (
                              <>
                                {product.categoryName && (
                                  <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>
                                )}
                                <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                                  {product.subcategory}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5', minHeight: '40px' }}>
                          {truncateDescription(product.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150).text}
                        </p>
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--secondary)' }}>
                            {isPositive ? '+' : ''}{profitabilityInfo.text ? profitabilityInfo.text : 'N/A'}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Smart Portfolios Section - Only visible when 'all' or 'smart_portfolio' tab is selected */}
          {visibleSmartPortfolios.length > 0 && (selectedTypeFilter === 'all' || selectedTypeFilter === 'smart_portfolio') && (
            <div style={{ marginBottom: '50px' }}>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Investissez où va l'argent intelligent
                </h2>
                <h3 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
                  Smart Portfolios les plus copiés
                </h3>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile 
                  ? '1fr' 
                  : 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: isMobile ? '16px' : '20px',
                marginBottom: isMobile ? '20px' : '30px'
              }}>
                {visibleSmartPortfolios.map((portfolio: any) => {
                  const profitabilityInfo = getProfitabilityDisplay(portfolio);
                  const isPositive = profitabilityInfo.isPositive;
                  const hasImage = Boolean(portfolio.imageUrl);

                  if (!hasImage) {
                    return (
                      <Card
                        key={portfolio.id}
                        onClick={() => {
                          logPlatformAction('click', { element: 'product', productId: portfolio.id });
                          navigate(`/platform/product/${portfolio.id}`);
                        }}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                          border: 'none',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          minHeight: '200px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                          {parseFeatured(portfolio?.isFeatured) && (
                            <div style={{
                              position: 'absolute',
                              top: '16px',
                              right: '16px',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#065f46',
                              fontSize: '11px',
                              fontWeight: '700',
                              zIndex: 2,
                            }}>
                              Tendance du moment
                            </div>
                          )}
                          <div style={{
                            marginBottom: '20px',
                            width: '64px',
                            height: '64px',
                          }}></div>
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{
                              fontSize: '20px',
                              fontWeight: '600',
                              color: '#111827',
                              marginBottom: '8px',
                            }}>
                              {portfolio.name || 'N/A'}
                            </div>
                            {portfolio.reference && (
                              <div style={{
                                fontSize: '14px',
                                color: '#6b7280',
                              }}>
                                {portfolio.reference}
                              </div>
                            )}
                          </div>
                          {(portfolio.categoryName || portfolio.subcategory) && (
                            <div style={{
                              marginBottom: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}>
                              {portfolio.categoryName && (
                                <div style={{
                                  fontSize: '16px',
                                  fontWeight: '600',
                                  color: '#374151',
                                }}>
                                  {portfolio.categoryName}
                                </div>
                              )}
                              {portfolio.subcategory && (
                                <>
                                  {portfolio.categoryName && (
                                    <span style={{
                                      fontSize: '14px',
                                      color: '#9ca3af',
                                    }}>•</span>
                                  )}
                                  <div style={{
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: '#6b7280',
                                  }}>
                                    {portfolio.subcategory}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          <p style={{
                            fontSize: isMobile ? '13px' : '14px',
                            color: '#6b7280',
                            marginBottom: '16px',
                            lineHeight: '1.5',
                            minHeight: '40px',
                          }}>
                            {truncateDescription(portfolio.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150).text}
                          </p>
                          <div style={{ marginBottom: '16px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: 'var(--secondary)',
                          }}>
                              {isPositive ? '+' : ''}{profitabilityInfo.text ? profitabilityInfo.text : 'N/A'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }
                  
                  return (
                    <Card
                      key={portfolio.id}
                      onClick={() => {
                        logPlatformAction('click', { element: 'product', productId: portfolio.id });
                        navigate(`/platform/product/${portfolio.id}`);
                      }}
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        backgroundColor: 'white',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Image Header */}
                      <div style={{
                        position: 'relative',
                        height: '180px',
                        backgroundColor: '#ffffff',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-end',
                        padding: '12px',
                      }}>
                        {portfolio.imageUrl && (
                          <img
                            src={portfolio.imageUrl}
                            alt={portfolio.name || 'Product image'}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'center',
                              transform: 'scale(1.22)',
                              transformOrigin: 'center',
                              zIndex: 0,
                            }}
                          />
                        )}
                        {parseFeatured(portfolio?.isFeatured) && (
                          <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#065f46',
                            fontSize: '11px',
                            fontWeight: '700',
                            zIndex: 2,
                          }}>
                            Tendance du moment
                          </div>
                        )}
                        {/* Trending Label or Menu Button */}
                        {(() => {
                          const desc = truncateDescription(portfolio.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150);
                          if (desc.isTruncated) {
                            return (
                              <span style={{
                                fontSize: isMobile ? '11px' : '12px',
                                color: '#6b7280',
                                fontWeight: '500',
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                display: 'inline-block',
                              }}>
                                Trending
                              </span>
                            );
                          }
                          return (
                            <button
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                              }}
                            >
                              <MoreHorizontal className="h-4 w-4" style={{ color: '#374151' }} />
                            </button>
                          );
                        })()}
                      </div>
                      
                      <CardContent style={{ padding: isMobile ? '16px' : '20px' }}>
                        {/* Title */}
                        <h4 style={{
                          fontSize: isMobile ? '18px' : '22px',
                          fontWeight: '700',
                          color: '#030213',
                          marginBottom: '8px',
                          marginTop: 0,
                        }}>
                          {portfolio.name || 'N/A'}
                        </h4>
                        
                        {/* Description */}
                        <p style={{
                          fontSize: isMobile ? '13px' : '14px',
                          color: '#6b7280',
                          marginBottom: '16px',
                          lineHeight: '1.5',
                          minHeight: '40px',
                        }}>
                          {(() => {
                            const desc = truncateDescription(portfolio.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150);
                            return desc.text;
                          })()}
                        </p>
                        
                        {/* Return */}
                        <div style={{ marginBottom: '16px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: 'var(--secondary)',
                          }}>
                            {isPositive ? '+' : ''}{profitabilityInfo.text ? profitabilityInfo.text : 'N/A'}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section Header */}
          <div style={{ marginBottom: isMobile ? '20px' : '30px' }}>
            <h2 style={{ 
              fontSize: isMobile ? '12px' : '14px', 
              fontWeight: '600', 
              color: '#6b7280', 
              marginBottom: '8px', 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px' 
            }}>
              Opportunités d'investissement
            </h2>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'flex-start' : 'center',
              flexWrap: isMobile ? 'wrap' : 'nowrap',
              gap: isMobile ? '12px' : '0',
            }}>
              <h1 className="platform-page-title" style={{ flex: 1, minWidth: 0 }}>
                Explorer les marchés mondiaux
              </h1>
              <div style={{ 
                display: 'flex', 
                gap: '8px',
                flexShrink: 0,
              }}>
                <button
                  type="button"
                  onClick={() => scrollFeaturedSlider('left')}
                  disabled={featuredSliderItems.length === 0}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: featuredSliderItems.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: featuredSliderItems.length === 0 ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (featuredSliderItems.length === 0) return;
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollFeaturedSlider('right')}
                  disabled={featuredSliderItems.length === 0}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: featuredSliderItems.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: featuredSliderItems.length === 0 ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (featuredSliderItems.length === 0) return;
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Assets Grid (External Assets + Other Internal Products) */}
          {/* Filtered by selected tab */}
          {(visibleAssets.length > 0 || visibleOtherInternalProducts.length > 0) && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isMobile 
                ? '1fr' 
                : 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: isMobile ? '16px' : '20px' 
            }}>
              {/* External Assets */}
              {visibleAssets.map((asset: any) => {
                const isInPortfolio = isAssetInPortfolio(asset.id);
                const productType = getAssetProductType(asset);
                const typeColor = getProductTypeColor(productType);
                
                return (
                  <Card
                    key={asset.id}
                    onClick={() => {
                      logPlatformAction('click', { element: 'asset', assetId: asset.id });
                      navigate(`/platform/product/${asset.id}`);
                    }}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                      border: 'none',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      minHeight: '200px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                      {/* Featured Badge */}
                      {parseFeatured(asset?.isFeatured) && (
                        <div style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#065f46',
                          fontSize: '11px',
                          fontWeight: '700',
                          zIndex: 2,
                        }}>
                          Tendance du moment
                        </div>
                      )}
                      {isInPortfolio && (
                        <div style={{
                          position: 'absolute',
                          top: parseFeatured(asset?.isFeatured) ? '44px' : '16px',
                          right: '16px',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          color: '#065f46',
                          fontSize: '11px',
                          fontWeight: '600',
                          zIndex: 2,
                        }}>
                          Dans le portefeuille
                        </div>
                      )}
                      
                      {/* Logo or Icon */}
                      <div style={{
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        backgroundColor: asset.logoUrl ? 'rgba(255, 255, 255, 0.8)' : 'transparent',
                        color: '#111827',
                        overflow: 'hidden',
                      }}>
                        {asset.logoUrl && (
                          <AssetLogo 
                            logoUrl={asset.logoUrl}
                            name={asset.name}
                            productType={productType}
                            typeColor={{ text: '#111827' }}
                            getProductTypeIcon={getProductTypeIcon}
                          />
                        )}
                      </div>
                      
                      {/* Name */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{
                          fontSize: '20px',
                          fontWeight: '600',
                          color: '#111827',
                          marginBottom: '8px',
                        }}>
                          {asset.name || 'N/A'}
                        </div>
                        {/* Reference */}
                        {asset.reference && (
                          <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                          }}>
                            {asset.reference}
                          </div>
                        )}
                      </div>
                      
                      {/* Category and Subcategory */}
                      {(asset.category || asset.subcategory) && (
                        <div style={{ 
                          marginBottom: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}>
                          {asset.category && (
                            <div style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#374151',
                            }}>
                              {asset.category}
                            </div>
                          )}
                          {asset.subcategory && (
                            <>
                              {asset.category && (
                                <span style={{
                                  fontSize: '14px',
                                  color: '#9ca3af',
                                }}>•</span>
                              )}
                              <div style={{
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#6b7280',
                              }}>
                                {asset.subcategory}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Price and Change */}
                      {(asset.lastPrice !== undefined && asset.lastPrice !== null) || (asset.price !== undefined) ? (
                        <div style={{ marginBottom: '16px' }}>
                          {/* Current Price */}
                          <div style={{
                            fontSize: '24px',
                            fontWeight: '700',
                            color: '#111827',
                            marginBottom: '8px',
                          }}>
                            {(asset.lastPrice !== undefined && asset.lastPrice !== null) 
                              ? typeof asset.lastPrice === 'number' 
                                ? asset.lastPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : asset.lastPrice
                              : typeof asset.price === 'number' 
                                ? asset.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : asset.price}
                            {asset.currency && ` ${asset.currency}`}
                          </div>
                          
                          {/* Price Change and Percentage */}
                          {(asset.priceChangePercent !== undefined && asset.priceChangePercent !== null) || 
                           (asset.priceChange !== undefined && asset.priceChange !== null) ||
                           (asset.changePercent !== undefined) ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}>
                              {/* Price Change (absolute) */}
                              {(asset.priceChange !== undefined && asset.priceChange !== null) && (
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: '600',
                                  color: (asset.priceChange || 0) >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                  {(asset.priceChange || 0) >= 0 ? '+' : ''}
                                  {typeof asset.priceChange === 'number' 
                                    ? asset.priceChange.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : asset.priceChange}
                                </div>
                              )}
                              
                              {/* Price Change Percentage */}
                              {(asset.priceChangePercent !== undefined && asset.priceChangePercent !== null) ? (
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: '600',
                                  color: (asset.priceChangePercent || 0) >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                  ({(asset.priceChangePercent || 0) >= 0 ? '+' : ''}
                                  {typeof asset.priceChangePercent === 'number' 
                                    ? asset.priceChangePercent.toFixed(2)
                                    : asset.priceChangePercent}%)
                                </div>
                              ) : asset.changePercent !== undefined && (
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: '600',
                                  color: (asset.changePercent || 0) >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                  ({(asset.changePercent || 0) >= 0 ? '+' : ''}
                                  {typeof asset.changePercent === 'number' 
                                    ? asset.changePercent.toFixed(2)
                                    : asset.changePercent}%)
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
              
              {/* Internal Products (non-Smart Portfolio) */}
              {visibleOtherInternalProducts.map((product: any) => {
                const profitabilityInfo = getProfitabilityDisplay(product);
                const isPositive = profitabilityInfo.isPositive;
                const hasImage = Boolean(product.imageUrl);

                if (!hasImage) {
                  return (
                    <Card
                      key={`product-${product.id}`}
                      onClick={() => {
                        logPlatformAction('click', { element: 'product', productId: product.id });
                        navigate(`/platform/product/${product.id}`);
                      }}
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                        border: 'none',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        minHeight: '200px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                        {parseFeatured(product?.isFeatured) && (
                          <div style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#065f46',
                            fontSize: '11px',
                            fontWeight: '700',
                            zIndex: 2,
                          }}>
                            Tendance du moment
                          </div>
                        )}
                        <div style={{
                          marginBottom: '20px',
                          width: '64px',
                          height: '64px',
                        }}></div>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{
                            fontSize: '20px',
                            fontWeight: '600',
                            color: '#111827',
                            marginBottom: '8px',
                          }}>
                            {product.name || 'N/A'}
                          </div>
                          {product.reference && (
                            <div style={{
                              fontSize: '14px',
                              color: '#6b7280',
                            }}>
                              {product.reference}
                            </div>
                          )}
                        </div>
                        {(product.categoryName || product.subcategory) && (
                          <div style={{
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap',
                          }}>
                            {product.categoryName && (
                              <div style={{
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                              }}>
                                {product.categoryName}
                              </div>
                            )}
                            {product.subcategory && (
                              <>
                                {product.categoryName && (
                                  <span style={{
                                    fontSize: '14px',
                                    color: '#9ca3af',
                                  }}>•</span>
                                )}
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  color: '#6b7280',
                                }}>
                                  {product.subcategory}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        <p style={{
                          fontSize: isMobile ? '13px' : '14px',
                          color: '#6b7280',
                          marginBottom: '16px',
                          lineHeight: '1.5',
                          minHeight: '40px',
                        }}>
                          {truncateDescription(product.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150).text}
                        </p>
                        <div style={{ marginBottom: '16px'}}>
                          <div style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: 'var(--secondary)',
                          }}>
                            {isPositive ? '+' : ''}{profitabilityInfo.text ? profitabilityInfo.text : 'N/A'}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                
                return (
                  <Card
                    key={`product-${product.id}`}
                    onClick={() => {
                      logPlatformAction('click', { element: 'product', productId: product.id });
                      navigate(`/platform/product/${product.id}`);
                    }}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      backgroundColor: 'white',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{
                      position: 'relative',
                      height: '180px',
                      backgroundColor: '#ffffff',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      padding: '12px',
                    }}>
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.name || 'Product image'}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center',
                            transform: 'scale(1.22)',
                            transformOrigin: 'center',
                            zIndex: 0,
                          }}
                        />
                      )}
                      {parseFeatured(product?.isFeatured) && (
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#065f46',
                          fontSize: '11px',
                          fontWeight: '700',
                          zIndex: 2,
                        }}>
                          Tendance du moment
                        </div>
                      )}
                    </div>
                    <CardContent style={{ padding: isMobile ? '16px' : '20px' }}>
                      <h4 style={{
                        fontSize: isMobile ? '18px' : '22px',
                        fontWeight: '700',
                        color: '#030213',
                        marginBottom: '8px',
                        marginTop: 0,
                      }}>
                        {product.name || 'N/A'}
                      </h4>
                      {(product.categoryName || product.subcategory) && (
                        <div style={{
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}>
                          {product.categoryName && (
                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                              {product.categoryName}
                            </div>
                          )}
                          {product.subcategory && (
                            <>
                              {product.categoryName && (
                                <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>
                              )}
                              <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                                {product.subcategory}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <p style={{
                        fontSize: isMobile ? '13px' : '14px',
                        color: '#6b7280',
                        marginBottom: '16px',
                        lineHeight: '1.5',
                        minHeight: '40px',
                      }}>
                        {truncateDescription(product.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.', 150).text}
                      </p>
                      <div style={{ marginBottom: '16px'}}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: 'var(--secondary)',
                        }}>
                          {isPositive ? '+' : ''}{profitabilityInfo.text ? profitabilityInfo.text : 'N/A'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          
          {/* Empty State - Show only if no items match the current filter */}
          {getItemCountByType(selectedTypeFilter) === 0 && (
            <Card>
              <CardContent style={{ padding: '60px 40px', textAlign: 'center' }}>
                <p style={{ color: '#6b7280', fontSize: '16px' }}>Aucun produit trouvé avec ces critères</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
