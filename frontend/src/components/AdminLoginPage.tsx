import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { signIn } from '../utils/auth';
import { useUser } from '../contexts/UserContext';
import { ACCESS_TOKEN, REFRESH_TOKEN } from '../utils/constants';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/LoginPage.css';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const { settings, loading: settingsLoading } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ username?: boolean; password?: boolean }>({});
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

  const validate = (values: { username: string; password: string }) => {
    const next: { username?: string; password?: string } = {};
    if (!values.username.trim()) next.username = 'Veuillez renseigner ce champ.';
    if (!values.password) next.password = 'Veuillez renseigner ce champ.';
    return next;
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    // Some browsers/password managers can autofill without triggering React onChange.
    // Read the actual DOM values at submit time to avoid "field required" while visibly filled.
    const form = e.currentTarget;
    const usernameValue =
      (form.elements.namedItem('username') as HTMLInputElement | null)?.value ?? username;
    const passwordValue =
      (form.elements.namedItem('password') as HTMLInputElement | null)?.value ?? password;
    if (usernameValue !== username) setUsername(usernameValue);
    if (passwordValue !== password) setPassword(passwordValue);

    const nextErrors = validate({ username: usernameValue, password: passwordValue });
    setFieldErrors(nextErrors);
    setTouched({ username: true, password: true });
    if (Object.keys(nextErrors).length > 0) return;
    setLoading(true);

    try {
      console.log('Admin login attempt for:', usernameValue);
      const result = await signIn(usernameValue, passwordValue);
      console.log('Login successful, result:', result);
      
      // Wait a bit for localStorage to be set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify token is stored
      const token = localStorage.getItem(ACCESS_TOKEN);
      const userType = localStorage.getItem('userType');
      console.log('Token stored:', !!token, 'UserType:', userType);
      
      if (!token) {
        throw new Error('Erreur: Token non reçu après connexion');
      }
      
      if (userType === 'client') {
        // Legacy safety: don't wipe all localStorage (would log out client session in other tabs).
        localStorage.removeItem(ACCESS_TOKEN);
        localStorage.removeItem(REFRESH_TOKEN);
        localStorage.removeItem('userType');
        throw new Error('Erreur: Connexion client détectée. Veuillez utiliser /login pour les clients.');
      }
      
      await refreshUser();
      
      // Double check userType after refresh
      const finalUserType = localStorage.getItem('userType');
      console.log('Final UserType after refresh:', finalUserType);
      
      if (finalUserType === 'client') {
        localStorage.removeItem(ACCESS_TOKEN);
        localStorage.removeItem(REFRESH_TOKEN);
        localStorage.removeItem('userType');
        throw new Error('Erreur: Type d\'utilisateur incorrect après connexion');
      }
      
      navigate('/admin');
    } catch (err: any) {
      console.error('Login error:', err);
      
      // Extract error message
      let errorMessage = 'Username ou mot de passe incorrect.';
      
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
        normalized.includes('username ou mot de passe incorrect') ||
        normalized.includes('invalid credentials') ||
        normalized.includes('no active account found');
      if (!isWrongCredentials) {
        toast.error(errorMessage);
      }
      
      // Clear any partial login data
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      localStorage.removeItem('userType');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page-container" style={containerStyle}>
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
            <CardTitle>{platformName ? `${platformName} - Administration` : ''}</CardTitle>
            <CardDescription>
              Connectez-vous à votre compte administrateur
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="login-form-field">
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder=" "
                  value={username}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUsername(v);
                    if (touched.username) setFieldErrors((prev) => ({ ...prev, ...validate({ username: v, password }) }));
                  }}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, username: true }));
                    setFieldErrors((prev) => ({ ...prev, ...validate({ username, password }) }));
                  }}
                  aria-invalid={Boolean(touched.username && fieldErrors.username)}
                  required
                  className="login-floating-input"
                />
                <label className="login-floating-label" htmlFor="username">Username</label>
                {touched.username && fieldErrors.username && (
                  <div className="login-field-error">{fieldErrors.username}</div>
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
                    if (touched.password) setFieldErrors((prev) => ({ ...prev, ...validate({ username, password: v }) }));
                  }}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, password: true }));
                    setFieldErrors((prev) => ({ ...prev, ...validate({ username, password }) }));
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

export default AdminLoginPage;
