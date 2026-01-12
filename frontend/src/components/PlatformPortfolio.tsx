import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';
import { apiCall } from '../utils/api';

export function PlatformPortfolio() {
  const { currentUser } = useUser();
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadPortfolioData();
    }
  }, [currentUser]);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      const [assetsResponse, transactionsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/assets/`),
        apiCall(`/api/clients/${currentUser.id}/transactions/`),
      ]);
      setAssets(assetsResponse.assets || []);
      setTransactions(transactionsResponse.transactions || []);
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcul des valeurs financières
  const investedCapital = currentUser?.invested_capital || currentUser?.investedCapital || 0;
  const tradingPortfolio = currentUser?.trading_portfolio || currentUser?.tradingPortfolio || 0;
  const bonus = currentUser?.bonus || 0;
  const availableFunds = investedCapital - tradingPortfolio - bonus;

  // Calcul des bénéfices/pertes à partir des transactions
  const calculateProfitLoss = () => {
    let profitLoss = 0;
    transactions.forEach((transaction: any) => {
      const amount = parseFloat(transaction.amount) || 0;
      switch (transaction.type) {
        case 'achat':
          // Les achats réduisent les bénéfices (coût d'achat)
          profitLoss -= amount;
          break;
        case 'vente':
          // Les ventes augmentent les bénéfices (revenu de vente)
          profitLoss += amount;
          break;
        case 'interets':
        case 'bonus':
          // Les intérêts et bonus augmentent les bénéfices
          profitLoss += amount;
          break;
        case 'frais':
        case 'perte':
          // Les frais et pertes réduisent les bénéfices
          profitLoss -= amount;
          break;
        case 'depot':
          // Les dépôts n'affectent pas les bénéfices/pertes (c'est du capital)
          break;
        case 'retrait':
          // Les retraits n'affectent pas les bénéfices/pertes (c'est du capital)
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

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '30px' }}>
        Mon Portefeuille
      </h1>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Liquidités Disponibles</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{availableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                <p className="text-xs text-muted-foreground mt-1">Fonds disponibles pour investir</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Investi</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{investedCapital.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                <p className="text-xs text-muted-foreground mt-1">Capital total investi</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bénéfices / Perte</CardTitle>
                {isProfit ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div 
                  className="text-2xl font-bold"
                  style={{ color: isProfit ? '#10b981' : '#ef4444' }}
                >
                  {isProfit ? '+' : ''}{profitLoss.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isProfit ? 'Gain réalisé' : 'Perte réalisée'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valeur du Portefeuille</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{portfolioValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                <p className="text-xs text-muted-foreground mt-1">Valeur totale actuelle</p>
              </CardContent>
            </Card>
          </div>

          {/* Assets List */}
          <Card>
            <CardHeader>
              <CardTitle>Actifs Disponibles</CardTitle>
              <CardDescription>Gérez vos actifs et placements</CardDescription>
            </CardHeader>
            <CardContent>
              {assets.length === 0 ? (
                <p>Aucun actif dans votre portefeuille</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                  {assets.map((asset: any) => (
                    <Card key={asset.id}>
                      <CardHeader>
                        <CardTitle style={{ fontSize: '18px' }}>{asset.asset?.name || 'N/A'}</CardTitle>
                        <CardDescription>{asset.asset?.type || ''}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {asset.asset?.category && (
                          <div style={{ marginBottom: '10px' }}>
                            <span style={{ fontSize: '14px', color: '#6b7280' }}>Catégorie: </span>
                            <span>{asset.asset.category}</span>
                          </div>
                        )}
                        {asset.asset?.reference && (
                          <div style={{ marginBottom: '10px' }}>
                            <span style={{ fontSize: '14px', color: '#6b7280' }}>Référence: </span>
                            <span>{asset.asset.reference}</span>
                          </div>
                        )}
                        {asset.featured && (
                          <div style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                            marginTop: '10px',
                          }}>
                            ⭐ Mis en avant
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
