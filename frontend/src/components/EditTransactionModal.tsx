import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { ProductTransferSelect } from './ProductTransferSelect';
import { X, Trash2 } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import { TRANSACTION_TYPES, STATUS_LABELS, getStatusLabel } from './transactionUtils';
import { getCurrencySymbol } from '../utils/currency';
import { PositionGenerationModal, PositionGenerationSuccessResult } from './PositionGenerationModal';
import '../styles/Modal.css';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: any;
  clientId: string;
  accountCurrency?: string;
  onClose: () => void;
  onSuccess: (updatedTransaction?: any) => void;
}

export function EditTransactionModal({
  isOpen,
  transaction,
  clientId,
  accountCurrency: accountCurrencyProp = 'EUR',
  onClose,
  onSuccess
}: EditTransactionModalProps) {
  const currencySym = getCurrencySymbol(accountCurrencyProp);
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

  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en_attente_paiement',
    datetime: '',
    from_field: 'solde',
    to_field: 'solde',
    productId: '',
    interestPeriod: '',
    is_surperformance: false,
  });
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<string | null>(null);
  const [isWithdrawalTransaction, setIsWithdrawalTransaction] = useState(false);
  const [isClosingTransfer, setIsClosingTransfer] = useState(false);
  const [transferProduct, setTransferProduct] = useState<any>(null);
  const [loadingTransferProduct, setLoadingTransferProduct] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [dateDisplay, setDateDisplay] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');

  // Format internal YYYY-MM-DDTHH:mm -> DD/MM/YYYY and HH:mm for display
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

  // Parse DD/MM/YYYY -> valid or null; validates real calendar dates (e.g. rejects Feb 31)
  const parseDate = (s: string): { y: number; m: number; d: number } | null => {
    const t = s.trim();
    const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    // Ensure day is valid for the month (reject e.g. Feb 31, Apr 31)
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

  // Build YYYY-MM-DDTHH:mm from separate date and time display strings
  const buildDatetimeFromDisplay = (dateStr: string, timeStr: string): string | null => {
    const date = parseDate(dateStr);
    const time = parseTime(timeStr);
    if (!date) return null;
    const monthStr = String(date.m).padStart(2, '0');
    const dayStr = String(date.d).padStart(2, '0');
    const hours = time ? time.h : 0;
    const minutes = time ? time.min : 0;
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    return `${date.y}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}`;
  };

  const bustTransactionsCache = (cid: string) => {
    // apiCall caches GET requests; after a successful edit we must bust list caches
    // so the table refresh doesn't overwrite local updates with stale cached rows.
    if (cid) {
      clearApiCache(`/api/clients/${cid}/transactions/`);
      clearApiCache(`/api/clients/${cid}/transactions/?`);
    }
    clearApiCache('/api/transactions/');
    clearApiCache('/api/transactions/?');
  };

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

  const productHasAllocations = async (productId: any): Promise<boolean> => {
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

  // Initialize form when transaction changes
  useEffect(() => {
    if (isOpen && transaction) {
      // Parse datetime ensuring correct format for datetime-local input
      let datetimeLocal = '';
      const datetimeValue = transaction.datetime || transaction.createdAt;
      
      if (datetimeValue) {
        // For ISO strings, extract the date/time part directly without timezone conversion
        if (typeof datetimeValue === 'string' && datetimeValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) {
          // ISO format: 2024-01-15T14:30:00 or 2024-01-15T14:30:00.000Z
          // Extract just the date and time part (ignore timezone and seconds)
          const match = datetimeValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
          if (match) {
            // Rebuild in datetime format: YYYY-MM-DDTHH:mm
            datetimeLocal = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
          }
        }
        
        // If we couldn't parse it as ISO string, try as Date object
        // But treat it as a local datetime string by removing timezone indicators
        if (!datetimeLocal && datetimeValue) {
          try {
            // Remove timezone indicators (Z, +00:00, -02:00, etc.) to treat as local time
            const cleanDateStr = String(datetimeValue).replace(/Z|[+-]\d{2}:\d{2}$/, '');
            const transactionDate = new Date(cleanDateStr);
            
            if (!isNaN(transactionDate.getTime())) {
              const year = transactionDate.getFullYear();
              const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
              const day = String(transactionDate.getDate()).padStart(2, '0');
              const hours = String(transactionDate.getHours()).padStart(2, '0');
              const minutes = String(transactionDate.getMinutes()).padStart(2, '0');
              datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
            }
          } catch (e) {
            console.error('EditTransactionModal - Failed to parse datetime:', e);
          }
        }
      }
      
      setDateDisplay(formatDisplayDate(datetimeLocal));
      setTimeDisplay(formatDisplayTime(datetimeLocal));
      setTransactionForm({
        type: transaction.type,
        amount: transaction.amount?.toString() || '',
        description: transaction.description || '',
        status: transaction.status || 'en_cours',
        datetime: datetimeLocal,
        from_field: transaction.transfer_from || transaction.from_field || transaction.from || 'solde',
        to_field: transaction.transfer_to || transaction.to_field || transaction.to || 'solde',
        productId:
          transaction.productId ||
          transaction.product_id ||
          transaction.product?.id ||
          transaction.transfer_to ||
          transaction.transfer_from ||
          '',
        interestPeriod:
          transaction.subscription_interest_period ||
          transaction.subscription_details?.interestPeriod ||
          transaction.subscription_details?.interest_period ||
          '',
        is_surperformance: !!transaction?.subscription_details?.is_surperformance,
      });
    }
  }, [isOpen, transaction]);

  // Load products for transfer selectors (same source as creation flow).
  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      if (!isOpen) return;
      try {
        const productsData = await apiCall('/api/products/').catch(() => ({ products: [] }));
        if (!cancelled) {
          setProducts(productsData.products || productsData || []);
        }
      } catch (error) {
        console.error('Error loading products for edit modal:', error);
        if (!cancelled) setProducts([]);
      }
    };
    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Load related transfer product to expose interest period choices in edit mode.
  useEffect(() => {
    let cancelled = false;
    const loadTransferProduct = async () => {
      if (!isOpen || !transaction || transactionForm.type !== 'transfert') {
        setTransferProduct(null);
        setLoadingTransferProduct(false);
        return;
      }

      const transferTo = transactionForm.to_field || transaction.transfer_to || transaction.to_field || transaction.to || transaction.transferTo || null;
      const transferFrom = transactionForm.from_field || transaction.transfer_from || transaction.from_field || null;
      const productIdFromSubscription =
        transaction.subscription_details?.productId ||
        transaction.subscriptionDetails?.productId ||
        transaction.product_id ||
        transaction.product?.id ||
        null;
      const productId =
        (transactionForm.productId ? transactionForm.productId : null) ||
        (transferTo && transferTo !== 'solde' ? transferTo : null) ||
        (transferFrom && transferFrom !== 'solde' ? transferFrom : null) ||
        productIdFromSubscription;

      if (!productId) {
        setTransferProduct(null);
        setLoadingTransferProduct(false);
        return;
      }

      setLoadingTransferProduct(true);
      try {
        const res: any = await apiCall(`/api/products/${String(productId)}/`, { method: 'GET' });
        if (!cancelled) {
          setTransferProduct(res?.product || res || null);
        }
      } catch {
        if (!cancelled) {
          setTransferProduct(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingTransferProduct(false);
        }
      }
    };

    loadTransferProduct();
    return () => {
      cancelled = true;
    };
  }, [isOpen, transaction, transactionForm.type, transactionForm.to_field, transactionForm.from_field, transactionForm.productId]);

  // Ensure selected interest period remains valid for the selected product.
  useEffect(() => {
    if (transactionForm.type !== 'transfert') {
      if (transactionForm.interestPeriod) {
        setTransactionForm(prev => ({ ...prev, interestPeriod: '' }));
      }
      return;
    }
    if (!transferProduct) return;

    const options = getInterestPeriodOptions(transferProduct);
    if (!transactionForm.interestPeriod || !options.includes(transactionForm.interestPeriod)) {
      setTransactionForm(prev => ({
        ...prev,
        interestPeriod: options.length === 1 ? options[0] : '',
      }));
    }
  }, [transactionForm.type, transactionForm.interestPeriod, transferProduct]);

  // Update status when type changes
  useEffect(() => {
    if (isOpen && transactionForm.type) {
      const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
      if (typeConfig && !typeConfig.statuses.includes(transactionForm.status)) {
        setTransactionForm(prev => ({ ...prev, status: typeConfig.statuses[0] }));
      }
    }
  }, [transactionForm.type, transactionForm.status, isOpen]);

  const getAvailableStatuses = () => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    return typeConfig ? typeConfig.statuses : [];
  };

  const handleClose = () => {
    setDateDisplay('');
    setTimeDisplay('');
    setIsClosingTransfer(false);
    setTransactionForm({
      type: 'depot',
      amount: '',
      description: '',
      status: 'en_attente_paiement',
      datetime: '',
      from_field: 'solde',
      to_field: 'solde',
      productId: '',
      interestPeriod: '',
      is_surperformance: false,
    });
    setTransferProduct(null);
    onClose();
  };

  const buildSubscriptionDetailsForUpdate = () => {
    const existing = transaction?.subscription_details && typeof transaction.subscription_details === 'object'
      ? { ...transaction.subscription_details }
      : {};
    const productId =
      transactionForm.productId ||
      (transactionForm.to_field && transactionForm.to_field !== 'solde' ? transactionForm.to_field : undefined) ||
      (transactionForm.from_field && transactionForm.from_field !== 'solde' ? transactionForm.from_field : undefined) ||
      existing.productId ||
      transaction?.product?.id ||
      transaction?.product_id ||
      transaction?.transfer_to ||
      transaction?.transfer_from ||
      undefined;
    return {
      ...existing,
      ...(productId && productId !== 'solde' ? { productId } : {}),
      interestPeriod: transactionForm.interestPeriod || '',
      interest_period: transactionForm.interestPeriod || '',
    };
  };

  const buildUpdatePayload = (
    statusValue: string,
    skipPositionGeneration: boolean,
    overrides?: { datetime?: string }
  ) => {
    const datetimeSource = overrides?.datetime ?? transactionForm.datetime;
    // Don't convert to UTC - keep the local datetime as-is
    // datetimeSource is in format YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss (local time)
    let datetimeISO = '';
    if (datetimeSource) {
      const timePart = datetimeSource.split('T')[1] ?? '';
      const hasSeconds = timePart.split(':').length >= 3;
      datetimeISO = hasSeconds
        ? datetimeSource
        : datetimeSource.includes(':')
          ? `${datetimeSource}:00`
          : datetimeSource;
    }
    
    return {
      type: transactionForm.type,
      amount: parseFloat(transactionForm.amount),
      description: transactionForm.description,
      status: statusValue,
      datetime: datetimeISO,
      skip_position_generation: skipPositionGeneration,
      ...(transactionForm.type === 'transfert'
        ? {
            from_field: transactionForm.from_field || 'solde',
            to_field: transactionForm.to_field || 'solde',
            subscription_details: buildSubscriptionDetailsForUpdate(),
            interestPeriod: transactionForm.interestPeriod || '',
          }
        : {}),
      ...(transactionForm.type === 'interets'
        ? {
            subscription_details: {
              ...(transaction?.subscription_details && typeof transaction.subscription_details === 'object'
                ? transaction.subscription_details
                : {}),
              is_surperformance: !!transactionForm.is_surperformance,
            },
          }
        : {}),
    };
  };

  const getClosureInvestmentProductId = (): string | null => {
    if (!transaction) return null;
    if (transactionForm.type !== 'transfert') return null;
    if (transaction.status !== 'valide') return null;

    const fromField = String(transactionForm.from_field || '').trim();
    const toField = String(transactionForm.to_field || '').trim();

    if (fromField !== 'solde') return null;
    if (!toField || toField === 'solde' || toField === 'trading') return null;

    return toField;
  };

  const handleCloseTransfer = async () => {
    if (!transaction || isClosingTransfer) return;

    const productId = getClosureInvestmentProductId();
    if (!productId) {
      toast.error("Cette transaction n'est pas éligible à une clôture automatique.");
      return;
    }

    const confirmed = confirm(
      'Clôturer ce transfert va créer un retrait validé vers le solde pour la totalité des fonds encore investis sur ce produit. Continuer ?'
    );
    if (!confirmed) return;

    setIsClosingTransfer(true);
    try {
      const closureData: any = await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/close/`, {
        method: 'POST',
      });

      bustTransactionsCache(clientId);
      const deletedPending = Number(closureData?.deleted_pending_positions ?? 0);
      const remainingInterests = Number(closureData?.remaining_interests_amount ?? 0);
      const successMessage = remainingInterests > 0
        ? `Clôture effectuée: transfert vers solde, intérêts restants créés, ${deletedPending} position(s) en attente supprimée(s).`
        : `Clôture effectuée: transfert vers solde, ${deletedPending} position(s) en attente supprimée(s).`;
      toast.success(successMessage);
      handleClose();
      onSuccess(closureData?.source_transaction || closureData);
    } catch (error: any) {
      console.error('Error closing transfer:', error);
      toast.error(error.message || 'Erreur lors de la clôture du transfert');
    } finally {
      setIsClosingTransfer(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!transaction) return;
    
    const effectiveStatus = transactionForm.status;
    
    if (!dateDisplay.trim()) {
      toast.error('La date est requise');
      return;
    }
    if (!timeDisplay.trim()) {
      toast.error('L\'heure est requise');
      return;
    }
    const submittedDatetime = buildDatetimeFromDisplay(dateDisplay, timeDisplay);
    if (!submittedDatetime) {
      toast.error('Format de date invalide. Utilisez JJ/MM/AAAA pour la date et HH:mm pour l\'heure.');
      return;
    }

    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) {
      toast.error('Le montant doit être supérieur à 0');
      return;
    }

    if (transactionForm.type === 'transfert' && transferProduct && !String(transactionForm.interestPeriod || '').trim()) {
      toast.error("La période d'intérêt est obligatoire pour un transfert impliquant un produit.");
      return;
    }
    
    // Check if this is a transfert transaction changing to "valide"
    // Only show modal if status is changing FROM something else TO "valide"
    // If status was already "valide", no need to regenerate positions
    const isTransfert = transactionForm.type === 'transfert';
    const wasAlreadyTermine = ['valide', 'cloture'].includes(String(transaction.status || '').trim().toLowerCase());
    const isChangingToTermine = effectiveStatus === 'valide' && 
                                 !wasAlreadyTermine;
    
    if (isTransfert && isChangingToTermine) {
      // Check multiple possible field names for transfer_to (as returned by serializer)
      const transferTo = transactionForm.to_field ||
                         transaction.productId ||
                         transaction.product_id ||
                         null;
      
      // Also check subscription_details for productId
      const productIdFromSubscription = transaction.subscription_details?.productId || 
                                        transaction.subscriptionDetails?.productId ||
                                        null;
      
      const finalProductId = transferTo || productIdFromSubscription;
      
      // Check if this is an investment (transfert to product) or withdrawal (transfert from product to solde)
      const isInvestment = finalProductId && 
                           String(finalProductId) !== 'solde' &&
                           String(finalProductId) !== 'trading';
      
      // Check if this is a withdrawal (transfert from product to solde)
      const transferFrom = transactionForm.from_field || null;
      const isWithdrawal = (transferTo === 'solde' || transferFrom !== null) && !isInvestment;
      
      // Debug logging
      console.log('EditTransactionModal - Checking transfert:', {
        type: transactionForm.type,
        transferTo,
        transferFrom,
        productIdFromSubscription,
        finalProductId,
        isInvestment,
        isWithdrawal,
        currentStatus: transaction.status,
        newStatus: effectiveStatus,
        isChangingToTermine
      });
      
      if (isInvestment) {
        // Only show the position generation modal if the destination product actually
        // has external asset allocations configured.
        const hasAllocations = await productHasAllocations(finalProductId);
        if (hasAllocations) {
          // Persist edited details with status "en_cours" - validation requires position generation.
          // Status will be set to "valide" only when user completes the modal.
          await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
            method: 'PUT',
            body: JSON.stringify(buildUpdatePayload('en_cours', true, { datetime: submittedDatetime }))
          });
          console.log('EditTransactionModal - Showing position generation modal for investment');
          setIsWithdrawalTransaction(false);
          setPendingStatusUpdate(effectiveStatus);
          setShowPositionModal(true);
          return;
        }
      } else if (isWithdrawal) {
        // Only show the modal for withdrawals when the source product has asset allocations.
        const relevantProductId = transferFrom && transferFrom !== 'solde' ? transferFrom : null;
        const hasAllocations = await productHasAllocations(relevantProductId);
        if (hasAllocations) {
          // Persist edited details with status "en_cours" - validation requires position generation.
          // Status will be set to "valide" only when user completes the modal.
          await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
            method: 'PUT',
            body: JSON.stringify(buildUpdatePayload('en_cours', true, { datetime: submittedDatetime }))
          });
          console.log('EditTransactionModal - Showing position generation modal for withdrawal');
          setIsWithdrawalTransaction(true);
          setPendingStatusUpdate(effectiveStatus);
          setShowPositionModal(true);
          return;
        }
      }
    }
    
    try {
      // Check if this is a withdrawal (transfert from product to solde)
      // Only recalculate if status is changing TO "valide" (not if it was already "valide")
      const transferTo = transactionForm.to_field || null;
      const transferFrom = transactionForm.from_field || null;
      const wasAlreadyTermine = ['valide', 'cloture'].includes(String(transaction.status || '').trim().toLowerCase());
      const isWithdrawal = transactionForm.type === 'transfert' && 
                          effectiveStatus === 'valide' &&
                          !wasAlreadyTermine && // Only if status is changing TO "valide"
                          (transferTo === 'solde' || (transferFrom && transferFrom !== 'solde'));
      
      const updatedTransaction = await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
        method: 'PUT',
        body: JSON.stringify(buildUpdatePayload(effectiveStatus, wasAlreadyTermine, { datetime: submittedDatetime }))
      });
      bustTransactionsCache(clientId);
      
      if (isWithdrawal) {
        toast.success('Transaction modifiée avec succès. Les positions des autres transactions d\'investissement sur ce produit seront recalculées automatiquement.');
      } else {
        toast.success('Transaction modifiée avec succès');
      }
      handleClose();
      onSuccess(updatedTransaction);
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast.error(error.message || 'Erreur lors de la modification de la transaction');
    }
  }

  const handlePositionModalSuccess = async (result?: PositionGenerationSuccessResult) => {
    if (!pendingStatusUpdate) return;

    const alreadyValidated =
      result?.validationFinalized ||
      result?.transaction?.status === 'valide';

    if (alreadyValidated) {
      bustTransactionsCache(clientId);
      if (isWithdrawalTransaction) {
        toast.success('Transaction modifiée avec succès. Les positions des autres transactions d\'investissement sur ce produit seront recalculées automatiquement.');
      } else {
        toast.success('Transaction modifiée avec succès');
      }
      setShowPositionModal(false);
      setPendingStatusUpdate(null);
      setIsWithdrawalTransaction(false);
      handleClose();
      onSuccess(result?.transaction || transaction);
      return;
    }

    // Fallback when backend did not finalize in save-positions
    try {
      const updatedTransaction = await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
        method: 'PUT',
        body: JSON.stringify(buildUpdatePayload(pendingStatusUpdate, true))
      });
      bustTransactionsCache(clientId);

      if (isWithdrawalTransaction) {
        toast.success('Transaction modifiée avec succès. Les positions des autres transactions d\'investissement sur ce produit seront recalculées automatiquement.');
      } else {
        toast.success('Transaction modifiée avec succès');
      }
      setShowPositionModal(false);
      setPendingStatusUpdate(null);
      setIsWithdrawalTransaction(false);
      handleClose();
      onSuccess(updatedTransaction);
    } catch (error: any) {
      console.error('Error updating transaction after position generation:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour de la transaction');
    }
  };

  const handlePositionModalClose = () => {
    setShowPositionModal(false);
    setPendingStatusUpdate(null);
    // User closed without completing - do NOT invoke success (transaction was already saved as "en_cours").
    // Just close the position modal and inform the user. Edit modal stays open.
    toast.info('La validation requiert la génération des positions. La transaction reste en cours.');
  };

  const handleDelete = async () => {
    if (!transaction) return;
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette transaction ? Cette action est irréversible.')) {
      return;
    }

    try {
      await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/delete/`, {
        method: 'DELETE'
      });
      
      toast.success('Transaction supprimée avec succès');
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      toast.error(error.message || 'Erreur lors de la suppression de la transaction');
    }
  };

  const interestPeriodOptions = getInterestPeriodOptions(transferProduct);
  const canCloseTransfer = !!getClosureInvestmentProductId();

  if (!isOpen || !transaction) return null;

  return (
    <>
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '36rem' }}>
          <div className="modal-header">
            <h2 className="modal-title">Modifier la transaction</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="modal-close"
              onClick={handleClose}
            >
              <X className="planning-icon-md" />
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="grid grid-cols-2" style={{ columnGap: '2rem', rowGap: '1rem' }}>
            <div className="modal-form-field">
              <Label>Type</Label>
              <Select value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
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
                    const nextTo = transactionForm.to_field || 'solde';
                    const nextProductId = nextFrom !== 'solde' ? nextFrom : (nextTo !== 'solde' ? nextTo : '');

                    let fromName = 'Solde';
                    let toName = 'Solde';
                    if (nextFrom !== 'solde') {
                      const fromProduct = products.find((p: any) => p.id === nextFrom);
                      if (fromProduct) fromName = fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
                    }
                    if (nextTo !== 'solde') {
                      const toProduct = products.find((p: any) => p.id === nextTo);
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
                    const nextFrom = transactionForm.from_field || 'solde';
                    const nextProductId = nextFrom !== 'solde' ? nextFrom : (nextTo !== 'solde' ? nextTo : '');

                    let fromName = 'Solde';
                    let toName = 'Solde';
                    if (nextFrom !== 'solde') {
                      const fromProduct = products.find((p: any) => p.id === nextFrom);
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
              </>
            )}
            {transactionForm.type === 'transfert' && transferProduct && (
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
                    <SelectValue
                      placeholder={
                        loadingTransferProduct
                          ? 'Chargement des périodes...'
                          : "Sélectionnez une période d'intérêt"
                      }
                    />
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
            <div className="modal-form-field">
              <Label>Date</Label>
              <Input
                type="text"
                value={dateDisplay}
                placeholder="JJ/MM/AAAA"
                onChange={(e) => {
                  const v = e.target.value;
                  setDateDisplay(v);
                  const parsed = buildDatetimeFromDisplay(v, timeDisplay);
                  if (parsed) setTransactionForm((prev) => ({ ...prev, datetime: parsed }));
                }}
                required
              />
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
            <div className="modal-form-field">
              <Label>Montant ({currencySym})</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                required
              />
            </div>
            {transactionForm.type === 'interets' && (
              <div className="modal-form-field flex items-start gap-2">
                <Checkbox
                  id="edit-is_surperformance"
                  checked={!!transactionForm.is_surperformance}
                  onCheckedChange={(checked) =>
                    setTransactionForm({ ...transactionForm, is_surperformance: !!checked })
                  }
                  className="mt-0.5 shrink-0"
                />
                <Label htmlFor="edit-is_surperformance" className="cursor-pointer leading-tight text-sm">Surperformance (intérêts supplémentaires)</Label>
              </div>
            )}
            <div className="modal-form-field col-span-2">
              <Label>Description</Label>
              <Textarea
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                placeholder="Description de la transaction"
              />
            </div>
            <div className="modal-form-field">
              <Label>Statut</Label>
              <Select value={transactionForm.status} onValueChange={(value) => setTransactionForm({ ...transactionForm, status: value })}>
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
              <div className="w-full">
                {canCloseTransfer && (
                  <div className="mb-3">
                    <button
                      type="button"
                      onClick={handleCloseTransfer}
                      disabled={isClosingTransfer}
                      className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {isClosingTransfer ? 'Clôture en cours...' : 'Clôturer le transfert'}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    style={{ marginRight: 'auto' }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Annuler
                  </Button>
                  <Button type="submit">Enregistrer</Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
      
      {showPositionModal && (
        <PositionGenerationModal
          isOpen={showPositionModal}
          accountCurrency={accountCurrencyProp}
          transaction={{
            ...transaction,
            subscription_interest_period:
              transactionForm.interestPeriod || transaction.subscription_interest_period || '',
            subscription_details: {
              ...(transaction.subscription_details || {}),
              interestPeriod: transactionForm.interestPeriod || '',
              interest_period: transactionForm.interestPeriod || '',
            },
          }}
          clientId={clientId}
          onClose={handlePositionModalClose}
          onSuccess={handlePositionModalSuccess}
          isWithdrawal={isWithdrawalTransaction}
        />
      )}
    </>
  );
}
