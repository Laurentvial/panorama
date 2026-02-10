import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from '../utils/constants';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';

export function ClientImpersonate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const [message, setMessage] = useState('Connexion au panel client...');
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Prevent running multiple times
    if (hasRunRef.current) {
      console.log('ClientImpersonate: Already ran, skipping');
      return;
    }

    let cancelled = false;

    async function run() {
      if (!id) {
        navigate('/admin/clients', { replace: true });
        return;
      }

      // Mark as running IMMEDIATELY to prevent re-execution
      hasRunRef.current = true;

      // Check if we're already authenticated and on platform
      const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
      const sessionUserType = sessionStorage.getItem('userType');
      const clientData = sessionStorage.getItem('clientData');
      
      if (sessionToken && sessionToken === `client_${id}` && sessionUserType === 'client' && clientData) {
        // Already set up, just navigate
        console.log('ClientImpersonate: Already authenticated, navigating directly');
        try {
          await refreshUser();
          navigate('/platform', { replace: true });
        } catch (e) {
          console.error('ClientImpersonate: Error refreshing user', e);
          navigate('/platform', { replace: true });
        }
        return;
      }

      // Clear any existing platform session (from previous impersonation or normal client login)
      // This ensures we disconnect any existing platform session before logging in as the new client
      const existingSessionToken = sessionStorage.getItem(ACCESS_TOKEN);
      const existingSessionUserType = sessionStorage.getItem('userType');
      const existingClientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);
      
      // Check if there's an existing platform session
      const hasExistingPlatformSession = 
        (existingSessionToken && (existingSessionUserType === 'client' || existingSessionToken.startsWith('client_'))) ||
        existingClientToken;

      if (hasExistingPlatformSession) {
        setMessage('Déconnexion de la session précédente...');
        // Clear platform-related storage (but keep admin storage intact)
        sessionStorage.removeItem(ACCESS_TOKEN);
        sessionStorage.removeItem('userType');
        sessionStorage.removeItem('clientData');
        localStorage.removeItem(CLIENT_ACCESS_TOKEN);
        localStorage.removeItem('clientData');
      }

      const clientToken = `client_${id}`;
      setMessage('Connexion au panel client...');

      // Store ONLY in sessionStorage so the admin panel (localStorage) stays intact.
      sessionStorage.setItem(ACCESS_TOKEN, clientToken);
      sessionStorage.setItem('userType', 'client');
      sessionStorage.removeItem('clientData');

      try {
        // Validate + preload clientData so ClientProtectedRoute is instant.
        // @ts-ignore - Vite environment variables
        const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
        setMessage('Vérification des accès client...');
        const res = await fetch(`${apiUrl}/api/client/current/?token=${clientToken}`, {
          headers: { Authorization: `Bearer ${clientToken}` },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Accès client refusé' }));
          const errorMsg = err.error || err.detail || 'Accès client refusé';
          console.error('Client impersonation failed:', errorMsg, res.status);
          throw new Error(errorMsg);
        }

        const data = await res.json();
        if (!data?.client) {
          throw new Error('Données client introuvables');
        }

        // Verify client has platform access and is active
        if (!data.client.platform_access) {
          throw new Error('Accès à la plateforme désactivé pour ce client');
        }
        if (!data.client.active) {
          throw new Error('Compte client désactivé');
        }

        // Store client data in sessionStorage BEFORE navigation
        sessionStorage.setItem('clientData', JSON.stringify(data.client));
        
        // Double-check that everything is stored correctly
        const verifyToken = sessionStorage.getItem(ACCESS_TOKEN);
        const verifyUserType = sessionStorage.getItem('userType');
        const verifyClientData = sessionStorage.getItem('clientData');
        
        if (!verifyToken || verifyToken !== clientToken || verifyUserType !== 'client' || !verifyClientData) {
          console.error('Token verification failed:', {
            token: verifyToken,
            expectedToken: clientToken,
            userType: verifyUserType,
            clientData: verifyClientData ? 'exists' : 'missing'
          });
          throw new Error('Erreur lors de la configuration de la session');
        }
        
        setMessage('Connexion réussie, redirection...');

        if (!cancelled) {
          // IMPORTANT: UserProvider mounted earlier with the admin token.
          // Refresh it now so platform pages use the impersonated client user.
          await refreshUser();
          
          // Use navigate with replace to avoid full page reload
          // The sessionStorage token is already set, so ClientProtectedRoute should see it
          navigate('/platform', { replace: true });
        }
      } catch (e: any) {
        console.error('Client impersonation error:', e);
        sessionStorage.removeItem(ACCESS_TOKEN);
        sessionStorage.removeItem('userType');
        sessionStorage.removeItem('clientData');
        const errorMessage = e?.message || 'Impossible de se connecter au panel client';
        toast.error(errorMessage);
        if (!cancelled) {
          // Try to navigate back to admin clients page, or login if admin session is lost
          const adminToken = localStorage.getItem(ACCESS_TOKEN);
          if (adminToken) {
            navigate(`/admin/clients/${id}`, { replace: true });
          } else {
            navigate('/admin/login', { replace: true });
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      // Reset the ref so the effect can re-run when id changes
      hasRunRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id, not refreshUser or navigate

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, color: '#0f172a' }}>{message}</div>
        <div style={{ fontSize: 13, marginTop: 8, color: '#64748b' }}>
          Cette connexion est ouverte dans cet onglet uniquement.
        </div>
      </div>
    </div>
  );
}

export default ClientImpersonate;
