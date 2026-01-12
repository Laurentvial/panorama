import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, TrendingDown, Wallet, DollarSign } from 'lucide-react';
import { apiCall } from '../utils/api';

export function PlatformDashboard() {
  const { currentUser } = useUser();
  const [portfolio, setPortfolio] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadDashboardData();
    }
  }, [currentUser]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Load client assets/portfolio
      const assetsResponse = await apiCall(`/api/clients/${currentUser.id}/assets/`);
      setPortfolio(assetsResponse.assets || []);

      // Load recent transactions
      const transactionsResponse = await apiCall(`/api/clients/${currentUser.id}/transactions/`);
      const sortedTransactions = (transactionsResponse.transactions || [])
        .sort((a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
        .slice(0, 5);
      setTransactions(sortedTransactions);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const investedCapital = currentUser?.investedCapital || 0;
  const tradingPortfolio = currentUser?.tradingPortfolio || 0;
  const bonus = currentUser?.bonus || 0;
  const availableFunds = investedCapital - tradingPortfolio - bonus;

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '30px' }}>
        Bienvenue, {currentUser?.fname || currentUser?.firstName || currentUser?.fullName || 'Client'}
      </h1>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Capital Investi</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{investedCapital.toLocaleString('fr-FR')} €</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Portefeuille Trading</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tradingPortfolio.toLocaleString('fr-FR')} €</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fonds Disponibles</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{availableFunds.toLocaleString('fr-FR')} €</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bonus</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{bonus.toLocaleString('fr-FR')} €</div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card style={{ marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Transactions Récentes</CardTitle>
              <CardDescription>Vos dernières transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p>Aucune transaction récente</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {transactions.map((transaction: any) => (
                    <div
                      key={transaction.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '15px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold' }}>
                          {transaction.type === 'depot' ? 'Dépôt' :
                           transaction.type === 'retrait' ? 'Retrait' :
                           transaction.type === 'achat' ? 'Achat' :
                           transaction.type === 'vente' ? 'Vente' :
                           transaction.type === 'bonus' ? 'Bonus' :
                           transaction.type}
                        </div>
                        <div style={{ fontSize: '14px', color: '#6b7280' }}>
                          {new Date(transaction.datetime).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                        {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio */}
          <Card>
            <CardHeader>
              <CardTitle>Mon Portefeuille</CardTitle>
              <CardDescription>Vos actifs disponibles</CardDescription>
            </CardHeader>
            <CardContent>
              {portfolio && portfolio.length === 0 ? (
                <p>Aucun actif dans votre portefeuille</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                  {portfolio?.map((asset: any) => (
                    <div
                      key={asset.id}
                      style={{
                        padding: '15px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{asset.asset?.name || 'N/A'}</div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>{asset.asset?.type || ''}</div>
                      {asset.featured && (
                        <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '5px' }}>⭐ Mis en avant</div>
                      )}
                    </div>
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
