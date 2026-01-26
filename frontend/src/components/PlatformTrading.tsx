import React, { useMemo, useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

export function PlatformTrading() {
  const { currentUser } = useUser();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState<'depot' | 'retrait'>('depot');
  const [paymentMethod, setPaymentMethod] = useState<'virement' | 'carte'>('virement');
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      const transactionsResponse = await apiCall(`/api/clients/${currentUser.id}/transactions/`);
      const sortedTransactions = (transactionsResponse.transactions || []).sort(
        (a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
      );
      setTransactions(sortedTransactions);
    } catch (error) {
      console.error('Error loading funds data:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const calculatedFunds = useMemo(() => {
    let investedCapital = 0;
    let tradingPortfolio = 0;
    let bonus = 0;

    const completedTransactions = (transactions || []).filter((t: any) => t?.status === 'termine');

    completedTransactions.forEach((transaction: any) => {
      const amountNum = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
      const amt = Number.isFinite(amountNum) ? amountNum : 0;

      switch (transaction.type) {
        case 'depot':
          investedCapital += amt;
          break;
        case 'retrait':
          investedCapital -= amt;
          break;
        case 'bonus':
          bonus += amt;
          investedCapital += amt;
          break;
        case 'achat':
        case 'investissement':
          tradingPortfolio += amt;
          break;
        case 'vente':
          tradingPortfolio -= amt;
          break;
        case 'transfert': {
          const transferTo = transaction.to || transaction.to_field || transaction.transfer_to || null;
          const hasProductId = transaction.productId || null;
          if (transferTo && transferTo !== 'balance') tradingPortfolio += amt;
          else if (transferTo === 'balance') tradingPortfolio -= amt;
          else if (hasProductId) tradingPortfolio += amt;
          break;
        }
        default:
          break;
      }
    });

    tradingPortfolio = Math.max(0, tradingPortfolio);
    // Bonus est du cash, inclus dans investedCapital
    const availableFunds = investedCapital - tradingPortfolio;
    return { investedCapital, tradingPortfolio, bonus, availableFunds };
  }, [transactions]);

  const withdrawableFunds = Math.max(0, calculatedFunds.availableFunds);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide');
      return;
    }

    if (movementType === 'retrait' && amountNum > withdrawableFunds) {
      toast.error(`Fonds insuffisants. Disponible au retrait: ${withdrawableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
      return;
    }

    try {
      setSubmitting(true);
      await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: movementType,
          amount: amountNum,
          description:
            movementType === 'depot'
              ? `Dépôt de fonds (${paymentMethod === 'carte' ? 'Carte bancaire' : 'Virement bancaire'})`
              : 'Demande de retrait',
          subscription_details: movementType === 'depot' ? { paymentMethod } : undefined,
          datetime: new Date().toISOString(),
          status: 'en_attente_paiement',
        }),
      });

      toast.success(movementType === 'depot' ? 'Dépôt initié' : 'Demande de retrait envoyée');
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating funds transaction:', error);
      toast.error(error?.error || error?.message || 'Erreur lors de la création de la transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const fundsTransactions = useMemo(() => {
    return (transactions || []).filter((t: any) => t?.type === 'depot' || t?.type === 'retrait');
  }, [transactions]);

  const statusLabel = (s: string) =>
    s === 'termine' ? 'Terminé' : s === 'en_cours' ? 'En cours' : s === 'en_attente_paiement' ? 'En attente' : s || '-';

  return (
    <div>
      <h1 className="platform-page-title" style={{ marginBottom: '30px' }}>Fonds</h1>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          <Card style={{ marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Fonds disponibles au retrait</CardTitle>
              <CardDescription>Montant disponible sur votre solde</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>
                {withdrawableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                (Basé sur les transactions terminées)
              </div>
            </CardContent>
          </Card>

          <Card style={{ marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Dépôt / Retrait</CardTitle>
              <CardDescription>Déposer ou retirer des fonds</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    variant={movementType === 'depot' ? 'default' : 'outline'}
                    onClick={() => setMovementType('depot')}
                  >
                    Dépôt
                  </Button>
                  <Button
                    type="button"
                    variant={movementType === 'retrait' ? 'default' : 'outline'}
                    onClick={() => setMovementType('retrait')}
                  >
                    Retrait
                  </Button>
                </div>

                {movementType === 'depot' && (
                  <div style={{ marginBottom: 12 }}>
                    <Label>Type de paiement</Label>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        variant={paymentMethod === 'virement' ? 'default' : 'outline'}
                        onClick={() => setPaymentMethod('virement')}
                      >
                        Virement bancaire
                      </Button>
                      <Button
                        type="button"
                        variant={paymentMethod === 'carte' ? 'default' : 'outline'}
                        onClick={() => setPaymentMethod('carte')}
                      >
                        Carte bancaire
                      </Button>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
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

                <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Traitement...' : movementType === 'depot' ? 'Continuer' : 'Demander un retrait'}
                  </Button>
                  {movementType === 'retrait' && (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                      Disponible au retrait: <strong>{withdrawableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong>
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historique</CardTitle>
              <CardDescription>Vos dépôts et retraits</CardDescription>
            </CardHeader>
            <CardContent>
              {fundsTransactions.length === 0 ? (
                <p>Aucune transaction</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px' }}>Montant</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fundsTransactions.map((t: any) => {
                        const amt = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                        const amountColor = Number.isFinite(amt) ? (t.type === 'depot' ? '#10b981' : '#ef4444') : '#111827';
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                              {new Date(t.datetime).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td style={{ padding: '10px 8px' }}>{t.type === 'depot' ? 'Dépôt' : 'Retrait'}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: amountColor }}>
                              {Number.isFinite(amt)
                                ? `${t.type === 'depot' ? '+' : '-'}${Math.abs(amt).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                                : '-'}
                            </td>
                            <td style={{ padding: '10px 8px' }}>{statusLabel(t.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
