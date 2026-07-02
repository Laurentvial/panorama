/** Shared subscription profitability simulation (aligned with ProductDetail + backend position_service). */

export function parseFinancialValue(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function parseDurationDays(duration: unknown): number {
  if (!duration) return 0;
  const m = String(duration).match(/(\d+)/);
  const v = m ? parseInt(m[1], 10) : 0;
  if (!Number.isFinite(v) || v <= 0) return 0;
  // Backward compat: typical month values (1-24) → months * 30; 25+ (e.g. 30, 90, 365) → days
  if (v <= 24) return v * 30;
  return v;
}

export function profitabilityPeriodMonths(period: unknown, durationDays: number): number {
  const p = String(period || '').trim().toLowerCase();
  if (!p) return 1;
  if (p.includes('fin') && (p.includes('contrat') || p.includes('matur'))) {
    return Math.max(1, Math.floor((durationDays || 30) / 30));
  }
  if (p.includes('mens')) return 1;
  if (p.includes('trim')) return 3;
  if (p.includes('sem')) return 6;
  if (p.includes('ann') || p === 'an' || p.includes('année') || p.includes('annee')) return 12;
  const m = p.match(/(\d+)/);
  const v = m ? parseInt(m[1], 10) : 0;
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function isCompoundingInterestPeriod(period: unknown): boolean {
  const p = String(period || '').trim().toLowerCase();
  return p.includes('fin') && (p.includes('contrat') || p.includes('matur'));
}

export function resolveSubscriptionInterestPeriod(transaction: any, product?: any): string {
  const raw =
    transaction?.subscription_interest_period ??
    transaction?.subscriptionInterestPeriod ??
    transaction?.subscription_details?.interestPeriod ??
    transaction?.subscriptionDetails?.interestPeriod ??
    product?.interestPeriod ??
    product?.interest_period ??
    '';
  return String(raw).split(',')[0].trim();
}

export function resolveSubscriptionDuration(transaction: any, product?: any): string {
  const raw =
    transaction?.subscription_duration ??
    transaction?.subscriptionDuration ??
    transaction?.subscription_details?.duration ??
    transaction?.subscriptionDetails?.duration ??
    product?.duration ??
    '';
  return String(raw || '').trim();
}

function getRateBoundsPct(product: any): { min: number; max: number; avg: number } {
  const min = parseFinancialValue(product?.profitability);
  const maxRaw = parseFinancialValue(product?.variableProfitability ?? product?.variable_profitability);
  const isVar =
    (product?.isVariableProfitability === 'Oui' || product?.is_variable_profitability === 'Oui') && maxRaw > 0;
  const max = isVar ? maxRaw : min;
  const avg = isVar ? (min + max) / 2 : min;
  return { min, max, avg };
}

export function simulateSubscriptionTermProfits(
  product: any,
  principal: number,
  opts?: { rateMode?: 'min' | 'avg' | 'max'; interestPeriod?: string }
): number {
  if (!product) return 0;
  if (product?.showRates === false) return 0;

  const durationDays = parseDurationDays(product?.duration);
  const periodMonths = profitabilityPeriodMonths(
    product?.profitabilityPeriod ?? product?.profitability_period,
    durationDays
  );
  const durationMonthsApprox = Math.max(1, Math.floor(durationDays / 30));
  const selectedInterestPeriod =
    String(opts?.interestPeriod || '').trim() ||
    String(product?.interestPeriod || product?.interest_period || '').split(',')[0].trim();
  const compound = isCompoundingInterestPeriod(selectedInterestPeriod);

  const bounds = getRateBoundsPct(product);
  let pickedRatePct = bounds.avg;
  if (opts?.rateMode === 'min') pickedRatePct = bounds.min;
  if (opts?.rateMode === 'max') pickedRatePct = bounds.max;

  const safePrincipal = Number.isFinite(principal) ? Math.max(0, principal) : 0;
  if (safePrincipal <= 0 || durationDays <= 0 || pickedRatePct <= 0) return 0;

  let remaining = durationMonthsApprox;
  let capital = safePrincipal;
  let totalProfit = 0;

  while (remaining > 0) {
    const step = Math.min(periodMonths, remaining);
    const proration = periodMonths > 0 ? step / periodMonths : 1;
    const effectiveRatePct = pickedRatePct * proration;
    const base = compound ? capital : safePrincipal;
    const profit = base * (effectiveRatePct / 100);
    totalProfit += profit;
    capital = compound ? capital + profit : safePrincipal + totalProfit;
    remaining -= step;
  }

  return totalProfit;
}

/** Expected term profit for a validated investment transfer without positions. */
export function estimateTransferTermProfits(transaction: any, amount: number, product?: any): number | null {
  if (!product || product?.showRates === false) {
    const stored = transaction?.subscription_profits ?? transaction?.subscription_details?.profits;
    if (stored == null) return null;
    const num = typeof stored === 'string' ? parseFloat(stored) : Number(stored);
    return Number.isFinite(num) && num !== 0 ? num : null;
  }

  const interestPeriod = resolveSubscriptionInterestPeriod(transaction, product);
  const compound = isCompoundingInterestPeriod(interestPeriod);
  const duration = resolveSubscriptionDuration(transaction, product);
  const productForSim =
    duration && duration !== String(product?.duration || '').trim() ? { ...product, duration } : product;

  if (compound) {
    const simulated = simulateSubscriptionTermProfits(productForSim, amount, {
      interestPeriod,
      rateMode: 'avg',
    });
    if (simulated !== 0) return simulated;
  }

  const profitsRaw = transaction?.subscription_profits ?? transaction?.subscription_details?.profits;
  if (profitsRaw != null) {
    const profitsNum = typeof profitsRaw === 'string' ? parseFloat(profitsRaw) : Number(profitsRaw);
    if (Number.isFinite(profitsNum) && profitsNum !== 0) return profitsNum;
  }

  const simulated = simulateSubscriptionTermProfits(productForSim, amount, {
    interestPeriod,
    rateMode: 'avg',
  });
  return simulated !== 0 ? simulated : null;
}
