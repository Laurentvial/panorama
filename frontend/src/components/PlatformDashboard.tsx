import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Check, PieChart } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useIsMobile } from './ui/use-mobile';

export function PlatformDashboard() {
  const { currentUser } = useUser();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [visibleNewsCount, setVisibleNewsCount] = useState(5);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);


  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Load all transactions
      const transactionsResponse = await apiCall(`/api/clients/${currentUser.id}/transactions/`);
      const allTransactionsList = transactionsResponse.transactions || [];
      setAllTransactions(allTransactionsList);

      // Load all assets for gainers/losers
      const allAssetsResponse = await apiCall('/api/assets/');
      setAssets(allAssetsResponse.assets || []);
    } catch (error: any) {
      // If it's a redirect error, don't log it - page is navigating away
      if (error?.isRedirecting) {
        return;
      }
      // If it's an authentication error, the redirect will happen in apiCall
      if (error?.status === 401 || error?.message?.includes('token') || error?.message?.includes('Authentication')) {
        // Redirect is handled in apiCall, just return early
        return;
      }
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNewsPosts = async () => {
    try {
      setNewsLoading(true);
      const newsResponse = await apiCall('/api/news/');
      setNewsPosts(newsResponse.news || []);
      setVisibleNewsCount(5);
    } catch (error: any) {
      console.error('Error loading news posts:', error);
      // If it's a 401 and we're on a public endpoint, try without auth
      if (error?.status === 401) {
        try {
          // Try fetching news without authentication (public endpoint)
          const response = await fetch(`${(import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000'}/api/news/`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const data = await response.json();
            setNewsPosts(data.news || []);
            setVisibleNewsCount(5);
            return;
          }
        } catch (fallbackError) {
          console.error('Fallback news fetch also failed:', fallbackError);
        }
      }
      // Set empty array on error
      setNewsPosts([]);
      setVisibleNewsCount(5);
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadDashboardData();
      loadNewsPosts();
    }
  }, [currentUser]);

  // Parse financial values, handling strings, null, undefined, and ensuring they're numbers
  const parseFinancialValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const tradingPortfolio = parseFinancialValue(currentUser?.tradingPortfolio || currentUser?.trading_portfolio || 0);

  const calculateProfitLoss = () => {
    let profitLoss = 0;
    (allTransactions || []).forEach((transaction: any) => {
      const amount = parseFinancialValue(transaction?.amount);
      switch (transaction?.type) {
        case 'achat':
          profitLoss -= amount;
          break;
        case 'vente':
          profitLoss += amount;
          break;
        case 'interets':
        case 'bonus':
          profitLoss += amount;
          break;
        case 'frais':
        case 'perte':
          profitLoss -= amount;
          break;
        default:
          break;
      }
    });
    return profitLoss;
  };

  const profitLoss = calculateProfitLoss();
  const portfolioValue = tradingPortfolio + profitLoss;
  const isProfit = profitLoss >= 0;

  // Calculate gainers and losers
  const getGainersAndLosers = () => {
    const assetsWithPriceChange = assets.filter((asset: any) => 
      asset.priceChangePercent !== null && 
      asset.priceChangePercent !== undefined &&
      asset.lastPrice !== null &&
      asset.lastPrice !== undefined
    );

    // Sort by price change percentage
    const sorted = [...assetsWithPriceChange].sort((a: any, b: any) => {
      const aChange = parseFinancialValue(a.priceChangePercent);
      const bChange = parseFinancialValue(b.priceChangePercent);
      return bChange - aChange;
    });

    const gainers = sorted.filter((asset: any) => parseFinancialValue(asset.priceChangePercent) > 0).slice(0, 5);
    const losers = sorted.filter((asset: any) => parseFinancialValue(asset.priceChangePercent) < 0).slice(-5).reverse();

    return { gainers, losers };
  };

  const { gainers, losers } = getGainersAndLosers();

  // Check if account is verified (server-side flag computed from all required onboarding fields)
  const isVerified = Boolean(currentUser?.accountVerified || currentUser?.account_verified);
  const roundedCardStyle: React.CSSProperties = { borderRadius: '10px', overflow: 'hidden' };

  return (
    <div style={{ padding: isMobile ? '16px' : '20px 20px' }}>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Account Verification Steps */}
          {!isVerified && (
            <Card style={{ ...roundedCardStyle, marginBottom: isMobile ? '20px' : '30px', backgroundColor: '#f9fafb' }}>
              <CardContent style={{ padding: isMobile ? '20px' : '30px' }}>
                {/* Progress Steps */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-start', 
                  gap: isMobile ? '6px' : '10px', 
                  marginBottom: isMobile ? '20px' : '25px',
                  overflowX: 'auto',
                }}>
                  {/* Step 1 - Completed */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', flexShrink: 0 }}>
                    <div style={{
                      width: isMobile ? '32px' : '40px',
                      height: isMobile ? '32px' : '40px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                    }}>
                      <Check className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
                    </div>
                    <div style={{
                      width: isMobile ? '40px' : '60px',
                      height: '2px',
                      backgroundColor: '#d1d5db',
                      borderStyle: 'dashed',
                      flexShrink: 0,
                    }}></div>
                  </div>

                  {/* Step 2 - Current */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', flexShrink: 0 }}>
                    <div style={{
                      width: isMobile ? '32px' : '40px',
                      height: isMobile ? '32px' : '40px',
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      border: '2px solid #10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#111827',
                      fontWeight: 'bold',
                      fontSize: isMobile ? '14px' : '16px',
                    }}>
                      2
                    </div>
                    <div style={{
                      width: isMobile ? '40px' : '60px',
                      height: '2px',
                      backgroundColor: '#d1d5db',
                      borderStyle: 'dashed',
                      flexShrink: 0,
                    }}></div>
                  </div>

                  {/* Step 3 - Pending */}
                  <div style={{ flexShrink: 0 }}>
                    <div style={{
                      width: isMobile ? '32px' : '40px',
                      height: isMobile ? '32px' : '40px',
                      borderRadius: '50%',
                      backgroundColor: '#f3f4f6',
                      border: '2px solid #d1d5db',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#6b7280',
                      fontWeight: 'bold',
                      fontSize: isMobile ? '14px' : '16px',
                    }}>
                      3
                    </div>
                  </div>
                </div>

                {/* Heading */}
                <h2 style={{ 
                  fontSize: isMobile ? '20px' : '24px', 
                  fontWeight: 'bold', 
                  marginBottom: '12px', 
                  color: '#111827' 
                }}>
                  Vous êtes presque prêt à trader
                </h2>

                {/* Description */}
                <p style={{ 
                  fontSize: isMobile ? '14px' : '16px', 
                  color: '#374151', 
                  marginBottom: isMobile ? '20px' : '25px', 
                  lineHeight: '1.6' 
                }}>
                  La vérification de votre identité nous aide à empêcher quelqu'un d'autre de créer un compte en votre nom.
                </p>

                {/* Verify Button */}
                <Button 
                  onClick={() => {
                    navigate('/platform/verification');
                  }}
                  variant="platform"
                  style={{
                    width: isMobile ? '100%' : 'auto',
                    ['--platform-button-bg' as any]: '#10b981',
                  }}
                >
                  Vérifier votre compte
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr',
            gap: isMobile ? '16px' : '20px',
            marginBottom: isMobile ? '20px' : '30px' 
          }}>
            <Card style={roundedCardStyle}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium" style={{ fontSize: isMobile ? '13px' : '14px' }}>
                  Valeur du Portefeuille
                </CardTitle>
                <PieChart className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontSize: isMobile ? '22px' : '28px' }}>
                  {portfolioValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <div style={{ marginTop: 6, fontSize: isMobile ? '12px' : '13px', color: isProfit ? '#10b981' : '#ef4444' }}>
                  {isProfit ? '+' : ''}{profitLoss.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <div style={{ marginTop: 12 }}>
                  <Button
                    variant="platform"
                    onClick={() => navigate('/platform/portfolio')}
                    style={{ borderRadius: 12 }}
                  >
                    Voir mon portefeuille
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* News Feed and Market Movers */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', 
            gap: isMobile ? '20px' : '30px' 
          }}>
            {/* News Feed */}
            <Card style={roundedCardStyle}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Actualités</CardTitle>
                </div>
                <CardDescription style={{ fontSize: isMobile ? '13px' : '14px' }}>Dernières nouvelles et mises à jour</CardDescription>
              </CardHeader>
              <CardContent>
                {newsLoading ? (
                  <div style={{ fontSize: isMobile ? '14px' : '16px' }}>Chargement des actualités...</div>
                ) : newsPosts.length === 0 ? (
                  <p style={{ fontSize: isMobile ? '14px' : '16px' }}>Aucune actualité disponible</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px' }}>
                    {newsPosts.slice(0, visibleNewsCount).map((post: any) => (
                      <div
                        key={post.id}
                        style={{
                          padding: isMobile ? '16px' : '20px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          backgroundColor: 'white',
                        }}
                      >
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt={post.title}
                            style={{
                              width: '100%',
                              maxHeight: isMobile ? '200px' : '300px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              marginBottom: isMobile ? '12px' : '15px',
                            }}
                          />
                        )}
                        <h3 style={{ 
                          fontSize: isMobile ? '18px' : '20px', 
                          fontWeight: 'bold', 
                          marginBottom: '10px' 
                        }}>
                          {post.title}
                        </h3>
                        <div
                          style={{
                            fontSize: isMobile ? '13px' : '14px',
                            color: '#6b7280',
                            marginBottom: isMobile ? '12px' : '15px',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.6',
                          }}
                        >
                          {post.content}
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          fontSize: isMobile ? '11px' : '12px', 
                          color: '#9ca3af',
                          flexWrap: 'wrap',
                          gap: isMobile ? '8px' : '0',
                        }}>
                          <span>Par {post.authorName || 'Admin'}</span>
                          <span>
                            {new Date(post.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}

                    {newsPosts.length > visibleNewsCount && (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Button
                          type="button"
                          variant="platform"
                          onClick={() => setVisibleNewsCount((c) => c + 5)}
                          style={{ borderRadius: 12 }}
                        >
                          Charger plus
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gainers and Losers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px' }}>
              {/* Top Gainers */}
              <Card style={roundedCardStyle}>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp className={isMobile ? "h-4 w-4 text-green-600" : "h-5 w-5 text-green-600"} />
                    <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Les plus fortes variations haussières</CardTitle>
                  </div>
                  <CardDescription style={{ fontSize: isMobile ? '13px' : '14px' }}>Actifs en hausse aujourd'hui</CardDescription>
                </CardHeader>
                <CardContent>
                  {gainers.length === 0 ? (
                    <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280' }}>Aucune donnée disponible</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '12px' }}>
                      {gainers.map((asset: any) => {
                        const changePercent = parseFinancialValue(asset.priceChangePercent);
                        return (
                          <div
                            key={asset.id}
                            style={{
                              padding: isMobile ? '10px' : '12px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              backgroundColor: 'white',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              marginBottom: '4px',
                              flexWrap: 'wrap',
                              gap: '4px',
                            }}>
                              <div style={{ 
                                fontWeight: '600', 
                                fontSize: isMobile ? '13px' : '14px',
                                wordBreak: 'break-word',
                              }}>{asset.name}</div>
                              <div style={{ 
                                fontSize: isMobile ? '13px' : '14px', 
                                fontWeight: '600', 
                                color: '#10b981',
                                flexShrink: 0,
                              }}>
                                +{changePercent.toFixed(2)}%
                              </div>
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '4px',
                            }}>
                              <div style={{ 
                                fontSize: isMobile ? '11px' : '12px', 
                                color: '#6b7280' 
                              }}>{asset.type}</div>
                              <div style={{ 
                                fontSize: isMobile ? '11px' : '12px', 
                                fontWeight: '500', 
                                color: '#111827',
                                flexShrink: 0,
                              }}>
                                {parseFinancialValue(asset.lastPrice).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {asset.currency || '€'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Losers */}
              <Card style={roundedCardStyle}>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingDown className={isMobile ? "h-4 w-4 text-red-600" : "h-5 w-5 text-red-600"} />
                    <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Les plus fortes variations baissières</CardTitle>
                  </div>
                  <CardDescription style={{ fontSize: isMobile ? '13px' : '14px' }}>Actifs en baisse aujourd'hui</CardDescription>
                </CardHeader>
                <CardContent>
                  {losers.length === 0 ? (
                    <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280' }}>Aucune donnée disponible</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '12px' }}>
                      {losers.map((asset: any) => {
                        const changePercent = parseFinancialValue(asset.priceChangePercent);
                        return (
                          <div
                            key={asset.id}
                            style={{
                              padding: isMobile ? '10px' : '12px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              backgroundColor: 'white',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              marginBottom: '4px',
                              flexWrap: 'wrap',
                              gap: '4px',
                            }}>
                              <div style={{ 
                                fontWeight: '600', 
                                fontSize: isMobile ? '13px' : '14px',
                                wordBreak: 'break-word',
                              }}>{asset.name}</div>
                              <div style={{ 
                                fontSize: isMobile ? '13px' : '14px', 
                                fontWeight: '600', 
                                color: '#ef4444',
                                flexShrink: 0,
                              }}>
                                {changePercent.toFixed(2)}%
                              </div>
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '4px',
                            }}>
                              <div style={{ 
                                fontSize: isMobile ? '11px' : '12px', 
                                color: '#6b7280' 
                              }}>{asset.type}</div>
                              <div style={{ 
                                fontSize: isMobile ? '11px' : '12px', 
                                fontWeight: '500', 
                                color: '#111827',
                                flexShrink: 0,
                              }}>
                                {parseFinancialValue(asset.lastPrice).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {asset.currency || '€'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
