import React, { useState, useEffect } from 'react';
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
      if (subscriptionDetails && subscriptionDetails.productId) {
        setProductLoadError(null);
        apiCall(`/api/products/${subscriptionDetails.productId}/`)
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

  if (!isOpen || !transaction) return null;

  const subscriptionDetails = parseSubscriptionDetails(transaction);
  const assetInfo = extractAssetInfo(transaction.description || '');
  const assetProductId = findAssetProductId(assetInfo.name, assetInfo.reference);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', width: 'min(1200px, 90vw)' }}>
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
                  <span 
                    className="px-2 py-1 rounded text-xs font-medium inline-block"
                    style={{
                      backgroundColor: transaction.status === 'termine' ? '#dcfce7' :
                                      transaction.status === 'en_attente_paiement' || transaction.status === 'en_cours' ? '#fed7aa' :
                                      transaction.status === 'conteste' ? '#fee2e2' :
                                      transaction.status === 'annule' ? '#e5e7eb' :
                                      '#f1f5f9',
                      color: transaction.status === 'termine' ? '#15803d' :
                             transaction.status === 'en_attente_paiement' || transaction.status === 'en_cours' ? '#c2410c' :
                             transaction.status === 'conteste' ? '#991b1b' :
                             transaction.status === 'annule' ? '#6b7280' :
                             '#475569',
                      zIndex: 1,
                      position: 'relative'
                    }}
                  >
                    {getStatusLabel(transaction.status)}
                  </span>
                </div>
              </div>
              
              <div>
                <Label className="text-slate-600 font-semibold">Actif</Label>
                {assetProductId ? (
                  <p 
                    className="text-slate-900 mt-1 cursor-pointer hover:text-blue-600 hover:underline"
                    onClick={() => navigate(`/platform/product/${assetProductId}`)}
                  >
                    {assetInfo.displayText}
                  </p>
                ) : (
                  <p className="text-slate-900 mt-1">
                    {assetInfo.displayText}
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
            
            {transaction.type === 'transfert' && subscriptionDetails && (
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
                        {subscriptionDetails.firstName} {subscriptionDetails.lastName}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">IP</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.ip || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Ville</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.city || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Date de naissance</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.birthDate || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-4">Produit</h3>
                  {productLoadError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-700">{productLoadError}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <Label className="text-slate-600 font-semibold">Catégorie</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.category || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Nom</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.productName || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">N° contrat</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.productReference || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Pays</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.country || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Date de souscription</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.subscriptionDate || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Durée</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.duration || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Versement des intérêts</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.interestPeriod || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">TAUX FIXE ANNUEL (sur le tarif de base)</Label>
                      <p className="text-slate-900 mt-1">
                        {subscriptionDetails.profitability || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Investissement</Label>
                      <p className="text-slate-900 mt-1 font-semibold">
                        {subscriptionDetails.investment ? subscriptionDetails.investment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} €
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Profits</Label>
                      <p className="text-slate-900 mt-1 font-semibold text-green-600">
                        {subscriptionDetails.profits ? subscriptionDetails.profits.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} €
                      </p>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-slate-600 font-semibold">TOTAL (Investissement + Profits)</Label>
                      <p className="text-slate-900 mt-1 font-bold text-lg">
                        {subscriptionDetails.total ? subscriptionDetails.total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} €
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
                        {subscriptionDetails.hasSignature ? 'Signature' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-600 font-semibold">Statut</Label>
                      <p className="text-slate-900 mt-1">
                        {transaction.status === 'en_cours' ? 'En vérification' : getStatusLabel(transaction.status)}
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
                      <div key={log.id} className="border border-slate-200 rounded p-2 bg-slate-50">
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
                                         key === 'status' ? getStatusLabel(oldVal) :
                                         key === 'type' ? getTypeLabel(oldVal) :
                                         String(oldVal || '-')}
                                      </span>
                                      <span className="text-green-600 font-medium text-xs">
                                        → {key === 'amount' ? `${parseFloat(newVal || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` :
                                            key === 'status' ? getStatusLabel(newVal) :
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
