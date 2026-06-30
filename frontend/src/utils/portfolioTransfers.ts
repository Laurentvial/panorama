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

const parseProfitLoss = (value: unknown): number | null => {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : null;
};

const resolveProductId = (value: any): string | null => {
  const raw =
    value?.productId ??
    value?.product_id ??
    value?.product?.id ??
    value?.subscription_details?.productId ??
    value?.subscriptionDetails?.productId ??
    null;
  if (raw == null) return null;
  const id = String(raw).trim();
  return id ? id : null;
};

const TERM_GAIN_POSITION_STATUSES = new Set(['pending', 'open', 'done']);

/** Sum profit_loss on pending + open + done positions for one product (gains attendus au terme). */
export function computeProductTermGains(
  productId: string,
  positions: any[],
  transactions?: any[],
  isCompletedStatus?: (status: unknown) => boolean
): number | null {
  const productKey = String(productId);

  let fromPositions = 0;
  let hasPositionRows = false;
  for (const p of positions || []) {
    const status = String(p?.status || '').trim().toLowerCase();
    if (status === 'cancelled' || !TERM_GAIN_POSITION_STATUSES.has(status)) continue;

    const posProductId = resolveProductId(p);
    if (!posProductId || posProductId !== productKey) continue;

    hasPositionRows = true;
    const gainNum = parseProfitLoss(p?.profit_loss);
    if (gainNum != null) fromPositions += gainNum;
  }

  if (hasPositionRows) {
    return fromPositions !== 0 ? fromPositions : null;
  }

  if (!transactions?.length || !isCompletedStatus) return null;

  let fromSubscriptions = 0;
  let hasSubscriptionProfits = false;
  for (const t of transactions) {
    if (!isCompletedStatus(t?.status) || String(t?.type || '') !== 'transfert') continue;

    const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
    const amt = Number.isFinite(amountNum) ? Math.abs(amountNum) : 0;
    if (!amt) continue;

    const movements = getTransferProductMovements(t, amt);
    const inflowToProduct = movements.some((m) => m.productId === productKey && m.delta > 0);
    if (!inflowToProduct) continue;

    const profitsRaw = t?.subscription_profits ?? t?.subscription_details?.profits;
    if (profitsRaw == null) continue;
    const profitsNum = typeof profitsRaw === 'string' ? parseFloat(profitsRaw) : Number(profitsRaw);
    if (!Number.isFinite(profitsNum)) continue;

    fromSubscriptions += profitsNum;
    hasSubscriptionProfits = true;
  }

  if (hasSubscriptionProfits && fromSubscriptions !== 0) return fromSubscriptions;
  return null;
}

/** Sum profit_loss on open + done positions for one product (total interest/gains created). */
export function computeProductAccruedGains(productId: string, positions: any[]): number {
  const productKey = String(productId);

  let accruedGains = 0;
  for (const p of positions || []) {
    const status = String(p?.status || '').trim().toLowerCase();
    if (status !== 'open' && status !== 'done') continue;

    const posProductId = resolveProductId(p);
    if (!posProductId || posProductId !== productKey) continue;

    const gainNum = parseProfitLoss(p?.profit_loss);
    if (gainNum != null) accruedGains += gainNum;
  }

  return accruedGains;
}

/** Accrued gains (open + done positions) minus paid interest transactions for one product. */
export function computeProductUnpaidGains(
  productId: string,
  positions: any[],
  transactions: any[],
  isCompletedStatus: (status: unknown) => boolean
): number {
  const productKey = String(productId);
  const accruedGains = computeProductAccruedGains(productKey, positions);

  let paidInterests = 0;
  for (const t of transactions || []) {
    if (!isCompletedStatus(t?.status) || String(t?.type || '') !== 'interets') continue;

    const txnProductId = resolveProductId(t);
    if (!txnProductId || txnProductId !== productKey) continue;

    const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
    const amt = Number.isFinite(amountNum) ? Math.abs(amountNum) : 0;
    if (amt > 0) paidInterests += amt;
  }

  return accruedGains - paidInterests;
}

/** Sum profit_loss on open positions (accrued but not yet closed). */
export function sumOpenPositionAccruedGains(positions: any[]): number {
  let total = 0;
  for (const p of positions || []) {
    if (String(p?.status || '').trim().toLowerCase() !== 'open') continue;
    const gainNum = parseProfitLoss(p?.profit_loss);
    if (gainNum != null) total += gainNum;
  }
  return total;
}

/** Net capital contributed (depots + bonus − retraits), excluding reintegrated interest. */
export function computeNetContributions(
  transactions: any[],
  isCompletedStatus: (status: unknown) => boolean
): number {
  let net = 0;
  let effectiveCurrency: string | null = null;

  const completed = (transactions || [])
    .filter((t) => isCompletedStatus(t?.status))
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  for (const transaction of completed) {
    const amount =
      typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
    const amt = Number.isFinite(amount) ? amount : 0;
    const txnCcy = (transaction.amountCurrency || transaction.amount_currency || 'EUR')
      .toString()
      .trim()
      .toUpperCase();

    if (transaction.type === 'conversion') {
      net = amt;
      effectiveCurrency = txnCcy;
      continue;
    }
    if (effectiveCurrency === null) effectiveCurrency = txnCcy;
    if (txnCcy !== effectiveCurrency) continue;

    switch (transaction.type) {
      case 'depot':
      case 'bonus':
        net += amt;
        break;
      case 'retrait':
        net -= amt;
        break;
      default:
        break;
    }
  }

  return net;
}

/** Client-facing portfolio gain: current value minus net contributions. */
export function computePortfolioDisplayPerformance(
  portfolioValue: number,
  netContributions: number
): { gain: number; pct: number | null } {
  const gain = portfolioValue - netContributions;
  const pct = netContributions > 0 ? (gain / netContributions) * 100 : null;
  return { gain, pct };
}
