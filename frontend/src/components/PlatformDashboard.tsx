import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Wallet, DollarSign, Newspaper, Check } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useIsMobile } from './ui/use-mobile';

export function PlatformDashboard() {
  const { currentUser } = useUser();
  const isMobile = useIsMobile();
  const [portfolio, setPortfolio] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);


  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Load client assets/portfolio
      const assetsResponse = await apiCall(`/api/clients/${currentUser.id}/assets/`);
      setPortfolio(assetsResponse.assets || []);

      // Load all transactions
      const transactionsResponse = await apiCall(`/api/clients/${currentUser.id}/transactions/`);
      const allTransactionsList = transactionsResponse.transactions || [];
      setAllTransactions(allTransactionsList);
      
      // Get recent transactions for display (last 5)
      const sortedTransactions = allTransactionsList
        .sort((a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
        .slice(0, 5);
      setTransactions(sortedTransactions);

      // Load all assets for gainers/losers
      const allAssetsResponse = await apiCall('/api/assets/');
      setAssets(allAssetsResponse.assets || []);
    } catch (error) {
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
    } catch (error) {
      console.error('Error loading news posts:', error);
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

  const investedCapital = parseFinancialValue(currentUser?.investedCapital || currentUser?.invested_capital || 0);
  const tradingPortfolio = parseFinancialValue(currentUser?.tradingPortfolio || currentUser?.trading_portfolio || 0);
  const bonus = parseFinancialValue(currentUser?.bonus || 0);
  
  // Calculate Fonds Disponibles using the account balance formula
  // Formula: investedCapital - tradingPortfolio - bonus
  // This represents the actual available funds based on the client's account state,
  // not just summing transactions which may not reflect the current balance
  const availableFunds = Math.max(0, investedCapital - tradingPortfolio - bonus);

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

  // Check if account is verified (for now, assume not verified if no verification status exists)
  const isVerified = currentUser?.verified || currentUser?.accountVerified || false;

  return (
    <div style={{ padding: isMobile ? '16px' : '20px 120px' }}>
      <h1 style={{ 
        fontSize: isMobile ? '22px' : '28px', 
        fontWeight: 'bold', 
        marginBottom: isMobile ? '20px' : '30px' 
      }}>
        Bienvenue, {currentUser?.fname || currentUser?.firstName || currentUser?.fullName || 'Client'}
      </h1>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Account Verification Steps */}
          {!isVerified && (
            <Card style={{ marginBottom: isMobile ? '20px' : '30px', backgroundColor: '#f9fafb' }}>
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
                    // TODO: Implement verification flow
                    console.log('Verify account clicked');
                  }}
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    fontWeight: 'bold',
                    padding: isMobile ? '10px 20px' : '12px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: isMobile ? '14px' : '16px',
                    width: isMobile ? '100%' : 'auto',
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
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: isMobile ? '16px' : '20px', 
            marginBottom: isMobile ? '20px' : '30px' 
          }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium" style={{ fontSize: isMobile ? '13px' : '14px' }}>Capital Investi</CardTitle>
                <DollarSign className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontSize: isMobile ? '20px' : '24px' }}>
                  {investedCapital.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium" style={{ fontSize: isMobile ? '13px' : '14px' }}>Portefeuille Trading</CardTitle>
                <TrendingUp className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontSize: isMobile ? '20px' : '24px' }}>
                  {tradingPortfolio.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium" style={{ fontSize: isMobile ? '13px' : '14px' }}>Fonds Disponibles</CardTitle>
                <Wallet className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontSize: isMobile ? '20px' : '24px' }}>
                  {availableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium" style={{ fontSize: isMobile ? '13px' : '14px' }}>Bonus</CardTitle>
                <TrendingDown className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontSize: isMobile ? '20px' : '24px' }}>
                  {bonus.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card style={{ marginBottom: isMobile ? '20px' : '30px' }}>
            <CardHeader>
              <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Transactions Récentes</CardTitle>
              <CardDescription style={{ fontSize: isMobile ? '13px' : '14px' }}>Vos dernières transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p style={{ fontSize: isMobile ? '14px' : '16px' }}>Aucune transaction récente</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '10px' }}>
                  {transactions.map((transaction: any) => {
                    const getStatusLabel = (status: string) => {
                      switch (status) {
                        case 'en_attente_paiement':
                          return 'En attente de paiement';
                        case 'en_cours':
                          return 'En cours';
                        case 'termine':
                          return 'Terminé';
                        case 'conteste':
                          return 'Contesté';
                        default:
                          return status;
                      }
                    };

                    const getStatusColor = (status: string) => {
                      switch (status) {
                        case 'en_attente_paiement':
                          return { bg: '#fef3c7', text: '#92400e' }; // yellow
                        case 'en_cours':
                          return { bg: '#dbeafe', text: '#1e40af' }; // blue
                        case 'termine':
                          return { bg: '#d1fae5', text: '#065f46' }; // green
                        case 'conteste':
                          return { bg: '#fee2e2', text: '#991b1b' }; // red
                        default:
                          return { bg: '#f3f4f6', text: '#374151' }; // gray
                      }
                    };

                    const statusColors = getStatusColor(transaction.status || 'en_cours');

                    return (
                      <div
                        key={transaction.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: isMobile ? 'flex-start' : 'center',
                          padding: isMobile ? '12px' : '15px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          flexWrap: isMobile ? 'wrap' : 'nowrap',
                          gap: isMobile ? '8px' : '0',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: isMobile ? '8px' : '10px', 
                            marginBottom: '5px',
                            flexWrap: 'wrap',
                          }}>
                            <div style={{ 
                              fontWeight: 'bold',
                              fontSize: isMobile ? '14px' : '16px',
                            }}>
                              {transaction.type === 'depot' ? 'Dépôt' :
                               transaction.type === 'retrait' ? 'Retrait' :
                               transaction.type === 'achat' ? 'Achat' :
                               transaction.type === 'vente' ? 'Vente' :
                               transaction.type === 'bonus' ? 'Bonus' :
                               transaction.type}
                            </div>
                            {transaction.status && (
                              <span
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: isMobile ? '11px' : '12px',
                                  fontWeight: '500',
                                  backgroundColor: statusColors.bg,
                                  color: statusColors.text,
                                }}
                              >
                                {getStatusLabel(transaction.status)}
                              </span>
                            )}
                          </div>
                          <div style={{ 
                            fontSize: isMobile ? '12px' : '14px', 
                            color: '#6b7280' 
                          }}>
                            {new Date(transaction.datetime).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                        <div style={{ 
                          fontWeight: 'bold', 
                          fontSize: isMobile ? '16px' : '18px',
                          flexShrink: 0,
                        }}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio */}
          <Card style={{ marginBottom: isMobile ? '20px' : '30px' }}>
            <CardHeader>
              <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Mon Portefeuille</CardTitle>
              <CardDescription style={{ fontSize: isMobile ? '13px' : '14px' }}>Vos actifs disponibles</CardDescription>
            </CardHeader>
            <CardContent>
              {portfolio && portfolio.length === 0 ? (
                <p style={{ fontSize: isMobile ? '14px' : '16px' }}>Aucun actif dans votre portefeuille</p>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', 
                  gap: isMobile ? '12px' : '15px' 
                }}>
                  {portfolio?.map((asset: any) => (
                    <div
                      key={asset.id}
                      style={{
                        padding: isMobile ? '12px' : '15px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ 
                        fontWeight: 'bold',
                        fontSize: isMobile ? '14px' : '16px',
                      }}>{asset.asset?.name || 'N/A'}</div>
                      <div style={{ 
                        fontSize: isMobile ? '12px' : '14px', 
                        color: '#6b7280' 
                      }}>{asset.asset?.type || ''}</div>
                      {asset.featured && (
                        <div style={{ 
                          fontSize: isMobile ? '11px' : '12px', 
                          color: '#3b82f6', 
                          marginTop: '5px' 
                        }}>⭐ Mis en avant</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* News Feed and Market Movers */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', 
            gap: isMobile ? '20px' : '30px' 
          }}>
            {/* News Feed */}
            <Card>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Newspaper className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
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
                    {newsPosts.map((post: any) => (
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
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gainers and Losers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px' }}>
              {/* Top Gainers */}
              <Card>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp className={isMobile ? "h-4 w-4 text-green-600" : "h-5 w-5 text-green-600"} />
                    <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Plus hausses</CardTitle>
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
              <Card>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingDown className={isMobile ? "h-4 w-4 text-red-600" : "h-5 w-5 text-red-600"} />
                    <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Plus baisses</CardTitle>
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
