import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';

import { clientRequestOtp, clientVerifyOtp } from '../utils/auth';

import '../styles/LoginPage.css';
import { LegalFooterLinks } from './legal/LegalFooterLinks';

type Step = 'email' | 'code';
type Channel = 'email' | 'sms';

export function ClientOtpLoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const { settings, loading: settingsLoading } = useTheme();

  const emailOtpEnabled = settings?.otp_email_enabled !== false;
  const smsOtpEnabled = settings?.otp_sms_enabled !== false;
  const bothOtpDisabled = !settingsLoading && !emailOtpEnabled && !smsOtpEnabled;
  const showChannelToggle = !settingsLoading && emailOtpEnabled && smsOtpEnabled;

  const [step, setStep] = useState<Step>('email');
  const [channel, setChannel] = useState<Channel>('email');
  const [identifier, setIdentifier] = useState('');
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (settingsLoading) return;
    if (!emailOtpEnabled && smsOtpEnabled) setChannel('sms');
    else if (emailOtpEnabled && !smsOtpEnabled) setChannel('email');
  }, [settingsLoading, emailOtpEnabled, smsOtpEnabled]);

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

  const expectedCodeLength = channel === 'sms' ? 4 : 6;
  const codeDigitsOnly = useMemo(
    () => code.replace(/\D/g, '').slice(0, expectedCodeLength),
    [code, expectedCodeLength]
  );

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    const v = identifier.trim();
    if (!v) {
      setError(channel === 'sms' ? 'Veuillez saisir votre numéro de téléphone.' : 'Veuillez saisir votre email.');
      return;
    }
    if (channel === 'email') {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (!ok) {
        setError('Veuillez saisir une adresse email valide.');
        return;
      }
    } else {
      const digits = v.replace(/\D/g, '');
      if (digits.length < 8) {
        setError('Veuillez saisir un numéro de téléphone valide.');
        return;
      }
    }
    setLoading(true);
    try {
      const result =
        channel === 'sms'
          ? await clientRequestOtp({ channel: 'sms', phone: v })
          : await clientRequestOtp({ channel: 'email', email: v });
      const sent = Boolean((result as any)?.sent);
      if (!sent || !result?.challengeToken) {
        setInfo(result?.message || 'Demande prise en compte.');
        return;
      }
      setChallengeToken(result.challengeToken);
      setStep('code');
      setInfo(channel === 'sms' ? 'Code envoyé. Vérifiez votre téléphone.' : 'Code envoyé. Vérifiez votre email.');
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
    const len = codeDigitsOnly.length;
    if (len !== expectedCodeLength) {
      setError(
        channel === 'sms'
          ? 'Veuillez saisir le code à 4 chiffres envoyé par SMS.'
          : 'Veuillez saisir le code à 6 chiffres envoyé par email.'
      );
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

  if (bothOtpDisabled) {
    return (
      <div className="login-page-container login-page-container--client" style={containerStyle}>
        <header className="login-banner">
          {hasLogo ? (
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
              <p style={{ marginBottom: '1rem', color: '#64748b' }}>
                La connexion par code (email ou SMS) est actuellement désactivée.
              </p>
              <Button type="button" className="login-button" onClick={() => navigate('/login')}>
                Retour à la connexion
              </Button>
            </CardContent>
          </Card>
        </div>
        <div style={{ padding: '1.25rem 1rem 2rem', width: '100%' }}>
          <LegalFooterLinks variant="login" />
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
                {showChannelToggle && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setChannel('email');
                      setIdentifier('');
                      setError('');
                      setInfo('');
                    }}
                    disabled={loading}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: channel === 'email' ? '#0f172a' : '#fff',
                      color: channel === 'email' ? '#fff' : '#0f172a',
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChannel('sms');
                      setIdentifier('');
                      setError('');
                      setInfo('');
                    }}
                    disabled={loading}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: channel === 'sms' ? '#0f172a' : '#fff',
                      color: channel === 'sms' ? '#fff' : '#0f172a',
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    SMS
                  </button>
                </div>
                )}
                <div className="login-form-field">
                  <Input
                    id="identifier"
                    name="identifier"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    autoComplete={channel === 'sms' ? 'tel' : 'email'}
                    placeholder=" "
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className="login-floating-input"
                  />
                  <label className="login-floating-label" htmlFor="identifier">
                    {channel === 'sms' ? 'Numéro de téléphone' : 'Email'}
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
                    {channel === 'sms' ? 'Saisissez le code envoyé par SMS.' : 'Saisissez le code envoyé par email.'}
                  </div>
                  {/* Use a plain input to ensure visibility even if Tailwind classes
                      from shadcn's InputOTP slots aren't applied in this environment. */}
                  <Input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={channel === 'sms' ? '••••' : '••••••'}
                    value={codeDigitsOnly}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={expectedCodeLength}
                    className="login-floating-input"
                    style={{
                      width: '220px',
                      textAlign: 'center',
                      letterSpacing: '10px',
                      fontSize: '18px',
                    }}
                    aria-label={channel === 'sms' ? 'Code à 4 chiffres' : 'Code à 6 chiffres'}
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
      <div style={{ padding: '1.25rem 1rem 2rem', width: '100%' }}>
        <LegalFooterLinks variant="login" />
      </div>
    </div>
  );
}

export default ClientOtpLoginPage;

