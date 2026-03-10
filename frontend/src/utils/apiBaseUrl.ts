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

