import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, TrendingUp, Coins, BarChart3, Building2, Wallet, DollarSign, Package, ChevronLeft, ChevronRight, Sparkles, CircleDollarSign, MoreHorizontal, Plus } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

export function PlatformDiscover() {
  const { currentUser } = useUser();
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [clientAssets, setClientAssets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadDiscoverData();
    }
  }, [currentUser]);

  const loadDiscoverData = async () => {
    try {
      setLoading(true);
      const [assetsResponse, productsResponse, clientAssetsResponse, categoriesResponse] = await Promise.all([
        apiCall('/api/assets/'),
        apiCall('/api/products/').catch((err) => {
          console.warn('Error loading products:', err);
          return { products: [] };
        }),
        apiCall(`/api/clients/${currentUser.id}/assets/`),
        apiCall('/api/categories/').catch((err) => {
          console.warn('Error loading categories:', err);
          return { categories: [] };
        }),
      ]);
      setAssets(assetsResponse.assets || []);
      // Filtrer les produits actifs uniquement pour la plateforme
      const allProducts = productsResponse?.products || productsResponse || [];
      const activeProducts = allProducts.filter((p: any) => p.status === 'Actif' && p.active !== false);
      
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
      console.log('Loaded products:', enrichedProducts.length, 'products (total:', allProducts.length, ')');
      console.log('Products details:', enrichedProducts.map((p: any) => ({ 
        id: p.id, 
        name: p.name, 
        type: p.type, 
        categoryName: p.categoryName,
        subcategory: p.subcategory,
        status: p.status,
        active: p.active 
      })));
      setClientAssets(clientAssetsResponse.assets || []);
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

  // Filter assets
  const filteredAssets = assets.filter((asset: any) => {
    const matchesSearch = !searchTerm || 
      asset.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const assetProductType = getAssetProductType(asset);
    const matchesTypeFilter = selectedTypeFilter === 'all' || assetProductType === selectedTypeFilter;
    const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
    
    return matchesSearch && matchesTypeFilter && matchesCategory;
  });

  // Map product to product type category (for internal products)
  const getProductType = (product: any): string => {
    const type = (product.type || product.subcategory || '').toLowerCase();
    
    // Smart Portfolio
    if (type.includes('smart portfolio') || type.includes('smartportfolio')) {
      return 'smart_portfolio';
    }
    
    // Épargne (savings)
    if (type.includes('epargne') || type.includes('savings') || type.includes('livret') ||
        product.subcategory?.toLowerCase().includes('epargne') || 
        product.subcategory?.toLowerCase().includes('livret')) {
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
  const smartPortfolios = products.filter((product: any) => {
    const matchesSearch = !searchTerm || 
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Check both type (if exists) and subcategory for Smart Portfolio
    const productType = product.type || product.subcategory || '';
    const isSmartPortfolio = productType.toLowerCase().includes('smart portfolio') || 
                             productType.toLowerCase().includes('smartportfolio') ||
                             product.subcategory?.toLowerCase().includes('smart portfolio') ||
                             product.subcategory?.toLowerCase().includes('smartportfolio');
    const matchesTypeFilter = selectedTypeFilter === 'all' || selectedTypeFilter === 'smart_portfolio';
    
    return isSmartPortfolio && matchesSearch && matchesTypeFilter;
  });

  // Filter other internal products (non-Smart Portfolio products)
  const otherInternalProducts = products.filter((product: any) => {
    const matchesSearch = !searchTerm || 
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Check if it's NOT a Smart Portfolio
    const productType = product.type || product.subcategory || '';
    const isSmartPortfolio = productType.toLowerCase().includes('smart portfolio') || 
                             productType.toLowerCase().includes('smartportfolio') ||
                             product.subcategory?.toLowerCase().includes('smart portfolio') ||
                             product.subcategory?.toLowerCase().includes('smartportfolio');
    
    if (isSmartPortfolio) return false;
    
    const productTypeCategory = getProductType(product);
    const matchesTypeFilter = selectedTypeFilter === 'all' || selectedTypeFilter === productTypeCategory;
    
    return matchesSearch && matchesTypeFilter;
  });

  // Check if asset is already in client's portfolio
  const isAssetInPortfolio = (assetId: string) => {
    return clientAssets.some((ca: any) => ca.asset?.id === assetId);
  };

  // Check if product is already in client's portfolio (via assets if linked)
  const isProductInPortfolio = (productId: string) => {
    // Pour l'instant, on vérifie si le produit est lié à un actif qui est dans le portefeuille
    // À l'avenir, on pourrait avoir une relation ClientProduct directe
    return false; // Placeholder - à implémenter selon votre logique métier
  };

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

  return (
    <div style={{ padding: '0' }}>
      {/* Search Bar */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingLeft: '45px',
              paddingRight: '20px',
              height: '48px',
              fontSize: '16px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
            }}
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ marginBottom: '40px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{
          display: 'flex',
          gap: '0',
          justifyContent: 'flex-start',
          overflowX: 'auto',
          paddingBottom: '0',
        }}>
          {[
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
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedTypeFilter(tab.value)}
              style={{
                border: 'none',
                borderBottom: selectedTypeFilter === tab.value ? '2px solid #030213' : '2px solid transparent',
                borderRadius: 0,
                padding: '12px 20px',
                backgroundColor: 'transparent',
                color: selectedTypeFilter === tab.value ? '#030213' : '#6b7280',
                fontWeight: selectedTypeFilter === tab.value ? '600' : '400',
                fontSize: '14px',
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

          {/* Section Header */}
          <div style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Opportunités d'investissement
            </h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
                Explorer les marchés mondiaux
              </h1>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
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

          {/* Smart Portfolios Section */}
          {(selectedTypeFilter === 'all' || selectedTypeFilter === 'smart_portfolio') && smartPortfolios.length > 0 && (
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: '20px',
                marginBottom: '30px'
              }}>
                {smartPortfolios.map((portfolio: any) => {
                  const return12M = portfolio.profitability || 0;
                  const isPositive = return12M >= 0;
                  
                  return (
                    <Card
                      key={portfolio.id}
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
                        backgroundColor: '#f3f4f6',
                        backgroundImage: portfolio.imageUrl ? `url(${portfolio.imageUrl})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-end',
                        padding: '12px',
                      }}>
                        {/* Menu Button */}
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
                      </div>
                      
                      <CardContent style={{ padding: '20px' }}>
                        {/* Title */}
                        <h4 style={{
                          fontSize: '22px',
                          fontWeight: '700',
                          color: '#030213',
                          marginBottom: '8px',
                          marginTop: 0,
                        }}>
                          {portfolio.name}
                        </h4>
                        
                        {/* Description */}
                        <p style={{
                          fontSize: '14px',
                          color: '#6b7280',
                          marginBottom: '16px',
                          lineHeight: '1.5',
                          minHeight: '40px',
                        }}>
                          {portfolio.description || 'Portefeuille intelligent diversifié pour maximiser vos rendements.'}
                        </p>
                        
                        {/* Return */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{
                            fontSize: '20px',
                            fontWeight: '700',
                            color: isPositive ? '#10b981' : '#ef4444',
                          }}>
                            {isPositive ? '+' : ''}{return12M.toFixed(2)}% RETURN (12M)
                          </div>
                        </div>
                        
                        {/* Underlying Assets Icons */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '16px',
                        }}>
                          <div style={{
                            display: 'flex',
                            gap: '-4px',
                            alignItems: 'center',
                          }}>
                            {/* Placeholder icons */}
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#374151',
                              border: '2px solid white',
                              marginLeft: '-8px',
                            }}>
                              {portfolio.name?.substring(0, 1).toUpperCase() || 'A'}
                            </div>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#dbeafe',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#1e40af',
                              border: '2px solid white',
                              marginLeft: '-8px',
                            }}>
                              {portfolio.name?.substring(1, 2).toUpperCase() || 'B'}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            fontWeight: '500',
                          }}>
                            +{Math.max(0, (portfolio.id?.charCodeAt(0) || 0) % 30 + 3)} MORE
                          </span>
                        </div>
                        
                        {/* Add Button */}
                        <Button
                          onClick={() => handleAddProduct(portfolio.id)}
                          style={{
                            width: '100%',
                            backgroundColor: '#030213',
                            color: 'white',
                            border: 'none',
                            fontWeight: '600',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        >
                          Ajouter au portefeuille
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assets Grid (External Assets + Other Internal Products) */}
          {(selectedTypeFilter === 'all' || selectedTypeFilter !== 'smart_portfolio') && (
            <>
              {filteredAssets.length === 0 && otherInternalProducts.length === 0 ? (
            <Card>
              <CardContent style={{ padding: '60px 40px', textAlign: 'center' }}>
                <p style={{ color: '#6b7280', fontSize: '16px' }}>Aucun produit trouvé avec ces critères</p>
              </CardContent>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {/* External Assets */}
              {filteredAssets.map((asset: any) => {
                const isInPortfolio = isAssetInPortfolio(asset.id);
                const productType = getAssetProductType(asset);
                const typeColor = getProductTypeColor(productType);
                
                return (
                  <Card
                    key={asset.id}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      backgroundColor: typeColor.bg,
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
                    <WaveformPattern color={typeColor.text} />
                    
                    <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                      {/* Featured Badge */}
                      {isInPortfolio && (
                        <div style={{
                          position: 'absolute',
                          top: '16px',
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
                      
                      {/* Large Icon */}
                      <div style={{
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        color: typeColor.text,
                      }}>
                        <div style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {React.cloneElement(getProductTypeIcon(productType), {
                            className: 'h-10 w-10',
                            style: { color: typeColor.text }
                          })}
                        </div>
                      </div>
                      
                      {/* Name */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{
                          fontSize: '20px',
                          fontWeight: '600',
                          color: typeColor.text,
                          opacity: 0.9,
                          marginBottom: '8px',
                        }}>
                          {asset.name || 'N/A'}
                        </div>
                        {/* Reference */}
                        {asset.reference && (
                          <div style={{
                            fontSize: '14px',
                            color: typeColor.text,
                            opacity: 0.7,
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
                              color: typeColor.text,
                              opacity: 0.8,
                            }}>
                              {asset.category}
                            </div>
                          )}
                          {asset.subcategory && (
                            <>
                              {asset.category && (
                                <span style={{
                                  fontSize: '14px',
                                  color: typeColor.text,
                                  opacity: 0.5,
                                }}>•</span>
                              )}
                              <div style={{
                                fontSize: '14px',
                                fontWeight: '500',
                                color: typeColor.text,
                                opacity: 0.7,
                              }}>
                                {asset.subcategory}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Price and Change (if available) */}
                      {asset.price !== undefined && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{
                            fontSize: '24px',
                            fontWeight: '700',
                            color: typeColor.text,
                            marginBottom: '4px',
                          }}>
                            {typeof asset.price === 'number' ? asset.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : asset.price}
                          </div>
                          {asset.changePercent !== undefined && (
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: (asset.changePercent || 0) >= 0 ? '#10b981' : '#ef4444',
                            }}>
                              {(asset.changePercent || 0) >= 0 ? '+' : ''}
                              {typeof asset.changePercent === 'number' ? asset.changePercent.toFixed(2) : asset.changePercent}%
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Add Button */}
                      <Button
                        onClick={() => handleAddAsset(asset.id)}
                        disabled={isInPortfolio}
                        style={{
                          width: '100%',
                          backgroundColor: isInPortfolio ? 'rgba(255, 255, 255, 0.5)' : 'white',
                          color: isInPortfolio ? typeColor.text : typeColor.text,
                          border: 'none',
                          fontWeight: '600',
                          padding: '10px 16px',
                          borderRadius: '8px',
                          cursor: isInPortfolio ? 'not-allowed' : 'pointer',
                          opacity: isInPortfolio ? 0.6 : 1,
                        }}
                      >
                        {isInPortfolio ? 'Déjà dans le portefeuille' : 'Ajouter au portefeuille'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
              
              {/* Internal Products (non-Smart Portfolio) */}
              {otherInternalProducts.map((product: any) => {
                const productType = getProductType(product);
                const typeColor = getProductTypeColor(productType);
                
                return (
                  <Card
                    key={`product-${product.id}`}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      backgroundColor: typeColor.bg,
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
                    <WaveformPattern color={typeColor.text} />
                    
                    <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                      {/* Large Icon */}
                      <div style={{
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        color: typeColor.text,
                      }}>
                        <div style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {React.cloneElement(getProductTypeIcon(productType), {
                            className: 'h-10 w-10',
                            style: { color: typeColor.text }
                          })}
                        </div>
                      </div>
                      
                      {/* Name */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{
                          fontSize: '20px',
                          fontWeight: '600',
                          color: typeColor.text,
                          opacity: 0.9,
                          marginBottom: '8px',
                        }}>
                          {product.name || 'N/A'}
                        </div>
                        {/* Reference */}
                        {product.reference && (
                          <div style={{
                            fontSize: '14px',
                            color: typeColor.text,
                            opacity: 0.7,
                          }}>
                            {product.reference}
                          </div>
                        )}
                      </div>
                      
                      {/* Price and Profitability */}
                      {product.price !== undefined && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{
                            fontSize: '24px',
                            fontWeight: '700',
                            color: typeColor.text,
                            marginBottom: '4px',
                          }}>
                            {typeof product.price === 'number' ? product.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : product.price} €
                          </div>
                          {product.profitability !== undefined && product.profitability !== null && (
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: (product.profitability || 0) >= 0 ? '#10b981' : '#ef4444',
                            }}>
                              {(product.profitability || 0) >= 0 ? '+' : ''}
                              {typeof product.profitability === 'number' ? product.profitability.toFixed(2) : product.profitability}%
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Category and Subcategory */}
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
                              color: typeColor.text,
                              opacity: 0.8,
                            }}>
                              {product.categoryName}
                            </div>
                          )}
                          {product.subcategory && (
                            <>
                              {product.categoryName && (
                                <span style={{
                                  fontSize: '14px',
                                  color: typeColor.text,
                                  opacity: 0.5,
                                }}>•</span>
                              )}
                              <div style={{
                                fontSize: '14px',
                                fontWeight: '500',
                                color: typeColor.text,
                                opacity: 0.7,
                              }}>
                                {product.subcategory}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Add Button */}
                      <Button
                        onClick={() => handleAddProduct(product.id)}
                        style={{
                          width: '100%',
                          backgroundColor: 'white',
                          color: typeColor.text,
                          border: 'none',
                          fontWeight: '600',
                          padding: '10px 16px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        Ajouter au portefeuille
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
            </>
          )}
          
          {/* Empty State */}
          {((selectedTypeFilter === 'all' && filteredAssets.length === 0 && smartPortfolios.length === 0 && otherInternalProducts.length === 0) ||
            (selectedTypeFilter !== 'all' && selectedTypeFilter !== 'smart_portfolio' && filteredAssets.length === 0 && otherInternalProducts.length === 0) ||
            (selectedTypeFilter === 'smart_portfolio' && smartPortfolios.length === 0)) && (
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
