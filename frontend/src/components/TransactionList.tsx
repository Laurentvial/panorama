import React from 'react';
import { Button } from './ui/button';
import { ArrowLeftRight, Eye, Edit, FileText, CheckCircle, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStatusLabel, getTypeLabel, getStatusColors } from './transactionUtils';
import { formatAmount } from '../utils/currency';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

// Helper functions for French labels
const getTypeColors = (type: string): { bg: string; text: string } => {
  const colorMap: { [key: string]: { bg: string; text: string } } = {
    'depot': { bg: '#dbeafe', text: '#1e40af' }, // blue
    'retrait': { bg: '#fee2e2', text: '#991b1b' }, // red
    'bonus': { bg: '#fef3c7', text: '#92400e' }, // yellow/amber
    'achat': { bg: '#dcfce7', text: '#15803d' }, // green
    'vente': { bg: '#dcfce7', text: '#15803d' }, // green
    'interets': { bg: '#d1fae5', text: '#065f46' }, // dark green
    'frais': { bg: '#fee2e2', text: '#991b1b' }, // red
    'transfert': { bg: '#fce7f3', text: '#9f1239' }, // pink
    'perte': { bg: '#fee2e2', text: '#991b1b' }, // red
  };
  return colorMap[type] || { bg: '#f1f5f9', text: '#475569' }; // default gray
};

// Extract asset/product name and reference from description
const extractAssetInfo = (description: string): { name: string; reference: string | null; displayText: string } => {
  if (!description) return { name: '-', reference: null, displayText: '-' };
  
  // Pattern for transfert: "Transfert de [from] vers [to]." or "Transfert de Solde vers Nom (Référence)"
  // Support both old and new formats
  // Use .*? (non-greedy) instead of [^v]+? to handle product names containing 'v' (e.g., "Volkswagen")
  const transfertPattern = /Transfert de\s+(.*?)\s+vers\s+([^(]+?)(?:\s*\(([^)]+)\))?/i;
  const transfertMatch = description.match(transfertPattern);
  if (transfertMatch) {
    // Extract the destination (to) which is what we're interested in
    const name = transfertMatch[2].trim();
    const reference = transfertMatch[3] ? transfertMatch[3].trim() : null;
    return {
      name,
      reference,
      displayText: reference ? `${name} (${reference})` : name
    };
  }
  
  // Try other patterns
  const patterns = [
    /actif[:\s]+([^,\n]+)/i,
    /asset[:\s]+([^,\n]+)/i,
    /produit[:\s]+([^,\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      return { name, reference: null, displayText: name };
    }
  }
  
  return { name: '-', reference: null, displayText: '-' };
};

const parseTransactionDetails = (value: any): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const parseDateValue = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  const frenchDateMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frenchDateMatch) {
    const [, day, month, year] = frenchDateMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTransactionDateValue = (transaction: any): number => {
  const rawDate = transaction?.datetime || transaction?.createdAt || transaction?.created_at;
  return parseDateValue(rawDate)?.getTime() || 0;
};

const formatInterestDate = (value: string | Date | null | undefined): string => {
  const date = parseDateValue(value);
  if (!date) return '-';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const extractPeriodEndFromDescription = (description: string): Date | null => {
  if (!description) return null;
  const rangeMatch = description.match(/\((\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\)/);
  if (rangeMatch?.[2]) return parseDateValue(rangeMatch[2]);

  const singleDateMatch = description.match(/\((\d{2}\/\d{2}\/\d{4})\)/);
  if (singleDateMatch?.[1]) return parseDateValue(singleDateMatch[1]);

  return null;
};

const getInterestReferenceDate = (interestTransaction: any): Date | null => {
  if (!interestTransaction) return null;
  const details = parseTransactionDetails(interestTransaction.subscription_details ?? interestTransaction.subscriptionDetails);
  const detailsDate =
    details.periodEnd ||
    details.period_end ||
    details.endDate ||
    details.end_date ||
    details.dueDate ||
    details.due_date ||
    details.paymentDate ||
    details.payment_date;

  return (
    parseDateValue(detailsDate) ||
    extractPeriodEndFromDescription(String(interestTransaction.description || '')) ||
    parseDateValue(interestTransaction.datetime || interestTransaction.createdAt || interestTransaction.created_at)
  );
};

const addInterestPeriod = (date: Date, interestPeriod: string): Date | null => {
  const normalized = String(interestPeriod || '').trim().toLowerCase();
  if (!normalized || (normalized.includes('fin') && (normalized.includes('contrat') || normalized.includes('matur')))) {
    return null;
  }

  const next = new Date(date);
  if (normalized.includes('quotid') || ['daily', 'jour', 'journee'].includes(normalized)) {
    next.setDate(next.getDate() + 1);
  } else if (normalized.includes('hebdo') || normalized.includes('semaine') || ['weekly', 'week'].includes(normalized)) {
    next.setDate(next.getDate() + 7);
  } else if (normalized.includes('trim') || ['quarter', 'trimestre'].includes(normalized)) {
    next.setMonth(next.getMonth() + 3);
  } else if (normalized.includes('sem') || ['semester', 'semestre'].includes(normalized)) {
    next.setMonth(next.getMonth() + 6);
  } else if (normalized.includes('ann') || ['year', 'année', 'an'].includes(normalized)) {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
};

const parseDurationDays = (value: any): number | null => {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (
    raw.includes('mois') ||
    raw.includes('month')
  ) {
    return amount * 30;
  }
  if (
    raw.includes('an') ||
    raw.includes('ans') ||
    raw.includes('annee') ||
    raw.includes('année') ||
    raw.includes('year')
  ) {
    return amount * 365;
  }
  if (raw.includes('sem') || raw.includes('week')) {
    return amount * 7;
  }
  return amount;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

interface TransactionListProps {
  transactions: any[];
  assets?: any[];
  products?: any[];
  clients?: any[];
  clientId?: string;
  transactionDocuments?: Record<string, any[]>;
  showContractColumn?: boolean;
  showClientColumn?: boolean;
  showInterestTrackingColumns?: boolean;
  allTransactionsForInterest?: any[];
  showIcons?: boolean;
  accountCurrency?: string;
  onView?: (transaction: any) => void;
  onEdit?: (transaction: any) => void;
  onValidateAndGenerate?: (transaction: any) => void;
  /** Ouvre le modal de génération de positions (même flux que valider un transfert) */
  onRecoverPositions?: (transaction: any) => void | Promise<void>;
  onContractDocumentsChanged?: () => void;
  emptyMessage?: string;
}

export function TransactionList({
  transactions,
  assets = [],
  products = [],
  clients = [],
  clientId,
  transactionDocuments = {},
  showContractColumn = false,
  showClientColumn = false,
  showInterestTrackingColumns = false,
  allTransactionsForInterest,
  showIcons = true,
  accountCurrency: accountCurrencyProp = 'EUR',
  onView,
  onEdit,
  onValidateAndGenerate,
  onRecoverPositions,
  onContractDocumentsChanged,
  emptyMessage = 'Aucune transaction trouvée'
}: TransactionListProps) {
  const navigate = useNavigate();
  const defaultCcy = (accountCurrencyProp || 'EUR').toString().trim().toUpperCase();
  const fileInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const interestSourceTransactions = allTransactionsForInterest || transactions;

  const interestTransactionsBySourceId = React.useMemo(() => {
    const map = new Map<string, any[]>();

    interestSourceTransactions
      .filter((transaction) => transaction?.type === 'interets')
      .forEach((transaction) => {
        const details = parseTransactionDetails(transaction.subscription_details ?? transaction.subscriptionDetails);
        const sourceId = details.sourceTransactionId ?? details.source_transaction_id;
        if (!sourceId) return;
        const key = String(sourceId);
        const current = map.get(key) || [];
        current.push(transaction);
        map.set(key, current);
      });

    map.forEach((items) => {
      items.sort((a, b) => getTransactionDateValue(b) - getTransactionDateValue(a));
    });

    return map;
  }, [interestSourceTransactions]);

  const getRelevantTransferProductLabel = (tx: any): string => {
    if (!tx) return '';
    const rawSub = (tx.subscription_details ?? tx.subscriptionDetails ?? null) as any;
    let sub: any = rawSub;
    if (typeof rawSub === 'string') {
      try {
        sub = JSON.parse(rawSub);
      } catch {
        sub = null;
      }
    }

    const transferToId = String(tx.to ?? tx.transfer_to ?? tx.to_field ?? tx.transferTo ?? '');
    const transferFromId = String(tx.from ?? tx.transfer_from ?? tx.from_field ?? '');
    const productIdFromSub = sub?.productId ?? sub?.product_id ?? sub?.product?.id ?? null;
    const directProductId = tx.productId ?? tx.product_id ?? tx.product?.id ?? null;

    const candidateId =
      (transferToId && transferToId !== 'solde' && transferToId !== 'trading' ? transferToId : '') ||
      (transferFromId && transferFromId !== 'solde' && transferFromId !== 'trading' ? transferFromId : '') ||
      (productIdFromSub ? String(productIdFromSub) : '') ||
      (directProductId ? String(directProductId) : '');

    if (candidateId) {
      const p = products.find((x: any) => String(x?.id) === String(candidateId));
      if (p?.name) return `${p.name}${p.reference ? ` (${p.reference})` : ''}`;
    }

    const nameFallback =
      tx.productName ??
      tx.product_name ??
      tx.subscription_product_name ??
      tx.subscription_details?.productName ??
      tx.subscriptionDetails?.productName ??
      '';
    return nameFallback ? String(nameFallback) : '';
  };

  // Find asset/product ID by name
  const findAssetProductId = (name: string, reference: string | null): string | null => {
    // First try to find by reference if available
    if (reference) {
      const productByRef = products.find(p => p.reference === reference);
      if (productByRef) return productByRef.id;
    }
    
    // Then try by name
    const productByName = products.find(p => p.name === name);
    if (productByName) return productByName.id;
    
    const assetByName = assets.find(a => a.name === name);
    if (assetByName) return assetByName.id;
    
    return null;
  };

  const getLastInterestTransaction = (transferTransaction: any): any | null => {
    const bySourceId = interestTransactionsBySourceId.get(String(transferTransaction.id));
    if (bySourceId?.length) return bySourceId[0];

    const legacyMatches = interestSourceTransactions
      .filter((transaction) => {
        if (transaction?.type !== 'interets') return false;
        const description = String(transaction.description || '');
        return description.includes(`Transaction ${transferTransaction.id}`) || description.includes(`txn ${transferTransaction.id}`);
      })
      .sort((a, b) => getTransactionDateValue(b) - getTransactionDateValue(a));

    return legacyMatches[0] || null;
  };

  const getNextInterestDate = (transferTransaction: any, lastInterestTransaction: any | null): Date | null => {
    const details = parseTransactionDetails(transferTransaction.subscription_details ?? transferTransaction.subscriptionDetails);
    const interestPeriod = String(
      transferTransaction.subscription_interest_period ||
      details.interestPeriod ||
      details.interest_period ||
      ''
    );
    const contractEnd = transferTransaction.subscription_contract_end || details.contractEnd || details.contract_end || '';
    const isEndOfContract = interestPeriod.toLowerCase().includes('fin') && interestPeriod.toLowerCase().includes('contrat');
    const startDate =
      parseDateValue(transferTransaction.datetime || transferTransaction.createdAt || transferTransaction.created_at) ||
      parseDateValue(details.subscriptionDate || details.subscription_date);

    if (isEndOfContract) {
      if (lastInterestTransaction) return null;
      const parsedContractEnd = parseDateValue(contractEnd);
      const durationRaw = String(
        transferTransaction.subscription_duration || details.duration || details.subscriptionDuration || ''
      ).trim();
      const durationDays = parseDurationDays(durationRaw);
      const computedContractEnd =
        startDate && durationDays && durationDays > 0
          ? addDays(startDate, durationDays)
          : null;
      const explicitDayUnit =
        durationRaw.toLowerCase().includes('jour') || durationRaw.toLowerCase().includes('day');

      if (!parsedContractEnd) {
        return computedContractEnd;
      }
      if (!startDate || !computedContractEnd) {
        return parsedContractEnd;
      }

      // Guardrail for inconsistent legacy rows where contract end equals start date.
      if (parsedContractEnd.getTime() <= startDate.getTime()) {
        return computedContractEnd;
      }
      if (explicitDayUnit) {
        const oneDayMs = 24 * 60 * 60 * 1000;
        const driftMs = Math.abs(parsedContractEnd.getTime() - computedContractEnd.getTime());
        if (driftMs >= oneDayMs) {
          return computedContractEnd;
        }
      }
      return parsedContractEnd;
    }

  const baseDate =
    getInterestReferenceDate(lastInterestTransaction) ||
    startDate;
    if (!baseDate) return null;
    return addInterestPeriod(baseDate, interestPeriod);
  };

  if (transactions.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4">Date</th>
            {showClientColumn && <th className="text-left py-3 px-4">Client</th>}
            <th className="text-left py-3 px-4">Type</th>
            <th className="text-left py-3 px-4">Actif</th>
            <th className="text-left py-3 px-4">Description</th>
            <th className="text-left py-3 px-4">Montant</th>
            <th className="text-left py-3 px-4">Statut</th>
            {showInterestTrackingColumns && (
              <>
                <th className="text-left py-3 px-4">Dernier versement d'intérêt</th>
                <th className="text-left py-3 px-4">Prochain versement d'intérêt</th>
              </>
            )}
            {showContractColumn && <th className="text-left py-3 px-4">Contrat</th>}
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const client = clients.find(c => c.id === transaction.clientId);
            const contractDocs = transactionDocuments[String(transaction.id)] || [];
            const hasContract = contractDocs.length > 0;
            const isTransfer = transaction.type === 'transfert';
            const transferTo = String(transaction.to ?? transaction.transfer_to ?? '');
            const tracksInterest = isTransfer && transferTo !== '' && transferTo !== 'solde' && transferTo !== 'trading';
            const isValidTransactionStatus = transaction.status === 'valide';
            const lastInterestTransaction = tracksInterest ? getLastInterestTransaction(transaction) : null;
            const lastInterestReferenceDate = lastInterestTransaction ? getInterestReferenceDate(lastInterestTransaction) : null;
            const nextInterestDate =
              tracksInterest && isValidTransactionStatus
                ? getNextInterestDate(transaction, lastInterestTransaction)
                : null;
            const nextInterestTimestamp = nextInterestDate?.getTime() || 0;
            const isNextInterestOverdue =
              tracksInterest &&
              nextInterestTimestamp > 0 &&
              nextInterestTimestamp < new Date(new Date().toDateString()).getTime() &&
              isValidTransactionStatus;
            const positionsCountForRecover = Number(transaction.positionsCount ?? 0);
            const showRecoverPositions =
              !!onRecoverPositions &&
              transaction.status === 'valide' &&
              transaction.type === 'transfert' &&
              transferTo !== '' &&
              transferTo !== 'solde';
            const recoverPositionsLabel =
              positionsCountForRecover > 0 ? 'Régénérer les positions' : 'Créer les positions';
            const recoverPositionsTitle =
              positionsCountForRecover > 0
                ? 'Recalculer les positions en attente (statut « en attente ») sur ce produit pour ce client. Les positions ouvertes ou déjà réalisées ne sont pas supprimées.'
                : 'Prévisualiser puis enregistrer les positions (même assistant que lors de la validation du transfert).';

            // Get product/asset info - prioritize productId from transaction
            let productName = '-';
            let productId: string | null = null;
            let displayText = '-';
            
            // First, check if transaction has productId directly
            if (transaction.productId) {
              productId = transaction.productId;
              // Display the asset/product TYPE (not the name)
              const product = products.find(p => p.id === transaction.productId);
              const asset = assets.find(a => a.id === transaction.productId);
              if (product) {
                productName = product.name;
                displayText = product.type || product.subcategory || product.categoryName || product.category || '-';
              } else if (asset) {
                productName = asset.name || '-';
                displayText = asset.type || asset.category || asset.subcategory || '-';
              }
            } else {
              // Fallback: try to extract from description
              const assetInfo = extractAssetInfo(transaction.description || '');
              productId = findAssetProductId(assetInfo.name, assetInfo.reference);
              const productByRef = assetInfo.reference ? products.find(p => p.reference === assetInfo.reference) : null;
              const assetByRef = assetInfo.reference ? assets.find(a => a.reference === assetInfo.reference) : null;
              const productByName = products.find(p => p.name === assetInfo.name);
              const assetByName = assets.find(a => a.name === assetInfo.name);

              const product = productByRef || productByName;
              const asset = assetByRef || assetByName;

              if (product) {
                displayText = product.type || product.subcategory || product.categoryName || product.category || '-';
              } else if (asset) {
                displayText = asset.type || asset.category || asset.subcategory || '-';
              } else {
                displayText = '-';
              }
            }
            
            return (
              <tr key={transaction.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                <td className="py-3 px-4">
                  {new Date(transaction.datetime || transaction.createdAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                {showClientColumn && (
                  <td className="py-3 px-4">
                    {client ? `${client.firstName || client.fname || ''} ${client.lastName || client.lname || ''}`.trim() || client.email || '-' : '-'}
                  </td>
                )}
                <td className="py-3 px-4">
                  {(() => {
                    const typeColors = getTypeColors(transaction.type);
                    return (
                      <span 
                        className="px-2 py-1 rounded text-xs font-medium inline-block"
                        style={{
                          backgroundColor: typeColors.bg,
                          color: typeColors.text,
                          zIndex: 1,
                          position: 'relative'
                        }}
                      >
                        {getTypeLabel(transaction.type)}
                      </span>
                    );
                  })()}
                </td>
                <td className="py-3 px-4">
                  {productId ? (
                    <span 
                      className="text-slate-700 cursor-pointer hover:text-blue-600 hover:underline"
                      onClick={() => navigate(`/platform/product/${productId}`)}
                    >
                      {displayText}
                    </span>
                  ) : (
                    <span className="text-slate-700">
                      {displayText}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 max-w-xs truncate" title={transaction.description || ''}>
                  {transaction.description || '-'}
                </td>
                <td className="py-3 px-4">
                  {transaction.type === 'transfert' ? (
                    <span className="font-medium text-orange-600 flex items-center gap-1">
                      <ArrowLeftRight className="w-4 h-4" />
                      {formatAmount(parseFloat(transaction.amount || 0), transaction.amountCurrency || transaction.amount_currency || defaultCcy)}
                    </span>
                  ) : (
                    <span className={`font-medium ${transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? 'text-red-600' : 'text-green-600'}`}>
                      {transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? '-' : '+'}{formatAmount(parseFloat(transaction.amount || 0), transaction.amountCurrency || transaction.amount_currency || defaultCcy)}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {(() => {
                    const { bg, text } = getStatusColors(transaction.status, transaction.type);
                    return (
                      <span
                        className="px-2 py-1 rounded text-xs font-medium inline-block"
                        style={{ backgroundColor: bg, color: text, zIndex: 1, position: 'relative' }}
                      >
                        {getStatusLabel(transaction.status, transaction.type)}
                      </span>
                    );
                  })()}
                </td>
                {showInterestTrackingColumns && (
                  <>
                    <td className="py-3 px-4">
                      {tracksInterest && lastInterestTransaction ? (
                        <div>
                          <div className="font-medium text-emerald-700">
                            {formatInterestDate(lastInterestReferenceDate)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatAmount(parseFloat(lastInterestTransaction.amount || 0), lastInterestTransaction.amountCurrency || lastInterestTransaction.amount_currency || defaultCcy)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {tracksInterest && !isValidTransactionStatus ? (
                        <span />
                      ) : tracksInterest && nextInterestDate ? (
                        <div>
                          <div className={isNextInterestOverdue ? 'font-medium text-red-600' : 'font-medium text-slate-700'}>
                            {formatInterestDate(nextInterestDate)}
                          </div>
                          {isNextInterestOverdue && (
                            <div className="text-xs text-red-500">À vérifier</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </>
                )}
                {showContractColumn && (
                  <td className="py-3 px-4">
                    {hasContract ? (
                      <div className="flex items-center gap-2">
                        {contractDocs[0]?.fileUrl ? (
                          <a
                            href={contractDocs[0].fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <FileText className="w-4 h-4" />
                            Voir le contrat
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}

                        <input
                          ref={(el) => {
                            fileInputRefs.current[String(transaction.id)] = el;
                          }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                          className="hidden"
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            e.stopPropagation();
                            const file = e.target.files?.[0] || null;
                            // Allow selecting same file again next time
                            e.target.value = '';
                            if (!file) return;
                            const docId = contractDocs[0]?.id;
                            if (!clientId || !docId) {
                              toast.error('Impossible de remplacer le document (client/document manquant).');
                              return;
                            }
                            try {
                              const form = new FormData();
                              form.append('file', file);
                              await apiCall(`/api/clients/${clientId}/documents/${docId}/replace/`, {
                                method: 'POST',
                                body: form,
                              });
                              toast.success('Contrat remplacé avec succès');
                              onContractDocumentsChanged?.();
                            } catch (err: any) {
                              console.error('Error replacing contract document:', err);
                              toast.error(err?.message || 'Erreur lors du remplacement du contrat');
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = fileInputRefs.current[String(transaction.id)];
                            input?.click();
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:underline text-sm font-medium"
                          title="Remplacer le document lié à cette transaction"
                        >
                          -  Remplacer
                        </button>
                      </div>
                    ) : isTransfer ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => {
                            fileInputRefs.current[`add:${String(transaction.id)}`] = el;
                          }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                          className="hidden"
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            e.stopPropagation();
                            const file = e.target.files?.[0] || null;
                            e.target.value = '';
                            if (!file) return;
                            if (!clientId) {
                              toast.error('Impossible d’ajouter le document (client manquant).');
                              return;
                            }
                            try {
                              const productLabel = getRelevantTransferProductLabel(transaction);
                              const docName = productLabel
                                ? `Contrat - ${productLabel}`
                                : `Contrat - Transaction ${transaction.id}`;

                              const form = new FormData();
                              form.append('name', docName);
                              form.append('documentType', 'contract');
                              form.append('transactionId', String(transaction.id));
                              form.append('description', '');
                              form.append('file', file);
                              await apiCall(`/api/clients/${clientId}/documents/create/`, {
                                method: 'POST',
                                body: form,
                              });
                              toast.success('Contrat ajouté avec succès');
                              onContractDocumentsChanged?.();
                            } catch (err: any) {
                              console.error('Error creating contract document:', err);
                              toast.error(err?.message || 'Erreur lors de l’ajout du contrat');
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = fileInputRefs.current[`add:${String(transaction.id)}`];
                            input?.click();
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:underline text-sm font-medium"
                          title="Ajouter un contrat lié à cette transaction"
                        >
                          Ajouter
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                )}
                <td className="py-3 px-4 text-right">
                  <div className="flex gap-2 justify-end relative" style={{ zIndex: 10 }}>
                    {onValidateAndGenerate && transaction.type === 'transfert' && transaction.status !== 'valide' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onValidateAndGenerate(transaction);
                        }}
                        className="hover:!bg-green-50 hover:!text-green-600 transition-colors duration-200 px-4"
                        style={{ position: 'relative', zIndex: 10 }}
                        title="Valider et générer les positions"
                      >
                        {showIcons && <CheckCircle className="w-4 h-4 mr-1" />}
                        Valider
                      </Button>
                    )}
                    {showRecoverPositions && onRecoverPositions && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onRecoverPositions(transaction);
                        }}
                        className="hover:!bg-amber-50 hover:!text-amber-800 transition-colors duration-200 px-4"
                        style={{ position: 'relative', zIndex: 10 }}
                        title={recoverPositionsTitle}
                      >
                        <Layers className="w-4 h-4 mr-1" />
                        {recoverPositionsLabel}
                      </Button>
                    )}
                    {onView ? (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onView(transaction);
                        }}
                        className="hover:!bg-blue-50 hover:!text-blue-600 transition-colors duration-200 px-4"
                        style={{ position: 'relative', zIndex: 10 }}
                      >
                        {showIcons && <Eye className="w-4 h-4 mr-1" />}
                        Voir
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate(`/admin/clients/${transaction.clientId}?transaction=${transaction.id}`)}
                        className="hover:bg-slate-100"
                      >
                        {showIcons && <Eye className="w-4 h-4 mr-1" />}
                        Voir
                      </Button>
                    )}
                    {onEdit ? (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(transaction);
                        }}
                        className="hover:!bg-purple-50 hover:!text-purple-600 transition-colors duration-200 px-4"
                        style={{ position: 'relative', zIndex: 10 }}
                      >
                        {showIcons && <Edit className="w-4 h-4 mr-1" />}
                        Modifier
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          if (transaction.clientId) {
                            navigate(`/admin/clients/${transaction.clientId}?transaction=${transaction.id}&edit=true`);
                          }
                        }}
                        className="hover:bg-slate-100"
                      >
                        {showIcons && <Edit className="w-4 h-4 mr-1" />}
                        Modifier
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
