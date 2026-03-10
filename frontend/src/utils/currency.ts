/**
 * Currency utilities for multi-currency display.
 * EUR, USD, CHF supported.
 */

export type SupportedCurrency = 'EUR' | 'USD' | 'CHF';

export function getCurrencySymbol(currency: string | undefined | null): string {
  const c = (currency ?? 'EUR').toString().trim().toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'CHF') return 'CHF';
  return '€';
}

export function getCurrencyLabel(currency: string | undefined | null): string {
  const c = (currency ?? 'EUR').toString().trim().toUpperCase();
  if (c === 'USD') return 'Dollar US';
  if (c === 'CHF') return 'Franc suisse';
  return 'Euro';
}

/** Format amount with currency symbol (e.g. "1 234,56 €" or "1,234.56 $" or "1 234,56 CHF") */
export function formatAmount(
  amount: number,
  currency: string | undefined | null,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const sym = getCurrencySymbol(currency);
  const opts = {
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  };
  const formatted = amount.toLocaleString('fr-FR', opts);
  if (sym === 'CHF') {
    return `${formatted} ${sym}`;
  }
  return `${formatted} ${sym}`;
}
