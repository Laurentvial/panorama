import { useEffect, useState } from 'react';

const BADGE_SOURCES = new Map<string, number>();
const badgeAccessListeners = new Set<() => void>();
let originalFaviconHref: string | null = null;
let badgeDrawToken = 0;
let faviconBadgeEnabled = false;
let faviconVisible = true;

function isBadgedFaviconHref(href: string): boolean {
  // Canvas badges are always PNG; default/custom data URLs (e.g. SVG) are not badges.
  return href.startsWith('data:image/png');
}

function notifyBadgeAccessChange() {
  badgeAccessListeners.forEach((listener) => listener());
}

export function isFaviconBadgePublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/admin/login' ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/invite/') ||
    pathname === '/logout'
  );
}

export function removeAllFavicons() {
  badgeDrawToken += 1;
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((link) => link.remove());
}

function replaceFaviconHref(href: string) {
  removeAllFavicons();

  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  document.head.appendChild(link);
}

function showStoredFavicon() {
  if (!faviconVisible) {
    removeAllFavicons();
    return;
  }

  if (faviconBadgeEnabled && getAggregateUnreadCount() > 0) {
    void refreshFaviconBadge();
    return;
  }

  replaceFaviconHref(getOriginalFaviconHref());
}

export function setFaviconBadgeEnabled(enabled: boolean) {
  const wasEnabled = faviconBadgeEnabled;
  faviconBadgeEnabled = enabled;
  showStoredFavicon();
  if (wasEnabled !== enabled) {
    notifyBadgeAccessChange();
  }
}

export function clearAllFaviconBadgeSources() {
  BADGE_SOURCES.clear();
  showStoredFavicon();
}

function getDefaultFaviconDataUrl(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#030213"/></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function setOriginalFaviconHref(href: string) {
  if (!href || isBadgedFaviconHref(href)) return;
  originalFaviconHref = href;
  showStoredFavicon();
}

function getOriginalFaviconHref(): string {
  if (originalFaviconHref && !isBadgedFaviconHref(originalFaviconHref)) {
    return originalFaviconHref;
  }

  const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (link?.href && !isBadgedFaviconHref(link.href)) {
    originalFaviconHref = link.href;
    return link.href;
  }

  const fallback = getDefaultFaviconDataUrl();
  originalFaviconHref = fallback;
  return fallback;
}

function getAggregateUnreadCount(): number {
  if (BADGE_SOURCES.size === 0) return 0;

  const crmTotal = Math.max(
    BADGE_SOURCES.get('crm-notifications') ?? 0,
    BADGE_SOURCES.get('crm-messages') ?? 0,
  );

  const platformTotal =
    (BADGE_SOURCES.get('platform-notifications') ?? 0) +
    (BADGE_SOURCES.get('platform-messages') ?? 0);

  return crmTotal + platformTotal;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawBadgeOnFavicon(count: number): Promise<void> {
  if (!faviconVisible || !faviconBadgeEnabled || count <= 0) {
    showStoredFavicon();
    return;
  }

  const token = ++badgeDrawToken;
  const href = getOriginalFaviconHref();
  const img = await loadImage(href);
  if (token !== badgeDrawToken || !faviconVisible || !faviconBadgeEnabled) return;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const iconInset = 4;
  const iconSize = size - iconInset * 2;
  if (img && img.naturalWidth > 0) {
    ctx.drawImage(img, iconInset, iconInset, iconSize, iconSize);
  } else {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(iconInset, iconInset, iconSize, iconSize);
  }

  const dotRadius = count > 99 ? 19 : count > 9 ? 18 : 17;
  const cx = size - dotRadius + 5;
  const cy = dotRadius - 3;

  ctx.beginPath();
  ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  if (count <= 99) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${count > 9 ? 17 : 20}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), cx, cy + 0.5);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('99+', cx, cy + 0.5);
  }

  if (token !== badgeDrawToken || !faviconVisible || !faviconBadgeEnabled) return;
  replaceFaviconHref(canvas.toDataURL('image/png'));
}

export async function refreshFaviconBadge() {
  if (!faviconVisible) {
    removeAllFavicons();
    return;
  }

  if (!faviconBadgeEnabled) {
    showStoredFavicon();
    return;
  }

  const count = getAggregateUnreadCount();
  if (count > 0) {
    await drawBadgeOnFavicon(count);
  } else {
    showStoredFavicon();
  }
}

export function setFaviconBadgeSource(source: string, count: number) {
  const normalized = Math.max(0, Math.floor(count || 0));

  if (normalized > 0) {
    BADGE_SOURCES.set(source, normalized);
  } else {
    BADGE_SOURCES.delete(source);
  }

  if (!faviconVisible || !faviconBadgeEnabled) {
    showStoredFavicon();
    return;
  }

  void refreshFaviconBadge();
}

export function clearFaviconBadgeSource(source: string) {
  BADGE_SOURCES.delete(source);
  if (!faviconVisible || !faviconBadgeEnabled) {
    showStoredFavicon();
    return;
  }
  void refreshFaviconBadge();
}

export function useFaviconBadge(source: string, count: number) {
  const [accessRevision, setAccessRevision] = useState(0);

  useEffect(() => {
    const listener = () => setAccessRevision((revision) => revision + 1);
    badgeAccessListeners.add(listener);
    return () => {
      badgeAccessListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    setFaviconBadgeSource(source, count);
    return () => clearFaviconBadgeSource(source);
  }, [source, count, accessRevision]);
}

export function applyAppFavicon(href?: string | null) {
  const resolvedHref = href?.trim() || getDefaultFaviconDataUrl();
  if (isBadgedFaviconHref(resolvedHref)) return;

  originalFaviconHref = resolvedHref;
  showStoredFavicon();
}

export function syncFaviconBadgeAccess(pathname: string, isLoggedIn: boolean, loading: boolean) {
  if (isFaviconBadgePublicPath(pathname)) {
    faviconVisible = false;
    setFaviconBadgeEnabled(false);
    BADGE_SOURCES.clear();
    removeAllFavicons();
    return;
  }

  faviconVisible = true;
  setFaviconBadgeEnabled(!loading && isLoggedIn);
}
