import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

export function PlatformTrading() {
  const { currentUser } = useUser();
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'achat' | 'vente'>('achat');
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadData();
    }
  }, [currentUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsResponse, transactionsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/assets/`),
        apiCall(`/api/clients/${currentUser.id}/transactions/`),
      ]);
      setAssets(assetsResponse.assets || []);
      const sortedTransactions = (transactionsResponse.transactions || [])
        .sort((a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
      setTransactions(sortedTransactions);
    } catch (error) {
      console.error('Error loading trading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAsset || !amount) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide');
      return;
    }

    try {
      setSubmitting(true);
      await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: transactionType,
          amount: amountNum,
          description: `${transactionType === 'achat' ? 'Achat' : 'Vente'} de ${selectedAsset}`,
          datetime: new Date().toISOString(),
          status: 'en_cours',
        }),
      });
      
      toast.success(`Transaction ${transactionType === 'achat' ? 'd\'achat' : 'de vente'} créée avec succès`);
      setAmount('');
      setSelectedAsset('');
      loadData();
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      toast.error(error?.error || 'Erreur lors de la création de la transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const availableFunds = (currentUser?.invested_capital || currentUser?.investedCapital || 0) - (currentUser?.trading_portfolio || currentUser?.tradingPortfolio || 0) - (currentUser?.bonus || 0);

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '30px' }}>
        Trading
      </h1>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Trading Form */}
          <Card style={{ marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Nouvelle Transaction</CardTitle>
              <CardDescription>Effectuez un achat ou une vente</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitTransaction}>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                  <Button
                    type="button"
                    variant={transactionType === 'achat' ? 'default' : 'outline'}
                    onClick={() => setTransactionType('achat')}
                  >
                    Achat
                  </Button>
                  <Button
                    type="button"
                    variant={transactionType === 'vente' ? 'default' : 'outline'}
                    onClick={() => setTransactionType('vente')}
                  >
                    Vente
                  </Button>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <Label htmlFor="asset">Actif</Label>
                  <select
                    id="asset"
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      marginTop: '5px',
                    }}
                    required
                  >
                    <option value="">Sélectionner un actif</option>
                    {assets.map((asset: any) => (
                      <option key={asset.id} value={asset.asset?.name || ''}>
                        {asset.asset?.name || 'N/A'} ({asset.asset?.type || ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <Label htmlFor="amount">Montant (€)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f3f4f6', borderRadius: '4px' }}>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>Fonds disponibles:</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{availableFunds.toLocaleString('fr-FR')} €</div>
                </div>

                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Traitement...' : `Confirmer ${transactionType === 'achat' ? 'l\'achat' : 'la vente'}`}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle>Historique des Transactions</CardTitle>
              <CardDescription>Toutes vos transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p>Aucune transaction</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {transactions.map((transaction: any) => (
                    <div
                      key={transaction.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '15px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                          {transaction.type === 'depot' ? 'Dépôt' :
                           transaction.type === 'retrait' ? 'Retrait' :
                           transaction.type === 'achat' ? 'Achat' :
                           transaction.type === 'vente' ? 'Vente' :
                           transaction.type === 'bonus' ? 'Bonus' :
                           transaction.type}
                        </div>
                        <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '5px' }}>
                          {transaction.description || 'Aucune description'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '5px' }}>
                          {new Date(transaction.datetime).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{
                          fontWeight: 'bold',
                          fontSize: '18px',
                          color: transaction.amount >= 0 ? '#10b981' : '#ef4444',
                        }}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                        </div>
                        <div style={{
                          fontSize: '12px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: transaction.status === 'termine' ? '#d1fae5' : '#fef3c7',
                          color: transaction.status === 'termine' ? '#065f46' : '#92400e',
                          marginTop: '5px',
                          display: 'inline-block',
                        }}>
                          {transaction.status === 'termine' ? 'Terminé' :
                           transaction.status === 'en_cours' ? 'En cours' :
                           transaction.status === 'en_attente_paiement' ? 'En attente' :
                           transaction.status}
                        </div>
                      </div>
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
