import React from 'react';
import { Euro, DollarSign, Banknote } from 'lucide-react';
import { cn } from './ui/utils';

interface CurrencyIconProps {
  currency?: string | null;
  className?: string;
  size?: number;
}

/** Renders the appropriate currency icon (Euro, DollarSign, Banknote for CHF). */
export function CurrencyIcon({ currency, className, size = 16 }: CurrencyIconProps) {
  const c = (currency ?? 'EUR').toString().trim().toUpperCase();
  const iconClass = cn('text-muted-foreground', className);

  if (c === 'USD') {
    return <DollarSign className={iconClass} style={{ width: size, height: size }} />;
  }
  if (c === 'CHF') {
    return <Banknote className={iconClass} style={{ width: size, height: size }} />;
  }
  return <Euro className={iconClass} style={{ width: size, height: size }} />;
}
