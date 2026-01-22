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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Client login only
      await clientSignIn(email, password);
      await refreshUser();
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
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page-container">
      <Card className="login-card">
        <CardHeader className="login-card-header">
          {!settingsLoading && settings?.logo_url ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginBottom: '1rem' 
            }}>
              <img 
                src={settings.logo_url} 
                alt="Logo" 
                style={{ 
                  maxHeight: '60px', 
                  maxWidth: '200px', 
                  objectFit: 'contain' 
                }} 
                onError={(e) => {
                  // If logo fails to load, hide the image and show nothing (or fallback)
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ) : null}
          <CardDescription>
            Connectez-vous à votre compte client
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-form-field">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="login-form-field">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
  );
}

export default LoginPage;