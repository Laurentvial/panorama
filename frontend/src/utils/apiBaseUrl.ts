// Central place to resolve the backend API base URL across the app.
// Render Blueprint can provide a hostname (no scheme), so we normalize it.

const getEnvVar = (key: string): string | undefined => {
  // Vite environment variables
  return (import.meta as any).env?.[key];
};

function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'http://127.0.0.1:8000';

  let result: string;

  // Already an absolute URL.
  if (/^https?:\/\//i.test(trimmed)) {
    result = trimmed.replace(/\/+$/, '');
  } else {
    // Heuristic: local hosts should default to http, everything else to https.
    const lower = trimmed.toLowerCase();
    const scheme =
      lower.includes('localhost') || lower.startsWith('127.0.0.1') || lower.startsWith('0.0.0.0')
        ? 'http://'
        : 'https://';
    result = `${scheme}${trimmed}`.replace(/\/+$/, '');
  }

  // Mixed Content: if page is HTTPS, API must use HTTPS (browsers block HTTP from HTTPS pages)
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && result.startsWith('http://')) {
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(result);
    if (!isLocalhost) {
      result = result.replace(/^http:\/\//i, 'https://');
    }
  }

  return result;
}

export function getApiBaseUrl(): string {
  // Prefer VITE_URL, but keep VITE_API_URL as a backwards-compatible alias.
  const raw = getEnvVar('VITE_URL') || getEnvVar('VITE_API_URL') || 'http://127.0.0.1:8000';
  return normalizeBaseUrl(raw);
}

const LOCAL_HTTP_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i;

/**
 * Resolve `/api/media/...` URLs for browser subresources (favicon, etc.).
 *
 * Production often serves the SPA and `/api` under one public host while Django
 * may still emit absolute URLs with an internal hostname, wrong scheme (http behind TLS),
 * or a separate `BACKEND_PUBLIC_URL`. Using the pathname resolved against the SPA's
 * configured API origin avoids broken favicons in those setups.
 */
export function resolveMediaProxyUrlForBrowser(storedUrl: string): string {
  if (!storedUrl || typeof window === 'undefined') {
    return storedUrl;
  }

  let pathWithQuery = '';
  try {
    const parsed = new URL(storedUrl, window.location.origin);
    if (!parsed.pathname.includes('/api/media/')) {
      if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && !LOCAL_HTTP_HOST.test(parsed.hostname)) {
        parsed.protocol = 'https:';
        return parsed.toString();
      }
      return storedUrl;
    }
    pathWithQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return storedUrl;
  }

  const apiBase = getApiBaseUrl().replace(/\/+$/, '');
  let apiOrigin: string;
  try {
    apiOrigin = new URL(apiBase).origin;
  } catch {
    return storedUrl;
  }

  if (apiOrigin === window.location.origin) {
    return pathWithQuery;
  }

  const absolute = `${apiBase}${pathWithQuery}`;
  try {
    const out = new URL(absolute);
    if (window.location.protocol === 'https:' && out.protocol === 'http:' && !LOCAL_HTTP_HOST.test(out.hostname)) {
      out.protocol = 'https:';
      return out.toString();
    }
  } catch {
    /* keep string */
  }
  return absolute;
}

