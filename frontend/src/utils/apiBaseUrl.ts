// Central place to resolve the backend API base URL across the app.
// Render Blueprint can provide a hostname (no scheme), so we normalize it.

const getEnvVar = (key: string): string | undefined => {
  // Vite environment variables
  return (import.meta as any).env?.[key];
};

function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'http://127.0.0.1:8000';

  // Already an absolute URL.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  // Heuristic: local hosts should default to http, everything else to https.
  const lower = trimmed.toLowerCase();
  const scheme =
    lower.includes('localhost') || lower.startsWith('127.0.0.1') || lower.startsWith('0.0.0.0')
      ? 'http://'
      : 'https://';

  return `${scheme}${trimmed}`.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  // Prefer VITE_URL, but keep VITE_API_URL as a backwards-compatible alias.
  const raw = getEnvVar('VITE_URL') || getEnvVar('VITE_API_URL') || 'http://127.0.0.1:8000';
  return normalizeBaseUrl(raw);
}

