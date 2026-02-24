// Shared transaction utilities and constants

export const getTypeLabel = (type: string): string => {
  const typeMap: { [key: string]: string } = {
    'depot': 'Dépôt',
    'retrait': 'Retrait',
    'bonus': 'Bonus',
    'achat': 'Achat',
    'vente': 'Vente',
    'interets': 'Intérêts',
    'frais': 'Frais',
    'transfert': 'Transfert',
    'perte': 'Perte',
  };
  return typeMap[type] || type;
};

export const getStatusLabel = (status: string, transactionType?: string): string => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const type = String(transactionType || '').toLowerCase();
  // For bonus, transfert, interets - show "En attente" instead of "En cours"
  if (normalizedStatus === 'en_cours' && ['bonus', 'transfert', 'interets'].includes(type)) {
    return 'En attente';
  }
  const statusMap: { [key: string]: string } = {
    'en_attente_paiement': 'En attente de paiement',
    'en_cours': 'En cours',
    'valide': 'Validé',
    'validé': 'Validé',
    'conteste': 'Contesté',
    'annule': 'Annulé',
  };
  return statusMap[normalizedStatus] || status;
};

/** Returns background and text colors for status badges. Validé=green, En attente=orange. */
export const getStatusColors = (status: string, transactionType?: string): { bg: string; text: string } => {
  const s = String(status || '').trim().toLowerCase();
  const type = String(transactionType || '').toLowerCase();
  if (s === 'valide' || s === 'validé') return { bg: '#dcfce7', text: '#15803d' }; // green
  if (s === 'en_cours' || s === 'en_attente_paiement') return { bg: '#fed7aa', text: '#c2410c' }; // orange
  if (s === 'conteste') return { bg: '#fee2e2', text: '#991b1b' }; // red
  if (s === 'annule') return { bg: '#e5e7eb', text: '#6b7280' }; // gray
  return { bg: '#f1f5f9', text: '#475569' };
};

export const getTypeColors = (type: string): { bg: string; text: string } => {
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

export const extractAssetInfo = (description: string): { name: string; reference: string | null; displayText: string } => {
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

export const TRANSACTION_TYPES = {
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

export const STATUS_LABELS: { [key: string]: string } = {
  en_attente_paiement: 'En attente de paiement',
  en_cours: 'En cours',
  valide: 'Validé',
  conteste: 'Contesté',
  annule: 'Annulé'
};

// Parse subscription details from transaction
export const parseSubscriptionDetails = (transaction: any): any | null => {
  if (!transaction) return null;
  
  // First try to get from subscription_details field (preferred)
  if (transaction.subscription_details && typeof transaction.subscription_details === 'object') {
    return transaction.subscription_details;
  }
  
  // Fallback: try to parse from description
  if (transaction.description && transaction.description.includes('SUBSCRIPTION_DETAILS:')) {
    try {
      const detailsMatch = transaction.description.match(/SUBSCRIPTION_DETAILS:(.+)$/);
      if (detailsMatch && detailsMatch[1]) {
        return JSON.parse(detailsMatch[1]);
      }
    } catch (error) {
      console.error('Error parsing subscription details from description:', error);
    }
  }
  
  return null;
};
