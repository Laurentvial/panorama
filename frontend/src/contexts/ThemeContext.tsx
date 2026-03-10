import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiCall } from '../utils/api';

interface AppSettings {
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
  const [loading, setLoading] = useState(true);

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
      setLoading(true);
      const data = await apiCall('/api/settings/');
      setSettings(data);
      applyTheme(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use default settings if API fails
      const defaultSettings: AppSettings = {
        id: 'default',
        platform_name: 'Panorama',
        primary_color: '#030213',
        secondary_color: '',
        accent_color: '',
        favicon_url: undefined
      };
      setSettings(defaultSettings);
      applyTheme(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (appSettings: AppSettings) => {
    const root = document.documentElement;

    // Apply platform name (document title) — never show "Panorama" as default
    const platformName = (appSettings.platform_name || '').trim();
    document.title = (platformName && platformName.toLowerCase() !== 'panorama') ? platformName : 'Plateforme';
    
    // Apply favicon
    const faviconUrl = appSettings.favicon_url;
    // Remove existing favicon links
    const existingFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    existingFavicons.forEach(link => link.remove());
    
    if (faviconUrl) {
      // Create new favicon link
      const link = document.createElement('link');
      link.rel = 'icon';
      // Try to detect the file type from the URL
      const lowerUrl = faviconUrl.toLowerCase();
      if (lowerUrl.includes('.ico')) {
        link.type = 'image/x-icon';
      } else if (lowerUrl.includes('.png')) {
        link.type = 'image/png';
      } else if (lowerUrl.includes('.svg')) {
        link.type = 'image/svg+xml';
      } else {
        link.type = 'image/x-icon'; // Default
      }
      link.href = faviconUrl;
      document.head.appendChild(link);
    }
    
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
    loadSettings();
  }, []);

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
