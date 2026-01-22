import React from 'react';
import { Button } from './ui/button';
import { ArrowLeftRight, Eye, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Helper functions for French labels
const getTypeLabel = (type: string): string => {
  const typeMap: { [key: string]: string } = {
    'depot': 'Dépôt',
    'retrait': 'Retrait',
    'bonus': 'Bonus',
    'achat': 'Achat',
    'vente': 'Vente',
    'interets': 'Intérêts',
    'frais': 'Frais',
    'investissement': 'Investissement',
    'transfert': 'Transfert',
    'perte': 'Perte',
  };
  return typeMap[type] || type;
};

const getStatusLabel = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    'en_attente_paiement': 'En attente de paiement',
    'en_cours': 'En cours',
    'termine': 'Terminé',
    'conteste': 'Contesté',
    'annule': 'Annulé',
  };
  return statusMap[status] || status;
};

// Get type colors
const getTypeColors = (type: string): { bg: string; text: string } => {
  const colorMap: { [key: string]: { bg: string; text: string } } = {
    'depot': { bg: '#dbeafe', text: '#1e40af' }, // blue
    'retrait': { bg: '#fee2e2', text: '#991b1b' }, // red
    'bonus': { bg: '#fef3c7', text: '#92400e' }, // yellow/amber
    'achat': { bg: '#dcfce7', text: '#15803d' }, // green
    'vente': { bg: '#dcfce7', text: '#15803d' }, // green
    'interets': { bg: '#d1fae5', text: '#065f46' }, // dark green
    'frais': { bg: '#fee2e2', text: '#991b1b' }, // red
    'investissement': { bg: '#e0e7ff', text: '#3730a3' }, // indigo
    'transfert': { bg: '#fce7f3', text: '#9f1239' }, // pink
    'perte': { bg: '#fee2e2', text: '#991b1b' }, // red
  };
  return colorMap[type] || { bg: '#f1f5f9', text: '#475569' }; // default gray
};

// Extract asset/product name and reference from description
const extractAssetInfo = (description: string): { name: string; reference: string | null; displayText: string } => {
  if (!description) return { name: '-', reference: null, displayText: '-' };
  
  // Pattern for transfert: "Transfert de Balance Cash vers Nom (Référence)"
  const transfertPattern = /Transfert de Balance Cash vers\s+([^(]+?)(?:\s*\(([^)]+)\))?/i;
  const transfertMatch = description.match(transfertPattern);
  if (transfertMatch) {
    const name = transfertMatch[1].trim();
    const reference = transfertMatch[2] ? transfertMatch[2].trim() : null;
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

interface TransactionListProps {
  transactions: any[];
  assets?: any[];
  products?: any[];
  clients?: any[];
  showClientColumn?: boolean;
  showIcons?: boolean;
  onView?: (transaction: any) => void;
  onEdit?: (transaction: any) => void;
  emptyMessage?: string;
}

export function TransactionList({
  transactions,
  assets = [],
  products = [],
  clients = [],
  showClientColumn = false,
  showIcons = true,
  onView,
  onEdit,
  emptyMessage = 'Aucune transaction trouvée'
}: TransactionListProps) {
  const navigate = useNavigate();

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
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const client = clients.find(c => c.id === transaction.clientId);
            
            // Get product/asset info - prioritize productId from transaction
            let productName = '-';
            let productId: string | null = null;
            let displayText = '-';
            
            // First, check if transaction has productId directly
            if (transaction.productId) {
              productId = transaction.productId;
              // Use productName from transaction if available, otherwise look it up
              if (transaction.productName) {
                productName = transaction.productName;
                displayText = transaction.productReference 
                  ? `${transaction.productName} (${transaction.productReference})`
                  : transaction.productName;
              } else {
                // Look up product by ID
                const product = products.find(p => p.id === transaction.productId);
                if (product) {
                  productName = product.name;
                  displayText = product.reference 
                    ? `${product.name} (${product.reference})`
                    : product.name;
                }
              }
            } else {
              // Fallback: try to extract from description
              const assetInfo = extractAssetInfo(transaction.description || '');
              productId = findAssetProductId(assetInfo.name, assetInfo.reference);
              displayText = assetInfo.displayText;
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
                      {parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  ) : (
                    <span className={`font-medium ${transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? 'text-red-600' : 'text-green-600'}`}>
                      {transaction.type === 'retrait' || transaction.type === 'perte' || transaction.type === 'frais' ? '-' : '+'}{parseFloat(transaction.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
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
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex gap-2 justify-end relative" style={{ zIndex: 10 }}>
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
