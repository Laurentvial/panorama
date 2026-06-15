const normalizeEndpointValue = (value: unknown): string => String(value ?? '').trim();

export const normalizeProductEndpointId = (value: unknown): string | null => {
  const normalized = normalizeEndpointValue(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === 'solde' || lower === 'trading') return null;
  return normalized;
};

const readTransferEndpoints = (transaction: any) => {
  const toRaw = normalizeEndpointValue(
    transaction?.to ?? transaction?.to_field ?? transaction?.transfer_to ?? transaction?.transferTo ?? null
  );
  const fromRaw = normalizeEndpointValue(
    transaction?.from ?? transaction?.from_field ?? transaction?.transfer_from ?? transaction?.transferFrom ?? null
  );
  const toLower = toRaw.toLowerCase();
  const fromLower = fromRaw.toLowerCase();
  const toProductId = normalizeProductEndpointId(toRaw);
  const fromProductId = normalizeProductEndpointId(fromRaw);
  const fallbackProductId = normalizeProductEndpointId(
    transaction?.productId ?? transaction?.product_id ?? transaction?.subscription_details?.productId ?? null
  );

  return {
    toRaw,
    fromRaw,
    toLower,
    fromLower,
    toProductId,
    fromProductId,
    fallbackProductId,
  };
};

export type TransferDirection =
  | 'solde_to_product'
  | 'product_to_solde'
  | 'product_to_product'
  | 'legacy_to_product'
  | 'legacy_from_product'
  | 'other';

export const classifyTransferDirection = (transaction: any): TransferDirection => {
  if (String(transaction?.type || '') !== 'transfert') return 'other';
  const { toLower, fromLower, toProductId, fromProductId, fallbackProductId } = readTransferEndpoints(transaction);

  if (fromLower === 'solde' && toProductId) return 'solde_to_product';
  if (toLower === 'solde' && fromProductId) return 'product_to_solde';
  if (fromProductId && toProductId) return 'product_to_product';
  if (toProductId || fallbackProductId) return 'legacy_to_product';
  if (fromProductId) return 'legacy_from_product';
  return 'other';
};

export const getTransferGlobalDelta = (transaction: any, rawAmount: number): number => {
  if (String(transaction?.type || '') !== 'transfert') return 0;
  if (!Number.isFinite(rawAmount) || rawAmount === 0) return 0;
  const amount = Math.abs(rawAmount);
  const direction = classifyTransferDirection(transaction);

  switch (direction) {
    case 'solde_to_product':
    case 'legacy_to_product':
      return amount;
    case 'product_to_solde':
    case 'legacy_from_product':
      return -amount;
    case 'product_to_product':
    case 'other':
    default:
      return 0;
  }
};

export const getTransferProductMovements = (
  transaction: any,
  rawAmount: number
): Array<{ productId: string; delta: number }> => {
  if (String(transaction?.type || '') !== 'transfert') return [];
  if (!Number.isFinite(rawAmount) || rawAmount === 0) return [];
  const amount = Math.abs(rawAmount);
  const { toLower, fromLower, toProductId, fromProductId, fallbackProductId } = readTransferEndpoints(transaction);

  if (fromLower === 'solde' && toProductId) return [{ productId: toProductId, delta: amount }];
  if (toLower === 'solde' && fromProductId) return [{ productId: fromProductId, delta: -amount }];
  if (fromProductId && toProductId) {
    return [
      { productId: fromProductId, delta: -amount },
      { productId: toProductId, delta: amount },
    ];
  }
  if (toProductId) return [{ productId: toProductId, delta: amount }];
  if (fromProductId) return [{ productId: fromProductId, delta: -amount }];
  if (fallbackProductId) return [{ productId: fallbackProductId, delta: amount }];
  return [];
};
