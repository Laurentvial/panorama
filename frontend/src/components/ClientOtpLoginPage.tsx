import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';

import { clientRequestOtp, clientVerifyOtp } from '../utils/auth';

import '../styles/LoginPage.css';

type Step = 'email' | 'code';
type Channel = 'email' | 'sms';

export function ClientOtpLoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const { settings, loading: settingsLoading } = useTheme();

  const [step, setStep] = useState<Step>('email');
  // Temporarily disable SMS OTP until Infobip routing is provisioned.
  const channel: Channel = 'email';
  const [identifier, setIdentifier] = useState('');
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const hasLogo = !settingsLoading && Boolean(settings?.logo_url);
  const bannerLogoSrc = settings?.logo_url || '';
  const platformName = !settingsLoading ? (settings?.platform_name || 'Plateforme').trim() : '';
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

  const codeDigitsOnly = useMemo(() => code.replace(/\D/g, '').slice(0, 6), [code]);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    const v = identifier.trim();
    if (!v) {
      setError(channel === 'sms' ? 'Veuillez saisir votre numéro de téléphone.' : 'Veuillez saisir votre email.');
      return;
    }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if (!ok) {
      setError('Veuillez saisir une adresse email valide.');
      return;
    }
    setLoading(true);
    try {
      const result = await clientRequestOtp({ channel: 'email', email: v });
      const sent = Boolean((result as any)?.sent);
      if (!sent || !result?.challengeToken) {
        setInfo(result?.message || 'Demande prise en compte.');
        return;
      }
      setChallengeToken(result.challengeToken);
      setStep('code');
      setInfo('Code envoyé. Vérifiez votre email.');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l\'envoi du code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!challengeToken) {
      setError('Veuillez demander un code.');
      setStep('email');
      return;
    }
    if (codeDigitsOnly.length !== 6) {
      setError('Veuillez saisir le code à 6 chiffres.');
      return;
    }
    setLoading(true);
    try {
      await clientVerifyOtp(challengeToken, codeDigitsOnly);
      await refreshUser();
      navigate('/platform');
    } catch (err: any) {
      setError(err?.message || 'Code invalide');
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
            <CardDescription>Connexion par code</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'email' ? (
              <form onSubmit={handleRequest} className="login-form" noValidate>
                {info && (
                  <div className="login-error" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                    {info}
                  </div>
                )}
                {error && (
                  <div className="login-error">
                    {error}
                  </div>
                )}
                <div className="login-form-field">
                  <Input
                    id="identifier"
                    name="identifier"
                    type="email"
                    autoComplete="email"
                    placeholder=" "
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className="login-floating-input"
                  />
                  <label className="login-floating-label" htmlFor="identifier">
                    Email
                  </label>
                </div>

                <Button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Envoi...' : 'Envoyer un code'}
                </Button>

                <div style={{ marginTop: '0.75rem', textAlign: 'center', display: 'grid', gap: '0.35rem' }}>
                  <Link to="/login" style={{ fontSize: '0.9rem' }}>Retour à la connexion</Link>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="login-form" noValidate>
                {info && (
                  <div className="login-error" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                    {info}
                  </div>
                )}
                {error && (
                  <div className="login-error">
                    {error}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.5rem', justifyItems: 'center' }}>
                  <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                    Saisissez le code envoyé par email.
                  </div>
                  {/* Use a plain input to ensure visibility even if Tailwind classes
                      from shadcn's InputOTP slots aren't applied in this environment. */}
                  <Input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    value={codeDigitsOnly}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    className="login-floating-input"
                    style={{
                      width: '220px',
                      textAlign: 'center',
                      letterSpacing: '10px',
                      fontSize: '18px',
                    }}
                    aria-label="Code a 6 chiffres"
                  />
                </div>

                <Button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Verification...' : 'Se connecter'}
                </Button>

                <div style={{ marginTop: '0.75rem', textAlign: 'center', display: 'grid', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setChallengeToken('');
                      setError('');
                      setInfo('');
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#0f172a', cursor: 'pointer' }}
                  >
                    Changer de méthode
                  </button>
                  <Link to="/login" style={{ fontSize: '0.9rem' }}>Retour à la connexion</Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ClientOtpLoginPage;

