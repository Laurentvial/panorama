import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ChevronLeft, TrendingUp, TrendingDown, BarChart3, FileText, Newspaper, DollarSign, MoreHorizontal, Check, ExternalLink } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [data, setData] = useState<any>(null);
  const [dataType, setDataType] = useState<'asset' | 'product' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'analysis' | 'news' | 'financials'>('overview');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '6M' | '1Y' | '3Y' | 'MAX'>('1W');
  
  // Subscription form state
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState({
    firstName: currentUser?.fname || currentUser?.firstName || '',
    lastName: currentUser?.lname || currentUser?.lastName || '',
    birthDate: currentUser?.birthDate || '',
    city: currentUser?.city || '',
    amount: '',
    interestPeriod: '',
    contractEnd: '',
    acceptTerms: false,
    acceptConditions: false,
  });
  const [clientIP, setClientIP] = useState('');

  useEffect(() => {
    // Get client IP
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIP(data.ip))
      .catch(() => setClientIP('N/A'));
    
    // Set current date
    const today = new Date().toISOString().split('T')[0];
    setSubscriptionData(prev => ({ ...prev, contractEnd: today }));
  }, []);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Try loading as asset first
      try {
        const assetResponse = await apiCall(`/api/assets/${id}/`);
        setData(assetResponse.asset || assetResponse);
        setDataType('asset');
      } catch (assetError) {
        // If asset fails, try as product
        try {
          const productResponse = await apiCall(`/api/products/${id}/`);
          setData(productResponse.product || productResponse);
          setDataType('product');
        } catch (productError) {
          console.error('Error loading product:', productError);
          toast.error('Erreur lors du chargement du produit');
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const parseFinancialValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatProfitability = (product: any): string => {
    if (product.isVariableProfitability === 'Oui' && product.variableProfitability) {
      const min = parseFinancialValue(product.profitability);
      const max = parseFinancialValue(product.variableProfitability);
      const period = product.profitabilityPeriod || 'Mensuel';
      return `${min.toFixed(2)} à ${max.toFixed(2)}% ${period}`;
    } else if (product.profitability !== null && product.profitability !== undefined) {
      const profit = parseFinancialValue(product.profitability);
      const period = product.profitabilityPeriod || 'Mensuel';
      return `${profit.toFixed(2)}% ${period}`;
    }
    return 'N/A';
  };

  const handleSubscribe = async () => {
    if (!subscriptionData.acceptTerms || !subscriptionData.acceptConditions) {
      toast.error('Veuillez accepter les conditions générales');
      return;
    }
    // TODO: Implement subscription API call
    toast.success('Souscription en cours de traitement...');
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 120px' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '20px 120px' }}>
        <div>Produit introuvable</div>
      </div>
    );
  }

  // Product view (internal investment products)
  if (dataType === 'product') {
    const product = data;
    const minInvestment = parseFinancialValue(product.minEntryValue);
    const maxInvestment = parseFinancialValue(product.maxEntryValue);
    
    return (
      <div style={{ padding: '20px 120px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '20px', fontSize: '14px', color: '#6b7280' }}>
          <span 
            onClick={() => navigate('/platform/discover')}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
          >
            Découvrir
          </span>
          {' > '}
          <span>{product.name}</span>
        </div>

        {/* Header Section */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Product Image */}
            {product.imageUrl && (
              <img 
                src={product.imageUrl}
                alt={product.name}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                }}
              />
            )}
            
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0, marginBottom: '8px' }}>
                {product.name || 'N/A'}
              </h1>
              {product.reference && (
                <div style={{ fontSize: '16px', color: '#6b7280' }}>
                  {product.reference}
                </div>
              )}
            </div>
          </div>

          <Button 
            onClick={() => setShowSubscriptionForm(true)}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              fontWeight: '600',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Souscription
          </Button>
        </div>

        {/* Product Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', marginBottom: '30px' }}>
          {/* Main Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Product Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Détails du produit</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Durée</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.duration || 'N/A'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Rentabilité</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                      {formatProfitability(product)}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Investissement minimum</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {minInvestment > 0 ? `${minInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : 'N/A'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Investissement maximum</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {maxInvestment > 0 ? `${maxInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : 'N/A'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Reconduction</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.capitalisationFonds === 'Oui' ? 'Oui' : 'Non'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Garantie contractuelle</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.noProfitability === 'Non' ? 'Oui' : 'Non'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Indice de confiance</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      100/100
                    </div>
                  </div>
                </div>
                
                <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                  <Button variant="outline" style={{ fontSize: '14px' }}>
                    <FileText className="h-4 w-4" style={{ marginRight: '8px' }} />
                    Conditions générales
                  </Button>
                  <Button variant="outline" style={{ fontSize: '14px' }}>
                    <BarChart3 className="h-4 w-4" style={{ marginRight: '8px' }} />
                    Récapitulatif des gains
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Profitability Simulator */}
            <Card>
              <CardHeader>
                <CardTitle>Simulateur de rentabilité</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ 
                  height: '200px', 
                  backgroundColor: '#f9fafb', 
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ color: '#6b7280' }}>Simulateur de rentabilité à venir...</div>
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            {product.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#374151', 
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {product.description}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div>
            {/* Subscription Form Card */}
            {showSubscriptionForm && (
              <Card style={{ marginBottom: '20px' }}>
                <CardHeader>
                  <CardTitle>Formulaire de souscription</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <Label htmlFor="test">Test</Label>
                      <Input
                        id="test"
                        value="Test"
                        disabled
                        style={{ backgroundColor: '#f9fafb', color: '#6b7280' }}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="firstName">Prénom</Label>
                      <Input
                        id="firstName"
                        value={subscriptionData.firstName}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, firstName: e.target.value })}
                        placeholder="Prénom"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="lastName">Nom</Label>
                      <Input
                        id="lastName"
                        value={subscriptionData.lastName}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, lastName: e.target.value })}
                        placeholder="Nom"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="birthDate">Date de naissance</Label>
                      <Input
                        id="birthDate"
                        type="date"
                        value={subscriptionData.birthDate}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, birthDate: e.target.value })}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="ip">IP de la transaction</Label>
                      <Input
                        id="ip"
                        value={clientIP}
                        disabled
                        style={{ backgroundColor: '#f9fafb', color: '#6b7280' }}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="transactionDate">Fait le (Date)</Label>
                      <Input
                        id="transactionDate"
                        type="date"
                        value={new Date().toISOString().split('T')[0]}
                        disabled
                        style={{ backgroundColor: '#f9fafb', color: '#6b7280' }}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="city">À (Ville)</Label>
                      <Input
                        id="city"
                        value={subscriptionData.city}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, city: e.target.value })}
                        placeholder="Ville"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="amount">Montant</Label>
                      <Input
                        id="amount"
                        type="number"
                        value={subscriptionData.amount}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, amount: e.target.value })}
                        placeholder="10000"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="interestPeriod">Période d'intérêt</Label>
                      <Input
                        id="interestPeriod"
                        value={subscriptionData.interestPeriod}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, interestPeriod: e.target.value })}
                        placeholder={product.interestPeriod || 'Période'}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="contractEnd">Fin de contrat</Label>
                      <Input
                        id="contractEnd"
                        type="date"
                        value={subscriptionData.contractEnd}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, contractEnd: e.target.value })}
                      />
                    </div>
                    
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Prévisualisation du contrat</div>
                      <div style={{ 
                        padding: '16px', 
                        backgroundColor: '#f9fafb', 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        minHeight: '100px',
                        fontSize: '12px',
                        color: '#6b7280',
                      }}>
                        Contrat de souscription pour {product.name}
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Signature</div>
                      <div style={{ 
                        padding: '16px', 
                        backgroundColor: '#f9fafb', 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        minHeight: '80px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                      }}>
                        Zone de signature
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={subscriptionData.acceptTerms}
                          onChange={(e) => setSubscriptionData({ ...subscriptionData, acceptTerms: e.target.checked })}
                        />
                        <span style={{ fontSize: '14px' }}>Bon pour accord</span>
                      </label>
                      
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={subscriptionData.acceptConditions}
                          onChange={(e) => setSubscriptionData({ ...subscriptionData, acceptConditions: e.target.checked })}
                        />
                        <span style={{ fontSize: '14px' }}>J'accepte les Termes et Conditions</span>
                      </label>
                    </div>
                    
                    <Button 
                      onClick={handleSubscribe}
                      style={{
                        width: '100%',
                        backgroundColor: '#10b981',
                        color: 'white',
                        fontWeight: '600',
                        padding: '12px',
                        borderRadius: '8px',
                        marginTop: '10px',
                      }}
                    >
                      Souscrire
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Asset view (crypto/stocks) - existing code
  const asset = data;
  const getAssetType = () => {
    const type = asset?.type?.toLowerCase() || '';
    if (type.includes('crypto') || type.includes('cryptomonnaie')) {
      return 'crypto';
    }
    return 'other';
  };

  const isCrypto = getAssetType() === 'crypto';
  const price = parseFinancialValue(asset?.price || asset?.lastPrice || 0);
  const priceChange = parseFinancialValue(asset?.priceChange || asset?.change || 0);
  const priceChangePercent = parseFinancialValue(asset?.priceChangePercent || asset?.changePercent || 0);

  return (
    <div style={{ padding: '20px 120px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '20px', fontSize: '14px', color: '#6b7280' }}>
        <span 
          onClick={() => navigate('/platform/discover')}
          style={{ cursor: 'pointer', textDecoration: 'underline' }}
        >
          Découvrir
        </span>
        {' > '}
        {isCrypto && (
          <>
            <span>Crypto</span>
            {' > '}
            <span>Coins</span>
            {' > '}
          </>
        )}
        <span>{asset.reference || asset.name}</span>
      </div>

      {/* Header Section */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '30px',
        paddingBottom: '20px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Asset Logo */}
          {asset.logoUrl ? (
            <img 
              src={asset.logoUrl}
              alt={asset.name}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '12px',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '12px',
              backgroundColor: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>
              {asset.name?.charAt(0) || 'A'}
            </div>
          )}
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>
                {asset.reference || 'N/A'} {asset.name || ''}
              </h1>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: priceChangePercent >= 0 ? '#10b981' : '#ef4444' }}>
                {price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '16px', color: priceChangePercent >= 0 ? '#10b981' : '#ef4444' }}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                {' '}({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Marché ouvert • PRIX PAR eToro, EN EUR
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button 
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              fontWeight: '600',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Trader
          </Button>
          <Button variant="outline" style={{ padding: '12px' }}>
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '30px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {[
          { id: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
          { id: 'chart', label: 'Graphique', icon: TrendingUp },
          { id: 'analysis', label: 'Analyse', icon: FileText },
          { id: 'news', label: 'Actualités', icon: Newspaper },
          { id: 'financials', label: 'Finances', icon: DollarSign },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 20px',
                border: 'none',
                backgroundColor: 'transparent',
                borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
                color: isActive ? '#111827' : '#6b7280',
                fontWeight: isActive ? '600' : '400',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
              }}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
        {/* Main Content */}
        <div>
          {activeTab === 'overview' && (
            <Card>
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <CardTitle>Performance</CardTitle>
                  <Button variant="outline" style={{ fontSize: '12px', padding: '6px 12px' }}>
                    Vue complète du trading
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Performance Chart Placeholder */}
                <div style={{
                  height: '300px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ color: '#6b7280' }}>Graphique de performance</div>
                </div>

                {/* Timeframe Selector */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                  {['1D', '1W', '1M', '6M', '1Y', '3Y', 'MAX'].map((timeframe) => (
                    <button
                      key={timeframe}
                      onClick={() => setSelectedTimeframe(timeframe as any)}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        backgroundColor: selectedTimeframe === timeframe ? '#10b981' : 'white',
                        color: selectedTimeframe === timeframe ? 'white' : '#111827',
                        fontWeight: selectedTimeframe === timeframe ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {timeframe}
                    </button>
                  ))}
                </div>

                {/* Performance Info */}
                <div style={{ fontSize: '18px', fontWeight: '600', color: priceChangePercent >= 0 ? '#10b981' : '#ef4444' }}>
                  {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}% Semaine passée
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'chart' && (
            <Card>
              <CardHeader>
                <CardTitle>Graphique</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{
                  height: '400px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ color: '#6b7280' }}>Graphique de trading</div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'analysis' && (
            <Card>
              <CardHeader>
                <CardTitle>Analyse</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280' }}>
                  Analyse détaillée du produit à venir...
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'news' && (
            <Card>
              <CardHeader>
                <CardTitle>Actualités</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280' }}>
                  Actualités liées au produit à venir...
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'financials' && (
            <Card>
              <CardHeader>
                <CardTitle>Finances</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280' }}>
                  Informations financières à venir...
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Why is it moving? */}
          <Card>
            <CardHeader>
              <CardTitle>Pourquoi {asset.reference || asset.name} bouge-t-il ?</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                Découvrez les facteurs qui influencent le prix de cet actif.
              </p>
              <Button 
                style={{
                  width: '100%',
                  backgroundColor: '#111827',
                  color: 'white',
                  fontWeight: '600',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                S'abonner au Club eToro
              </Button>
            </CardContent>
          </Card>

          {/* Additional Info Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {asset.category && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Catégorie:</span>
                    <span style={{ fontWeight: '600' }}>{asset.category}</span>
                  </div>
                )}
                {asset.type && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Type:</span>
                    <span style={{ fontWeight: '600' }}>{asset.type}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
