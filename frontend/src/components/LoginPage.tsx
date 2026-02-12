import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { clientSignIn } from '../utils/auth';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import '../styles/LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const { settings, loading: settingsLoading } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
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

  const validate = (values: { email: string; password: string }) => {
    const next: { email?: string; password?: string } = {};
    const emailTrimmed = values.email.trim();
    if (!emailTrimmed) {
      next.email = 'Veuillez renseigner ce champ.';
    } else {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
      if (!ok) next.email = 'Veuillez saisir une adresse email valide.';
    }
    if (!values.password) {
      next.password = 'Veuillez renseigner ce champ.';
    }
    return next;
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    // Some browsers/password managers can autofill without triggering React onChange.
    // Read the actual DOM values at submit time to avoid "field required" while visibly filled.
    const form = e.currentTarget;
    const emailValue =
      (form.elements.namedItem('email') as HTMLInputElement | null)?.value ?? email;
    const passwordValue =
      (form.elements.namedItem('password') as HTMLInputElement | null)?.value ?? password;
    if (emailValue !== email) setEmail(emailValue);
    if (passwordValue !== password) setPassword(passwordValue);

    const nextErrors = validate({ email: emailValue, password: passwordValue });
    setFieldErrors(nextErrors);
    setTouched({ email: true, password: true });
    if (Object.keys(nextErrors).length > 0) return;
    setLoading(true);

    try {
      // Client login only
      await clientSignIn(emailValue, passwordValue);
      await refreshUser();
      
      // Log successful login (backend already logs it, but we can also log from frontend for redundancy)
      // Wait a bit to ensure token is available in storage
      setTimeout(() => {
        import('../utils/platformLogger').then(({ logPlatformAction }) => {
          logPlatformAction('login', { source: 'frontend' });
        }).catch(() => {
          // Silently ignore if logging fails
        });
      }, 100);
      
      navigate('/platform');
    } catch (err: any) {
      console.error('Login error:', err);
      
      // Extract error message
      let errorMessage = 'Email ou mot de passe incorrect.';
      
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.response?.data) {
        const data = err.response.data;
        errorMessage = data.detail || data.error || Object.values(data).flat().join(', ') || errorMessage;
      }
      
      setError(errorMessage);
      // Don't show a toast for the common "wrong credentials" case (we already show it under the form)
      const normalized = String(errorMessage || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const isWrongCredentials =
        normalized.includes('email ou mot de passe incorrect') ||
        normalized.includes('invalid credentials') ||
        normalized.includes('no active account found');
      if (!isWrongCredentials) {
        toast.error(errorMessage);
      }
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
            <CardDescription>
              Connectez-vous à votre compte client
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="login-form-field">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder=" "
                  value={email}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmail(v);
                    if (touched.email) setFieldErrors((prev) => ({ ...prev, ...validate({ email: v, password }) }));
                  }}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, email: true }));
                    setFieldErrors((prev) => ({ ...prev, ...validate({ email, password }) }));
                  }}
                  aria-invalid={Boolean(touched.email && fieldErrors.email)}
                  required
                  className="login-floating-input"
                />
                <label className="login-floating-label" htmlFor="email">Email</label>
                {touched.email && fieldErrors.email && (
                  <div className="login-field-error">{fieldErrors.email}</div>
                )}
              </div>
              
              <div className="login-form-field">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder=" "
                  value={password}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPassword(v);
                    if (touched.password) setFieldErrors((prev) => ({ ...prev, ...validate({ email, password: v }) }));
                  }}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, password: true }));
                    setFieldErrors((prev) => ({ ...prev, ...validate({ email, password }) }));
                  }}
                  aria-invalid={Boolean(touched.password && fieldErrors.password)}
                  required
                  className="login-floating-input"
                />
                <label className="login-floating-label" htmlFor="password">Mot de passe</label>
                {touched.password && fieldErrors.password && (
                  <div className="login-field-error">{fieldErrors.password}</div>
                )}
              </div>

              {error && (
                <div className="login-error">
                  {error}
                </div>
              )}

              <Button type="submit" className="login-button" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default LoginPage;