import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';

import { useTheme } from '../contexts/ThemeContext';
import { clientRequestPasswordReset } from '../utils/auth';

import '../styles/LoginPage.css';
import { LegalFooterLinks } from './legal/LegalFooterLinks';

export function ClientForgotPasswordPage() {
  const { settings, loading: settingsLoading } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

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
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      setError('Veuillez saisir votre email.');
      return;
    }
    setLoading(true);
    try {
      await clientRequestPasswordReset(emailTrimmed);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la demande');
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
            <CardDescription>Mot de passe oublie</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="login-error" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                  Si un compte existe pour cet email, un lien de reinitialisation a ete envoye.
                </div>
                <Link to="/login" style={{ textDecoration: 'none' }}>
                  <Button type="button" className="login-button">
                    Retour a la connexion
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
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="login-floating-input"
                  />
                  <label className="login-floating-label" htmlFor="email">Email</label>
                </div>

                <Button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Envoi...' : 'Envoyer le lien'}
                </Button>

                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <Link to="/login" style={{ fontSize: '0.9rem' }}>
                    Retour a la connexion
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

export default ClientForgotPasswordPage;

