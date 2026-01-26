import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiCall } from '../utils/api';

interface AppSettings {
  id: string;
  logo?: string;
  logo_url?: string;
  login_background_image?: string;
  login_background_image_url?: string;
  platform_name?: string;
  primary_color: string;
  secondary_color?: string;
  accent_color?: string;
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
        accent_color: ''
      };
      setSettings(defaultSettings);
      applyTheme(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (appSettings: AppSettings) => {
    const root = document.documentElement;

    // Apply platform name (document title)
    const platformName = (appSettings.platform_name || '').trim();
    if (platformName) {
      document.title = platformName;
    }
    
    // Apply primary color
    if (appSettings.primary_color) {
      root.style.setProperty('--primary', appSettings.primary_color);
      root.style.setProperty('--sidebar-primary', appSettings.primary_color);
    }
    
    // Apply secondary color if provided
    if (appSettings.secondary_color) {
      root.style.setProperty('--secondary', appSettings.secondary_color);
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
