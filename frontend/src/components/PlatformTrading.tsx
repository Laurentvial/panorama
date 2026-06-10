import React, { useMemo, useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Check, Copy } from 'lucide-react';
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

type DepositPaymentMethod = 'virement' | 'carte_bancaire' | 'cryptomonnaie';

function normalizeDepositPaymentMethod(raw: unknown): DepositPaymentMethod | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'virement' || value === 'bank_transfer') return 'virement';
  if (value === 'carte_bancaire' || value === 'carte bancaire' || value === 'card') return 'carte_bancaire';
  if (value === 'cryptomonnaie' || value === 'crypto' || value === 'cryptocurrency') return 'cryptomonnaie';
  return null;
}

export function PlatformTrading() {
  const { currentUser } = useUser();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clientProducts, setClientProducts] = useState<any[]>([]);
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState<'depot' | 'retrait'>('depot');
  const [paymentMethod, setPaymentMethod] = useState<DepositPaymentMethod>('virement');
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
  const [clientWallets, setClientWallets] = useState<any[]>([]);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [transferSuccess, setTransferSuccess] = useState<{ amount: number; transaction: any } | null>(null);
  const [cardDepositDialogOpen, setCardDepositDialogOpen] = useState(false);
  const [cardDepositSuccess, setCardDepositSuccess] = useState<{ amount: number; transaction: any } | null>(null);
  const [depositRibDialogOpen, setDepositRibDialogOpen] = useState(false);
  const [cryptoDepositDialogOpen, setCryptoDepositDialogOpen] = useState(false);
  const [cryptoDepositSuccess, setCryptoDepositSuccess] = useState<{ amount: number; transaction: any } | null>(null);
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
      loadClientWallets();
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

  const loadClientWallets = async () => {
    if (!currentUser?.id) return;
    try {
      const walletsResponse = await apiCall(`/api/clients/${currentUser.id}/wallets/`);
      const raw = (walletsResponse as any).wallets || [];
      // Un seul wallet affiché côté plateforme (aligné API client ; sécurité si données anciennes).
      setClientWallets(Array.isArray(raw) ? raw.slice(0, 1) : []);
    } catch (error) {
      console.error('Error loading client wallets:', error);
      setClientWallets([]);
    }
  };

  // Get available payment methods from client data
  const availablePaymentMethods = useMemo(() => {
    const methods: DepositPaymentMethod[] = [];
    const rawMethods = Array.isArray(currentUser?.paymentMethods) ? currentUser.paymentMethods : [];
    for (const rawMethod of rawMethods) {
      const normalized = normalizeDepositPaymentMethod(rawMethod);
      if (normalized && !methods.includes(normalized)) {
        methods.push(normalized);
      }
    }
    if (clientWallets.length > 0 && !methods.includes('cryptomonnaie')) {
      methods.push('cryptomonnaie');
    }
    return methods;
  }, [currentUser, clientWallets]);

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
        setPaymentMethod(availablePaymentMethods[0]);
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
      const [transactionsResponse, clientProductsResponse, positionsResponse, productsCatalogResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/transactions/`),
        apiCall(`/api/clients/${currentUser.id}/products/`).catch(() => ({ products: [] })),
        apiCall(`/api/clients/${currentUser.id}/positions/?status=open,done`).catch(() => null),
        apiCall('/api/products/').catch(() => ({ products: [] })),
      ]);
      const sortedTransactions = (transactionsResponse.transactions || []).sort(
        (a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
      );
      setTransactions(sortedTransactions);
      setClientProducts((clientProductsResponse as any)?.products || []);
      setPositions(Array.isArray((positionsResponse as any)?.positions) ? (positionsResponse as any).positions : null);
      setProductsCatalog((productsCatalogResponse as any)?.products || []);
    } catch (error) {
      console.error('Error loading funds data:', error);
      setTransactions([]);
      setClientProducts([]);
      setPositions(null);
      setProductsCatalog([]);
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

    const isCompletedStatus = (status: any) =>
      ['valide', 'cloture'].includes(String(status ?? '').trim().toLowerCase());
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

  const availableFundsProductKeys = useMemo(() => {
    const keys = new Set<string>();
    const toKey = (value: any) => String(value ?? '').trim().toLowerCase();

    for (const product of productsCatalog || []) {
      const hasAvailableFunds = Boolean(product?.availableFunds ?? product?.available_funds ?? false);
      if (!hasAvailableFunds) continue;

      const productId = product?.id != null ? String(product.id) : '';
      const productReference = product?.reference != null ? String(product.reference) : '';
      const productName = product?.name != null ? String(product.name) : '';

      if (productId) keys.add(toKey(productId));
      if (productReference) keys.add(toKey(productReference));
      if (productName) keys.add(toKey(productName));
    }

    for (const cp of clientProducts || []) {
      const product = cp?.product || cp;
      const hasAvailableFunds = Boolean(product?.availableFunds ?? product?.available_funds ?? false);
      if (!hasAvailableFunds) continue;

      const productId = product?.id != null ? String(product.id) : '';
      const productReference = product?.reference != null ? String(product.reference) : '';
      const productName = product?.name != null ? String(product.name) : '';

      if (productId) keys.add(toKey(productId));
      if (productReference) keys.add(toKey(productReference));
      if (productName) keys.add(toKey(productName));
    }

    return keys;
  }, [productsCatalog, clientProducts]);

  const availableFundsPrincipalByProduct = useMemo(() => {
    if (!availableFundsProductKeys.size) return new Map<string, number>();

    const isCompletedStatus = (status: any) =>
      ['valide', 'cloture'].includes(String(status ?? '').trim().toLowerCase());
    const completedTransactions = (transactions || [])
      .filter((t: any) => isCompletedStatus(t?.status))
      .sort((a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    const netByProduct = new Map<string, number>();
    const toKey = (value: any) => String(value ?? '').trim().toLowerCase();
    const normalizeId = (value: any): string | null => {
      if (value == null) return null;
      const v = String(value).trim();
      if (!v || v === 'solde' || v === 'trading') return null;
      return v;
    };

    for (const t of completedTransactions) {
      if (String(t?.type || '') !== 'transfert') continue;

      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amt = Number.isFinite(amountNum) ? Math.abs(amountNum) : 0;
      if (!amt) continue;

      const rawTo = t?.to ?? t?.to_field ?? t?.transfer_to ?? t?.transferTo ?? null;
      const rawFrom = t?.from ?? t?.from_field ?? t?.transfer_from ?? t?.transferFrom ?? null;
      const to = normalizeId(rawTo);
      const from = normalizeId(rawFrom);
      const fallbackProductId = normalizeId(t?.productId ?? t?.product_id ?? t?.subscription_details?.productId ?? null);

      // Inflow: solde -> product (or legacy transfer with productId and no explicit source/target).
      const inflowProductId = to || (!from && !to ? fallbackProductId : null);
      if (inflowProductId && availableFundsProductKeys.has(toKey(inflowProductId))) {
        const key = toKey(inflowProductId);
        netByProduct.set(key, (netByProduct.get(key) || 0) + amt);
      }

      // Outflow: product -> solde.
      const isTransferToSolde = String(rawTo ?? '').trim().toLowerCase() === 'solde';
      const outflowProductId = isTransferToSolde ? (from || fallbackProductId) : null;
      if (outflowProductId && availableFundsProductKeys.has(toKey(outflowProductId))) {
        const key = toKey(outflowProductId);
        netByProduct.set(key, (netByProduct.get(key) || 0) - amt);
      }
    }

    return netByProduct;
  }, [transactions, availableFundsProductKeys]);

  const availableFundsFromTransactions = useMemo(() => {
    let total = 0;
    for (const netAmount of availableFundsPrincipalByProduct.values()) {
      if (netAmount > 0) total += netAmount;
    }

    return total;
  }, [availableFundsPrincipalByProduct]);

  const availableFundsUnpaidGainsFromProducts = useMemo(() => {
    if (!availableFundsPrincipalByProduct.size) return 0;

    const toKey = (value: any) => String(value ?? '').trim().toLowerCase();
    const activeProductKeys = new Set<string>();
    for (const [productKey, netPrincipal] of availableFundsPrincipalByProduct.entries()) {
      if (netPrincipal > 0) activeProductKeys.add(productKey);
    }
    if (!activeProductKeys.size) return 0;

    let accruedGains = 0;
    for (const p of positions || []) {
      const status = String(p?.status || '').trim().toLowerCase();
      if (status !== 'open' && status !== 'done') continue;

      const productIdRaw = p?.productId ?? p?.product_id ?? p?.product?.id ?? null;
      const productKey = productIdRaw != null ? toKey(productIdRaw) : '';
      if (!productKey || !activeProductKeys.has(productKey)) continue;

      const gainNum = typeof p?.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p?.profit_loss);
      if (Number.isFinite(gainNum)) accruedGains += gainNum;
    }

    const isCompletedStatus = (status: any) =>
      ['valide', 'cloture'].includes(String(status ?? '').trim().toLowerCase());
    let paidInterests = 0;
    for (const t of transactions || []) {
      if (!isCompletedStatus(t?.status) || String(t?.type || '') !== 'interets') continue;

      const productIdRaw = t?.productId ?? t?.product_id ?? t?.product?.id ?? t?.subscription_details?.productId ?? null;
      const productKey = productIdRaw != null ? toKey(productIdRaw) : '';
      if (!productKey || !activeProductKeys.has(productKey)) continue;

      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amt = Number.isFinite(amountNum) ? Math.abs(amountNum) : 0;
      if (amt > 0) paidInterests += amt;
    }

    return accruedGains - paidInterests;
  }, [positions, transactions, availableFundsPrincipalByProduct]);

  const availableFundsFromProducts = useMemo(
    () => Math.max(0, availableFundsFromTransactions + availableFundsUnpaidGainsFromProducts),
    [availableFundsFromTransactions, availableFundsUnpaidGainsFromProducts]
  );

  const withdrawableFunds = Math.max(0, Math.max(0, calculatedFunds.availableFunds) + availableFundsFromProducts);
  const hasInvestedProductWithAvailableFunds = availableFundsFromProducts > 0;
  const isDepositFlow = movementType === 'depot';
  const flowTitle = isDepositFlow ? 'Dépôt de fonds' : 'Demande de retrait';
  const flowDescription = isDepositFlow
    ? 'Vous allez initier un dépôt (virement, carte ou cryptomonnaie selon vos moyens de paiement).'
    : 'Vous allez envoyer une demande de retrait vers votre compte bancaire.';
  const flowAmountLabel = isDepositFlow
    ? `Montant du dépôt (${getCurrencySymbol('EUR')})`
    : `Montant du retrait (${currencySym})`;
  const flowSubmitLabel = isDepositFlow ? 'Continuer le dépôt' : 'Continuer le retrait';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientId = currentUser?.id;
    if (!clientId) {
      toast.error('Session client introuvable. Veuillez vous reconnecter.');
      return;
    }

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

    if (movementType === 'depot' && paymentMethod === 'cryptomonnaie') {
      setPendingAmount(amountNum);
      await loadClientWallets();
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_crypto_dialog_opened',
        amount: amountNum,
        accountCurrency: 'EUR',
        paymentMethod: 'cryptomonnaie',
        route: '/platform/funds',
      });
      setCryptoDepositDialogOpen(true);
      return;
    }

    // This should not happen for deposits (handled above), but keep for safety
    try {
      setSubmitting(true);
      await apiCall(`/api/clients/${clientId}/transactions/create/`, {
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
    const clientId = currentUser?.id;
    if (!clientId) {
      toast.error('Session client introuvable. Veuillez vous reconnecter.');
      return;
    }
    try {
      setSubmitting(true);
      const response = await apiCall(`/api/clients/${clientId}/transactions/create/`, {
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
  const selectedDepositClientWallet = clientWallets.length === 0 ? null : clientWallets[0];

  const depositWireMotifMissing =
    clientRibs.length > 0 && !(selectedDepositClientRib?.rib?.motif || '').trim();

  const canViewDepositRib =
    movementType === 'depot' &&
    paymentMethod === 'virement' &&
    availablePaymentMethods.includes('virement');

  const canViewDepositWallet =
    movementType === 'depot' &&
    paymentMethod === 'cryptomonnaie' &&
    availablePaymentMethods.includes('cryptomonnaie') &&
    !!selectedDepositClientWallet?.wallet;

  const copyShortcutButtonStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: 12,
    fontWeight: 600,
    padding: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const copyToClipboard = async (label: string, value: string) => {
    const text = String(value || '').trim();
    if (!text) {
      toast.error(`Aucune valeur à copier pour ${label}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié`);
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      toast.error(`Impossible de copier ${label}`);
    }
  };

  const confirmTransfer = async () => {
    const clientId = currentUser?.id;
    if (!clientId) {
      toast.error('Session client introuvable. Veuillez vous reconnecter.');
      return;
    }
    try {
      setSubmitting(true);
      const description = resolveWireDepositDescription();
      const response = await apiCall(`/api/clients/${clientId}/transactions/create/`, {
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

  const confirmCryptoDeposit = async () => {
    const clientId = currentUser?.id;
    if (!clientId) {
      toast.error('Session client introuvable. Veuillez vous reconnecter.');
      return;
    }
    try {
      setSubmitting(true);
      const selectedWallet = selectedDepositClientWallet?.wallet;
      const walletLabel = selectedWallet
        ? `${selectedWallet.assetSymbol || 'Crypto'} - ${selectedWallet.network || 'Réseau'}`
        : 'Cryptomonnaie';
      const response = await apiCall(`/api/clients/${clientId}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'depot',
          amount: pendingAmount,
          description: `Dépôt de fonds (${walletLabel})`,
          subscription_details: {
            paymentMethod: 'cryptomonnaie',
            walletId: selectedWallet?.id || null,
            walletSymbol: selectedWallet?.assetSymbol || '',
            walletNetwork: selectedWallet?.network || '',
          },
          datetime: new Date().toISOString(),
          status: 'en_attente_paiement',
        }),
      });

      setCryptoDepositSuccess({
        amount: pendingAmount,
        transaction: response.transaction || null,
      });
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_request_created',
        amount: pendingAmount,
        accountCurrency: 'EUR',
        paymentMethod: 'cryptomonnaie',
        success: true,
        route: '/platform/funds',
      });
      setAmount('');
      loadData();
    } catch (error: any) {
      console.error('Error creating crypto deposit transaction:', error);
      const errMsg = error?.error || error?.message || 'Erreur lors de la création de la transaction';
      toast.error(errMsg);
      void logPlatformAction('form_submit', {
        form: 'funds_deposit_intent',
        step: 'deposit_submit_failed',
        amount: pendingAmount,
        accountCurrency: 'EUR',
        paymentMethod: 'cryptomonnaie',
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(260px, 320px) minmax(0, 1fr)',
              gap: 20,
              alignItems: 'start',
              marginBottom: '30px',
            }}
          >
            <Card style={{ ...roundedCardStyle, marginBottom: 0 }}>
              <CardHeader>
                <CardTitle>{hasInvestedProductWithAvailableFunds ? 'Fonds disponibles' : 'Solde disponible'}</CardTitle>
                <CardDescription>Montant retirable sur votre compte</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: isMobile ? 22 : 24, fontWeight: 800, lineHeight: 1.2 }}>
                  {formatAmount(withdrawableFunds, accountCurrency)}
                </div>
              </CardContent>
            </Card>

            <Card style={{ ...roundedCardStyle, marginBottom: 0 }}>
              <CardHeader>
                <CardTitle style={{ fontSize: isMobile ? 19 : 21, lineHeight: 1.2, fontWeight: 800 }}>
                  {availablePaymentMethods.length > 0 ? flowTitle : 'Demande de retrait'}
                </CardTitle>
                <CardDescription>
                  {availablePaymentMethods.length > 0 ? flowDescription : 'Vous allez envoyer une demande de retrait'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit}>
                {/* Tabulation style (same as Découvrir) */}
                <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${tabBorderColor}` }}>
                  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {[
                      ...(availablePaymentMethods.length > 0 ? [{ value: 'depot' as const, label: '+ Dépôt' }] : []),
                      { value: 'retrait' as const, label: '− Retrait' },
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
                          padding: isMobile ? '5px 12px' : '6px 14px',
                          backgroundColor: isActive ? activeBg : inactiveBg,
                          color: isActive ? '#ffffff' : inactiveText,
                          fontWeight: isActive ? 800 : 700,
                          fontSize: isMobile ? 13 : 14,
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
                  <div style={{ flex: '0 0 auto', width: isMobile ? '100%' : 320, minWidth: isMobile ? '100%' : 320 }}>
                    <Label htmlFor="amount">{flowAmountLabel}</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={isDepositFlow ? 'Ex: 500.00' : 'Ex: 250.00'}
                      required
                      className="h-14 px-4 text-base md:text-base placeholder:text-base"
                    />
                  </div>

                  {movementType === 'depot' && availablePaymentMethods.length > 0 && (
                    <div style={{ width: isMobile ? '100%' : 260 }}>
                      <Label>Type de paiement</Label>
                      <Select
                        value={paymentMethod}
                        onValueChange={(v) => {
                          const normalized = normalizeDepositPaymentMethod(v);
                          if (normalized) setPaymentMethod(normalized);
                        }}
                      >
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
                          {availablePaymentMethods.includes('cryptomonnaie') && (
                            <SelectItem value="cryptomonnaie">Cryptomonnaie</SelectItem>
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
                    {submitting ? 'Traitement...' : flowSubmitLabel}
                  </Button>
                  {canViewDepositRib && (
                    <Button
                      type="button"
                      variant="platform"
                      onClick={() => setDepositRibDialogOpen(true)}
                    >
                      Voir le RIB
                    </Button>
                  )}
                  {canViewDepositWallet && (
                    <Button
                      type="button"
                      variant="platform"
                      onClick={() => setCryptoDepositDialogOpen(true)}
                    >
                      Voir le wallet
                    </Button>
                  )}
                </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Dialog open={depositRibDialogOpen} onOpenChange={setDepositRibDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>RIB pour le virement</DialogTitle>
                <DialogDescription>
                  Utilisez ces informations pour effectuer votre virement.
                </DialogDescription>
              </DialogHeader>

              {selectedDepositClientRib?.rib ? (
                <div
                  style={{
                    padding: 12,
                    border: '1px solid #dbeafe',
                    borderRadius: 8,
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontWeight: 500, color: '#6b7280' }}>Titulaire :</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{selectedDepositClientRib.rib.accountHolder || '-'}</span>
                        <button
                          type="button"
                          style={copyShortcutButtonStyle}
                          onClick={() => copyToClipboard('Titulaire', selectedDepositClientRib.rib.accountHolder || '')}
                          aria-label="Copier le titulaire"
                          title="Copier le titulaire"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontWeight: 500, color: '#6b7280', fontSize: 13 }}>
                          IBAN :
                        </div>
                        <button
                          type="button"
                          style={copyShortcutButtonStyle}
                          onClick={() => copyToClipboard('IBAN', selectedDepositClientRib.rib.iban || '')}
                          aria-label="Copier l'IBAN"
                          title="Copier l'IBAN"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>
                        {selectedDepositClientRib.rib.iban || '-'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontWeight: 500, color: '#6b7280' }}>BIC :</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedDepositClientRib.rib.bic || '-'}</span>
                        <button
                          type="button"
                          style={copyShortcutButtonStyle}
                          onClick={() => copyToClipboard('BIC', selectedDepositClientRib.rib.bic || '')}
                          aria-label="Copier le BIC"
                          title="Copier le BIC"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    {selectedDepositClientRib.rib.bankCode && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontWeight: 500, color: '#6b7280' }}>Code banque :</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedDepositClientRib.rib.bankCode}</span>
                          <button
                            type="button"
                            style={copyShortcutButtonStyle}
                            onClick={() => copyToClipboard('Code banque', selectedDepositClientRib.rib.bankCode || '')}
                            aria-label="Copier le code banque"
                            title="Copier le code banque"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedDepositClientRib.rib.branchCode && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontWeight: 500, color: '#6b7280' }}>Code guichet :</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedDepositClientRib.rib.branchCode}</span>
                          <button
                            type="button"
                            style={copyShortcutButtonStyle}
                            onClick={() => copyToClipboard('Code guichet', selectedDepositClientRib.rib.branchCode || '')}
                            aria-label="Copier le code guichet"
                            title="Copier le code guichet"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedDepositClientRib.rib.accountNumber && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontWeight: 500, color: '#6b7280' }}>N° compte :</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedDepositClientRib.rib.accountNumber}</span>
                          <button
                            type="button"
                            style={copyShortcutButtonStyle}
                            onClick={() => copyToClipboard('Numéro de compte', selectedDepositClientRib.rib.accountNumber || '')}
                            aria-label="Copier le numéro de compte"
                            title="Copier le numéro de compte"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedDepositClientRib.rib.ribKey && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontWeight: 500, color: '#6b7280' }}>Clé RIB :</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedDepositClientRib.rib.ribKey}</span>
                          <button
                            type="button"
                            style={copyShortcutButtonStyle}
                            onClick={() => copyToClipboard('Clé RIB', selectedDepositClientRib.rib.ribKey || '')}
                            aria-label="Copier la clé RIB"
                            title="Copier la clé RIB"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedDepositClientRib.rib.domiciliation && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontWeight: 500, color: '#6b7280', fontSize: 13 }}>
                            Domiciliation :
                          </div>
                          <button
                            type="button"
                            style={copyShortcutButtonStyle}
                            onClick={() => copyToClipboard('Domiciliation', selectedDepositClientRib.rib.domiciliation || '')}
                            aria-label="Copier la domiciliation"
                            title="Copier la domiciliation"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <div style={{ fontSize: 13, color: '#374151' }}>
                          {selectedDepositClientRib.rib.domiciliation}
                        </div>
                      </div>
                    )}
                    {(selectedDepositClientRib.rib.motif || '').trim() ? (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontWeight: 500, color: '#6b7280', fontSize: 13 }}>
                            Motif du virement :
                          </div>
                          <button
                            type="button"
                            style={copyShortcutButtonStyle}
                            onClick={() => copyToClipboard('Motif du virement', (selectedDepositClientRib.rib.motif || '').trim())}
                            aria-label="Copier le motif du virement"
                            title="Copier le motif du virement"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            color: '#111827',
                            whiteSpace: 'pre-wrap',
                            fontWeight: 600,
                            lineHeight: 1.45,
                          }}
                        >
                          {(selectedDepositClientRib.rib.motif || '').trim()}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#6b7280' }}>
                  Aucun RIB disponible actuellement.
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="platform" onClick={() => setDepositRibDialogOpen(false)}>
                  Fermer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Dépôt initié</div>
                      <div style={{ fontSize: 14, color: '#6b7280' }}>
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
                      <div style={{ marginTop: 10, fontSize: 14, color: '#6b7280' }}>
                        Référence: <strong>{transferSuccess.transaction.id}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 14, color: '#1e40af' }}>
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
                          <div style={{ fontSize: 14 }}>
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
                          <div style={{ fontSize: 14, color: '#6b7280' }}>
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
                                <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
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
                                      <div style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4, fontSize: 13 }}>Domiciliation :</div>
                                      <div style={{ fontSize: 13, color: '#374151' }}>{rib.domiciliation}</div>
                                    </div>
                                  )}
                                  {(rib.motif || '').trim() ? (
                                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                                      <div style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4, fontSize: 13 }}>
                                        Motif du virement (libellé banque) :
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 14,
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

                        <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 14, color: '#1e40af' }}>
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

          {/* Crypto Deposit Dialog */}
          <Dialog
            open={cryptoDepositDialogOpen}
            onOpenChange={(open) => {
              if (!submitting && !cryptoDepositSuccess) {
                setCryptoDepositDialogOpen(open);
                if (!open) {
                  setCryptoDepositSuccess(null);
                  setPendingAmount(0);
                }
              }
            }}
          >
            <DialogContent>
              {cryptoDepositSuccess ? (
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
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Dépôt initié</div>
                      <div style={{ fontSize: 14, color: '#6b7280' }}>
                        Cryptomonnaie
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                      <span>Montant</span>
                      <strong>
                        {formatAmount(cryptoDepositSuccess.amount, 'EUR')}
                      </strong>
                    </div>
                    {cryptoDepositSuccess.transaction && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginTop: 6 }}>
                        <span>Statut</span>
                        <strong style={{ color: '#f59e0b' }}>En attente de paiement</strong>
                      </div>
                    )}
                    {cryptoDepositSuccess.transaction?.id && (
                      <div style={{ marginTop: 10, fontSize: 14, color: '#6b7280' }}>
                        Référence: <strong>{cryptoDepositSuccess.transaction.id}</strong>
                      </div>
                    )}
                  </div>

                  <DialogFooter style={{ marginTop: 0, paddingTop: 0 }}>
                    <Button
                      type="button"
                      variant="platform"
                      onClick={() => {
                        setCryptoDepositDialogOpen(false);
                        setCryptoDepositSuccess(null);
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
                    <DialogTitle>Instructions pour le dépôt en cryptomonnaie</DialogTitle>
                    <DialogDescription>
                      Utilisez les informations du wallet ci-dessous pour effectuer votre transfert.
                    </DialogDescription>
                  </DialogHeader>

                  {!selectedDepositClientWallet?.wallet ? (
                    <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 14, color: '#1e40af' }}>
                      Aucun wallet n&apos;est disponible actuellement pour votre compte.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ padding: 12, backgroundColor: '#f3f4f6', borderRadius: 6 }}>
                        <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                          Montant à transférer : {formatAmount(pendingAmount, 'EUR')}
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7280' }}>
                          Effectuez votre transfert crypto vers l&apos;adresse ci-dessous.
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 12,
                          border: '2px solid #bfdbfe',
                          borderRadius: 6,
                          backgroundColor: '#f8fafc',
                        }}
                      >
                        <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 500, color: '#6b7280' }}>Nom :</span>
                            <span style={{ fontWeight: 600 }}>{selectedDepositClientWallet.wallet.name || '-'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 500, color: '#6b7280' }}>Symbole :</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {selectedDepositClientWallet.wallet.assetSymbol || '-'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 500, color: '#6b7280' }}>Réseau :</span>
                            <span style={{ fontWeight: 600 }}>{selectedDepositClientWallet.wallet.network || '-'}</span>
                          </div>
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                            <div style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4, fontSize: 13 }}>
                              Adresse wallet :
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
                                {selectedDepositClientWallet.wallet.walletAddress || '-'}
                              </span>
                              <button
                                type="button"
                                style={copyShortcutButtonStyle}
                                onClick={() => copyToClipboard('Adresse wallet', selectedDepositClientWallet.wallet.walletAddress || '')}
                                aria-label="Copier l'adresse wallet"
                                title="Copier l'adresse wallet"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          </div>
                          {(selectedDepositClientWallet.wallet.memoOrTag || '').trim() ? (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                              <div style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4, fontSize: 13 }}>
                                Memo / Tag :
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                  {(selectedDepositClientWallet.wallet.memoOrTag || '').trim()}
                                </span>
                                <button
                                  type="button"
                                  style={copyShortcutButtonStyle}
                                  onClick={() => copyToClipboard('Memo / Tag', (selectedDepositClientWallet.wallet.memoOrTag || '').trim())}
                                  aria-label="Copier le memo ou tag"
                                  title="Copier le memo ou tag"
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      style={{ color: 'white' }}
                      disabled={submitting}
                      onClick={() => {
                        setCryptoDepositDialogOpen(false);
                        setPendingAmount(0);
                      }}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      variant="platform"
                      disabled={submitting || !selectedDepositClientWallet?.wallet}
                      onClick={confirmCryptoDeposit}
                    >
                      {submitting ? 'Traitement...' : 'Valider ma demande de dépôt crypto'}
                    </Button>
                  </DialogFooter>
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
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Dépôt initié</div>
                      <div style={{ fontSize: 14, color: '#6b7280' }}>
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
                      <div style={{ marginTop: 10, fontSize: 14, color: '#6b7280' }}>
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

                  <div style={{ padding: 12, backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 14, color: '#1e40af' }}>
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

          {/* Historique (table/cards) retiré de "Mon solde" */}
        </>
      )}
    </div>
  );
}
