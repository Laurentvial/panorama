import React from 'react';
import { formatAmount } from '../utils/currency';

export const getPositionStatusLabel = (status: string): string => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'pending':
      return 'À venir';
    case 'open':
      return 'Ouverte';
    case 'done':
      return 'Fermée';
    case 'cancelled':
      return 'Annulée';
    default:
      return status || '-';
  }
};

export const getPositionStatusColors = (status: string): { bg: string; text: string } => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'pending':
      return { bg: '#fef3c7', text: '#92400e' };
    case 'open':
      return { bg: '#dbeafe', text: '#1e40af' };
    case 'done':
      return { bg: '#dcfce7', text: '#15803d' };
    case 'cancelled':
      return { bg: '#f1f5f9', text: '#64748b' };
    default:
      return { bg: '#f1f5f9', text: '#475569' };
  }
};

export const tableStatusBadgeClass = 'table-status-badge';

export function PositionStatusBadge({ status }: { status: string }) {
  const label = getPositionStatusLabel(status);
  const { bg, text } = getPositionStatusColors(status);

  return (
    <span
      className={tableStatusBadgeClass}
      style={{
        backgroundColor: bg,
        color: text,
        borderColor: `${text}2e`,
      }}
    >
      {label}
    </span>
  );
}

export const computePositionPnlPct = (pnl: number | null | undefined, invested: number | null | undefined): number | null => {
  if (pnl == null || !Number.isFinite(pnl) || invested == null || !Number.isFinite(invested) || invested <= 0) {
    return null;
  }
  const pct = (pnl / invested) * 100;
  return Number.isFinite(pct) ? pct : null;
};

export const formatPositionPnlWithPct = (
  pnl: number | null | undefined,
  invested: number | null | undefined,
  currency = 'EUR'
): { main: string; pct: string | null; isPositive: boolean | null } => {
  if (pnl == null || !Number.isFinite(pnl)) {
    return { main: '-', pct: null, isPositive: null };
  }

  const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
  const main = `${sign}${formatAmount(Math.abs(pnl), currency)}`;
  const pnlPct = computePositionPnlPct(pnl, invested);
  const pct =
    pnlPct != null
      ? `(${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`
      : null;

  return { main, pct, isPositive: pnl >= 0 };
};

export const positionsTableShellClass = 'rounded-lg border border-slate-200 bg-white shadow-sm';
export const positionsTableClass = 'w-full caption-bottom text-sm';
export const positionsTableHeadClass = 'bg-slate-50/90 shadow-[inset_0_-1px_0_0_rgba(148,163,184,0.25)]';
export const positionsTableHeadRowClass = 'border-b border-slate-200/90';
export const positionsTableHeadCellClass =
  'positions-table-head-cell h-12 px-4 align-middle text-sm font-semibold text-slate-700 whitespace-nowrap';
export const positionsTableBodyClass = '[&_tr:last-child]:border-0';
export const positionsTableRowClass =
  'group border-b border-slate-100 transition-colors hover:bg-slate-50/70';
export const positionsTableCellClass = 'px-4 py-3 align-middle text-slate-700';
export const ASSET_LOGO_NAME_GAP_PX = 16;

export const getAssetLogoUrl = (asset: any): string =>
  String(asset?.logoUrl || asset?.logo_url || '').trim();

export const getAssetLogoUrlFromSources = (...sources: any[]): string => {
  for (const source of sources) {
    const url = getAssetLogoUrl(source);
    if (url) return url;
    const nestedUrl = String(source?.asset?.logoUrl || source?.asset?.logo_url || '').trim();
    if (nestedUrl) return nestedUrl;
    const positionUrl = String(source?.assetLogoUrl || source?.asset_logo_url || '').trim();
    if (positionUrl) return positionUrl;
  }
  return '';
};

export function AssetLogo({
  logoUrl,
  name,
  size = 28,
  objectFit = 'contain',
}: {
  logoUrl?: string | null;
  name?: string | null;
  size?: number;
  objectFit?: 'contain' | 'cover';
}) {
  const url = String(logoUrl || '').trim();
  const label = String(name || 'Asset').trim() || 'Asset';

  if (!url) {
    return (
      <div
        className="shrink-0 rounded-lg bg-slate-100"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={`shrink-0 rounded-lg bg-white ${objectFit === 'cover' ? 'object-cover' : 'object-contain'}`}
      style={{ width: size, height: size }}
      title={label}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export function AssetNameWithLogo({
  name,
  logoUrl,
  className = '',
  nameClassName = 'font-medium text-slate-900',
}: {
  name?: string | null;
  logoUrl?: string | null;
  className?: string;
  nameClassName?: string;
}) {
  const label = String(name || '').trim();
  if (!label || label === '-') {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className={`flex min-w-0 items-center ${className}`.trim()}>
      <div className="shrink-0" style={{ marginRight: ASSET_LOGO_NAME_GAP_PX }}>
        <AssetLogo logoUrl={logoUrl} name={label} />
      </div>
      <span className={`truncate ${nameClassName}`.trim()}>{label}</span>
    </div>
  );
}
