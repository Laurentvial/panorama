import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { HiOutlineUpload, HiOutlineSave, HiOutlineRefresh } from 'react-icons/hi';
import { CheckCircle, XCircle } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/Customization.css';
import '../styles/Clients.css';

export function Customization() {
  const { settings, loadSettings, updateSettings, loading: themeLoading } = useTheme();
  const [loading, setLoading] = useState(false);
  const [platformName, setPlatformName] = useState('Panorama');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [shouldRemoveLogo, setShouldRemoveLogo] = useState(false);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [shouldRemoveFavicon, setShouldRemoveFavicon] = useState(false);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [shouldRemoveBg, setShouldRemoveBg] = useState(false);
  const [colors, setColors] = useState({
    primary: '#030213',
    secondary: '',
    accent: ''
  });
  const [otpEmailEnabled, setOtpEmailEnabled] = useState(true);
  const [otpSmsEnabled, setOtpSmsEnabled] = useState(true);
  const [otpSaving, setOtpSaving] = useState(false);
  const hasSyncedOtpFromSettings = useRef(false);

  useEffect(() => {
    if (settings) {
      setPlatformName(settings.platform_name || 'Panorama');
      setAddress(settings.address || '');
      setWebsite(settings.website || '');
      setEmail(settings.email || '');
      setColors({
        primary: settings.primary_color || '#030213',
        secondary: settings.secondary_color || '',
        accent: settings.accent_color || ''
      });
      if (settings.logo_url) {
        setLogoPreview(settings.logo_url);
      }
      if (settings.favicon_url) {
        setFaviconPreview(settings.favicon_url);
      }
      if (settings.login_background_image_url) {
        setBgPreview(settings.login_background_image_url);
      }
      if (!hasSyncedOtpFromSettings.current) {
        hasSyncedOtpFromSettings.current = true;
        setOtpEmailEnabled(settings.otp_email_enabled !== false);
        setOtpSmsEnabled(settings.otp_sms_enabled !== false);
      }
    }
  }, [settings]);

  const saveOtpSettings = async (emailEnabled: boolean, smsEnabled: boolean) => {
    try {
      setOtpSaving(true);
      const formData = new FormData();
      formData.append('otp_email_enabled', emailEnabled ? 'true' : 'false');
      formData.append('otp_sms_enabled', smsEnabled ? 'true' : 'false');
      await apiCall('/api/settings/', { method: 'PUT', body: formData });
      toast.success('Méthodes d\'authentification mises à jour');
      await loadSettings();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la mise à jour');
    } finally {
      setOtpSaving(false);
    }
  };

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

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      // Check MIME type first, but also check file extension as fallback
      // Some .ico files may have empty or unrecognized MIME types
      const fileName = file.name.toLowerCase();
      const isValidImageType = file.type.startsWith('image/');
      const isValidExtension = fileName.endsWith('.ico') || 
                               fileName.endsWith('.png') || 
                               fileName.endsWith('.svg') || 
                               fileName.endsWith('.jpg') || 
                               fileName.endsWith('.jpeg') || 
                               fileName.endsWith('.gif');
      
      if (!isValidImageType && !isValidExtension) {
        toast.error('Veuillez sélectionner un fichier image (ICO, PNG, SVG, JPG, GIF)');
        return;
      }
      // Validate file size (max 2MB for favicon)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Le favicon ne doit pas dépasser 2MB');
        return;
      }
      setFaviconFile(file);
      setShouldRemoveFavicon(false); // Reset remove flag when new file is selected
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaviconPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveFavicon = () => {
    setFaviconFile(null);
    setFaviconPreview(null);
    setShouldRemoveFavicon(true);
  };

  const handleBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner un fichier image');
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error('L\'image ne doit pas dépasser 8MB');
        return;
      }
      setBgFile(file);
      setShouldRemoveBg(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBgPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBg = () => {
    setBgFile(null);
    setBgPreview(null);
    setShouldRemoveBg(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const formData = new FormData();
      
      formData.append('platform_name', platformName);
      formData.append('address', address);
      formData.append('website', website);
      formData.append('email', email);
      
      if (logoFile) {
        formData.append('logo', logoFile);
      }

      if (faviconFile) {
        formData.append('favicon', faviconFile);
      }

      if (bgFile) {
        formData.append('login_background_image', bgFile);
      }
      
      // If logo should be removed, send a flag
      if (shouldRemoveLogo && !logoFile) {
        formData.append('remove_logo', 'true');
      }

      // If favicon should be removed, send a flag
      if (shouldRemoveFavicon && !faviconFile) {
        formData.append('remove_favicon', 'true');
      }

      if (shouldRemoveBg && !bgFile) {
        formData.append('remove_login_background_image', 'true');
      }
      
      formData.append('primary_color', colors.primary);
      if (colors.secondary) {
        formData.append('secondary_color', colors.secondary);
      }
      if (colors.accent) {
        formData.append('accent_color', colors.accent);
      }
      formData.append('otp_email_enabled', otpEmailEnabled ? 'true' : 'false');
      formData.append('otp_sms_enabled', otpSmsEnabled ? 'true' : 'false');

      await apiCall('/api/settings/', {
        method: 'PUT',
        body: formData
      });

      toast.success('Paramètres sauvegardés avec succès');
      setShouldRemoveLogo(false);
      setShouldRemoveFavicon(false);
      setShouldRemoveBg(false);
      await loadSettings(); // Reload settings to get updated logo URL
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPlatformName(settings?.platform_name || 'Panorama');
    setAddress(settings?.address || '');
    setWebsite(settings?.website || '');
    setEmail(settings?.email || '');
    setColors({
      primary: settings?.primary_color || '#030213',
      secondary: settings?.secondary_color || '',
      accent: settings?.accent_color || ''
    });
    setLogoFile(null);
    setShouldRemoveLogo(false);
    setFaviconFile(null);
    setShouldRemoveFavicon(false);
    setBgFile(null);
    setShouldRemoveBg(false);
    if (settings?.logo_url) {
      setLogoPreview(settings.logo_url);
    } else {
      setLogoPreview(null);
    }
    if (settings?.favicon_url) {
      setFaviconPreview(settings.favicon_url);
    } else {
      setFaviconPreview(null);
    }
    if (settings?.login_background_image_url) {
      setBgPreview(settings.login_background_image_url);
    } else {
      setBgPreview(null);
    }
    setOtpEmailEnabled(settings?.otp_email_enabled !== false);
    setOtpSmsEnabled(settings?.otp_sms_enabled !== false);
    hasSyncedOtpFromSettings.current = false;
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
      {/* Platform name */}
      <Card>
        <CardHeader>
          <CardTitle>Nom de la plateforme</CardTitle>
          <CardDescription>
            Ce nom peut être affiché sur la page de connexion et dans l’interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="customization-card-content">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform-name">Nom de la plateforme</Label>
              <Input
                id="platform-name"
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="Panorama"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Rue Example, 75001 Paris"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Site web</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo Section */}
      <Card>
        <CardHeader>
          <CardTitle>Logo et Favicon de l'application</CardTitle>
          <CardDescription>
            Téléchargez un logo et un favicon pour personnaliser l'apparence de votre application
          </CardDescription>
        </CardHeader>
        <CardContent className="customization-card-content">
          <div className="customization-logo-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Logo */}
            <div>
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
                      variant="link"
                      onClick={handleRemoveLogo}
                      className="customization-delete-button p-0 h-auto"
                    >
                      Supprimer
                    </Button>
                  )}
                </div>
                <p className="customization-logo-info">
                  Formats acceptés: PNG, JPG, SVG (max 5MB)
                </p>
              </div>
            </div>

            {/* Favicon */}
            <div>
              {faviconPreview && (
                <div className="customization-logo-preview">
                  <img
                    src={faviconPreview}
                    alt="Favicon preview"
                    className="customization-logo-image"
                    style={{ width: '64px', height: '64px', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div className="customization-logo-controls">
                <Label htmlFor="favicon-upload">Favicon</Label>
                <div className="customization-logo-upload-group">
                  <input
                    id="favicon-upload"
                    type="file"
                    accept="image/*,.ico"
                    onChange={handleFaviconChange}
                    className="customization-logo-upload-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('favicon-upload')?.click()}
                  >
                    <HiOutlineUpload className="h-4 w-4 mr-2" />
                    {faviconPreview ? 'Changer le favicon' : 'Télécharger un favicon'}
                  </Button>
                  {faviconPreview && (
                    <Button
                      type="button"
                      variant="link"
                      onClick={handleRemoveFavicon}
                      className="customization-delete-button p-0 h-auto"
                    >
                      Supprimer
                    </Button>
                  )}
                </div>
                <p className="customization-logo-info">
                  Formats acceptés: ICO, PNG, SVG (max 2MB). Recommandé: 32×32 ou 16×16px
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Login Background Section */}
      <Card>
        <CardHeader>
          <CardTitle>Image de fond (page de connexion)</CardTitle>
          <CardDescription>
            Téléchargez une image de fond qui sera affichée sur la page de connexion, avec un overlay blanc par-dessus.
          </CardDescription>
        </CardHeader>
        <CardContent className="customization-card-content">
          <div className="customization-logo-section">
            {bgPreview && (
              <div className="customization-logo-preview">
                <img
                  src={bgPreview}
                  alt="Background preview"
                  className="customization-logo-image"
                  style={{ width: '10rem', height: '6rem', objectFit: 'cover' }}
                />
              </div>
            )}
            <div className="customization-logo-controls">
              <Label htmlFor="bg-upload">Image de fond</Label>
              <div className="customization-logo-upload-group">
                <input
                  id="bg-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleBgChange}
                  className="customization-logo-upload-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('bg-upload')?.click()}
                >
                  <HiOutlineUpload className="h-4 w-4 mr-2" />
                  {bgPreview ? 'Changer l\'image' : 'Télécharger une image'}
                </Button>
                {bgPreview && (
                  <Button
                    type="button"
                    variant="link"
                    onClick={handleRemoveBg}
                    className="customization-delete-button p-0 h-auto"
                  >
                    Supprimer
                  </Button>
                )}
              </div>
              <p className="customization-logo-info">
                Formats acceptés: PNG, JPG, WEBP (max 8MB). Recommandé: 1920×1080.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auth methods */}
      <Card>
        <CardHeader>
          <CardTitle>Méthodes d'authentification</CardTitle>
          <CardDescription>
            Activez ou désactivez la connexion par code (OTP) par email et par SMS pour les clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4 gap-4">
            <div className="space-y-0.5 flex-1">
              <Label>Connexion par code (email)</Label>
              <p className="text-sm text-muted-foreground">
                Les clients peuvent demander un code à 6 chiffres envoyé par email.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={otpSaving}
              onClick={() => {
                const next = !otpEmailEnabled;
                setOtpEmailEnabled(next);
                saveOtpSettings(next, otpSmsEnabled);
              }}
              className={otpEmailEnabled ? 'client-action-button-deactivate' : 'client-action-button-activate'}
            >
              {otpEmailEnabled ? (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Désactiver
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Activer
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4 gap-4">
            <div className="space-y-0.5 flex-1">
              <Label>Connexion par code (SMS)</Label>
              <p className="text-sm text-muted-foreground">
                Les clients peuvent demander un code envoyé par SMS (Prelude / opérateur).
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={otpSaving}
              onClick={() => {
                const next = !otpSmsEnabled;
                setOtpSmsEnabled(next);
                saveOtpSettings(otpEmailEnabled, next);
              }}
              className={otpSmsEnabled ? 'client-action-button-deactivate' : 'client-action-button-activate'}
            >
              {otpSmsEnabled ? (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Désactiver
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Activer
                </>
              )}
            </Button>
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
