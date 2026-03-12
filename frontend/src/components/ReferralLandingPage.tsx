import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { useTheme } from '../contexts/ThemeContext';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/LoginPage.css';

export function ReferralLandingPage() {
  const { code } = useParams<{ code: string }>();
  const { settings, loading: settingsLoading } = useTheme();
  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [codeValid, setCodeValid] = useState<boolean | null>(null);

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
    ['--platform-button-bg' as any]: buttonBg,
  };
  if (!settingsLoading && settings?.login_background_image_url) {
    (containerStyle as any)['--login-bg-image'] = `url("${settings.login_background_image_url}")`;
  }

  useEffect(() => {
    if (!code || code.trim() === '') {
      setCodeValid(false);
    } else {
      setCodeValid(true);
    }
  }, [code]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code?.trim()) return;

    const fnameTrimmed = fname.trim();
    const lnameTrimmed = lname.trim();
    const emailTrimmed = email.trim().toLowerCase();
    const phoneTrimmed = phone.trim();

    if (!fnameTrimmed) {
      toast.error('Veuillez renseigner votre prénom');
      return;
    }
    if (!lnameTrimmed) {
      toast.error('Veuillez renseigner votre nom');
      return;
    }
    if (!emailTrimmed) {
      toast.error('Veuillez renseigner votre email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      toast.error('Veuillez saisir une adresse email valide');
      return;
    }

    setLoading(true);
    try {
      await apiCall('/api/referral-prospects/', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          fname: fnameTrimmed,
          lname: lnameTrimmed,
          email: emailTrimmed,
          phone: phoneTrimmed,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      setSuccess(true);
    } catch (err: any) {
      console.error('Referral prospect submit error:', err);
      const msg = err?.message || err?.error || 'Une erreur est survenue. Veuillez réessayer.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (codeValid === false) {
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
            <CardContent style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1rem', color: '#6b7280' }}>
                Lien d&apos;invitation invalide ou expiré.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
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
            <CardContent style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#166534', marginBottom: 8 }}>
                Merci !
              </p>
              <p style={{ fontSize: '1rem', color: '#374151' }}>
                Nous vous contacterons rapidement pour créer votre compte.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
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
            <CardDescription style={{ fontSize: '1.1rem', fontWeight: 600, color: '#166534', marginBottom: 8 }}>
              Rejoignez {platformName || 'la plateforme'} et <strong>recevez jusqu&apos;à 500€</strong> de bonus grâce à cette invitation
            </CardDescription>
            <CardDescription style={{ fontSize: '0.95rem', color: '#6b7280' }}>
              Laissez-nous vos coordonnées pour recevoir votre bonus et créer votre compte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="login-form-field">
                <Input
                  id="fname"
                  name="fname"
                  type="text"
                  autoComplete="given-name"
                  placeholder=" "
                  value={fname}
                  onChange={(e) => setFname(e.target.value)}
                  className="login-floating-input"
                  required
                />
                <label className="login-floating-label" htmlFor="fname">Prénom</label>
              </div>

              <div className="login-form-field">
                <Input
                  id="lname"
                  name="lname"
                  type="text"
                  autoComplete="family-name"
                  placeholder=" "
                  value={lname}
                  onChange={(e) => setLname(e.target.value)}
                  className="login-floating-input"
                  required
                />
                <label className="login-floating-label" htmlFor="lname">Nom</label>
              </div>

              <div className="login-form-field">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="login-floating-input"
                  required
                />
                <label className="login-floating-label" htmlFor="email">Email</label>
              </div>

              <div className="login-form-field">
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder=" "
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="login-floating-input"
                />
                <label className="login-floating-label" htmlFor="phone">Téléphone</label>
              </div>

              <div style={{ marginTop: '1.25rem' }}>
                <Button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Envoi en cours...' : 'Recevoir mon bonus'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
