import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { signIn } from '../utils/auth';
import { useUser } from '../contexts/UserContext';
import { ACCESS_TOKEN } from '../utils/constants';
import { toast } from 'sonner';
import '../styles/LoginPage.css';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('Admin login attempt for:', username);
      const result = await signIn(username, password);
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
        // Clear everything and try again
        localStorage.clear();
        throw new Error('Erreur: Connexion client détectée. Veuillez utiliser /login pour les clients.');
      }
      
      await refreshUser();
      
      // Double check userType after refresh
      const finalUserType = localStorage.getItem('userType');
      console.log('Final UserType after refresh:', finalUserType);
      
      if (finalUserType === 'client') {
        localStorage.clear();
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
      toast.error(errorMessage);
      
      // Clear any partial login data
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem('refresh');
      localStorage.removeItem('userType');
      localStorage.removeItem('clientData');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page-container">
      <Card className="login-card">
        <CardHeader className="login-card-header">
          <CardTitle>Panorama - Administration</CardTitle>
          <CardDescription>
            Connectez-vous à votre compte administrateur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-form-field">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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

export default AdminLoginPage;
