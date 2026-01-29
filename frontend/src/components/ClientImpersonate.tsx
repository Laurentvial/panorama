import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from '../utils/constants';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';

export function ClientImpersonate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useUser();
  const [message, setMessage] = useState('Connexion au panel client...');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!id) {
        navigate('/admin/clients', { replace: true });
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
        const res = await fetch(`${apiUrl}/api/client/current/?token=${clientToken}`, {
          headers: { Authorization: `Bearer ${clientToken}` },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Accès client refusé' }));
          throw new Error(err.error || err.detail || 'Accès client refusé');
        }

        const data = await res.json();
        if (data?.client) {
          sessionStorage.setItem('clientData', JSON.stringify(data.client));
        }

        if (!cancelled) {
          // IMPORTANT: UserProvider mounted earlier with the admin token.
          // Refresh it now so platform pages use the impersonated client user.
          await refreshUser();
          navigate('/platform', { replace: true });
        }
      } catch (e: any) {
        sessionStorage.removeItem(ACCESS_TOKEN);
        sessionStorage.removeItem('userType');
        sessionStorage.removeItem('clientData');
        toast.error(e?.message || 'Impossible de se connecter au panel client');
        if (!cancelled) {
          navigate(`/admin/clients/${id}`, { replace: true });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, refreshUser]);

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
