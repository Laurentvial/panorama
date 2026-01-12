import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Search, TrendingUp, Coins, BarChart3, Building2, Wallet } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

export function PlatformDiscover() {
  const { currentUser } = useUser();
  const [assets, setAssets] = useState<any[]>([]);
  const [clientAssets, setClientAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadDiscoverData();
    }
  }, [currentUser]);

  const loadDiscoverData = async () => {
    try {
      setLoading(true);
      const [assetsResponse, clientAssetsResponse] = await Promise.all([
        apiCall('/api/assets/'),
        apiCall(`/api/clients/${currentUser.id}/assets/`),
      ]);
      setAssets(assetsResponse.assets || []);
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

  // Get unique types and categories
  const types = Array.from(new Set(assets.map((a: any) => a.type).filter(Boolean)));
  const categories = Array.from(new Set(assets.map((a: any) => a.category).filter(Boolean)));

  // Filter assets
  const filteredAssets = assets.filter((asset: any) => {
    const matchesSearch = !searchTerm || 
      asset.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = selectedType === 'all' || asset.type === selectedType;
    const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  // Check if asset is already in client's portfolio
  const isAssetInPortfolio = (assetId: string) => {
    return clientAssets.some((ca: any) => ca.asset?.id === assetId);
  };

  const getTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'crypto':
      case 'cryptomonnaie':
        return <Coins className="h-5 w-5" />;
      case 'etf':
        return <BarChart3 className="h-5 w-5" />;
      case 'action':
      case 'actions':
        return <TrendingUp className="h-5 w-5" />;
      case 'obligation':
      case 'obligations':
        return <Building2 className="h-5 w-5" />;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'crypto':
      case 'cryptomonnaie':
        return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      case 'etf':
        return { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' };
      case 'action':
      case 'actions':
        return { bg: '#d1fae5', text: '#065f46', border: '#34d399' };
      case 'obligation':
      case 'obligations':
        return { bg: '#e9d5ff', text: '#6b21a8', border: '#a78bfa' };
      default:
        return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '30px' }}>
        Découvrir les Produits Financiers
      </h1>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Filters */}
          <Card style={{ marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Rechercher et Filtrer</CardTitle>
              <CardDescription>Trouvez les produits financiers qui vous intéressent</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div style={{ position: 'relative' }}>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher un produit..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: '35px' }}
                  />
                </div>

                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type de produit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    {types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les catégories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Assets Grid */}
          <div>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600' }}>
                {filteredAssets.length} produit{filteredAssets.length > 1 ? 's' : ''} disponible{filteredAssets.length > 1 ? 's' : ''}
              </h2>
            </div>

            {filteredAssets.length === 0 ? (
              <Card>
                <CardContent style={{ padding: '40px', textAlign: 'center' }}>
                  <p style={{ color: '#6b7280' }}>Aucun produit trouvé avec ces critères</p>
                </CardContent>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {filteredAssets.map((asset: any) => {
                  const isInPortfolio = isAssetInPortfolio(asset.id);
                  const typeColor = getTypeColor(asset.type);
                  
                  return (
                    <Card key={asset.id} style={{ 
                      border: `2px solid ${typeColor.border}`,
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    >
                      <CardHeader>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: typeColor.bg,
                            color: typeColor.text,
                            fontSize: '12px',
                            fontWeight: '600',
                          }}>
                            {getTypeIcon(asset.type)}
                            <span>{asset.type || 'Autre'}</span>
                          </div>
                          {isInPortfolio && (
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#d1fae5',
                              color: '#065f46',
                              fontSize: '11px',
                              fontWeight: '600',
                            }}>
                              Dans votre portefeuille
                            </span>
                          )}
                        </div>
                        <CardTitle style={{ fontSize: '20px', marginBottom: '5px' }}>
                          {asset.name || 'N/A'}
                        </CardTitle>
                        {asset.category && (
                          <CardDescription style={{ fontSize: '14px' }}>
                            {asset.category}
                            {asset.subcategory && ` • ${asset.subcategory}`}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        {asset.reference && (
                          <div style={{ marginBottom: '15px' }}>
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>Référence: </span>
                            <span style={{ fontSize: '14px', fontWeight: '500' }}>{asset.reference}</span>
                          </div>
                        )}
                        
                        {asset.description && (
                          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '15px' }}>
                            {asset.description}
                          </p>
                        )}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                          {!isInPortfolio ? (
                            <Button
                              onClick={() => handleAddAsset(asset.id)}
                              style={{ flex: 1 }}
                            >
                              Ajouter au portefeuille
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              disabled
                              style={{ flex: 1 }}
                            >
                              Déjà dans votre portefeuille
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
