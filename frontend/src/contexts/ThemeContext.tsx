import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiCall } from '../utils/api';
import { resolveMediaProxyUrlForBrowser } from '../utils/apiBaseUrl';
import { applyAppFavicon } from '../utils/faviconBadge';

export interface AppSettings {
  id: string;
  logo?: string;
  logo_url?: string;
  favicon?: string;
  favicon_url?: string;
  login_background_image?: string;
  login_background_image_url?: string;
  platform_banner_image?: string;
  platform_banner_image_url?: string;
  platform_name?: string;
  /** Siège / adresse de l'éditeur (API GET /api/settings/) */
  address?: string;
  website?: string;
  email?: string;
  /** Paramètres entreprise / mentions légales (admin) */
  legal_form?: string;
  share_capital?: string;
  siren?: string;
  siret?: string;
  rcs?: string;
  vat_number?: string;
  publication_director?: string;
  hosting_provider?: string;
  dpo_contact?: string;
  consumer_mediator?: string;
  regulatory_mentions?: string;
  /** Pays d'établissement de l'éditeur : FR, BE, LU, CH — affichage droit applicable / juridictions sur les pages légales */
  company_country?: string;
  primary_color: string;
  secondary_color?: string;
  accent_color?: string;
  otp_email_enabled?: boolean;
  otp_sms_enabled?: boolean;
}

interface ThemeContextType {
  settings: AppSettings | null;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  /** False until the first settings fetch (success or default-on-error) completes. */
  const [ready, setReady] = useState(false);

  const getReadableForeground = (hexColor: string): string | null => {
    const hex = (hexColor || '').trim();
    if (!hex.startsWith('#')) return null;
    const raw = hex.slice(1);
    const normalized =
      raw.length === 3
        ? raw.split('').map((c) => c + c).join('')
        : raw.length === 6
          ? raw
          : null;
    if (!normalized) return null;

    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;

    // Relative luminance (sRGB), then choose high-contrast foreground.
    const toLinear = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return L > 0.55 ? '#030213' : '#ffffff';
  };

  const loadSettings = async () => {
    try {
      const data = await apiCall('/api/settings/');
      setSettings(data);
      applyTheme(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use default settings if API fails
      const defaultSettings: AppSettings = {
        id: 'default',
        platform_name: 'Panorama',
        address: '',
        website: '',
        email: '',
        legal_form: '',
        share_capital: '',
        siren: '',
        siret: '',
        rcs: '',
        vat_number: '',
        publication_director: '',
        hosting_provider: '',
        dpo_contact: '',
        consumer_mediator: '',
        regulatory_mentions: '',
        company_country: 'FR',
        primary_color: '#030213',
        secondary_color: '',
        accent_color: '',
        favicon_url: undefined
      };
      setSettings(defaultSettings);
      applyTheme(defaultSettings);
    } finally {
      setReady(true);
    }
  };

  const applyTheme = (appSettings: AppSettings) => {
    const root = document.documentElement;

    // Keep browser titles generic to avoid exposing the platform name publicly.
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    let genericTitle = 'Plateforme';
    if (pathname.startsWith('/admin/login')) {
      genericTitle = 'Administration';
    } else if (
      pathname.startsWith('/login') ||
      pathname.startsWith('/forgot-password') ||
      pathname.startsWith('/reset-password')
    ) {
      genericTitle = 'Connexion';
    } else if (pathname.startsWith('/invite/')) {
      genericTitle = 'Invitation';
    } else if (pathname.startsWith('/legal/')) {
      genericTitle = 'Mentions légales';
    }
    document.title = genericTitle;

    const faviconUrl = appSettings.favicon_url
      ? resolveMediaProxyUrlForBrowser(appSettings.favicon_url)
      : null;
    applyAppFavicon(faviconUrl);
    
    // Apply primary color
    if (appSettings.primary_color) {
      root.style.setProperty('--primary', appSettings.primary_color);
      root.style.setProperty('--sidebar-primary', appSettings.primary_color);
    }
    
    // Apply secondary color if provided
    if (appSettings.secondary_color) {
      root.style.setProperty('--secondary', appSettings.secondary_color);
      const fg = getReadableForeground(appSettings.secondary_color);
      if (fg) {
        root.style.setProperty('--secondary-foreground', fg);
      }
    }
    
    // Apply accent color if provided
    if (appSettings.accent_color) {
      root.style.setProperty('--accent', appSettings.accent_color);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updated = { ...settings, ...newSettings } as AppSettings;
      setSettings(updated);
      applyTheme(updated);
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  // `loading` is only true before the first settings response so pages can use optimistic
  // fallbacks. Refetches (e.g. admin customization) do not set this back to true.
  const loading = !ready;

  return (
    <ThemeContext.Provider value={{ settings, loading, loadSettings, updateSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
