import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { X, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { 
  getTypeLabel, 
  getStatusLabel, 
  getTypeColors, 
  getStatusColors,
  extractAssetInfo, 
  parseSubscriptionDetails,
  TRANSACTION_TYPES,
  STATUS_LABELS
} from './transactionUtils';
import '../styles/Modal.css';

interface ViewTransactionModalProps {
  isOpen: boolean;
  transaction: any;
  clientId?: string;
  assets?: any[];
  products?: any[];
  onClose: () => void;
}

export function ViewTransactionModal({
  isOpen,
  transaction,
  clientId,
  assets = [],
  products = [],
  onClose
}: ViewTransactionModalProps) {
  const navigate = useNavigate();
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [assetsMap, setAssetsMap] = useState<Record<string, any>>({});
  const assetsMapEffectKeyRef = useRef<string>('');

  // Find asset/product ID by name
  const findAssetProductId = (name: string, reference: string | null): string | null => {
    if (reference) {
      const productByRef = products.find(p => p.reference === reference);
      if (productByRef) return productByRef.id;
    }
    const productByName = products.find(p => p.name === name);
    if (productByName) return productByName.id;
    const assetByName = assets.find(a => a.name === name);
    if (assetByName) return assetByName.id;
    return null;
  };

  // Load product details when viewing a transfert transaction
  useEffect(() => {
    let isMounted = true;
    
    if (isOpen && transaction && transaction.type === 'transfert') {
      const subscriptionDetails = parseSubscriptionDetails(transaction);
      const productId =
        subscriptionDetails?.productId ||
        transaction?.productId ||
        transaction?.product_id ||
        transaction?.transfer_to ||
        transaction?.to_field ||
        null;
      const normalizedProductId = productId && productId !== 'balance' && productId !== 'trading' ? String(productId) : null;
      if (normalizedProductId) {
        setProductLoadError(null);
        apiCall(`/api/products/${normalizedProductId}/`)
          .then(response => {
            if (isMounted) {
              setSelectedProduct(response.product || response);
              setProductLoadError(null);
            }
          })
          .catch(error => {
            console.error('Error loading product:', error);
            if (isMounted) {
              setSelectedProduct(null);
              setProductLoadError('Impossible de charger les détails du produit. Veuillez réessayer.');
              toast.error('Erreur lors du chargement du produit');
            }
          });
      } else {
        if (isMounted) {
          setSelectedProduct(null);
          setProductLoadError(null);
        }
      }
    } else {
      if (isMounted) {
        setSelectedProduct(null);
        setProductLoadError(null);
      }
    }
    
    return () => {
      isMounted = false;
    };
  }, [isOpen, transaction]);

  // Load transaction logs when viewing a transaction
  useEffect(() => {
    if (isOpen && transaction && clientId) {
      setLogsLoading(true);
      apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/logs/`)
        .then(response => {
          setTransactionLogs(response.logs || []);
          setLogsLoading(false);
        })
        .catch(error => {
          console.error('Error loading transaction logs:', error);
          setTransactionLogs([]);
          setLogsLoading(false);
        });
    } else {
      setTransactionLogs([]);
    }
  }, [isOpen, transaction, clientId]);

  // Load assets to map IDs to names for position generation history
  useEffect(() => {
    let isMounted = true;
    
    if (isOpen && transaction && transaction.position_generation_history) {
      // Extract all asset IDs from history
      const assetIds = new Set<string>();
      transaction.position_generation_history.forEach((entry: any) => {
        if (entry.summary && entry.summary.positions_by_asset) {
          Object.keys(entry.summary.positions_by_asset).forEach(assetId => {
            if (assetId !== 'none') {
              assetIds.add(assetId);
            }
          });
        }
      });

      if (assetIds.size > 0) {
        // Create a unique key for this effect run based on transaction ID and asset IDs
        const sortedAssetIds = Array.from(assetIds).sort().join(',');
        const effectKey = `${transaction.id}-${sortedAssetIds}`;
        assetsMapEffectKeyRef.current = effectKey;

        // Try to find assets from props first
        const foundAssets: Record<string, any> = {};
        assetIds.forEach(assetId => {
          const asset = assets.find(a => a.id === assetId);
          if (asset) {
            foundAssets[assetId] = asset;
          }
        });

        // If some assets are missing, fetch them
        const missingIds = Array.from(assetIds).filter(id => !foundAssets[id]);
        if (missingIds.length > 0) {
          Promise.all(
            missingIds.map(assetId =>
              apiCall(`/api/assets/${assetId}/`)
                .then(response => ({ id: assetId, asset: response.asset || response }))
                .catch(() => ({ id: assetId, asset: null }))
            )
          ).then(results => {
            // Only update state if this effect run is still current and component is mounted
            if (isMounted && assetsMapEffectKeyRef.current === effectKey) {
              const newAssetsMap: Record<string, any> = { ...foundAssets };
              results.forEach(({ id, asset }) => {
                if (asset) {
                  newAssetsMap[id] = asset;
                }
              });
              setAssetsMap(newAssetsMap);
            }
          });
        } else {
          if (isMounted && assetsMapEffectKeyRef.current === effectKey) {
            setAssetsMap(foundAssets);
          }
        }
      } else {
        if (isMounted) {
          setAssetsMap({});
        }
      }
    } else {
      if (isMounted) {
        setAssetsMap({});
      }
    }
    
    return () => {
      isMounted = false;
    };
  }, [isOpen, transaction, assets]);

  if (!isOpen || !transaction) return null;

  const subscriptionDetails = parseSubscriptionDetails(transaction);
  const assetInfo = extractAssetInfo(transaction.description || '');
  const assetProductId = findAssetProductId(assetInfo.name, assetInfo.reference);
  const transferTo = transaction.transfer_to || transaction.to_field || transaction.to || null;
  const hasTransferProductTarget = transferTo && transferTo !== 'balance' && transferTo !== 'trading';
  const hasSubscriptionProductId = Boolean(
    subscriptionDetails?.productId || transaction.productId || transaction.product_id
  );
  
  // Check if this is an investment transfert (transfer_to is a product ID, not 'balance')
  const isInvestmentTransfer = transaction.type === 'transfert' && (hasTransferProductTarget || hasSubscriptionProductId);

  const formatDateValue = (value: any) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const productDuration = selectedProduct?.duration || subscriptionDetails?.duration || 'N/A';
  const productProfitabilityPeriod =
    selectedProduct?.profitabilityPeriod || selectedProduct?.profitability_period || 'N/A';
  const productInterestPeriod = selectedProduct?.interestPeriod || selectedProduct?.interest_period || 'N/A';
  const productProfitability = (() => {
    const isVariableRaw = selectedProduct?.isVariableProfitability ?? selectedProduct?.is_variable_profitability;
    const isVariable = String(isVariableRaw || '').toLowerCase() === 'oui';
    const baseRate = selectedProduct?.profitability;
    const maxRate = selectedProduct?.variableProfitability ?? selectedProduct?.variable_profitability;
    if (isVariable && baseRate != null && maxRate != null && baseRate !== '' && maxRate !== '') {
      return `${baseRate}% à ${maxRate}%`;
    }
    if (baseRate != null && baseRate !== '') {
      return `${baseRate}%`;
    }
    return subscriptionDetails?.profitability || 'N/A';
  })();
  const productAvailabilityStart = formatDateValue(
    selectedProduct?.availabilityStart ?? selectedProduct?.availability_start
  );
  const productAvailabilityEnd = formatDateValue(
    selectedProduct?.availabilityEnd ?? selectedProduct?.availability_end
  );
  const transactionIp = subscriptionDetails?.ip || transaction.subscription_ip || 'N/A';
  const chosenInterestPeriod =
    subscriptionDetails?.interestPeriod || subscriptionDetails?.interest_period || transaction.subscription_interest_period || 'N/A';
  const hasSubscriptionOrProductInfo = transaction.type === 'transfert' && Boolean(subscriptionDetails || selectedProduct || productLoadError);

  const findAssetOrProduct = () => {
    if (assetInfo.reference) {
      const productByRef = products.find((p) => p.reference === assetInfo.reference);
      if (productByRef) return { kind: 'product' as const, data: productByRef };
      const assetByRef = assets.find((a) => a.reference === assetInfo.reference);
      if (assetByRef) return { kind: 'asset' as const, data: assetByRef };
    }
    if (assetInfo.name && assetInfo.name !== '-') {
      const productByName = products.find((p) => p.name === assetInfo.name);
      if (productByName) return { kind: 'product' as const, data: productByName };
      const assetByName = assets.find((a) => a.name === assetInfo.name);
      if (assetByName) return { kind: 'asset' as const, data: assetByName };
    }
    return null;
  };

  const assetOrProduct = findAssetOrProduct();
  const assetTypeText = (() => {
    if (!assetOrProduct) return '-';
    const item = assetOrProduct.data;

    // For internal products, "type" or "subcategory" is often the meaningful label.
    if (assetOrProduct.kind === 'product') {
      return (
        item.type ||
        item.subcategory ||
        item.categoryName ||
        item.category ||
        '-'
      );
    }

    // For external assets, "type" or "category" tends to represent the asset class.
    return item.type || item.category || item.subcategory || '-';
  })();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content--scrollable"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', width: 'min(1200px, 90vw)' }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Détails de la transaction</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="modal-close"
            onClick={onClose}
          >
            <X className="planning-icon-md" />
          </Button>
        </div>
        <div className="modal-form">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <Label className="text-slate-600 font-semibold">Date</Label>
                <p className="text-slate-900 mt-1">
                  {new Date(transaction.datetime || transaction.createdAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              
              <div>
                <Label className="text-slate-600 font-semibold">Type</Label>
                <div className="mt-1">
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
                </div>
              </div>
              
              <div>
                <Label className="text-slate-600 font-semibold">Montant</Label>
                {transaction.type === 'transfert' ? (
                  <p className="text-lg font-medium mt-1 text-orange-600 flex items-center gap-1">
                    <ArrowLeftRight className="w-4 h-4" />
                    {parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })} €
                  </p>
                ) : (
                  <p className={`text-lg font-medium mt-1 ${
                    transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' 
                      ? 'text-red-600' 
                      : 'text-green-600'
                  }`}>
                    {transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? '-' : '+'}
                    {parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })} €
                  </p>
                )}
              </div>
              
              <div>
                <Label className="text-slate-600 font-semibold">Statut</Label>
                <div className="mt-1">
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
                </div>
              </div>
              
              <div>
                <Label className="text-slate-600 font-semibold">Actif</Label>
                {assetProductId ? (
                  <p 
                    className="text-slate-900 mt-1 cursor-pointer hover:text-blue-600 hover:underline"
                    onClick={() => navigate(`/platform/product/${assetProductId}`)}
                  >
                    {assetTypeText}
                  </p>
                ) : (
                  <p className="text-slate-900 mt-1">
                    {assetTypeText}
                  </p>
                )}
              </div>
              
              <div>
                <Label className="text-slate-600 font-semibold">ID Transaction</Label>
                <p className="text-slate-900 mt-1 font-mono text-sm">
                  {transaction.id}
                </p>
              </div>
            </div>
            
            {/* Transfer direction information for transfert transactions */}
            {transaction.type === 'transfert' && (
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-4">Détails du transfert</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-slate-600 font-semibold">Transfert de</Label>
                    <p className="text-slate-900 mt-1">
                      {(() => {
                        const fromField = transaction.transfer_from || transaction.from_field || 'balance';
                        if (fromField === 'balance') {
                          return 'Solde';
                        }
                        const fromProduct = products.find((p: any) => p.id === fromField);
                        if (fromProduct) {
                          return fromProduct.name + (fromProduct.reference ? ` (${fromProduct.reference})` : '');
                        }
                        return fromField;
                      })()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-slate-600 font-semibold">Transfert vers</Label>
                    <p className="text-slate-900 mt-1">
                      {(() => {
                        const toField = transaction.transfer_to || transaction.to_field || 'balance';
                        if (toField === 'balance') {
                          return 'Solde';
                        }
                        if (toField === 'trading') {
                          return 'Trading';
                        }
                        const toProduct = products.find((p: any) => p.id === toField);
                        if (toProduct) {
                          return toProduct.name + (toProduct.reference ? ` (${toProduct.reference})` : '');
                        }
                        return toField;
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {hasSubscriptionOrProductInfo && isInvestmentTransfer && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-4">Formulaire de Souscription</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <Label className="text-slate-600 font-semibold">Date</Label>
                      <p className="text-slate-900 mt-1">
                        {new Date(transaction.datetime || transaction.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Prénom / Nom</Label>
                      <p className="text-slate-900 mt-1">
                        {`${subscriptionDetails?.firstName || ''} ${subscriptionDetails?.lastName || ''}`.trim() || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">IP</Label>
                      <p className="text-slate-900 mt-1">
                        {transactionIp}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Ville</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.city || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Date de naissance</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.birthDate || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-4">Produit (détails)</h3>
                  {productLoadError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-700">{productLoadError}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <Label className="text-slate-600 font-semibold">Catégorie</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.category || selectedProduct?.categoryTitle || selectedProduct?.category || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Nom</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.productName || selectedProduct?.name || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">N° contrat</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.productReference || selectedProduct?.reference || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Pays</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.country || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Date de souscription</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.subscriptionDate || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Durée</Label>
                      <p className="text-slate-900 mt-1">
                        {productDuration !== 'N/A' ? `${productDuration} Jours` : productDuration}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Période d&apos;intérêt choisie</Label>
                      <p className="text-slate-900 mt-1">
                        {chosenInterestPeriod}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Rentabilité produit</Label>
                      <p className="text-slate-900 mt-1">
                        {productProfitability}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Période de rentabilité (disponible)</Label>
                      <p className="text-slate-900 mt-1">
                        {productProfitabilityPeriod}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Période de versement (disponible)</Label>
                      <p className="text-slate-900 mt-1">
                        {productInterestPeriod}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Fonds disponibles à partir du</Label>
                      <p className="text-slate-900 mt-1">
                        {productAvailabilityStart}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Fonds disponibles jusqu&apos;au</Label>
                      <p className="text-slate-900 mt-1">
                        {productAvailabilityEnd}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Investissement</Label>
                      <p className="text-slate-900 mt-1 font-semibold">
                        {subscriptionDetails?.investment ? subscriptionDetails.investment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} €
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Profits</Label>
                      <p className="text-slate-900 mt-1 font-semibold text-green-600">
                        {subscriptionDetails?.profits ? subscriptionDetails.profits.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} €
                      </p>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-slate-600 font-semibold">TOTAL (Investissement + Profits)</Label>
                      <p className="text-slate-900 mt-1 font-bold text-lg">
                        {subscriptionDetails?.total ? subscriptionDetails.total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} €
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Conditions</Label>
                      <p className="text-slate-900 mt-1">
                        voir
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Signature de la transaction</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails?.hasSignature ? 'Signature' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Statut</Label>
                      <p className="text-slate-900 mt-1">
                        {getStatusLabel(transaction.status, transaction.type)}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            <div>
              <Label className="text-slate-600 font-semibold">Description</Label>
              <p className="text-slate-900 mt-1 whitespace-pre-wrap">
                {transaction.description ? transaction.description.replace(/SUBSCRIPTION_DETAILS:.*$/, '').trim() : 'Aucune description'}
              </p>
            </div>
            
            <div>
              <Label className="text-slate-600 font-semibold">Date de création</Label>
              <p className="text-slate-900 mt-1">
                {new Date(transaction.createdAt).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
          
          {/* Position Generation History Section */}
          {transaction.type === 'transfert' && transaction.position_generation_history && Array.isArray(transaction.position_generation_history) && transaction.position_generation_history.length > 0 && (
            <div className="border-t pt-4 mt-6">
              <h3 className="text-lg font-semibold mb-3">Historique de génération des positions</h3>
              <div className="max-h-96 overflow-y-auto pr-2">
                <div className="space-y-4">
                  {transaction.position_generation_history.map((historyEntry: any, idx: number) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-semibold text-slate-900 text-sm mb-1">
                            Génération #{idx + 1}
                          </div>
                          <div className="text-xs text-slate-600">
                            {historyEntry.timestamp ? new Date(historyEntry.timestamp).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 'Date inconnue'}
                          </div>
                        </div>
                      </div>
                      
                      {historyEntry.summary && (
                        <div className="mb-3 p-3 bg-white rounded border border-slate-200">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <Label className="text-xs text-slate-500">Positions générées</Label>
                              <p className="text-slate-900 font-semibold mt-1">
                                {historyEntry.summary.positions_generated || 0}
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-500">Total investi</Label>
                              <p className="text-slate-900 font-semibold mt-1">
                                {parseFloat(historyEntry.summary.total_invested || 0).toLocaleString('fr-FR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })} €
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-500">Total profit</Label>
                              <p className="text-green-600 font-semibold mt-1">
                                {parseFloat(historyEntry.summary.total_profit || 0).toLocaleString('fr-FR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })} €
                              </p>
                            </div>
                            {historyEntry.deleted_future_positions && historyEntry.deleted_future_positions.count > 0 && (
                              <div>
                                <Label className="text-xs text-slate-500">Positions supprimées</Label>
                                <p className="text-orange-600 font-semibold mt-1">
                                  {historyEntry.deleted_future_positions.count}
                                </p>
                              </div>
                            )}
                          </div>
                          
                          {historyEntry.summary.positions_by_asset && Object.keys(historyEntry.summary.positions_by_asset).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <Label className="text-xs text-slate-500 mb-2 block">Répartition par actif</Label>
                              <div className="space-y-2">
                                {Object.entries(historyEntry.summary.positions_by_asset).map(([assetId, summary]: [string, any]) => {
                                  const asset = assetsMap[assetId] || assets.find((a: any) => a.id === assetId);
                                  const assetName = asset ? (asset.name || asset.reference || `Actif ${assetId}`) : (assetId === 'none' ? 'Aucun actif' : `Actif ${assetId}`);
                                  return (
                                  <div key={assetId} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-700">
                                      {assetName}
                                    </span>
                                    <div className="flex gap-4">
                                      <span className="text-slate-600">
                                        {summary.count} position(s)
                                      </span>
                                      <span className="text-slate-700 font-medium">
                                        {parseFloat(summary.total_invested || 0).toLocaleString('fr-FR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })} €
                                      </span>
                                      <span className="text-green-600 font-medium">
                                        {parseFloat(summary.total_profit || 0).toLocaleString('fr-FR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })} €
                                      </span>
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {historyEntry.rates_used && Object.keys(historyEntry.rates_used).length > 0 && (
                        <div className="mb-3">
                          <Label className="text-xs text-slate-500 mb-2 block">Taux utilisés par période</Label>
                          <div className="bg-white rounded border border-slate-200 p-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              {Object.entries(historyEntry.rates_used).map(([periodIdx, rate]: [string, any]) => (
                                <div key={periodIdx} className="flex justify-between">
                                  <span className="text-slate-600">Période {parseInt(periodIdx) + 1}:</span>
                                  <span className="text-slate-900 font-semibold">{parseFloat(rate || 0).toFixed(2)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {historyEntry.period_summaries && historyEntry.period_summaries.length > 0 && (
                        <div>
                          <Label className="text-xs text-slate-500 mb-2 block">Détails des périodes</Label>
                          <div className="bg-white rounded border border-slate-200 overflow-x-auto">
                            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                              <thead>
                                <tr className="bg-slate-100 border-b border-slate-200">
                                  <th className="text-left p-2 font-semibold text-slate-700">Période</th>
                                  <th className="text-left p-2 font-semibold text-slate-700">Durée</th>
                                  <th className="text-left p-2 font-semibold text-slate-700">Dates</th>
                                  <th className="text-right p-2 font-semibold text-slate-700">Taux</th>
                                  <th className="text-right p-2 font-semibold text-slate-700">Capital base</th>
                                  <th className="text-right p-2 font-semibold text-slate-700">Profit cible</th>
                                </tr>
                              </thead>
                              <tbody>
                                {historyEntry.period_summaries.map((period: any, pIdx: number) => (
                                  <tr key={pIdx} className="border-b border-slate-100">
                                    <td className="p-2 text-slate-900">{period.periodIndex + 1}</td>
                                    <td className="p-2 text-slate-700">{period.months} mois</td>
                                    <td className="p-2 text-slate-700 text-xs">
                                      {period.startDate ? new Date(period.startDate).toLocaleDateString('fr-FR') : '-'} - {period.endDate ? new Date(period.endDate).toLocaleDateString('fr-FR') : '-'}
                                    </td>
                                    <td className="p-2 text-right text-slate-900 font-medium">{parseFloat(period.baseRatePct || period.ratePct || 0).toFixed(2)}%</td>
                                    <td className="p-2 text-right text-slate-700">
                                      {parseFloat(period.capitalBase || 0).toLocaleString('fr-FR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })} €
                                    </td>
                                    <td className="p-2 text-right text-green-600 font-medium">
                                      {parseFloat(period.targetProfit || 0).toLocaleString('fr-FR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })} €
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Transaction Logs Section */}
          {clientId && (
            <div className="border-t pt-4 mt-6">
              <h3 className="text-lg font-semibold mb-3">Historique des modifications</h3>
              {logsLoading ? (
                <p className="text-sm text-slate-500">Chargement des logs...</p>
              ) : transactionLogs.length > 0 ? (
                <div className="max-h-96 overflow-y-auto pr-2">
                  <div className="space-y-1.5">
                    {transactionLogs.map((log: any) => (
                      <div key={log.id} className="border border-slate-200 rounded p-2 mb-2 bg-slate-50">
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 text-xs">
                              {log.eventType === 'createTransaction' ? 'Création' : 'Modification'}
                            </span>
                            {log.userName && (
                              <span className="text-xs text-slate-600">
                                par {log.userName}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                            {new Date(log.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        {log.eventType === 'editTransaction' && log.oldValue && log.newValue && (
                          <div className="mt-1 space-y-0.5 text-xs">
                            {Object.keys(log.newValue).map((key) => {
                              const oldVal = log.oldValue[key];
                              const newVal = log.newValue[key];
                              if (oldVal !== newVal && key !== 'datetime') {
                                return (
                                  <div key={key} className="flex items-center gap-1.5">
                                    <span className="font-medium text-slate-700 capitalize min-w-[85px] text-xs shrink-0">
                                      {key === 'clientId' ? 'Client ID' :
                                       key === 'type' ? 'Type' :
                                       key === 'amount' ? 'Montant' :
                                       key === 'description' ? 'Description' :
                                       key === 'status' ? 'Statut' :
                                       key === 'transfer_from' ? 'De' :
                                       key === 'transfer_to' ? 'Vers' :
                                       key === 'productId' ? 'Produit ID' :
                                       key}:
                                    </span>
                                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                                      <span className="text-red-600 line-through text-xs">
                                        {key === 'amount' ? `${parseFloat(oldVal || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` :
                                         key === 'status' ? getStatusLabel(oldVal, transaction?.type) :
                                         key === 'type' ? getTypeLabel(oldVal) :
                                         String(oldVal || '-')}
                                      </span>
                                      <span className="text-green-600 font-medium text-xs">
                                        → {key === 'amount' ? `${parseFloat(newVal || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` :
                                            key === 'status' ? getStatusLabel(newVal, transaction?.type) :
                                            key === 'type' ? getTypeLabel(newVal) :
                                            String(newVal || '-')}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}
                        {log.eventType === 'createTransaction' && log.newValue && (
                          <div className="mt-0.5 text-xs text-slate-700">
                            Transaction créée avec les valeurs initiales
                          </div>
                        )}
                        {log.details && log.details.ip_address && (
                          <div className="mt-0.5 text-xs text-slate-500">
                            IP: {log.details.ip_address}
                            {log.details.browser && log.details.browser.browser && (
                              <span className="ml-1">• {log.details.browser.browser}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucun log disponible</p>
              )}
            </div>
          )}
          
          <div className="modal-form-actions mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Fermer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
