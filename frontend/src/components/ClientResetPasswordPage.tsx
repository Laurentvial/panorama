import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';

import { useTheme } from '../contexts/ThemeContext';
import { clientConfirmPasswordReset } from '../utils/auth';

import '../styles/LoginPage.css';
import { LegalFooterLinks } from './legal/LegalFooterLinks';

function useQueryParam(name: string): string {
  const location = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get(name) || '').trim();
  }, [location.search, name]);
}

export function ClientResetPasswordPage() {
  const token = useQueryParam('token');

  const { settings, loading: settingsLoading } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasLogo = !settingsLoading && Boolean(settings?.logo_url);
  const bannerLogoSrc = settings?.logo_url || '';
  const rawName = !settingsLoading ? (settings?.platform_name || '').trim() : '';
  const platformName = rawName && rawName.toLowerCase() !== 'panorama' ? rawName : '';
  const buttonBg =
    (settings?.secondary_color || '').trim() ||
    (settings?.primary_color || '').trim() ||
    '#030213';
  const containerStyle: React.CSSProperties = {
    ['--login-button-bg' as any]: buttonBg,
  };
  if (!settingsLoading && settings?.login_background_image_url) {
    (containerStyle as any)['--login-bg-image'] = `url("${settings.login_background_image_url}")`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!token) {
      setError('Lien invalide.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      await clientConfirmPasswordReset(token, password);
      setSuccess('Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la réinitialisation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page-container login-page-container--client" style={containerStyle}>
      <header className="login-banner">
        {settingsLoading ? (
          <div className="login-banner-placeholder" aria-hidden="true" />
        ) : hasLogo ? (
          <img className="login-banner-logo" src={bannerLogoSrc} alt="Logo" />
        ) : (
          <div className="login-banner-title">{platformName}</div>
        )}
      </header>

      <div className="login-content">
        <Card className="login-card">
          <CardHeader className="login-card-header">
            <CardDescription>Réinitialisation du mot de passe</CardDescription>
          </CardHeader>
          <CardContent>
            {!token ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="login-error">
                  Lien invalide ou manquant. Veuillez refaire une demande de réinitialisation.
                </div>
                <Link to="/forgot-password" style={{ textDecoration: 'none' }}>
                  <Button type="button" className="login-button">Demander un nouveau lien</Button>
                </Link>
              </div>
            ) : success ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="login-error" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                  {success}
                </div>
                <Link to="/login" style={{ textDecoration: 'none' }}>
                  <Button type="button" className="login-button">
                    Aller à la connexion
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="login-form" noValidate>
                {error && (
                  <div className="login-error">
                    {error}
                  </div>
                )}
                <div className="login-form-field">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="login-floating-input"
                  />
                  <label className="login-floating-label" htmlFor="password">Nouveau mot de passe</label>
                </div>

                <div className="login-form-field">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder=" "
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="login-floating-input"
                  />
                  <label className="login-floating-label" htmlFor="confirmPassword">Confirmer</label>
                </div>

                <Button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Mise à jour...' : 'Mettre à jour'}
                </Button>

                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <Link to="/login" style={{ fontSize: '0.9rem' }}>
                    Retour à la connexion
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
      <div style={{ padding: '1.25rem 1rem 2rem', width: '100%' }}>
        <LegalFooterLinks variant="login" />
      </div>
    </div>
  );
}

export default ClientResetPasswordPage;

