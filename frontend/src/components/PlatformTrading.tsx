import React, { useMemo, useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Check } from 'lucide-react';
import { apiCall } from '../utils/api';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from '../utils/constants';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from './ui/use-mobile';
import { logPlatformAction } from '../utils/platformLogger';
import { getStatusColors, getStatusLabel } from './transactionUtils';
import { getCurrencySymbol, formatAmount } from '../utils/currency';
import '../styles/PlatformTrading.css';
import '../styles/PlatformPortfolio.css';

export function PlatformTrading() {
  const { currentUser } = useUser();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState<'depot' | 'retrait'>('depot');
  const [paymentMethod, setPaymentMethod] = useState<'virement' | 'carte_bancaire'>('virement');
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawBeneficiaryName, setWithdrawBeneficiaryName] = useState('');
  const [withdrawIban, setWithdrawIban] = useState('');
  const [withdrawBic, setWithdrawBic] = useState('');
  const [withdrawBankName, setWithdrawBankName] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [clientRibs, setClientRibs] = useState<any[]>([]);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [transferSuccess, setTransferSuccess] = useState<{ amount: number; transaction: any } | null>(null);
  const [cardDepositDialogOpen, setCardDepositDialogOpen] = useState(false);
  const [cardDepositSuccess, setCardDepositSuccess] = useState<{ amount: number; transaction: any } | null>(null);
  const roundedCardStyle: React.CSSProperties = { borderRadius: '10px', overflow: 'hidden' };

  const accountCurrency = (currentUser?.accountCurrency || currentUser?.account_currency || 'EUR').toString().trim().toUpperCase();
  const currencySym = getCurrencySymbol(accountCurrency);

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
    if (currentUser && currentUser.id) {
      loadData();
      loadClientRibs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) return;
    logPlatformAction('page_view', { route: '/platform/funds' });
  }, [currentUser?.id]);

  // Créer automatiquement le dépôt si aucun RIB n'est disponible quand le dialog s'ouvre
  useEffect(() => {
    if (transferDialogOpen && !transferSuccess && clientRibs.length === 0 && pendingAmount > 0 && !submitting) {
      // Créer automatiquement le dépôt
      confirmTransfer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferDialogOpen, clientRibs.length, pendingAmount]);

  // Pre-fill withdrawal form with client's RIB data when dialog opens
  useEffect(() => {
    if (withdrawDialogOpen && currentUser?.id) {
      // Always reset all RIB fields first to avoid stale data
      // This ensures clean state regardless of previous values
      setWithdrawBeneficiaryName('');
      setWithdrawIban('');
      setWithdrawBic('');
      setWithdrawBankName('');
      
      // Then load fresh client data to get RIB information using client endpoint
      const loadClientRibData = async () => {
        try {
          // Use /api/client/current/ which accepts client_ tokens
          const clientData = await apiCall(`/api/client/current/`);
          const client = (clientData as any).client;
          
          // Pre-fill with RIB data from client profile (only if data exists)
          // Always set values explicitly, even if empty, to ensure clean state
          setWithdrawBeneficiaryName(client?.ribAccountHolder || '');
          setWithdrawIban(client?.ribIban || '');
          setWithdrawBic(client?.ribBic || '');
          setWithdrawBankName(client?.ribBankName || '');
        } catch (error) {
          console.error('Error loading client RIB data:', error);
          // Fallback to currentUser data if available (only if data exists)
          // Always set values explicitly, even if empty
          setWithdrawBeneficiaryName(currentUser?.ribAccountHolder || '');
          setWithdrawIban(currentUser?.ribIban || '');
          setWithdrawBic(currentUser?.ribBic || '');
          setWithdrawBankName(currentUser?.ribBankName || '');
        }
      };
      
      loadClientRibData();
    } else if (!withdrawDialogOpen) {
      // Clear all fields when dialog closes to prevent stale data
      setWithdrawBeneficiaryName('');
      setWithdrawIban('');
      setWithdrawBic('');
      setWithdrawBankName('');
      setWithdrawNote('');
    }
  }, [withdrawDialogOpen, currentUser?.id]);

  const loadClientRibs = async () => {
    if (!currentUser?.id) return;
    try {
      const ribsResponse = await apiCall(`/api/clients/${currentUser.id}/ribs/`);
      const raw = (ribsResponse as any).ribs || [];
      // Un seul RIB affiché côté plateforme (aligné API client ; sécurité si données anciennes).
      setClientRibs(Array.isArray(raw) ? raw.slice(0, 1) : []);
    } catch (error) {
      console.error('Error loading client RIBs:', error);
      setClientRibs([]);
    }
  };

  // Get available payment methods from client data
  const availablePaymentMethods = useMemo(() => {
    const methods = currentUser?.paymentMethods || [];
    return methods;
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const movement = params.get('movement');
    if (movement === 'depot' && availablePaymentMethods.length > 0) {
      setMovementType('depot');
    } else if (movement === 'retrait') {
      setMovementType('retrait');
    } else if (movement === 'depot' && availablePaymentMethods.length === 0) {
      // If depot is requested but not available, default to retrait
      setMovementType('retrait');
    }
  }, [location.search, availablePaymentMethods]);

  // Set default payment method based on available options
  useEffect(() => {
    if (movementType === 'depot' && availablePaymentMethods.length > 0) {
      // If current payment method is not available, switch to first available
      if (!availablePaymentMethods.includes(paymentMethod)) {
        setPaymentMethod(availablePaymentMethods[0] as 'virement' | 'carte_bancaire');
      }
    }
    // If no payment methods available and user is on depot tab, switch to retrait
    if (movementType === 'depot' && availablePaymentMethods.length === 0) {
      setMovementType('retrait');
    }
  }, [availablePaymentMethods, movementType, paymentMethod]);

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

  // Same calculation logic as PlatformPortfolio (Solde block) for consistency
  const calculatedFunds = useMemo(() => {
    let investedCapital = 0;
    let tradingPortfolio = 0;
    let bonus = 0;
    let effectiveCurrency: string | null = null;

    const isCompletedStatus = (status: any) => String(status ?? '').trim().toLowerCase() === 'valide';
    const completedTransactions = (transactions || [])
      .filter((t: any) => isCompletedStatus(t?.status))
      .sort((a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    completedTransactions.forEach((transaction: any) => {
      const amountNum = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
      const amt = Number.isFinite(amountNum) ? amountNum : 0;
      const txnCcy = (transaction.amountCurrency || transaction.amount_currency || 'EUR').toString().trim().toUpperCase();

      if (transaction.type === 'conversion') {
        investedCapital = amt;
        tradingPortfolio = 0;
        effectiveCurrency = txnCcy;
        return;
      }
      if (effectiveCurrency === null) effectiveCurrency = txnCcy;
      if (txnCcy !== effectiveCurrency) return;

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
        case 'interets':
          investedCapital += amt;
          break;
        case 'achat':
          tradingPortfolio += amt;
          break;
        case 'vente':
          tradingPortfolio -= amt;
          break;
        case 'transfert': {
          const transferTo = transaction.to || transaction.to_field || transaction.transfer_to || null;
          const hasProductId = transaction.productId || null;
          if (transferTo && transferTo !== 'solde') tradingPortfolio += amt;
          else if (transferTo === 'solde') tradingPortfolio -= amt;
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

    if (movementType === 'retrait') {
      void logPlatformAction('form_submit', {
        form: 'funds_withdraw_intent',
        step: 'withdraw_dialog_opened',
        amount: amountNum,
        accountCurrency,
        withdrawableFundsAtIntent: formatAmount(withdrawableFunds, accountCurrency),
        route: '/platform/funds',
      });
      setWithdrawDialogOpen(true);
      return;
    }

    // If deposit with virement, show transfer instructions modal
    if (movementType === 'depot' && paymentMethod === 'virement') {
      setPendingAmount(amountNum);
      await loadClientRibs();
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_transfer_dialog_opened',
        amount: amountNum,
        accountCurrency: 'EUR',
        paymentMethod: 'virement',
        route: '/platform/funds',
      });
      setTransferDialogOpen(true);
      return;
    }

    // For card payment, show dialog first
    if (movementType === 'depot' && paymentMethod === 'carte_bancaire') {
      setPendingAmount(amountNum);
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_card_dialog_opened',
        amount: amountNum,
        accountCurrency: 'EUR',
        paymentMethod: 'carte_bancaire',
        route: '/platform/funds',
      });
      setCardDepositDialogOpen(true);
      return;
    }

    // This should not happen for deposits (handled above), but keep for safety
    try {
      setSubmitting(true);
      await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: movementType,
          amount: amountNum,
          description: 'Demande de retrait',
          datetime: new Date().toISOString(),
          status: 'en_attente_paiement',
        }),
      });

      toast.success('Demande de retrait envoyée');
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating funds transaction:', error);
      toast.error(error?.error || error?.message || 'Erreur lors de la création de la transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCardDeposit = async () => {
    try {
      setSubmitting(true);
      const response = await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'depot',
          amount: pendingAmount,
          description: 'Dépôt de fonds (Carte bancaire)',
          subscription_details: { paymentMethod: 'carte_bancaire' },
          datetime: new Date().toISOString(),
          status: 'en_attente_paiement',
        }),
      });

      setCardDepositSuccess({
        amount: pendingAmount,
        transaction: response.transaction || null
      });
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_request_created',
        amount: pendingAmount,
        accountCurrency: 'EUR',
        paymentMethod: 'carte_bancaire',
        success: true,
        route: '/platform/funds',
      });
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating card deposit transaction:', error);
      const errMsg = error?.error || error?.message || 'Erreur lors de la création de la transaction';
      toast.error(errMsg);
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_submit_failed',
        amount: pendingAmount,
        accountCurrency: 'EUR',
        paymentMethod: 'carte_bancaire',
        success: false,
        error: errMsg,
        route: '/platform/funds',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resolveWireDepositDescription = () => {
    if (clientRibs.length === 0) {
      return 'Dépôt de fonds (Virement bancaire)';
    }
    const selected = clientRibs[0];
    const m = (selected?.rib?.motif || '').trim();
    return m || 'Dépôt de fonds (Virement bancaire)';
  };

  const selectedDepositClientRib = clientRibs.length === 0 ? null : clientRibs[0];

  const depositWireMotifMissing =
    clientRibs.length > 0 && !(selectedDepositClientRib?.rib?.motif || '').trim();

  const confirmTransfer = async () => {
    try {
      setSubmitting(true);
      const description = resolveWireDepositDescription();
      const response = await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'depot',
          amount: pendingAmount,
          description,
          subscription_details: { paymentMethod: 'virement' },
          datetime: new Date().toISOString(),
          status: 'en_attente_paiement',
        }),
      });

      setTransferSuccess({
        amount: pendingAmount,
        transaction: response.transaction || null
      });
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_request_created',
        amount: pendingAmount,
        accountCurrency: 'EUR',
        paymentMethod: 'virement',
        success: true,
        route: '/platform/funds',
      });
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating transfer transaction:', error);
      const errMsg = error?.error || error?.message || 'Erreur lors de la création de la transaction';
      toast.error(errMsg);
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_submit_failed',
        amount: pendingAmount,
        accountCurrency: 'EUR',
        paymentMethod: 'virement',
        success: false,
        error: errMsg,
        route: '/platform/funds',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Extract RIB information from French IBAN
  const extractRibFromIban = (iban: string) => {
    const ibanNorm = normalizeIban(iban);
    if (ibanNorm.startsWith('FR') && ibanNorm.length >= 27) {
      // French IBAN format: FR + 2 check digits + 23 chars (bank 5 + branch 5 + account 11 + key 2)
      return {
        bankCode: ibanNorm.substring(4, 9), // positions 4-8
        branchCode: ibanNorm.substring(9, 14), // positions 9-13
        accountNumber: ibanNorm.substring(14, 25), // positions 14-24
        ribKey: ibanNorm.substring(25, 27), // positions 25-26
      };
    }
    return null;
  };

  const submitWithdrawRequest = async () => {
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide');
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
      
      // Create withdrawal transaction
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

      // Save RIB information to client profile
      // Use a separate try-catch to prevent RIB save errors from affecting withdrawal
      try {
        const ribInfo = extractRibFromIban(ibanNorm);
        const ribUpdateData: any = {
          ribAccountHolder: beneficiaryName,
          ribIban: ibanNorm,
        };

        if (withdrawBankName.trim()) {
          ribUpdateData.ribBankName = withdrawBankName.trim();
        }
        if (withdrawBic.trim()) {
          ribUpdateData.ribBic = withdrawBic.trim();
        }
        if (ribInfo) {
          ribUpdateData.ribBankCode = ribInfo.bankCode;
          ribUpdateData.ribBranchCode = ribInfo.branchCode;
          ribUpdateData.ribAccountNumber = ribInfo.accountNumber;
          ribUpdateData.ribKey = ribInfo.ribKey;
        }

        // Use client_update_identity endpoint which is designed for clients to update their own profile
        try {
          console.log('Saving RIB data to client profile:', ribUpdateData);
          
          await apiCall(`/api/client/identity/`, {
            method: 'PATCH',
            body: JSON.stringify(ribUpdateData),
            headers: { 'Content-Type': 'application/json' }
          });
          
          console.log('RIB saved successfully to client profile');
          toast.success('RIB sauvegardé dans votre profil');
        } catch (ribSaveError: any) {
          // Check if it's a redirect error
          if (ribSaveError?.isRedirecting || ribSaveError?.message?.includes('Redirecting')) {
            // This is a redirect error, ignore it silently
            console.warn('RIB save skipped due to redirect');
          } else {
            // Log the error but don't fail the withdrawal
            console.error('Failed to save RIB to client profile:', ribSaveError);
            const errorMessage = ribSaveError?.response?.detail || ribSaveError?.message || 'Erreur inconnue';
            console.error('Error details:', {
              status: ribSaveError?.status,
              message: errorMessage,
              error: ribSaveError
            });
            // Show a warning toast but don't fail the withdrawal
            toast.warning('Le retrait a été créé mais le RIB n\'a pas pu être sauvegardé dans votre profil');
          }
        }
      } catch (ribError: any) {
        // Don't fail the withdrawal if RIB save fails, just log it
        console.error('Unexpected error saving RIB to client profile:', ribError);
        toast.warning('Le retrait a été créé mais le RIB n\'a pas pu être sauvegardé');
      }

      void logPlatformAction('form_submit', {
        form: 'funds_withdraw_intent',
        step: 'withdraw_request_created',
        amount: amountNum,
        accountCurrency,
        success: true,
        route: '/platform/funds',
      });

      toast.success('Demande de retrait envoyée');
      setWithdrawDialogOpen(false);
      // Don't clear the form fields - keep them for next time
      // setWithdrawBeneficiaryName('');
      // setWithdrawIban('');
      // setWithdrawBic('');
      // setWithdrawBankName('');
      setWithdrawNote('');
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating withdraw transaction:', error);
      const errMsg = error?.error || error?.message || 'Erreur lors de la création du retrait';
      toast.error(errMsg);
      void logPlatformAction('form_submit', {
        form: 'funds_withdraw_intent',
        step: 'withdraw_submit_failed',
        amount: amountNum,
        accountCurrency,
        success: false,
        error: errMsg,
        route: '/platform/funds',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fundsTransactions = useMemo(() => {
    return (transactions || []).filter((t: any) => t?.type === 'depot' || t?.type === 'retrait');
  }, [transactions]);

  function handleSelectFundsTab(next: 'depot' | 'retrait') {
    if (next === movementType) return;
    void logPlatformAction('click', {
      element: next === 'depot' ? 'funds_tab_depot' : 'funds_tab_retrait',
      route: '/platform/funds',
      movement: next,
    });
    setMovementType(next);
  }

  return (
    <div>
      <h1 className="platform-portfolioPageTitle">Mon solde</h1>
      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Solde disponible</CardTitle>
              <CardDescription>Montant retirable sur votre compte</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>
                {formatAmount(withdrawableFunds, accountCurrency)}
              </div>
            </CardContent>
          </Card>

          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>
                {availablePaymentMethods.length > 0 ? 'Dépôt / Retrait' : 'Retrait'}
              </CardTitle>
              <CardDescription>
                {availablePaymentMethods.length > 0 ? 'Déposer ou retirer des fonds' : 'Retirer des fonds'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                {/* Tabulation style (same as Découvrir) */}
                <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${tabBorderColor}` }}>
                  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {[
                      ...(availablePaymentMethods.length > 0 ? [{ value: 'depot' as const, label: 'Dépôt' }] : []),
                      { value: 'retrait' as const, label: 'Retrait' },
                    ].map((tab) => (
                      (() => {
                        const isActive = movementType === tab.value;
                        const isDeposit = tab.value === 'depot';
                        const activeBg = isDeposit ? '#10b981' : '#ef4444';
                        const activeBorder = isDeposit ? '#059669' : '#dc2626';
                        const inactiveText = isDeposit ? '#065f46' : '#7f1d1d';
                        const inactiveBg = isDeposit ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.10)';
                        const inactiveBorder = isDeposit ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';

                        return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => handleSelectFundsTab(tab.value)}
                        style={{
                          border: `1px solid ${isActive ? activeBorder : inactiveBorder}`,
                          borderBottom: `3px solid ${isActive ? activeBorder : 'transparent'}`,
                          borderRadius: 9999,
                          padding: isMobile ? '10px 16px' : '12px 20px',
                          backgroundColor: isActive ? activeBg : inactiveBg,
                          color: isActive ? '#ffffff' : inactiveText,
                          fontWeight: isActive ? 800 : 700,
                          fontSize: isMobile ? 12 : 14,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.2s',
                          boxShadow: isActive ? '0 8px 22px rgba(2, 6, 23, 0.14)' : 'none',
                          transform: isActive ? 'translateY(-1px)' : 'translateY(0px)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = isDeposit ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = inactiveBg;
                            e.currentTarget.style.transform = 'translateY(0px)';
                          }
                        }}
                      >
                        {tab.label}
                      </button>
                        );
                      })()
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
                    <Label htmlFor="amount">Montant ({movementType === 'depot' ? getCurrencySymbol('EUR') : currencySym})</Label>
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

                  {movementType === 'depot' && availablePaymentMethods.length > 0 && (
                    <div style={{ width: isMobile ? '100%' : 260 }}>
                      <Label>Type de paiement</Label>
                      <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                        <SelectTrigger aria-label="Type de paiement">
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePaymentMethods.includes('virement') && (
                            <SelectItem value="virement">Virement bancaire</SelectItem>
                          )}
                          {availablePaymentMethods.includes('carte_bancaire') && (
                            <SelectItem value="carte_bancaire">Carte bancaire</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button 
                    type="submit" 
                    disabled={submitting} 
                    variant="platform"
                  >
                    {submitting ? 'Traitement...' : 'Continuer'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Dialog
            open={withdrawDialogOpen}
            onOpenChange={(open) => {
              if (!submitting) {
                setWithdrawDialogOpen(open);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Informations de retrait</DialogTitle>
                <DialogDescription>
                  Renseignez les informations bancaires pour recevoir votre retrait. Le montant peut dépasser le solde
                  affiché : votre gestionnaire validera la demande selon les fonds réellement disponibles.
                </DialogDescription>
              </DialogHeader>

              <div className="min-w-0" style={{ display: 'grid', gap: 12 }}>
                <div className="min-w-0">
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

                <div className="min-w-0">
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

                <div
                  className="min-w-0"
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
                  }}
                >
                  <div className="min-w-0">
                    <Label htmlFor="withdrawBic">BIC (optionnel)</Label>
                    <Input
                      id="withdrawBic"
                      value={withdrawBic}
                      onChange={(e) => setWithdrawBic(e.target.value)}
                      placeholder="BIC/SWIFT"
                      autoComplete="off"
                    />
                  </div>
                  <div className="min-w-0">
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

                <div className="min-w-0">
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

          {/* Transfer Instructions Dialog */}
          <Dialog
            open={transferDialogOpen}
            onOpenChange={(open) => {
              if (!submitting && !transferSuccess) {
                setTransferDialogOpen(open);
                if (!open) {
                  setTransferSuccess(null);
                  setPendingAmount(0);
                }
              }
            }}
          >
            <DialogContent>
              {transferSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 9999,
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={22} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>Dépôt initié</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        Virement bancaire
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                      <span>Montant</span>
                      <strong>
                        {formatAmount(transferSuccess.amount, 'EUR')}
                      </strong>
                    </div>
                    {transferSuccess.transaction && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginTop: 6 }}>
                        <span>Statut</span>
                        <strong style={{ color: '#f59e0b' }}>En attente de paiement</strong>
                      </div>
                    )}
                    {transferSuccess.transaction?.id && (
                      <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
                        Référence: <strong>{transferSuccess.transaction.id}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 13, color: '#1e40af' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Prochaines étapes :</div>
                    <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
                      <li>Effectuez le virement depuis votre compte bancaire</li>
                      <li>Le traitement peut prendre 1 à 3 jours ouvrés</li>
                      <li>Vous recevrez une confirmation une fois le virement traité</li>
                    </ul>
                  </div>

                  <DialogFooter style={{ marginTop: 0, paddingTop: 0 }}>
                    <Button
                      type="button"
                      variant="platform"
                      onClick={() => {
                        setTransferDialogOpen(false);
                        setTransferSuccess(null);
                        setPendingAmount(0);
                      }}
                      style={{ width: '100%' }}
                    >
                      Fermer
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Instructions pour le virement bancaire</DialogTitle>
                    <DialogDescription>
                      Veuillez effectuer un virement bancaire en utilisant les informations ci-dessous
                    </DialogDescription>
                  </DialogHeader>

                  {clientRibs.length === 0 ? (
                    <>
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 14, color: '#1e40af', textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>Votre demande de dépôt est en cours de traitement</div>
                          <div style={{ fontSize: 13 }}>
                            Montant : <strong>{formatAmount(pendingAmount, 'EUR')}</strong>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="platform"
                          disabled={submitting}
                          onClick={() => {
                            setTransferDialogOpen(false);
                            setPendingAmount(0);
                          }}
                          style={{ width: '100%' }}
                        >
                          Fermer
                        </Button>
                      </DialogFooter>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ padding: 12, backgroundColor: '#f3f4f6', borderRadius: 6 }}>
                          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                            Montant à virer : {formatAmount(pendingAmount, 'EUR')}
                          </div>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>
                            Veuillez effectuer le virement depuis votre compte bancaire en utilisant le RIB ci-dessous.
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                          {clientRibs.map((clientRib: any) => {
                            const rib = clientRib.rib;
                            return (
                              <div
                                key={clientRib.id}
                                style={{
                                  padding: 12,
                                  border: '2px solid #bfdbfe',
                                  borderRadius: 6,
                                  backgroundColor: '#f8fafc',
                                }}
                              >
                                <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 500, color: '#6b7280' }}>Titulaire du compte :</span>
                                    <span style={{ fontWeight: 600 }}>{rib.accountHolder || '-'}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 500, color: '#6b7280' }}>IBAN :</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>{rib.iban || '-'}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 500, color: '#6b7280' }}>BIC :</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rib.bic || '-'}</span>
                                  </div>
                                  {rib.bankCode && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: 500, color: '#6b7280' }}>Code banque :</span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rib.bankCode}</span>
                                    </div>
                                  )}
                                  {rib.branchCode && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: 500, color: '#6b7280' }}>Code guichet :</span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rib.branchCode}</span>
                                    </div>
                                  )}
                                  {rib.accountNumber && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: 500, color: '#6b7280' }}>N° compte :</span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rib.accountNumber}</span>
                                    </div>
                                  )}
                                  {rib.ribKey && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: 500, color: '#6b7280' }}>Clé RIB :</span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{rib.ribKey}</span>
                                    </div>
                                  )}
                                  {rib.domiciliation && (
                                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                                      <div style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4, fontSize: 12 }}>Domiciliation :</div>
                                      <div style={{ fontSize: 12, color: '#374151' }}>{rib.domiciliation}</div>
                                    </div>
                                  )}
                                  {(rib.motif || '').trim() ? (
                                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                                      <div style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4, fontSize: 12 }}>
                                        Motif du virement (libellé banque) :
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 13,
                                          color: '#111827',
                                          whiteSpace: 'pre-wrap',
                                          fontWeight: 600,
                                          lineHeight: 1.45,
                                        }}
                                      >
                                        {(rib.motif || '').trim()}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 13, color: '#1e40af' }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>Important :</div>
                          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
                            <li>Effectuez le virement depuis votre compte bancaire</li>
                            <li>Utilisez le montant exact indiqué ci-dessus</li>
                            {!depositWireMotifMissing ? (
                              <li>
                                Utilisez strictement, sans le modifier, le motif de virement indiqué ci-dessus pour le RIB
                                concerné (libellé, communication ou référence selon votre banque).
                              </li>
                            ) : null}
                            <li>Le traitement peut prendre 1 à 3 jours ouvrés</li>
                            <li>Vous recevrez une confirmation une fois le virement traité</li>
                          </ul>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => {
                            setTransferDialogOpen(false);
                            setPendingAmount(0);
                          }}
                        >
                          Annuler
                        </Button>
                        <Button 
                          type="button" 
                          variant="platform" 
                          disabled={submitting || depositWireMotifMissing} 
                          onClick={() => confirmTransfer()}
                        >
                          {submitting ? 'Traitement...' : 'Valider ma demande de versement'}
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Card Deposit Dialog */}
          <Dialog
            open={cardDepositDialogOpen}
            onOpenChange={(open) => {
              if (!submitting && !cardDepositSuccess) {
                setCardDepositDialogOpen(open);
                if (!open) {
                  setCardDepositSuccess(null);
                  setPendingAmount(0);
                }
              }
            }}
          >
            <DialogContent>
              {cardDepositSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 9999,
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={22} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>Dépôt initié</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        Carte bancaire
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                      <span>Montant</span>
                      <strong>
                        {formatAmount(cardDepositSuccess.amount, 'EUR')}
                      </strong>
                    </div>
                    {cardDepositSuccess.transaction && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginTop: 6 }}>
                        <span>Statut</span>
                        <strong style={{ color: '#f59e0b' }}>En attente de paiement</strong>
                      </div>
                    )}
                    {cardDepositSuccess.transaction?.id && (
                      <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
                        Référence: <strong>{cardDepositSuccess.transaction.id}</strong>
                      </div>
                    )}
                  </div>

                  <DialogFooter style={{ marginTop: 0, paddingTop: 0 }}>
                    <Button
                      type="button"
                      variant="platform"
                      onClick={() => {
                        setCardDepositDialogOpen(false);
                        setCardDepositSuccess(null);
                        setPendingAmount(0);
                      }}
                      style={{ width: '100%' }}
                    >
                      Fermer
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Confirmation du dépôt par carte bancaire</DialogTitle>
                    <DialogDescription>
                      Confirmez le dépôt de {formatAmount(pendingAmount, 'EUR')}
                    </DialogDescription>
                  </DialogHeader>

                  <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 13, color: '#1e40af' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Information :</div>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>
                      Le traitement du paiement par carte bancaire peut prendre quelques minutes. Vous recevrez une confirmation une fois le paiement traité.
                    </p>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => {
                        setCardDepositDialogOpen(false);
                        setPendingAmount(0);
                      }}
                    >
                      Annuler
                    </Button>
                    <Button 
                      type="button" 
                      variant="platform" 
                      disabled={submitting} 
                      onClick={confirmCardDeposit}
                    >
                      {submitting ? 'Traitement...' : 'Confirmer le dépôt'}
                    </Button>
                  </DialogFooter>
                </>
              )}
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
                <>
                  {/* Desktop: tableau (visible >= 768px) */}
                  <div className="platform-fundsHistoryTableDesktop">
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date</th>
                            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Description</th>
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
                                <td style={{ padding: '10px 8px' }}>{t.description || '—'}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: amountColor }}>
                                  {Number.isFinite(amt)
                                    ? `${t.type === 'depot' ? '+' : '-'}${formatAmount(Math.abs(amt), t.amountCurrency || t.amount_currency || accountCurrency)}`
                                    : '-'}
                                </td>
                                <td style={{ padding: '10px 8px' }}>
                                  {(() => {
                                    const { text } = getStatusColors(t.status, t.type);
                                    return <span style={{ color: text, fontWeight: 600 }}>{getStatusLabel(t.status, t.type)}</span>;
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile: cartes (visible < 768px) */}
                  <div className="platform-fundsHistoryCards">
                    {fundsTransactions.map((t: any) => {
                      const amt = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                      const amountColor = Number.isFinite(amt) ? (t.type === 'depot' ? '#10b981' : '#ef4444') : '#111827';
                      const dateLabel = new Date(t.datetime).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const { text: statusColor } = getStatusColors(t.status, t.type);
                      return (
                        <div key={t.id} className="platform-fundsHistoryCard">
                          <div className="platform-fundsHistoryCardHeader">
                            <span className="platform-fundsHistoryCardType">{t.type === 'depot' ? 'Dépôt' : 'Retrait'}</span>
                            <span className="platform-fundsHistoryCardDate">{dateLabel}</span>
                          </div>
                          <div className="platform-fundsHistoryCardMain">
                            <div className="platform-fundsHistoryCardMainItem">
                              <span className="platform-fundsHistoryCardLabel">Montant</span>
                              <span className="platform-fundsHistoryCardValue" style={{ color: amountColor }}>
                                {Number.isFinite(amt)
                                  ? `${t.type === 'depot' ? '+' : '-'}${formatAmount(Math.abs(amt), t.amountCurrency || t.amount_currency || accountCurrency)}`
                                  : '-'}
                              </span>
                            </div>
                            <div className="platform-fundsHistoryCardMainItem">
                              <span className="platform-fundsHistoryCardLabel">Statut</span>
                              <span className="platform-fundsHistoryCardValue" style={{ color: statusColor }}>
                                {getStatusLabel(t.status, t.type)}
                              </span>
                            </div>
                          </div>
                          <div className="platform-fundsHistoryCardSecondary">
                            <div className="platform-fundsHistoryCardSecondaryItem">
                              <span>Description</span>
                              <span>{t.description || '—'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
