import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Checkbox } from './ui/checkbox';
import { Plus, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { TransactionList } from './TransactionList';
import { ProductTransferSelect } from './ProductTransferSelect';
import { ViewTransactionModal } from './ViewTransactionModal';
import { EditTransactionModal } from './EditTransactionModal';
import { PositionGenerationModal } from './PositionGenerationModal';
import { TRANSACTION_TYPES, STATUS_LABELS, getStatusLabel, parseSubscriptionDetails } from './transactionUtils';
import LoadingIndicator from './LoadingIndicator';
import '../styles/Modal.css';

interface ClientTransactionsTabProps {
  onRefresh: () => void;
  clientId: string;
}

// Transaction types with their allowed statuses
const TRANSACTION_TYPES = {
  depot: {
    label: 'Dépôt',
    statuses: ['en_attente_paiement', 'valide', 'conteste', 'annule']
  },
  retrait: {
    label: 'Retrait',
    statuses: ['en_cours', 'valide', 'annule']
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
    statuses: ['en_cours', 'valide', 'annule']
  },
  perte: {
    label: 'Perte',
    statuses: ['valide', 'annule']
  }
};

const STATUS_LABELS: { [key: string]: string } = {
  en_attente_paiement: 'En attente de paiement',
  en_cours: 'En cours',
  valide: 'Validé',
  conteste: 'Contesté',
  annule: 'Annulé'
};

export function ClientTransactionsTab({ onRefresh, clientId }: ClientTransactionsTabProps) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
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
  const [positionModalSource, setPositionModalSource] = useState<'create' | 'validate'>('create');
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

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
      const allocations = p?.assetAllocations || p?.asset_allocations || [];
      return Array.isArray(allocations) && allocations.length > 0;
    } catch {
      return false;
    }
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
    if (tx.status === 'valide') {
      toast.info('La transaction est déjà validée');
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
    const productIdFromSub = tx.subscription_details?.productId || tx.productId || tx.product_id || null;
    const finalProductId = transferTo || productIdFromSub;
    const isInvestment = finalProductId && String(finalProductId) !== 'solde' && String(finalProductId) !== 'trading';
    const isWithdrawal = transferTo === 'solde' && transferFrom && transferFrom !== 'solde';

    const relevantProductId = isInvestment ? finalProductId : (transferFrom && transferFrom !== 'solde' ? transferFrom : null);
    const hasAllocations = relevantProductId ? await productHasAllocationsForValidate(relevantProductId) : false;

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
    // kept for backward compatibility with existing UI resets
    visibleByClient: true
  });

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
      // Format as YYYY-MM-DDTHH:mm for datetime-local input
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTransactionForm(prev => ({ ...prev, datetime: `${year}-${month}-${day}T${hours}:${minutes}` }));
    }
  }, [isTransactionDialogOpen]);

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

    if (!transactionForm.datetime) {
      toast.error('La date et l\'heure sont requises');
      setIsCreatingTransaction(false);
      return;
    }

    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) {
      toast.error('Le montant doit être supérieur à 0');
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
      // transactionForm.datetime is already in YYYY-MM-DDTHH:mm format (local time)
      let datetimeISO = transactionForm.datetime;
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
      
      const response = await apiCall(`/api/clients/${clientId}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify({
          type: transactionForm.type,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          status: transactionStatus, // Use temporary status only if modal will be shown
          datetime: datetimeISO,
          skip_position_generation: shouldShowModal, // Skip auto-generation only if showing modal
          ...(transactionForm.type === 'transfert'
            ? {
                from_field: transactionForm.from_field || 'solde',
                to_field: transactionForm.to_field || undefined,
                // help backend reliably resolve product
                subscription_details: transactionForm.productId
                  ? {
                      productId: transactionForm.productId,
                      ...(transactionForm.interestPeriod ? { interestPeriod: transactionForm.interestPeriod } : {}),
                    }
                  : undefined,
              }
            : {}),
        })
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
            visibleByClient: true
          });
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
        visibleByClient: true
      });
      // Reload first page to guarantee visibility of the newly created transaction.
      loadTransactions(1, pagination.limit);
      loadContractDocuments();
      onRefresh();
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      toast.error(error.message || 'Erreur lors de la création de la transaction');
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
  
  const hasAvailableFunds = sourceProduct 
    ? (sourceProduct.availableFunds ?? sourceProduct.available_funds ?? false)
    : true;
  
  const showAvailableFundsWarning = shouldShowWarning && !hasAvailableFunds;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Transactions</h2>
        <Button onClick={() => {
          setIsTransactionDialogOpen(true);
          // Reset form when opening
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
            visibleByClient: true
          });
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une transaction
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Type filter (multiple selection) */}
            <div className="space-y-2">
              <Label>Type de transaction</Label>
              <Popover open={isTypeFilterOpen} onOpenChange={setIsTypeFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 rounded-md border-input bg-input-background px-3 py-2 text-sm text-slate-700"
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
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>Montant (€)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Min"
                  value={filters.amountMin}
                  onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })}
                  className="text-slate-700 placeholder:text-slate-600"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Max"
                  value={filters.amountMax}
                  onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })}
                  className="text-slate-700 placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Date filter */}
            <div className="space-y-2">
              <Label>Date de début</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="text-slate-700 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label>Date de fin</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="text-slate-700 placeholder:text-slate-600"
              />
            </div>

            {/* Clear filters button */}
            <div className="space-y-2">
              <Label className="opacity-0">Actions</Label>
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full rounded-md"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isTransactionDialogOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsTransactionDialogOpen(false);
          // Reset form when closing
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
            visibleByClient: true
          });
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
                    visibleByClient: true
                  });
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleCreateTransaction} className="modal-form">
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

              <div className="modal-form-field">
                <Label>Date et heure</Label>
                <Input
                  type="datetime-local"
                  value={transactionForm.datetime}
                  onChange={(e) => setTransactionForm({ ...transactionForm, datetime: e.target.value })}
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
                <Button type="button" variant="outline" disabled={isCreatingTransaction} onClick={() => {
                  setIsTransactionDialogOpen(false);
                  setIsCreatingTransaction(false);
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
                    visibleByClient: true
                  });
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
                transactionDocuments={contractDocumentsByTransaction}
                showContractColumn={true}
                showClientColumn={false}
                showIcons={false}
                onView={(transaction) => {
                  setSelectedTransaction(transaction);
                  setIsViewTransactionModalOpen(true);
                }}
                onEdit={(transaction) => {
                  openEditModal(transaction);
                }}
                onValidateAndGenerate={handleValidateAndGenerate}
                emptyMessage="Aucune transaction"
              />

              {unlinkedContractDocuments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="text-sm font-semibold text-slate-700 mb-3">
                    Contrats non liés à une transaction
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
          onClose={() => {
            const isValidate = positionModalSource === 'validate';
            setIsPositionGenerationModalOpen(false);
            setTransactionForPositionGeneration(null);
            setIsWithdrawalForPositionGeneration(false);
            setPositionModalSource('create');
            setIsTransactionDialogOpen(false);
            if (isValidate) {
              toast.info('La validation requiert la génération des positions. La transaction reste en cours.');
            } else {
              toast.info('Transaction créée avec le statut "En cours". Vous pouvez la finaliser plus tard.');
            }
            loadTransactions(pagination.page, pagination.limit);
            loadContractDocuments();
            onRefresh();
          }}
          onSuccess={async () => {
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
            setIsTransactionDialogOpen(false);
            toast.success('Transaction créée avec succès');
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

