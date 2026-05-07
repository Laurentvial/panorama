type LeadPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
    dataLayer?: Array<Record<string, any>>;
  }
}

function safePageLocation(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

export function trackMarketingPageView(pagePath: string): void {
  if (typeof window === 'undefined') return;
  const pageLocation = safePageLocation();
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'PageView', {
        page_path: pagePath,
        page_location: pageLocation,
      });
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: pagePath,
        page_location: pageLocation,
        page_title: document?.title || '',
      });
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({
        event: 'page_view',
        page_path: pagePath,
        page_location: pageLocation,
      });
    }
  } catch {
    // Ignore tracking failures to avoid breaking UX.
  }
}

export function trackLeadConversion(payload: LeadPayload = {}): void {
  if (typeof window === 'undefined') return;
  const pageLocation = safePageLocation();
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Lead', {
        page_location: pageLocation,
        ...payload,
      });
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'generate_lead', {
        page_location: pageLocation,
        ...payload,
      });
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({
        event: 'lead_conversion',
        page_location: pageLocation,
        ...payload,
      });
    }
  } catch {
    // Ignore tracking failures to avoid breaking UX.
  }
}

