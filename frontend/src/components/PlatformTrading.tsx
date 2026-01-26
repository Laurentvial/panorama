import React, { useMemo, useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from './ui/use-mobile';

export function PlatformTrading() {
  const { currentUser } = useUser();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState<'depot' | 'retrait'>('depot');
  const [paymentMethod, setPaymentMethod] = useState<'virement' | 'carte'>('virement');
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawBeneficiaryName, setWithdrawBeneficiaryName] = useState('');
  const [withdrawIban, setWithdrawIban] = useState('');
  const [withdrawBic, setWithdrawBic] = useState('');
  const [withdrawBankName, setWithdrawBankName] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const roundedCardStyle: React.CSSProperties = { borderRadius: '10px', overflow: 'hidden' };

  const tabActiveColor = '#030213';
  const tabInactiveColor = '#6b7280';
  const tabBorderColor = '#e5e7eb';

  const normalizeIban = (iban: string) => String(iban || '').replace(/\s+/g, '').toUpperCase();
  const isValidIban = (iban: string) => {
    const v = normalizeIban(iban);
    // Simple/cheap validation (bank-grade validation is server-side).
    return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const movement = params.get('movement');
    if (movement === 'depot' || movement === 'retrait') {
      setMovementType(movement);
    }
  }, [location.search]);

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

    if (movementType === 'retrait') {
      setWithdrawDialogOpen(true);
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

  const submitWithdrawRequest = async () => {
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (amountNum > withdrawableFunds) {
      toast.error('Fonds insuffisants');
      return;
    }
    const beneficiaryName = withdrawBeneficiaryName.trim();
    if (!beneficiaryName) {
      toast.error('Veuillez renseigner le nom du titulaire');
      return;
    }
    const ibanNorm = normalizeIban(withdrawIban);
    if (!isValidIban(ibanNorm)) {
      toast.error("IBAN invalide");
      return;
    }

    try {
      setSubmitting(true);
      await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'retrait',
          amount: amountNum,
          description: 'Demande de retrait',
          subscription_details: {
            iban: ibanNorm,
            beneficiaryName,
            bic: withdrawBic.trim() || undefined,
            bankName: withdrawBankName.trim() || undefined,
            note: withdrawNote.trim() || undefined,
          },
          datetime: new Date().toISOString(),
          status: 'en_attente_paiement',
        }),
      });

      toast.success('Demande de retrait envoyée');
      setWithdrawDialogOpen(false);
      setWithdrawBeneficiaryName('');
      setWithdrawIban('');
      setWithdrawBic('');
      setWithdrawBankName('');
      setWithdrawNote('');
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating withdraw transaction:', error);
      toast.error(error?.error || error?.message || 'Erreur lors de la création du retrait');
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
      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Fonds</CardTitle>
              <CardDescription>Solde disponible</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>
                {withdrawableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </div>
            </CardContent>
          </Card>

          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Dépôt / Retrait</CardTitle>
              <CardDescription>Déposer ou retirer des fonds</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                {/* Tabulation style (same as Découvrir) */}
                <div style={{ marginBottom: 16, borderBottom: `1px solid ${tabBorderColor}` }}>
                  <div style={{ display: 'flex', gap: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {[
                      { value: 'depot' as const, label: 'Dépôt' },
                      { value: 'retrait' as const, label: 'Retrait' },
                    ].map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setMovementType(tab.value)}
                        style={{
                          border: 'none',
                          borderBottom: movementType === tab.value ? `2px solid ${tabActiveColor}` : '2px solid transparent',
                          borderRadius: 0,
                          padding: isMobile ? '10px 16px' : '12px 20px',
                          backgroundColor: 'transparent',
                          color: movementType === tab.value ? tabActiveColor : tabInactiveColor,
                          fontWeight: movementType === tab.value ? 600 : 400,
                          fontSize: isMobile ? 12 : 14,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (movementType !== tab.value) e.currentTarget.style.color = tabActiveColor;
                        }}
                        onMouseLeave={(e) => {
                          if (movementType !== tab.value) e.currentTarget.style.color = tabInactiveColor;
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                    alignItems: 'flex-end',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : 240 }}>
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

                  {movementType === 'depot' && (
                    <div style={{ width: isMobile ? '100%' : 260 }}>
                      <Label>Type de paiement</Label>
                      <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                        <SelectTrigger aria-label="Type de paiement">
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="virement">Virement bancaire</SelectItem>
                          <SelectItem value="carte">Carte bancaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button type="submit" disabled={submitting} variant="platform">
                    {submitting ? 'Traitement...' : 'Continuer'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Dialog
            open={withdrawDialogOpen}
            onOpenChange={(open) => {
              if (!submitting) setWithdrawDialogOpen(open);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Informations de retrait</DialogTitle>
                <DialogDescription>
                  Renseignez les informations bancaires pour recevoir votre retrait.
                </DialogDescription>
              </DialogHeader>

              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <Label htmlFor="withdrawBeneficiaryName">Nom du titulaire</Label>
                  <Input
                    id="withdrawBeneficiaryName"
                    value={withdrawBeneficiaryName}
                    onChange={(e) => setWithdrawBeneficiaryName(e.target.value)}
                    placeholder="Nom et prénom"
                    autoComplete="name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="withdrawIban">IBAN</Label>
                  <Input
                    id="withdrawIban"
                    value={withdrawIban}
                    onChange={(e) => setWithdrawIban(e.target.value)}
                    placeholder="FR76 ...."
                    autoComplete="off"
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : 180 }}>
                    <Label htmlFor="withdrawBic">BIC (optionnel)</Label>
                    <Input
                      id="withdrawBic"
                      value={withdrawBic}
                      onChange={(e) => setWithdrawBic(e.target.value)}
                      placeholder="BIC/SWIFT"
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : 220 }}>
                    <Label htmlFor="withdrawBankName">Banque (optionnel)</Label>
                    <Input
                      id="withdrawBankName"
                      value={withdrawBankName}
                      onChange={(e) => setWithdrawBankName(e.target.value)}
                      placeholder="Nom de la banque"
                      autoComplete="organization"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="withdrawNote">Informations complémentaires (optionnel)</Label>
                  <Textarea
                    id="withdrawNote"
                    value={withdrawNote}
                    onChange={(e) => setWithdrawNote(e.target.value)}
                    placeholder="Ex: référence, précision, etc."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => setWithdrawDialogOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="button" variant="platform" disabled={submitting} onClick={submitWithdrawRequest}>
                  {submitting ? 'Traitement...' : 'Confirmer le retrait'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card style={roundedCardStyle}>
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
