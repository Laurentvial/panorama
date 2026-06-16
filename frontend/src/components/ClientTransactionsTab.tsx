import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateInputWithCalendar } from './ui/date-input';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Checkbox } from './ui/checkbox';
import { Plus, X, ChevronDown, ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { TransactionList } from './TransactionList';
import { ProductTransferSelect } from './ProductTransferSelect';
import { ViewTransactionModal } from './ViewTransactionModal';
import { EditTransactionModal } from './EditTransactionModal';
import { PositionGenerationModal } from './PositionGenerationModal';
import { getStatusLabel, parseSubscriptionDetails } from './transactionUtils';
import { getCurrencySymbol } from '../utils/currency';
import LoadingIndicator from './LoadingIndicator';
import { SimpleCalendar } from './ui/simple-calendar';
import '../styles/Modal.css';

interface ClientTransactionsTabProps {
  onRefresh: () => void;
  clientId: string;
  client?: any;
}

// Transaction types with their allowed statuses
const TRANSACTION_TYPES = {
  depot: {
    label: 'Dépôt',
    statuses: ['en_attente_paiement', 'valide', 'conteste', 'annule']
  },
  retrait: {
    label: 'Retrait',
    statuses: ['en_cours', 'en_verification', 'valide', 'annule']
  },
  bonus: {
    label: 'Bonus',
    statuses: ['en_cours', 'valide', 'annule']
  },
  achat: {
    label: 'Achat',
    statuses: ['en_cours', 'valide', 'annule']
  },
  vente: {
    label: 'Vente',
    statuses: ['en_cours', 'valide', 'annule']
  },
  interets: {
    label: 'Intérêts',
    statuses: ['en_cours', 'valide', 'annule']
  },
  frais: {
    label: 'Frais',
    statuses: ['en_cours', 'valide', 'annule']
  },
  transfert: {
    label: 'Transfert',
    statuses: ['en_cours', 'valide', 'cloture', 'annule']
  },
  perte: {
    label: 'Perte',
    statuses: ['valide', 'annule']
  },
  conversion: {
    label: 'Conversion',
    statuses: ['valide', 'annule']
  }
};

const STATUS_LABELS: { [key: string]: string } = {
  en_attente_paiement: 'En attente de paiement',
  en_cours: 'En cours',
  en_verification: 'En vérification',
  valide: 'Validé',
  cloture: 'Clôturé',
  conteste: 'Contesté',
  annule: 'Annulé'
};

export function ClientTransactionsTab({ onRefresh, clientId, client }: ClientTransactionsTabProps) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [allTransactionsForInterest, setAllTransactionsForInterest] = useState<any[]>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [isBackfillingInterests, setIsBackfillingInterests] = useState(false);
  const [isBackfillPreviewModalOpen, setIsBackfillPreviewModalOpen] = useState(false);
  const [isLoadingBackfillPreview, setIsLoadingBackfillPreview] = useState(false);
  const [backfillPreviewResult, setBackfillPreviewResult] = useState<any | null>(null);
  const [previewTransactionIds, setPreviewTransactionIds] = useState<string[]>([]);
  const [contractDocumentsByTransaction, setContractDocumentsByTransaction] = useState<Record<string, any[]>>({});
  const [unlinkedContractDocuments, setUnlinkedContractDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isCreatingTransaction, setIsCreatingTransaction] = useState(false);
  const [isViewTransactionModalOpen, setIsViewTransactionModalOpen] = useState(false);
  const [isEditTransactionModalOpen, setIsEditTransactionModalOpen] = useState(false);
  const [isPositionGenerationModalOpen, setIsPositionGenerationModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [transactionForPositionGeneration, setTransactionForPositionGeneration] = useState<any>(null);
  const [isWithdrawalForPositionGeneration, setIsWithdrawalForPositionGeneration] = useState(false);
  const [positionModalSource, setPositionModalSource] = useState<'create' | 'validate' | 'recovery'>('create');
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const getAllocationsFromProduct = (p: any): any[] => {
    if (!p) return [];
    const raw =
      (p as any).assetAllocations ??
      (p as any).asset_allocations ??
      (p as any).assetAllocations?.results ??
      (p as any).asset_allocations?.results ??
      [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    if (raw && typeof raw === 'object') {
      const values = Object.values(raw);
      return Array.isArray(values) ? values : [];
    }
    return [];
  };

  const accountCurrency = (client?.accountCurrency || client?.account_currency || 'EUR').toString().trim().toUpperCase();

  // Load transactions with pagination
  const loadTransactions = async (page: number = 1, limit: number = 50) => {
    try {
      setLoading(true);
      // Add a cache-buster so newly created rows appear immediately.
      const data = await apiCall(`/api/clients/${clientId}/transactions/?page=${page}&limit=${limit}&_ts=${Date.now()}`);
      setTransactions((data as any).transactions || []);
      if ((data as any).pagination) {
        setPagination((data as any).pagination);
      }
      // Keep contract links in sync when transactions are refreshed
      loadContractDocuments();
    } catch (error) {
      console.error('Error loading transactions:', error);
      toast.error('Erreur lors du chargement des transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAllTransactionsForInterest = async () => {
    try {
      const collected: any[] = [];
      const pageSize = 500;
      let page = 1;
      let totalPages = 1;

      do {
        const data = await apiCall(`/api/clients/${clientId}/transactions/?page=${page}&limit=${pageSize}`);
        const pageTransactions = (data as any).transactions || [];
        collected.push(...pageTransactions);
        const paginationData = (data as any).pagination || {};
        totalPages = Number(paginationData.total_pages || 1);
        page += 1;
      } while (page <= totalPages);

      setAllTransactionsForInterest(collected);
    } catch (error) {
      console.error('Error loading all transactions for interest tracking:', error);
      setAllTransactionsForInterest([]);
    }
  };

  const loadContractDocuments = async () => {
    try {
      const data = await apiCall(`/api/clients/${clientId}/documents/`);
      const documents = (data as any).documents || [];
      const contractsWithTx = documents.filter(
        (doc: any) => doc?.documentType === 'contract' && doc?.transactionId
      );
      const unlinked = documents.filter(
        (doc: any) => doc?.documentType === 'contract' && !doc?.transactionId
      );

      const groupedByTransaction = contractsWithTx.reduce((acc: Record<string, any[]>, doc: any) => {
        const txId = String(doc.transactionId);
        if (!acc[txId]) {
          acc[txId] = [];
        }
        acc[txId].push(doc);
        return acc;
      }, {});

      setContractDocumentsByTransaction(groupedByTransaction);
      setUnlinkedContractDocuments(unlinked);
    } catch (error) {
      console.error('Error loading contract documents:', error);
      setContractDocumentsByTransaction({});
      setUnlinkedContractDocuments([]);
    }
  };

  // Load transactions on mount and when clientId changes
  useEffect(() => {
    loadTransactions(1, 50);
    loadContractDocuments();
    loadAllTransactionsForInterest();
    setSelectedTransactionIds(new Set());
  }, [clientId]);

  // Load assets and products to find IDs
  useEffect(() => {
    const loadAssetsAndProducts = async () => {
      try {
        const [assetsData, productsData] = await Promise.all([
          apiCall('/api/assets/').catch(() => ({ assets: [] })),
          apiCall('/api/products/').catch(() => ({ products: [] }))
        ]);
        setAssets(assetsData.assets || assetsData || []);
        setProducts(productsData.products || productsData || []);
      } catch (error) {
        console.error('Error loading assets/products:', error);
      }
    };
    loadAssetsAndProducts();
  }, []);

  const productHasAllocationsForValidate = async (productId: any): Promise<boolean> => {
    if (!productId) return false;
    try {
      const res: any = await apiCall(`/api/products/${String(productId)}/`, { method: 'GET' });
      const p = res?.product || res || null;
      return getAllocationsFromProduct(p).length > 0;
    } catch {
      const fromList = products.find((x: any) => String(x?.id) === String(productId));
      return getAllocationsFromProduct(fromList).length > 0;
    }
  };

  const resolveRelevantProductIdFromTransaction = (tx: any): string | null => {
    if (!tx) return null;
    const rawTo = tx.transfer_to ?? tx.to_field ?? tx.to ?? null;
    const rawFrom = tx.transfer_from ?? tx.from_field ?? tx.from ?? null;
    const sub = tx.subscription_details ?? {};
    const rawFromSub =
      sub.productId ?? sub.product_id ?? sub.product?.id ?? tx.productId ?? tx.product_id ?? null;

    const to = rawTo == null ? '' : String(rawTo).trim();
    const from = rawFrom == null ? '' : String(rawFrom).trim();
    const fromSub = rawFromSub == null ? '' : String(rawFromSub).trim();

    const isInvestToProduct = to && to !== 'solde' && to !== 'trading';
    if (isInvestToProduct) return to;

    const isWithdrawalFromProduct = to === 'solde' && from && from !== 'solde' && from !== 'trading';
    if (isWithdrawalFromProduct) return from;

    if (fromSub && fromSub !== 'solde' && fromSub !== 'trading') return fromSub;

    return null;
  };

  const buildValidateUpdatePayload = (tx: any, skipPositionGeneration: boolean) => {
    let datetimeISO = tx.datetime || tx.createdAt || '';
    if (datetimeISO && typeof datetimeISO === 'string') {
      if (!datetimeISO.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        const match = datetimeISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (match) datetimeISO = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`;
      }
    }
    const payload: any = {
      type: tx.type,
      amount: parseFloat(tx.amount || 0),
      description: tx.description || '',
      status: 'valide',
      datetime: datetimeISO,
      skip_position_generation: skipPositionGeneration,
    };
    if (tx.type === 'transfert') {
      payload.from_field = tx.transfer_from || tx.from_field || tx.from || 'solde';
      payload.to_field = tx.transfer_to || tx.to_field || tx.to || 'solde';
      payload.subscription_details = tx.subscription_details || {};
      payload.interestPeriod = tx.subscription_interest_period || tx.subscription_details?.interestPeriod || '';
    }
    return payload;
  };

  const handleValidateAndGenerate = async (tx: any) => {
    if (['valide', 'cloture'].includes(String(tx.status || '').trim().toLowerCase())) {
      toast.info('La transaction est déjà validée ou clôturée');
      return;
    }
    if (tx.type !== 'transfert') {
      try {
        await apiCall(`/api/clients/${clientId}/transactions/${tx.id}/`, {
          method: 'PUT',
          body: JSON.stringify(buildValidateUpdatePayload(tx, false)),
        });
        clearApiCache(`/api/clients/${clientId}/transactions/`);
        loadTransactions(pagination.page, pagination.limit);
        onRefresh();
        toast.success('Transaction modifiée avec succès');
      } catch (err: any) {
        toast.error((err as any).message || 'Erreur lors de la mise à jour');
      }
      return;
    }

    const transferTo = tx.transfer_to || tx.to_field || tx.to || null;
    const transferFrom = tx.transfer_from || tx.from_field || tx.from || null;
    const isWithdrawal = transferTo === 'solde' && transferFrom && transferFrom !== 'solde';
    const relevantProductId = resolveRelevantProductIdFromTransaction(tx);
    const hasAllocations = relevantProductId
      ? await productHasAllocationsForValidate(relevantProductId)
      : false;

    if (hasAllocations) {
      // Do NOT update status to "valide" before modal - validation requires position generation.
      // Open modal with transaction as-is; status will be set to "valide" only when user completes.
      setPositionModalSource('validate');
      setTransactionForPositionGeneration(tx);
      setIsWithdrawalForPositionGeneration(isWithdrawal);
      setIsPositionGenerationModalOpen(true);
    } else {
      try {
        await apiCall(`/api/clients/${clientId}/transactions/${tx.id}/`, {
          method: 'PUT',
          body: JSON.stringify(buildValidateUpdatePayload(tx, false)),
        });
        clearApiCache(`/api/clients/${clientId}/transactions/`);
        loadTransactions(pagination.page, pagination.limit);
        onRefresh();
        toast.success('Transaction modifiée avec succès');
      } catch (err: any) {
        toast.error((err as any).message || 'Erreur lors de la mise à jour');
      }
    }
  };

  /**
   * Transfert investissement ou retrait déjà validé : ouvrir le modal de génération / régénération
   * (même flux que « valider un transfert »), y compris lorsqu’il existe déjà des positions pour la transaction.
   */
  const handleOpenRecoverPositionsModal = async (tx: any) => {
    const transferTo = tx.transfer_to || tx.to_field || tx.to || null;
    const transferFrom = tx.transfer_from || tx.from_field || tx.from || null;
    const isWithdrawal = transferTo === 'solde' && transferFrom && transferFrom !== 'solde';
    const relevantProductId = resolveRelevantProductIdFromTransaction(tx);
    const hasAllocations = relevantProductId
      ? await productHasAllocationsForValidate(relevantProductId)
      : false;

    if (hasAllocations) {
      setPositionModalSource('recovery');
      setTransactionForPositionGeneration(tx);
      setIsWithdrawalForPositionGeneration(isWithdrawal);
      setIsPositionGenerationModalOpen(true);
    } else {
      toast.info(
        'Ce produit n’a pas d’allocations d’actifs : le modal de génération n’est pas disponible. Vérifiez la configuration du produit.'
      );
    }
  };

  // Parse subscription details from transaction - check both subscription_details field and description fallback
  const parseSubscriptionDetails = (transaction: any): any | null => {
    if (!transaction) return null;
    
    // First try to get from subscription_details field (preferred)
    if (transaction.subscription_details && Object.keys(transaction.subscription_details).length > 0) {
      return transaction.subscription_details;
    }
    
    // Fallback: try to parse from description (for old transactions)
    const description = transaction.description || '';
    if (description && typeof description === 'string') {
      const detailsMatch = description.match(/SUBSCRIPTION_DETAILS:(.+)$/);
      if (detailsMatch) {
        try {
          return JSON.parse(detailsMatch[1]);
        } catch (e) {
          console.error('Error parsing subscription details:', e);
        }
      }
    }
    
    // Also try to get from individual fields if available
    if (transaction.subscription_first_name || transaction.subscription_last_name || transaction.subscription_details) {
      // If we have subscription_details, use it, otherwise build from individual fields
      if (transaction.subscription_details && Object.keys(transaction.subscription_details).length > 0) {
        return transaction.subscription_details;
      }
      
      return {
        firstName: transaction.subscription_first_name || '',
        lastName: transaction.subscription_last_name || '',
        birthDate: transaction.subscription_birth_date || '',
        city: transaction.subscription_city || '',
        ip: transaction.subscription_ip || '',
        productId: transaction.productId || null,
        productName: transaction.productName || '',
        productReference: transaction.productReference || null,
        category: transaction.category || '',
        country: transaction.country || 'FRANCE',
        subscriptionDate: transaction.subscription_date || '',
        duration: transaction.subscription_duration || '',
        interestPeriod: transaction.subscription_interest_period || '',
        profitability: transaction.subscription_profitability || '',
        investment: transaction.subscription_investment || null,
        profits: transaction.subscription_profits || null,
        total: transaction.subscription_total || null,
        contractEnd: transaction.subscription_contract_end || '',
        hasSignature: !!transaction.subscription_signature,
        signature: transaction.subscription_signature || null,
      };
    }
    
    return null;
  };

  const [filters, setFilters] = useState({
    types: [] as string[],
    status: 'all',
    amountMin: '',
    amountMax: '',
    dateFrom: '',
    dateTo: ''
  });
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en_attente_paiement',
    datetime: '',
    // transfert fields (admin create)
    from_field: 'solde',
    to_field: 'solde',
    productId: '',
    interestPeriod: '',
    // conversion fields
    to_currency: '',
    // depot/bonus for non-EUR account: amount in EUR, optional fx rate
    fx_rate_eur_to_account: '',
    // depot: optional bonus shortcut - creates a parallel bonus transaction when filled
    bonus_amount: '',
    // interets: surperformance (intérêts supplémentaires, exclus du calcul paid_interests)
    is_surperformance: false,
    // kept for backward compatibility with existing UI resets
    visibleByClient: true
  });
  const [dateDisplay, setDateDisplay] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const getDefaultTransactionForm = () => ({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en_attente_paiement',
    datetime: '',
    from_field: 'solde',
    to_field: 'solde',
    productId: '',
    interestPeriod: '',
    to_currency: '',
    fx_rate_eur_to_account: '',
    bonus_amount: '',
    is_surperformance: false,
    visibleByClient: true
  });

  const resetTransactionForm = () => {
    setTransactionForm(getDefaultTransactionForm());
    setDateDisplay('');
    setTimeDisplay('');
    setIsDatePickerOpen(false);
  };

  const formatDisplayDate = (iso: string): string => {
    if (!iso || !iso.includes('T')) return '';
    const [datePart] = iso.split('T');
    const [y, m, d] = datePart.split('-');
    return `${d}/${m}/${y}`;
  };

  const formatDisplayTime = (iso: string): string => {
    if (!iso || !iso.includes('T')) return '';
    const timePart = iso.split('T')[1] || '00:00';
    return timePart.slice(0, 5);
  };

  const parseDate = (s: string): { y: number; m: number; d: number } | null => {
    const t = s.trim();
    const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return { y: year, m: month, d: day };
  };

  const parseTime = (s: string): { h: number; min: number } | null => {
    const t = s.trim();
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return { h, min };
  };

  const buildDatetimeFromDisplay = (dateStr: string, timeStr: string): string | null => {
    const date = parseDate(dateStr);
    const time = parseTime(timeStr);
    if (!date || !time) return null;
    const monthStr = String(date.m).padStart(2, '0');
    const dayStr = String(date.d).padStart(2, '0');
    const hoursStr = String(time.h).padStart(2, '0');
    const minutesStr = String(time.min).padStart(2, '0');
    return `${date.y}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}`;
  };

  const buildDisplayDateFromDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const selectedDateForCalendar = (() => {
    const parsed = parseDate(dateDisplay);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : undefined;
  })();

  const normalizeInterestPeriod = (value: string): string => {
    const v = String(value || '').trim();
    const legacyMapping: Record<string, string> = {
      Trimestriel: 'Trimestrielle',
      Semestriel: 'Semestrielle',
      Annuel: 'Annuelle',
    };
    return legacyMapping[v] || v;
  };

  const getInterestPeriodOptions = (product: any): string[] => {
    const allOptions = ['Quotidien', 'Hebdomadaire', 'Mensuel', 'Trimestrielle', 'Semestrielle', 'Annuelle', 'Fin de contrat'];
    if (!product) return allOptions;
    const raw = product.interestPeriod ?? product.interest_period ?? '';
    if (!raw) return allOptions;
    const parsed = String(raw)
      .split(',')
      .map((item) => normalizeInterestPeriod(item))
      .map((item) => item.trim())
      .filter(Boolean);
    const valid = parsed.filter((item) => allOptions.includes(item));
    return valid.length > 0 ? Array.from(new Set(valid)) : allOptions;
  };

  // Update status when type changes
  useEffect(() => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    if (typeConfig && !typeConfig.statuses.includes(transactionForm.status)) {
      setTransactionForm(prev => ({ ...prev, status: typeConfig.statuses[0] }));
    }
  }, [transactionForm.type, transactionForm.status]);

  // Initialize datetime with current date/time when modal opens
  useEffect(() => {
    if (isTransactionDialogOpen && !transactionForm.datetime) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const nextDatetime = `${year}-${month}-${day}T${hours}:${minutes}`;
      setTransactionForm(prev => ({ ...prev, datetime: nextDatetime }));
      setDateDisplay(formatDisplayDate(nextDatetime));
      setTimeDisplay(formatDisplayTime(nextDatetime));
    }
  }, [isTransactionDialogOpen, transactionForm.datetime]);

  // Fetch suggested FX rate for depot/bonus when account is non-EUR
  const needsEurInputAndConversion = (
    (transactionForm.type === 'depot' || transactionForm.type === 'bonus') &&
    accountCurrency !== 'EUR'
  );
  useEffect(() => {
    if (!isTransactionDialogOpen || !needsEurInputAndConversion) return;
    if (transactionForm.fx_rate_eur_to_account) return; // User already entered one
    let cancelled = false;
    (async () => {
      try {
        const res: any = await apiCall(`/api/forex/quote/?from=EUR&to=${accountCurrency}`);
        const rate = res?.exchange_rate;
        if (!cancelled && rate != null && typeof rate === 'number') {
          setTransactionForm(prev => ({ ...prev, fx_rate_eur_to_account: String(rate) }));
        }
      } catch {
        // Ignore - user can enter manually
      }
    })();
    return () => { cancelled = true; };
  }, [isTransactionDialogOpen, needsEurInputAndConversion, accountCurrency]);

  // Pre-fill description with conversion comment for depot/bonus with EUR→accountCurrency conversion
  const conversionCommentPattern = /[\r\n]*\s*\(Conversion:.*?\)\s*$/;
  useEffect(() => {
    const baseDesc = (transactionForm.description || '').replace(conversionCommentPattern, '').trim();
    if (!needsEurInputAndConversion || !transactionForm.amount || !transactionForm.fx_rate_eur_to_account) {
      // Remove conversion line when amount/rate cleared
      if (baseDesc !== (transactionForm.description || '').trim()) {
        setTransactionForm(prev => ({ ...prev, description: baseDesc }));
      }
      return;
    }
    const amt = parseFloat(transactionForm.amount);
    const rate = parseFloat(transactionForm.fx_rate_eur_to_account);
    if (isNaN(amt) || amt <= 0 || isNaN(rate) || rate <= 0) return;
    const converted = (amt * rate).toFixed(2);
    const conversionLine = `\n\n(Conversion: ${amt.toLocaleString('fr-FR')} EUR × ${rate} = ${parseFloat(converted).toLocaleString('fr-FR')} ${accountCurrency})`;
    const newDesc = baseDesc ? baseDesc + conversionLine : conversionLine.trim();
    if (newDesc !== transactionForm.description) {
      setTransactionForm(prev => ({ ...prev, description: newDesc }));
    }
  }, [needsEurInputAndConversion, transactionForm.amount, transactionForm.fx_rate_eur_to_account, transactionForm.description, accountCurrency]);

  // Keep interest period aligned with selected transfer product options.
  useEffect(() => {
    if (transactionForm.type !== 'transfert') {
      if (transactionForm.interestPeriod) {
        setTransactionForm(prev => ({ ...prev, interestPeriod: '' }));
      }
      return;
    }

    const transferProductId =
      transactionForm.from_field && transactionForm.from_field !== 'solde'
        ? transactionForm.from_field
        : (transactionForm.to_field && transactionForm.to_field !== 'solde' ? transactionForm.to_field : '');

    if (!transferProductId) {
      if (transactionForm.interestPeriod) {
        setTransactionForm(prev => ({ ...prev, interestPeriod: '' }));
      }
      return;
    }

    const selectedProduct = products.find((p: any) => String(p?.id) === String(transferProductId));
    const options = getInterestPeriodOptions(selectedProduct);
    if (!transactionForm.interestPeriod || !options.includes(transactionForm.interestPeriod)) {
      setTransactionForm(prev => ({
        ...prev,
        interestPeriod: options.length === 1 ? options[0] : '',
      }));
    }
  }, [transactionForm.type, transactionForm.from_field, transactionForm.to_field, transactionForm.interestPeriod, products]);

  // Auto-generate description for transfert transactions
  useEffect(() => {
    if (transactionForm.type === 'transfert' && (transactionForm.from_field || transactionForm.to_field)) {
      const fromField = transactionForm.from_field || 'solde';
      const toField = transactionForm.to_field || 'solde';
      
      // Find product names
      let fromName = 'Solde';
      let toName = 'Solde';
      
      if (fromField !== 'solde') {
        const fromProduct = products.find((p: any) => p.id === fromField);
        if (fromProduct) {
          fromName = fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
        }
      }
      
      if (toField !== 'solde') {
        const toProduct = products.find((p: any) => p.id === toField);
        if (toProduct) {
          toName = toProduct.name + (toProduct.reference ? ` (${toProduct.reference})` : '');
        }
      }
      
      // Generate description: "Transfert de [from] vers [to]."
      const generatedDescription = `Transfert de ${fromName} vers ${toName}.`;
      
      const currentDesc = transactionForm.description || '';
      
      // Check if description matches old auto-generated pattern (with Montant, Période, etc.)
      const isOldAutoPattern = currentDesc.startsWith('Transfert de') && 
                               (currentDesc.includes('Montant:') || currentDesc.includes('Période d\'intérêt') || currentDesc.includes('Date de fin de contrat'));
      
      // Check if description matches the new simplified format pattern
      const isNewFormatPattern = currentDesc.match(/^Transfert de\s+.+?\s+vers\s+.+?\.?$/);
      
      // Update description if:
      // 1. Description is empty
      // 2. Description matches old auto-generated pattern (needs update)
      // 3. Description matches new format but doesn't match current values (needs update)
      // This allows users to manually edit the description without it being overwritten, unless they change the transfer fields
      if (!currentDesc.trim() || isOldAutoPattern || (isNewFormatPattern && currentDesc.trim() !== generatedDescription.trim())) {
        setTransactionForm(prev => ({ ...prev, description: generatedDescription }));
      }
    } else if (transactionForm.type !== 'transfert' && transactionForm.description && 
               transactionForm.description.startsWith('Transfert de')) {
      // Clear transfer description if type changes away from transfert
      setTransactionForm(prev => ({ ...prev, description: '' }));
    }
  }, [transactionForm.type, transactionForm.from_field, transactionForm.to_field, products]);

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (isCreatingTransaction) return;
    setIsCreatingTransaction(true);

    if (!dateDisplay.trim()) {
      toast.error('La date est requise');
      setIsCreatingTransaction(false);
      return;
    }

    if (!timeDisplay.trim()) {
      toast.error('L\'heure est requise');
      setIsCreatingTransaction(false);
      return;
    }

    const submittedDatetime = buildDatetimeFromDisplay(dateDisplay, timeDisplay);
    if (!submittedDatetime) {
      toast.error('Format de date invalide. Utilisez JJ/MM/AAAA pour la date et HH:mm pour l\'heure.');
      setIsCreatingTransaction(false);
      return;
    }

    const isConversion = transactionForm.type === 'conversion';
    if (!isConversion && (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0)) {
      toast.error('Le montant doit être supérieur à 0');
      setIsCreatingTransaction(false);
      return;
    }

    if (isConversion && !transactionForm.to_currency) {
      toast.error('Veuillez sélectionner la devise cible');
      setIsCreatingTransaction(false);
      return;
    }

    const needsEurAndRate = (transactionForm.type === 'depot' || transactionForm.type === 'bonus') &&
      (client?.accountCurrency || client?.account_currency || 'EUR').toString().trim().toUpperCase() !== 'EUR';
    if (needsEurAndRate && (!transactionForm.fx_rate_eur_to_account || parseFloat(transactionForm.fx_rate_eur_to_account) <= 0)) {
      toast.error('Veuillez saisir un taux de conversion valide (EUR → ' + (client?.accountCurrency || client?.account_currency || 'CHF') + ')');
      setIsCreatingTransaction(false);
      return;
    }

    const isTransferWithProduct =
      transactionForm.type === 'transfert' &&
      ((transactionForm.from_field && transactionForm.from_field !== 'solde') ||
        (transactionForm.to_field && transactionForm.to_field !== 'solde'));
    if (isTransferWithProduct && !String(transactionForm.interestPeriod || '').trim()) {
      toast.error("La période d'intérêt est obligatoire pour un transfert impliquant un produit.");
      setIsCreatingTransaction(false);
      return;
    }

    try {
      // Keep datetime in local format, don't convert to UTC
      // submittedDatetime is in YYYY-MM-DDTHH:mm format (local time)
      let datetimeISO = submittedDatetime;
      if (datetimeISO && !datetimeISO.includes(':')) {
        // Add seconds if not present
        datetimeISO = `${datetimeISO}:00`;
      } else if (datetimeISO && datetimeISO.split(':').length === 2) {
        // Has HH:mm but no seconds, add them
        datetimeISO = `${datetimeISO}:00`;
      }
      
      // Check if this is a transfert transaction with status "valide"
      const isTransfert = transactionForm.type === 'transfert';
      const isTermine = transactionForm.status === 'valide';
      
      // For transfert transactions, determine if this is an investment or withdrawal BEFORE creating
      // This prevents creating transactions with wrong status if they don't qualify for position generation
      let shouldShowModal = false;
      let isInvestment = false;
      let isWithdrawal = false;
      
      if (isTransfert && isTermine) {
        // Check transfer direction from form fields to determine if this qualifies for position generation
        const transferTo = transactionForm.to_field || 'solde';
        const transferFrom = transactionForm.from_field || 'solde';
        
        // Check if this is an investment (transfert to product) or withdrawal (transfert from product to solde)
        // Investment: transferTo is a product ID (not 'solde' or 'trading')
        isInvestment = transferTo && 
                      transferTo !== 'solde' && 
                      transferTo !== 'trading' &&
                      String(transferTo).trim() !== '';
        
        // Withdrawal: transferTo is 'solde' and transferFrom is a product ID (not 'solde')
        isWithdrawal = transferTo === 'solde' && 
                      transferFrom && 
                      transferFrom !== 'solde' &&
                      transferFrom !== 'trading' &&
                      String(transferFrom).trim() !== '';
        
        // Only show modal for actual investments or withdrawals (not solde-to-solde or solde-to-trading)
        const productHasAllocations = (productId: any) => {
          if (!productId) return false;
          const p = products.find((x: any) => String(x?.id) === String(productId));
          const allocations = (p as any)?.assetAllocations || (p as any)?.asset_allocations || [];
          return Array.isArray(allocations) && allocations.length > 0;
        };

        // Only show the modal when the product actually has external asset allocations configured.
        // Otherwise, validating the transfer should not trigger position generation.
        if (isInvestment) {
          shouldShowModal = productHasAllocations(transferTo);
        } else if (isWithdrawal) {
          shouldShowModal = productHasAllocations(transferFrom);
        } else {
          shouldShowModal = false;
        }
      }
      
      // Use temporary status "en_cours" ONLY if we're actually going to show the modal
      // This prevents transactions from being stuck in "en_cours" status
      const transactionStatus = shouldShowModal ? 'en_cours' : transactionForm.status;
      
      const payload: Record<string, any> = {
        type: transactionForm.type,
        amount: isConversion ? 0 : parseFloat(transactionForm.amount),
        description: transactionForm.description,
        status: isConversion ? 'valide' : transactionStatus,
        datetime: datetimeISO,
        skip_position_generation: shouldShowModal,
        ...(isConversion
          ? { to_currency: transactionForm.to_currency }
          : transactionForm.type === 'transfert'
            ? {
                from_field: transactionForm.from_field || 'solde',
                to_field: transactionForm.to_field || undefined,
                subscription_details: transactionForm.productId
                  ? {
                      productId: transactionForm.productId,
                      ...(transactionForm.interestPeriod ? { interestPeriod: transactionForm.interestPeriod } : {}),
                    }
                  : undefined,
              }
            : {}),
        ...((transactionForm.type === 'depot' || transactionForm.type === 'bonus') && needsEurAndRate && transactionForm.fx_rate_eur_to_account
          ? { subscription_details: { fx_rate_eur_to_account: parseFloat(transactionForm.fx_rate_eur_to_account) } }
          : {}),
        ...(transactionForm.type === 'depot' && transactionForm.bonus_amount && parseFloat(transactionForm.bonus_amount) > 0
          ? { bonus_amount: parseFloat(transactionForm.bonus_amount) }
          : {}),
        ...(transactionForm.type === 'interets'
          ? { subscription_details: { is_surperformance: !!transactionForm.is_surperformance } }
          : {}),
      };

      const response = await apiCall(`/api/clients/${clientId}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      // If we should show the modal, open it instead of closing the dialog
      if (shouldShowModal && response) {
        // Verify the transaction response matches our expectations
        const responseTransferTo = response.transfer_to || 
                                   response.to_field || 
                                   response.to || 
                                   response.transferTo ||
                                   null;
        const responseTransferFrom = response.transfer_from || 
                                    response.from_field || 
                                    response.from ||
                                    null;
        
        // Double-check that this is still an investment or withdrawal based on actual response
        const responseIsInvestment = responseTransferTo && 
                                    String(responseTransferTo) !== 'solde' && 
                                    String(responseTransferTo) !== 'trading';
        const responseIsWithdrawal = responseTransferTo === 'solde' && 
                                    responseTransferFrom && 
                                    String(responseTransferFrom) !== 'solde' &&
                                    String(responseTransferFrom) !== 'trading';
        
        // Only show modal if response confirms it's an investment or withdrawal
        // AND the involved product has asset allocations.
        const productHasAllocations = (productId: any) => {
          if (!productId) return false;
          const p = products.find((x: any) => String(x?.id) === String(productId));
          const allocations = (p as any)?.assetAllocations || (p as any)?.asset_allocations || [];
          return Array.isArray(allocations) && allocations.length > 0;
        };

        const responseEligibleForModal =
          (responseIsInvestment && productHasAllocations(responseTransferTo)) ||
          (responseIsWithdrawal && productHasAllocations(responseTransferFrom));

        if (responseEligibleForModal) {
          // Set the transaction for position generation
          setPositionModalSource('create');
          setTransactionForPositionGeneration(response);
          setIsWithdrawalForPositionGeneration(responseIsWithdrawal);
          setIsPositionGenerationModalOpen(true);
          // Keep the dialog closed (it was already closed or will be closed)
          setIsTransactionDialogOpen(false);
          // Reset form
          resetTransactionForm();
          // Don't call onRefresh yet - wait for modal to complete
          return;
        } else {
          // Transaction was created with 'en_cours' but doesn't qualify for modal
          // Update it back to 'valide' to match user's intent
          console.warn('Transaction created with en_cours status but does not qualify for position generation modal. Updating to valide.');
          try {
            await apiCall(`/api/clients/${clientId}/transactions/${response.id}/`, {
              method: 'PUT',
              body: JSON.stringify({
                ...response,
                status: 'valide',
                skip_position_generation: false // Allow backend to handle position generation if needed
              })
            });
          } catch (error: any) {
            console.error('Error updating transaction status back to valide:', error);
            toast.error('Erreur lors de la mise à jour du statut de la transaction');
            // Transaction exists in DB as 'en_cours' - close dialog and refresh so user can edit it
            setIsTransactionDialogOpen(false);
            loadTransactions(1, pagination.limit);
            loadContractDocuments();
            onRefresh();
            return; // Do not continue to success flow - transaction is stuck in 'en_cours'
          }
        }
      }
      
      toast.success('Transaction créée avec succès');
      // Optimistic UI update so the new row appears instantly.
      setTransactions((prev) => {
        const next = [response, ...prev.filter((t) => t?.id !== response?.id)];
        return next;
      });
      setIsTransactionDialogOpen(false);
      resetTransactionForm();
      // Reload first page to guarantee visibility of the newly created transaction.
      loadTransactions(1, pagination.limit);
      loadContractDocuments();
      onRefresh();
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      const msg = error?.response?.error || error.message || 'Erreur lors de la création de la transaction';
      toast.error(msg);
    } finally {
      setIsCreatingTransaction(false);
    }
  }

  const openEditModal = (transaction: any) => {
    setSelectedTransaction(transaction);
    setIsEditTransactionModalOpen(true);
  };

  const applyTransactionUpdate = (updatedTransaction?: any) => {
    if (!updatedTransaction?.id) return;

    setTransactions(prevTransactions =>
      prevTransactions.map(transaction =>
        transaction.id === updatedTransaction.id
          ? { ...transaction, ...updatedTransaction }
          : transaction
      )
    );

    setSelectedTransaction(prevSelected =>
      prevSelected?.id === updatedTransaction.id
        ? { ...prevSelected, ...updatedTransaction }
        : prevSelected
    );
  };

  const getAvailableStatuses = () => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    return typeConfig ? typeConfig.statuses : [];
  };

  const formatTransactionType = (type: string) => {
    return TRANSACTION_TYPES[type as keyof typeof TRANSACTION_TYPES]?.label || type;
  };

  const formatStatus = (status: string) => {
    return STATUS_LABELS[status] || status;
  };

  // Filter transactions based on filters
  const filteredTransactions = transactions.filter(transaction => {
    // Filter by types (multiple selection)
    if (filters.types.length > 0 && !filters.types.includes(transaction.type)) {
      return false;
    }
    
    // Filter by status
    if (filters.status !== 'all' && transaction.status !== filters.status) {
      return false;
    }
    
    // Filter by amount
    const amount = parseFloat(transaction.amount || 0);
    if (filters.amountMin && amount < parseFloat(filters.amountMin)) {
      return false;
    }
    if (filters.amountMax && amount > parseFloat(filters.amountMax)) {
      return false;
    }
    
    // Filter by date
    const transactionDate = new Date(transaction.datetime || transaction.createdAt);
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (transactionDate < fromDate) {
        return false;
      }
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (transactionDate > toDate) {
        return false;
      }
    }
    
    return true;
  });

  const isInterestEligibleTransfer = (transaction: any): boolean => {
    const type = String(transaction?.type || '').trim().toLowerCase();
    if (type !== 'transfert') return false;
    const statusValue = String(transaction?.status || '').trim().toLowerCase();
    if (!['valide', 'cloture'].includes(statusValue)) return false;
    const transferTo = String(transaction?.transfer_to ?? transaction?.to_field ?? transaction?.to ?? '').trim().toLowerCase();
    return transferTo !== '' && transferTo !== 'solde' && transferTo !== 'trading';
  };

  const handleToggleSelectTransaction = (transaction: any, checked: boolean) => {
    const txId = String(transaction?.id || '').trim();
    if (!txId) return;
    if (!isInterestEligibleTransfer(transaction)) return;
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(txId);
      else next.delete(txId);
      return next;
    });
  };

  const handleToggleSelectAllTransactions = (rows: any[], checked: boolean) => {
    const eligibleIds = rows
      .filter((row) => isInterestEligibleTransfer(row))
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean);
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      for (const txId of eligibleIds) {
        if (checked) next.add(txId);
        else next.delete(txId);
      }
      return next;
    });
  };

  const clearSelectedTransactions = () => {
    setSelectedTransactionIds(new Set());
  };

  const runBackfillMissingInterests = async (transactionIds: string[], dryRun: boolean) => {
    const response: any = await apiCall(`/api/clients/${clientId}/transactions/backfill-interests/`, {
      method: 'POST',
      body: JSON.stringify({
        transaction_ids: transactionIds,
        dry_run: dryRun,
      }),
    });
    return response;
  };

  const openBackfillPreviewModal = async () => {
    const transactionIds = Array.from(selectedTransactionIds);
    if (transactionIds.length === 0) return;
    try {
      setIsLoadingBackfillPreview(true);
      const response = await runBackfillMissingInterests(transactionIds, true);
      setPreviewTransactionIds(transactionIds);
      setBackfillPreviewResult(response);
      setIsBackfillPreviewModalOpen(true);
    } catch (error: any) {
      console.error('Error previewing missing interests:', error);
      toast.error(error?.message || 'Erreur lors de la prévisualisation des intérêts');
    } finally {
      setIsLoadingBackfillPreview(false);
    }
  };

  const handleConfirmBackfillMissingInterests = async () => {
    if (previewTransactionIds.length === 0) return;
    try {
      setIsBackfillingInterests(true);
      const response = await runBackfillMissingInterests(previewTransactionIds, false);
      const createdCount = Number(response?.created_count || 0);
      const checkedCount = Number(response?.checked_count || 0);
      const skippedCount = Number(response?.skipped_count || 0);
      toast.success(
        `${createdCount} intérêt(s) créé(s) • ${checkedCount} transaction(s) vérifiée(s) • ${skippedCount} ignorée(s)`
      );
      clearApiCache(`/api/clients/${clientId}/transactions/`);
      setIsBackfillPreviewModalOpen(false);
      setBackfillPreviewResult(null);
      setPreviewTransactionIds([]);
      clearSelectedTransactions();
      await loadTransactions(pagination.page, pagination.limit);
      await loadAllTransactionsForInterest();
      onRefresh();
    } catch (error: any) {
      console.error('Error backfilling missing interests:', error);
      toast.error(error?.message || 'Erreur lors de la création des intérêts manquants');
    } finally {
      setIsBackfillingInterests(false);
    }
  };

  const handleTypeFilterChange = (type: string, checked: boolean) => {
    if (checked) {
      setFilters(prev => ({ ...prev, types: [...prev.types, type] }));
    } else {
      setFilters(prev => ({ ...prev, types: prev.types.filter(t => t !== type) }));
    }
  };

  const clearFilters = () => {
    setFilters({
      types: [],
      status: 'all',
      amountMin: '',
      amountMax: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  const getTypeFilterDisplayText = () => {
    if (filters.types.length === 0) {
      return 'Tous les types';
    }
    if (filters.types.length === 1) {
      return TRANSACTION_TYPES[filters.types[0] as keyof typeof TRANSACTION_TYPES]?.label || filters.types[0];
    }
    return `${filters.types.length} types sélectionnés`;
  };

  // Check if we should show warning for product without available funds
  const shouldShowWarning = transactionForm.type === 'transfert' && 
                            transactionForm.from_field && 
                            transactionForm.from_field !== 'solde' && 
                            transactionForm.to_field === 'solde';
  
  const sourceProduct = shouldShowWarning 
    ? products.find((p: any) => p.id === transactionForm.from_field)
    : null;

  const transferProductId =
    transactionForm.from_field && transactionForm.from_field !== 'solde'
      ? transactionForm.from_field
      : (transactionForm.to_field && transactionForm.to_field !== 'solde' ? transactionForm.to_field : '');
  const transferProduct = transferProductId
    ? products.find((p: any) => String(p?.id) === String(transferProductId))
    : null;
  const interestPeriodOptions = getInterestPeriodOptions(transferProduct);
  const currencySym = getCurrencySymbol(accountCurrency);
  const activeFiltersCount =
    filters.types.length +
    (filters.status !== 'all' ? 1 : 0) +
    (filters.amountMin ? 1 : 0) +
    (filters.amountMax ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);
  
  const hasAvailableFunds = sourceProduct 
    ? (sourceProduct.availableFunds ?? sourceProduct.available_funds ?? false)
    : true;
  
  const showAvailableFundsWarning = shouldShowWarning && !hasAvailableFunds;

  useEffect(() => {
    clearSelectedTransactions();
    setIsBackfillPreviewModalOpen(false);
    setBackfillPreviewResult(null);
    setPreviewTransactionIds([]);
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => {
    setSelectedTransactionIds((prev) => {
      if (prev.size === 0) return prev;
      const eligibleCurrentIds = new Set(
        transactions
          .filter((transaction) => isInterestEligibleTransfer(transaction))
          .map((transaction) => String(transaction.id))
      );
      const next = new Set<string>();
      for (const txId of prev) {
        if (eligibleCurrentIds.has(txId)) next.add(txId);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Transactions</h2>
        <Button onClick={() => {
          setIsTransactionDialogOpen(true);
          resetTransactionForm();
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une transaction
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 min-h-8">
            <CardTitle className="text-base leading-none">Filtres</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFiltersCollapsed((prev) => !prev)}
              className="h-8 px-2 text-slate-600 hover:text-slate-900"
              aria-expanded={!isFiltersCollapsed}
              aria-label={isFiltersCollapsed ? 'Afficher les filtres' : 'Masquer les filtres'}
            >
              <span className="mr-1 text-xs">
                {isFiltersCollapsed ? 'Afficher' : 'Masquer'}
                {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isFiltersCollapsed ? '' : 'rotate-180'}`} />
            </Button>
          </div>
        </CardHeader>
        {!isFiltersCollapsed && (
        <CardContent className="pt-0 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3">
            {/* Type filter (multiple selection) */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Type de transaction</Label>
              <Popover open={isTypeFilterOpen} onOpenChange={setIsTypeFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="h-8 w-full justify-between rounded-md border-input bg-input-background px-3 text-sm text-black"
                  >
                    <span className="truncate">{getTypeFilterDisplayText()}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="max-h-64 overflow-y-auto p-2">
                    {Object.entries(TRANSACTION_TYPES).map(([key, config]) => (
                      <div key={key} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded">
                        <Checkbox
                          id={`type-filter-${key}`}
                          checked={filters.types.includes(key)}
                          onCheckedChange={(checked) => handleTypeFilterChange(key, checked as boolean)}
                        />
                        <Label 
                          htmlFor={`type-filter-${key}`} 
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {config.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status filter */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Statut</Label>
              <Select modal={false} value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount filter */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Montant ({currencySym})</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Min"
                  value={filters.amountMin}
                  onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })}
                  className="h-8 text-slate-700 placeholder:text-slate-500"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Max"
                  value={filters.amountMax}
                  onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })}
                  className="h-8 text-slate-700 placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Date filter */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Date de début</Label>
              <DateInputWithCalendar
                value={filters.dateFrom}
                onChange={(value) => setFilters({ ...filters, dateFrom: value })}
                className="h-8"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Date de fin</Label>
              <DateInputWithCalendar
                value={filters.dateTo}
                onChange={(value) => setFilters({ ...filters, dateTo: value })}
                className="h-8"
              />
            </div>

            {/* Clear filters button */}
            <div className="space-y-1">
              <Label className="opacity-0">Actions</Label>
              <Button
                variant="outline"
                onClick={clearFilters}
                className="h-8 w-full rounded-md px-3 text-sm"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {selectedTransactionIds.size > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-col items-start gap-2">
            <div className="text-sm text-slate-700">
              {selectedTransactionIds.size} transaction(s) sélectionnée(s)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={clearSelectedTransactions} disabled={isBackfillingInterests || isLoadingBackfillPreview}>
                Annuler la sélection
              </Button>
              <Button onClick={openBackfillPreviewModal} disabled={isBackfillingInterests || isLoadingBackfillPreview}>
                {isLoadingBackfillPreview ? 'Prévisualisation...' : 'Prévisualiser les intérêts manquants'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isBackfillPreviewModalOpen && (
        <div className="modal-overlay" onClick={() => {
          if (isBackfillingInterests) return;
          setIsBackfillPreviewModalOpen(false);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '48rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Prévisualisation des intérêts manquants</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                disabled={isBackfillingInterests}
                onClick={() => {
                  setIsBackfillPreviewModalOpen(false);
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {Number(backfillPreviewResult?.created_count || 0) > 0
                  ? 'Voici les intérêts qui seront créés après validation.'
                  : 'Aucun intérêt à créer pour la sélection actuelle.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Transactions vérifiées</div>
                  <div className="text-lg font-semibold text-slate-800">{Number(backfillPreviewResult?.checked_count || 0)}</div>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs text-emerald-700">Intérêts à créer</div>
                  <div className="text-lg font-semibold text-emerald-800">{Number(backfillPreviewResult?.created_count || 0)}</div>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Transactions ignorées</div>
                  <div className="text-lg font-semibold text-slate-800">{Number(backfillPreviewResult?.skipped_count || 0)}</div>
                </div>
              </div>

              {Array.isArray(backfillPreviewResult?.results) && backfillPreviewResult.results.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2 px-3">Transaction source</th>
                        <th className="text-left py-2 px-3">Périodes vérifiées</th>
                        <th className="text-left py-2 px-3">Intérêts à créer</th>
                        <th className="text-left py-2 px-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backfillPreviewResult.results.map((row: any) => {
                        const sourceId = String(row?.source_transaction_id || '-');
                        const periodsChecked = Number(row?.periods_checked || 0);
                        const toCreateCount = Number(row?.created_count || 0);
                        const skippedReason = row?.skipped_reason ? String(row.skipped_reason) : '';
                        const statusText = toCreateCount > 0 ? 'À créer' : (skippedReason || 'Aucun intérêt à créer');
                        return (
                          <tr key={sourceId} className="border-b border-slate-100 last:border-b-0">
                            <td className="py-2 px-3 text-slate-700">{sourceId}</td>
                            <td className="py-2 px-3 text-slate-700">{periodsChecked}</td>
                            <td className="py-2 px-3 text-slate-700">{toCreateCount}</td>
                            <td className="py-2 px-3 text-slate-700">{statusText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-form-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBackfillingInterests}
                  onClick={() => setIsBackfillPreviewModalOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  disabled={isBackfillingInterests || Number(backfillPreviewResult?.created_count || 0) <= 0}
                  onClick={handleConfirmBackfillMissingInterests}
                >
                  {isBackfillingInterests ? 'Création en cours...' : 'Valider la création'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isTransactionDialogOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsTransactionDialogOpen(false);
          resetTransactionForm();
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '36rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Nouvelle transaction</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => {
                  setIsTransactionDialogOpen(false);
                  setIsCreatingTransaction(false);
                  resetTransactionForm();
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleCreateTransaction} className="modal-form">
              <div className="grid grid-cols-2" style={{ columnGap: '2rem', rowGap: '1rem' }}>
              <div className="modal-form-field">
                <Label>Type</Label>
                <Select modal={false} value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[1050]" style={{ zIndex: 1050 }}>
                    {Object.entries(TRANSACTION_TYPES).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {transactionForm.type === 'transfert' && (
                <>
                  <ProductTransferSelect
                    label="Transfert de"
                    value={transactionForm.from_field || 'solde'}
                    products={products}
                    onValueChange={(nextFrom) => {
                      const nextProductId = nextFrom !== 'solde' ? nextFrom : (transactionForm.to_field !== 'solde' ? transactionForm.to_field : '');
                      const toField = transactionForm.to_field || 'solde';
                      let fromName = 'Solde';
                      let toName = 'Solde';

                      if (nextFrom !== 'solde') {
                        const fromProduct = products.find((p: any) => p.id === nextFrom);
                        if (fromProduct) fromName = fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
                      }
                      if (toField !== 'solde') {
                        const toProduct = products.find((p: any) => p.id === toField);
                        if (toProduct) toName = toProduct.name + (toProduct.reference ? ` (${toProduct.reference})` : '');
                      }

                      setTransactionForm({
                        ...transactionForm,
                        from_field: nextFrom,
                        productId: nextProductId,
                        description: `Transfert de ${fromName} vers ${toName}.`,
                      });
                    }}
                  />

                  <ProductTransferSelect
                    label="Transfert vers"
                    value={transactionForm.to_field || 'solde'}
                    products={products}
                    onValueChange={(nextTo) => {
                      const nextProductId = transactionForm.from_field !== 'solde' ? transactionForm.from_field : (nextTo !== 'solde' ? nextTo : '');
                      const fromField = transactionForm.from_field || 'solde';
                      let fromName = 'Solde';
                      let toName = 'Solde';

                      if (fromField !== 'solde') {
                        const fromProduct = products.find((p: any) => p.id === fromField);
                        if (fromProduct) fromName = fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
                      }
                      if (nextTo !== 'solde') {
                        const toProduct = products.find((p: any) => p.id === nextTo);
                        if (toProduct) toName = toProduct.name + (toProduct.reference ? ` (${toProduct.reference})` : '');
                      }

                      setTransactionForm({
                        ...transactionForm,
                        to_field: nextTo,
                        productId: nextProductId,
                        description: `Transfert de ${fromName} vers ${toName}.`,
                      });
                    }}
                  />

                  {transferProduct && (
                    <div className="modal-form-field">
                      <Label>Période d&apos;intérêt</Label>
                      <Select
                        value={transactionForm.interestPeriod}
                        onValueChange={(value) =>
                          setTransactionForm({
                            ...transactionForm,
                            interestPeriod: value,
                          })
                        }
                      >
                        <SelectTrigger className="text-slate-700 [&[data-placeholder]]:text-slate-600">
                          <SelectValue placeholder="Sélectionnez une période d'intérêt" />
                        </SelectTrigger>
                        <SelectContent className="z-[1050]" style={{ zIndex: 1050 }}>
                          {interestPeriodOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Warning message for products without available funds */}
                  {showAvailableFundsWarning && (
                    <div className="modal-form-field col-span-2">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="font-semibold text-yellow-800 mb-1">⚠️ Attention</div>
                        <div className="text-sm text-yellow-700">
                          Ce produit ne permet pas le retrait des fonds avant la fin du contrat.
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {transactionForm.type === 'conversion' && (
                <div className="modal-form-field col-span-2">
                  <Label>Devise cible</Label>
                  <Select
                    value={transactionForm.to_currency}
                    onValueChange={(value) => setTransactionForm({ ...transactionForm, to_currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner la devise" />
                    </SelectTrigger>
                    <SelectContent className="z-[1050]" style={{ zIndex: 1050 }}>
                      {['EUR', 'USD', 'CHF']
                        .filter((ccy) => ccy !== (client?.accountCurrency || client?.account_currency || 'EUR'))
                        .map((ccy) => (
                          <SelectItem key={ccy} value={ccy}>
                            {ccy === 'EUR' ? 'Euro (€)' : ccy === 'USD' ? 'Dollar US ($)' : 'Franc suisse (CHF)'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Conversion du solde entier ({client?.accountCurrency || client?.account_currency || 'EUR'}) vers la devise cible. Aucun fonds investi dans des produits.
                  </p>
                </div>
              )}

              <div className="modal-form-field">
                <Label>Date</Label>
                <div className="flex">
                  <Input
                    type="text"
                    value={dateDisplay}
                    placeholder="JJ/MM/AAAA"
                    className="rounded-r-none border-r-0"
                    onChange={(e) => {
                      const v = e.target.value;
                      setDateDisplay(v);
                      const parsed = buildDatetimeFromDisplay(v, timeDisplay);
                      if (parsed) setTransactionForm((prev) => ({ ...prev, datetime: parsed }));
                    }}
                    required
                  />
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0 rounded-none border-l-0 px-3"
                        aria-label="Ouvrir le calendrier"
                      >
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border shadow-lg z-[1050]" align="end" style={{ zIndex: 1050 }}>
                      <SimpleCalendar
                        selected={selectedDateForCalendar}
                        onSelect={(date) => {
                          if (!date) return;
                          const nextDate = buildDisplayDateFromDate(date);
                          setDateDisplay(nextDate);
                          const parsed = buildDatetimeFromDisplay(nextDate, timeDisplay);
                          if (parsed) {
                            setTransactionForm((prev) => ({ ...prev, datetime: parsed }));
                          }
                          setIsDatePickerOpen(false);
                        }}
                        className="min-w-[260px]"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="modal-form-field">
                <Label>Heure</Label>
                <Input
                  type="text"
                  value={timeDisplay}
                  placeholder="HH:mm"
                  onChange={(e) => {
                    const v = e.target.value;
                    setTimeDisplay(v);
                    const parsed = buildDatetimeFromDisplay(dateDisplay, v);
                    if (parsed) setTransactionForm((prev) => ({ ...prev, datetime: parsed }));
                  }}
                  required
                />
              </div>
              {transactionForm.type !== 'conversion' && (
                <>
                  <div className="modal-form-field">
                    <Label>
                      Montant ({needsEurInputAndConversion ? 'EUR' : currencySym})
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                      required
                    />
                  </div>
                  {transactionForm.type === 'depot' && (
                    <div className="modal-form-field">
                      <Label>Bonus (optionnel)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ex. 50"
                        value={transactionForm.bonus_amount}
                        onChange={(e) => setTransactionForm({ ...transactionForm, bonus_amount: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Crée une transaction bonus en parallèle si rempli
                      </p>
                    </div>
                  )}
                  {needsEurInputAndConversion && (
                    <div className="modal-form-field">
                      <Label>Taux de conversion EUR → {accountCurrency}</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        min="0.00001"
                        placeholder="Ex. 0.95"
                        value={transactionForm.fx_rate_eur_to_account}
                        onChange={(e) => setTransactionForm({ ...transactionForm, fx_rate_eur_to_account: e.target.value })}
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Le montant en {accountCurrency} enregistré sera : montant EUR × taux
                      </p>
                    </div>
                  )}
                  {transactionForm.type === 'interets' && (
                    <div className="modal-form-field flex items-start gap-2">
                      <Checkbox
                        id="is_surperformance"
                        checked={!!transactionForm.is_surperformance}
                        onCheckedChange={(checked) =>
                          setTransactionForm({ ...transactionForm, is_surperformance: !!checked })
                        }
                        className="mt-0.5 shrink-0"
                      />
                      <Label htmlFor="is_surperformance" className="cursor-pointer leading-tight text-sm">Surperformance (intérêts supplémentaires)</Label>
                    </div>
                  )}
                </>
              )}
              <div className="modal-form-field col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                  placeholder="Description de la transaction"
                />
                {transactionForm.type === 'depot' && (
                  <div className="flex flex-col gap-1 mt-1.5 p-2 rounded bg-slate-100">
                    <span className="text-[11px] text-slate-500">Suggestion</span>
                    <div className="flex flex-wrap gap-1 items-center">
                      {['Virement SEPA', 'CB'].map((suggestion, i) => (
                        <React.Fragment key={suggestion}>
                          {i > 0 && <span className="text-slate-400 text-[10px]">|</span>}
                          <button
                            type="button"
                            className="text-[11px] px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
                            onClick={() => setTransactionForm({ ...transactionForm, description: suggestion })}
                          >
                            {suggestion}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-form-field">
                <Label>Statut</Label>
                <Select modal={false} value={transactionForm.status} onValueChange={(value) => setTransactionForm({ ...transactionForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[1050]" style={{ zIndex: 1050 }}>
                    {getAvailableStatuses().map((status) => (
                      <SelectItem key={status} value={status}>
                        {getStatusLabel(status, transactionForm.type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </div>
              <div className="modal-form-actions mt-4">
                <Button type="button" variant="outline" disabled={isCreatingTransaction}                 onClick={() => {
                  setIsTransactionDialogOpen(false);
                  setIsCreatingTransaction(false);
          resetTransactionForm();
        }}>
          Annuler
                </Button>
                <Button type="submit" disabled={isCreatingTransaction}>
                  {isCreatingTransaction ? 'Création...' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transactions ({loading ? '...' : pagination.total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingIndicator />
              <p className="mt-4 text-slate-500">Chargement des transactions...</p>
            </div>
          ) : (
            <>
              {loading && transactions.length > 0 && (
                <div className="flex items-center justify-center py-4 mb-4">
                  <LoadingIndicator />
                </div>
              )}
              <TransactionList
                transactions={filteredTransactions}
                assets={assets}
                products={products}
                clientId={clientId}
                transactionDocuments={contractDocumentsByTransaction}
                showContractColumn={true}
                accountCurrency={accountCurrency}
                showClientColumn={false}
                showInterestTrackingColumns={true}
                allTransactionsForInterest={allTransactionsForInterest}
                showIcons={false}
                selectable={true}
                selectedTransactionIds={selectedTransactionIds}
                onToggleSelect={handleToggleSelectTransaction}
                onToggleSelectAll={handleToggleSelectAllTransactions}
                isRowSelectable={isInterestEligibleTransfer}
                onContractDocumentsChanged={() => {
                  loadContractDocuments();
                }}
                onView={(transaction) => {
                  setSelectedTransaction(transaction);
                  setIsViewTransactionModalOpen(true);
                }}
                onEdit={(transaction) => {
                  openEditModal(transaction);
                }}
                onValidateAndGenerate={handleValidateAndGenerate}
                onRecoverPositions={handleOpenRecoverPositionsModal}
                emptyMessage="Aucune transaction"
              />

              {unlinkedContractDocuments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="text-sm font-semibold text-slate-700 mb-3">
                    Contrats sans transaction
                  </div>
                  <ul className="list-none p-0 m-0 space-y-2">
                    {unlinkedContractDocuments.map((doc: any) => (
                      <li key={doc.id} className="flex items-center gap-2">
                        <a
                          href={doc?.fileUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => { if (!doc?.fileUrl) e.preventDefault(); }}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                        >
                          {doc?.name || 'Contrat'}
                        </a>
                        {doc?.productName ? (
                          <span className="text-slate-500 text-sm">— Produit : {doc.productName}</span>
                        ) : null}
                        {doc?.description && (
                          <span className="text-slate-500 text-sm">— {doc.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Pagination Controls */}
              {pagination.total_pages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-200">
                  <div className="text-sm text-slate-600">
                    Page {pagination.page} sur {pagination.total_pages} ({pagination.total} transactions)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (pagination.page > 1) {
                          loadTransactions(1, pagination.limit);
                        }
                      }}
                      disabled={pagination.page <= 1 || loading}
                      title="Première page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <ChevronLeft className="w-4 h-4 -ml-2" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (pagination.page > 1) {
                          loadTransactions(pagination.page - 1, pagination.limit);
                        }
                      }}
                      disabled={pagination.page <= 1 || loading}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Précédent
                    </Button>
                    
                    {/* Page Numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                        let pageNum: number;
                        if (pagination.total_pages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.total_pages - 2) {
                          pageNum = pagination.total_pages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={pagination.page === pageNum ? "default" : "outline"}
                            size="sm"
                            className="min-w-[2.5rem]"
                            onClick={() => loadTransactions(pageNum, pagination.limit)}
                            disabled={loading}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (pagination.page < pagination.total_pages) {
                          loadTransactions(pagination.page + 1, pagination.limit);
                        }
                      }}
                      disabled={pagination.page >= pagination.total_pages || loading}
                    >
                      Suivant
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (pagination.page < pagination.total_pages) {
                          loadTransactions(pagination.total_pages, pagination.limit);
                        }
                      }}
                      disabled={pagination.page >= pagination.total_pages || loading}
                      title="Dernière page"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <ChevronRight className="w-4 h-4 -ml-2" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* View Transaction Modal */}
      <ViewTransactionModal
        isOpen={isViewTransactionModalOpen}
        transaction={selectedTransaction}
        clientId={clientId}
        assets={assets}
        products={products}
        accountCurrency={accountCurrency}
        onClose={() => {
          setIsViewTransactionModalOpen(false);
          setSelectedTransaction(null);
        }}
        onRefresh={() => {
          loadTransactions(pagination.page, pagination.limit);
          onRefresh();
        }}
      />

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={isEditTransactionModalOpen}
        transaction={selectedTransaction}
        clientId={clientId}
        accountCurrency={accountCurrency}
        onClose={() => {
          setIsEditTransactionModalOpen(false);
          setSelectedTransaction(null);
        }}
        onSuccess={(updatedTransaction) => {
          applyTransactionUpdate(updatedTransaction);
          loadTransactions(pagination.page, pagination.limit);
          loadContractDocuments();
          onRefresh();
        }}
      />

      {/* Position Generation Modal - Shows after creating/editing transaction with status "valide" */}
      {transactionForPositionGeneration && (
        <PositionGenerationModal
          isOpen={isPositionGenerationModalOpen}
          transaction={transactionForPositionGeneration}
          clientId={clientId}
          accountCurrency={accountCurrency}
          onClose={() => {
            const isValidate = positionModalSource === 'validate';
            const isRecovery = positionModalSource === 'recovery';
            setIsPositionGenerationModalOpen(false);
            setTransactionForPositionGeneration(null);
            setIsWithdrawalForPositionGeneration(false);
            setPositionModalSource('create');
            setIsTransactionDialogOpen(false);
            if (isRecovery) {
              toast.info('Génération des positions annulée.');
            } else if (isValidate) {
              toast.info('La validation requiert la génération des positions. La transaction reste en cours.');
            } else {
              toast.info('Transaction créée avec le statut "En cours". Vous pouvez la finaliser plus tard.');
            }
            loadTransactions(pagination.page, pagination.limit);
            loadContractDocuments();
            onRefresh();
          }}
          onSuccess={async () => {
            const successModalSource = positionModalSource;
            // Update transaction status to "valide" after position generation completes
            if (transactionForPositionGeneration) {
              try {
                // Keep datetime in local format, don't convert to UTC
                let datetimeISO = transactionForPositionGeneration.datetime;
                if (datetimeISO && typeof datetimeISO === 'string') {
                  // If it's already in ISO format, keep it
                  if (!datetimeISO.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                    // Otherwise format it properly
                    const dt = new Date(datetimeISO);
                    const year = dt.getFullYear();
                    const month = String(dt.getMonth() + 1).padStart(2, '0');
                    const day = String(dt.getDate()).padStart(2, '0');
                    const hours = String(dt.getHours()).padStart(2, '0');
                    const minutes = String(dt.getMinutes()).padStart(2, '0');
                    const seconds = String(dt.getSeconds()).padStart(2, '0');
                    datetimeISO = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
                  }
                } else {
                  // Fallback to current datetime if missing
                  const now = new Date();
                  const year = now.getFullYear();
                  const month = String(now.getMonth() + 1).padStart(2, '0');
                  const day = String(now.getDate()).padStart(2, '0');
                  const hours = String(now.getHours()).padStart(2, '0');
                  const minutes = String(now.getMinutes()).padStart(2, '0');
                  const seconds = String(now.getSeconds()).padStart(2, '0');
                  datetimeISO = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
                }
                
                await apiCall(`/api/clients/${clientId}/transactions/${transactionForPositionGeneration.id}/`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    type: transactionForPositionGeneration.type,
                    amount: parseFloat(transactionForPositionGeneration.amount),
                    description: transactionForPositionGeneration.description,
                    status: 'valide', // Update to final status
                    datetime: datetimeISO,
                    skip_position_generation: true // Skip since positions already generated
                  })
                });
              } catch (error: any) {
                console.error('Error updating transaction status:', error);
                toast.error('Erreur lors de la mise à jour du statut de la transaction');
              }
            }
            setIsPositionGenerationModalOpen(false);
            setTransactionForPositionGeneration(null);
            setIsWithdrawalForPositionGeneration(false);
            setPositionModalSource('create');
            setIsTransactionDialogOpen(false);
            toast.success(
              successModalSource === 'recovery'
                ? 'Positions enregistrées avec succès'
                : 'Transaction créée avec succès'
            );
            // After modal completion, bring newest rows immediately.
            loadTransactions(1, pagination.limit);
            loadContractDocuments();
            onRefresh();
          }}
          isWithdrawal={isWithdrawalForPositionGeneration}
        />
      )}
    </div>
  );
}

