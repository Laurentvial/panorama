import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { HiOutlineUpload, HiOutlineTrash, HiOutlineSave, HiOutlineRefresh } from 'react-icons/hi';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/Customization.css';

export function Customization() {
  const { settings, loadSettings, updateSettings, loading: themeLoading } = useTheme();
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [shouldRemoveLogo, setShouldRemoveLogo] = useState(false);
  const [colors, setColors] = useState({
    primary: '#030213',
    secondary: '',
    accent: ''
  });

  useEffect(() => {
    if (settings) {
      setColors({
        primary: settings.primary_color || '#030213',
        secondary: settings.secondary_color || '',
        accent: settings.accent_color || ''
      });
      if (settings.logo_url) {
        setLogoPreview(settings.logo_url);
      }
    }
  }, [settings]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner un fichier image');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('L\'image ne doit pas dépasser 5MB');
        return;
      }
      setLogoFile(file);
      setShouldRemoveLogo(false); // Reset remove flag when new file is selected
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setShouldRemoveLogo(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const formData = new FormData();
      
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      
      // If logo should be removed, send a flag
      if (shouldRemoveLogo && !logoFile) {
        formData.append('remove_logo', 'true');
      }
      
      formData.append('primary_color', colors.primary);
      if (colors.secondary) {
        formData.append('secondary_color', colors.secondary);
      }
      if (colors.accent) {
        formData.append('accent_color', colors.accent);
      }

      await apiCall('/api/settings/', {
        method: 'PUT',
        body: formData
      });

      toast.success('Paramètres sauvegardés avec succès');
      setShouldRemoveLogo(false);
      await loadSettings(); // Reload settings to get updated logo URL
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setColors({
      primary: '#030213',
      secondary: '',
      accent: ''
    });
    setLogoFile(null);
    setShouldRemoveLogo(false);
    if (settings?.logo_url) {
      setLogoPreview(settings.logo_url);
    } else {
      setLogoPreview(null);
    }
  };

  if (themeLoading) {
    return (
      <div className="customization-loading">
        <HiOutlineRefresh className="customization-loading-icon" />
      </div>
    );
  }

  return (
    <div className="customization-container">
      {/* Logo Section */}
      <Card>
        <CardHeader>
          <CardTitle>Logo de l'application</CardTitle>
          <CardDescription>
            Téléchargez un logo pour personnaliser l'apparence de votre application
          </CardDescription>
        </CardHeader>
        <CardContent className="customization-card-content">
          <div className="customization-logo-section">
            {logoPreview && (
              <div className="customization-logo-preview">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="customization-logo-image"
                />
              </div>
            )}
              <div className="customization-logo-controls">
              <Label htmlFor="logo-upload">Logo</Label>
              <div className="customization-logo-upload-group">
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="customization-logo-upload-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('logo-upload')?.click()}
                >
                  <HiOutlineUpload className="h-4 w-4 mr-2" />
                  {logoPreview ? 'Changer le logo' : 'Télécharger un logo'}
                </Button>
                {logoPreview && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveLogo}
                    className="customization-delete-button"
                  >
                    <HiOutlineTrash className="h-4 w-4 mr-2" />
                    Supprimer
                  </Button>
                )}
              </div>
              <p className="customization-logo-info">
                Formats acceptés: PNG, JPG, SVG (max 5MB)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colors Section */}
      <Card>
        <CardHeader>
          <CardTitle>Couleurs de l'application</CardTitle>
          <CardDescription>
            Personnalisez les couleurs principales de votre application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Primary Color */}
            <div className="space-y-2">
              <Label htmlFor="primary-color">Couleur primaire</Label>
              <div className="flex items-center gap-3">
                <input
                  id="primary-color"
                  type="color"
                  value={colors.primary}
                  onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  type="text"
                  value={colors.primary}
                  onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                  placeholder="#030213"
                  className="flex-1"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Couleur principale utilisée pour les boutons et éléments importants
              </p>
            </div>

            {/* Secondary Color */}
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Couleur secondaire (optionnel)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="secondary-color"
                  type="color"
                  value={colors.secondary || '#000000'}
                  onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  type="text"
                  value={colors.secondary}
                  onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Couleur secondaire pour les éléments de support
              </p>
            </div>

            {/* Accent Color */}
            <div className="space-y-2">
              <Label htmlFor="accent-color">Couleur d'accent (optionnel)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="accent-color"
                  type="color"
                  value={colors.accent || '#000000'}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  type="text"
                  value={colors.accent}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Couleur d'accent pour les éléments mis en évidence
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6 p-4 border rounded-lg bg-muted/50">
            <h3 className="text-sm font-medium mb-3">Aperçu</h3>
            <div className="flex items-center gap-4">
              <div
                className="px-4 py-2 rounded text-white font-medium"
                style={{ backgroundColor: colors.primary }}
              >
                Bouton primaire
              </div>
              {colors.secondary && (
                <div
                  className="px-4 py-2 rounded text-white font-medium"
                  style={{ backgroundColor: colors.secondary }}
                >
                  Bouton secondaire
                </div>
              )}
              {colors.accent && (
                <div
                  className="px-4 py-2 rounded text-white font-medium"
                  style={{ backgroundColor: colors.accent }}
                >
                  Accent
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="customization-actions">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={loading}
        >
          <HiOutlineRefresh className="h-4 w-4 mr-2" />
          Réinitialiser
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading}
        >
          <HiOutlineSave className="h-4 w-4 mr-2" />
          {loading ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
}
