import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateTimePicker } from './ui/datetime-picker';
import { X, Trash2 } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import { TRANSACTION_TYPES, STATUS_LABELS } from './transactionUtils';
import { PositionGenerationModal } from './PositionGenerationModal';
import '../styles/Modal.css';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: any;
  clientId: string;
  onClose: () => void;
  onSuccess: (updatedTransaction?: any) => void;
}

export function EditTransactionModal({
  isOpen,
  transaction,
  clientId,
  onClose,
  onSuccess
}: EditTransactionModalProps) {
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
    from_field: 'balance',
    to_field: 'balance',
    productId: '',
    interestPeriod: '',
  });
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<string | null>(null);
  const [isWithdrawalTransaction, setIsWithdrawalTransaction] = useState(false);
  const [transferProduct, setTransferProduct] = useState<any>(null);
  const [loadingTransferProduct, setLoadingTransferProduct] = useState(false);
  const [products, setProducts] = useState<any[]>([]);

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

  const productHasAllocations = async (productId: any): Promise<boolean> => {
    if (!productId) return false;
    try {
      const res: any = await apiCall(`/api/products/${String(productId)}/`, { method: 'GET' });
      const p = res?.product || res || null;
      const allocations = p?.assetAllocations || p?.asset_allocations || [];
      return Array.isArray(allocations) && allocations.length > 0;
    } catch {
      // If we can't fetch the product, default to not showing the generation modal.
      return false;
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
      
      setTransactionForm({
        type: transaction.type,
        amount: transaction.amount?.toString() || '',
        description: transaction.description || '',
        status: transaction.status || 'en_cours',
        datetime: datetimeLocal,
        from_field: transaction.transfer_from || transaction.from_field || transaction.from || 'balance',
        to_field: transaction.transfer_to || transaction.to_field || transaction.to || 'balance',
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
          ''
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
        (transferTo && transferTo !== 'balance' ? transferTo : null) ||
        (transferFrom && transferFrom !== 'balance' ? transferFrom : null) ||
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
    setTransactionForm({
      type: 'depot',
      amount: '',
      description: '',
      status: 'en_attente_paiement',
      datetime: '',
      from_field: 'balance',
      to_field: 'balance',
      productId: '',
      interestPeriod: '',
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
      (transactionForm.to_field && transactionForm.to_field !== 'balance' ? transactionForm.to_field : undefined) ||
      (transactionForm.from_field && transactionForm.from_field !== 'balance' ? transactionForm.from_field : undefined) ||
      existing.productId ||
      transaction?.product?.id ||
      transaction?.product_id ||
      transaction?.transfer_to ||
      transaction?.transfer_from ||
      undefined;
    return {
      ...existing,
      ...(productId && productId !== 'balance' ? { productId } : {}),
      interestPeriod: transactionForm.interestPeriod || '',
      interest_period: transactionForm.interestPeriod || '',
    };
  };

  const buildUpdatePayload = (statusValue: string, skipPositionGeneration: boolean) => {
    // Don't convert to UTC - keep the local datetime as-is
    // transactionForm.datetime is in format YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss (local time)
    // We need to send it as ISO but preserve the local time
    let datetimeISO = '';
    if (transactionForm.datetime) {
      const timePart = transactionForm.datetime.split('T')[1] ?? '';
      const hasSeconds = timePart.split(':').length >= 3;
      // Add seconds only when not already present (avoid "14:30:45" -> "14:30:45:00")
      datetimeISO = hasSeconds
        ? transactionForm.datetime
        : transactionForm.datetime.includes(':')
          ? `${transactionForm.datetime}:00`
          : transactionForm.datetime;
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
            from_field: transactionForm.from_field || 'balance',
            to_field: transactionForm.to_field || 'balance',
            subscription_details: buildSubscriptionDetailsForUpdate(),
            interestPeriod: transactionForm.interestPeriod || '',
          }
        : {}),
    };
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!transaction) return;
    
    if (!transactionForm.datetime) {
      toast.error('La date et l\'heure sont requises');
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
    const wasAlreadyTermine = transaction.status === 'valide';
    const isChangingToTermine = transactionForm.status === 'valide' && 
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
      
      // Check if this is an investment (transfert to product) or withdrawal (transfert from product to balance)
      const isInvestment = finalProductId && 
                           String(finalProductId) !== 'balance' &&
                           String(finalProductId) !== 'trading';
      
      // Check if this is a withdrawal (transfert from product to balance)
      const transferFrom = transactionForm.from_field || null;
      const isWithdrawal = (transferTo === 'balance' || transferFrom !== null) && !isInvestment;
      
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
        newStatus: transactionForm.status,
        isChangingToTermine
      });
      
      if (isInvestment) {
        // Only show the position generation modal if the destination product actually
        // has external asset allocations configured.
        const hasAllocations = await productHasAllocations(finalProductId);
        if (hasAllocations) {
          // Persist edited details before opening generation modal so backend uses latest interest period.
          await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
            method: 'PUT',
            body: JSON.stringify(buildUpdatePayload(transaction.status || 'en_cours', true))
          });
          console.log('EditTransactionModal - Showing position generation modal for investment');
          setIsWithdrawalTransaction(false);
          setPendingStatusUpdate(transactionForm.status);
          setShowPositionModal(true);
          return;
        }
      } else if (isWithdrawal) {
        // Only show the modal for withdrawals when the source product has asset allocations.
        const relevantProductId = transferFrom && transferFrom !== 'balance' ? transferFrom : null;
        const hasAllocations = await productHasAllocations(relevantProductId);
        if (hasAllocations) {
          // Persist edited details before opening generation modal so backend uses latest interest period.
          await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
            method: 'PUT',
            body: JSON.stringify(buildUpdatePayload(transaction.status || 'en_cours', true))
          });
          console.log('EditTransactionModal - Showing position generation modal for withdrawal');
          setIsWithdrawalTransaction(true);
          setPendingStatusUpdate(transactionForm.status);
          setShowPositionModal(true);
          return;
        }
      }
    }
    
    try {
      // Check if this is a withdrawal (transfert from product to balance)
      // Only recalculate if status is changing TO "valide" (not if it was already "valide")
      const transferTo = transactionForm.to_field || null;
      const transferFrom = transactionForm.from_field || null;
      const wasAlreadyTermine = transaction.status === 'valide';
      const isWithdrawal = transactionForm.type === 'transfert' && 
                          transactionForm.status === 'valide' &&
                          !wasAlreadyTermine && // Only if status is changing TO "valide"
                          (transferTo === 'balance' || (transferFrom && transferFrom !== 'balance'));
      
      const updatedTransaction = await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
        method: 'PUT',
        body: JSON.stringify(buildUpdatePayload(transactionForm.status, wasAlreadyTermine))
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

  const handlePositionModalSuccess = async () => {
    // After positions are generated (or withdrawal confirmed), update transaction status to valide
    if (pendingStatusUpdate) {
      try {
        const updatedTransaction = await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
          method: 'PUT',
          body: JSON.stringify(buildUpdatePayload(pendingStatusUpdate, true))  // Always skip: positions already handled
        });
        bustTransactionsCache(clientId);
        
        // Show toast for both investments and withdrawals
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
    }
  };

  const handlePositionModalClose = () => {
    setShowPositionModal(false);
    setPendingStatusUpdate(null);
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

  if (!isOpen || !transaction) return null;

  return (
    <>
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
            <div className="modal-form-field">
              <Label>Type</Label>
              <Select value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSACTION_TYPES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {transactionForm.type === 'transfert' && (
              <>
                <div className="modal-form-field">
                  <Label>Transfert de</Label>
                  <Select
                    value={transactionForm.from_field || 'balance'}
                    onValueChange={(value) => {
                      const nextFrom = value || 'balance';
                      const nextTo = transactionForm.to_field || 'balance';
                      const nextProductId = nextFrom !== 'balance' ? nextFrom : (nextTo !== 'balance' ? nextTo : '');

                      let fromName = 'Balance Cash';
                      let toName = 'Balance Cash';
                      if (nextFrom !== 'balance') {
                        const fromProduct = products.find((p: any) => p.id === nextFrom);
                        if (fromProduct) fromName = fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
                      }
                      if (nextTo !== 'balance') {
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
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balance">Balance Cash</SelectItem>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.reference ? ` (${p.reference})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="modal-form-field">
                  <Label>Transfert vers</Label>
                  <Select
                    value={transactionForm.to_field || 'balance'}
                    onValueChange={(value) => {
                      const nextTo = value || 'balance';
                      const nextFrom = transactionForm.from_field || 'balance';
                      const nextProductId = nextFrom !== 'balance' ? nextFrom : (nextTo !== 'balance' ? nextTo : '');

                      let fromName = 'Balance Cash';
                      let toName = 'Balance Cash';
                      if (nextFrom !== 'balance') {
                        const fromProduct = products.find((p: any) => p.id === nextFrom);
                        if (fromProduct) fromName = fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
                      }
                      if (nextTo !== 'balance') {
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
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balance">Balance Cash</SelectItem>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.reference ? ` (${p.reference})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingTransferProduct
                          ? 'Chargement des périodes...'
                          : "Sélectionnez une période d'intérêt"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
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
              <Label>Date et heure</Label>
              <DateTimePicker
                value={transactionForm.datetime}
                onChange={(value) => setTransactionForm({ ...transactionForm, datetime: value })}
                placeholder="Sélectionner une date et heure"
                required
              />
            </div>
            <div className="modal-form-field">
              <Label>Montant (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="modal-form-field">
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
                <SelectContent>
                  {getAvailableStatuses().map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="modal-form-actions">
              {transaction.status !== 'valide' && (
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={handleDelete}
                  style={{ marginRight: 'auto' }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </div>
      </div>
      
      {showPositionModal && (
        <PositionGenerationModal
          isOpen={showPositionModal}
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
