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

export const getStatusLabel = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    'en_attente_paiement': 'En attente de paiement',
    'en_cours': 'En cours',
    'termine': 'Terminé',
    'conteste': 'Contesté',
    'annule': 'Annulé',
  };
  return statusMap[status] || status;
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
  
  // Pattern for transfert: "Transfert de [from] vers [to]." or "Transfert de Balance Cash vers Nom (Référence)"
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
    statuses: ['en_attente_paiement', 'en_cours', 'termine', 'conteste', 'annule']
  },
  retrait: {
    label: 'Retrait',
    statuses: ['en_cours', 'termine', 'annule']
  },
  bonus: {
    label: 'Bonus',
    statuses: ['en_cours', 'termine', 'annule']
  },
  achat: {
    label: 'Achat',
    statuses: ['en_cours', 'termine', 'annule']
  },
  vente: {
    label: 'Vente',
    statuses: ['en_cours', 'termine', 'annule']
  },
  interets: {
    label: 'Intérêts',
    statuses: ['en_cours', 'termine', 'annule']
  },
  frais: {
    label: 'Frais',
    statuses: ['en_cours', 'termine', 'annule']
  },
  transfert: {
    label: 'Transfert',
    statuses: ['en_cours', 'termine', 'annule']
  },
  perte: {
    label: 'Perte',
    statuses: ['termine', 'annule']
  }
};

export const STATUS_LABELS: { [key: string]: string } = {
  en_attente_paiement: 'En attente de paiement',
  en_cours: 'En cours',
  termine: 'Terminé',
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
