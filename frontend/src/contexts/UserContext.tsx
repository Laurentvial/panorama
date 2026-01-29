import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiCall } from '../utils/api';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN, REFRESH_TOKEN } from '../utils/constants';

interface UserContextType {
  currentUser: any;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

// Provide a default value to avoid undefined context
const defaultContextValue: UserContextType = {
  currentUser: null,
  loading: true,
  refreshUser: async () => {},
};

const UserContext = createContext<UserContextType>(defaultContextValue);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const getCurrentUser = async () => {
    const path =
      typeof window !== 'undefined' ? (window.location?.pathname || '') : '';
    const isAdminRoute = path.startsWith('/admin');

    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
    const sessionUserType = sessionStorage.getItem('userType');
    const isSessionClient =
      Boolean(sessionToken) && (sessionUserType === 'client' || sessionToken!.startsWith('client_'));

    let storage: Storage;
    let token: string | null;
    let userType: string | null;

    if (isAdminRoute) {
      // Admin routes always use admin auth from localStorage.
      storage = localStorage;
      token = storage.getItem(ACCESS_TOKEN);
      userType = storage.getItem('userType');
    } else if (isSessionClient) {
      // Client routes prefer per-tab client context (impersonation).
      storage = sessionStorage;
      token = sessionToken;
      userType = 'client';
    } else {
      // Normal client login uses a dedicated localStorage key so it can coexist
      // with an admin JWT session.
      storage = localStorage;
      token = storage.getItem(CLIENT_ACCESS_TOKEN);
      userType = token ? 'client' : null;
    }
    
    // Only make API call if we have a token
    if (!token) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    try {
      // Check if it's a client or admin user
      // If userType is not set or is 'admin', treat as admin (Django JWT)
      if (userType === 'client' || token.startsWith('client_')) {
        // Client user
        const clientData = storage.getItem('clientData');
        if (clientData) {
          try {
            const cachedClient = JSON.parse(clientData);
            // Check cached data - if client is disabled, don't use cached data
            if (!cachedClient.active || !cachedClient.platform_access) {
              // Clear invalid cached data
              storage.removeItem('clientData');
              storage.removeItem(ACCESS_TOKEN);
              storage.removeItem(CLIENT_ACCESS_TOKEN);
              storage.removeItem('userType');
            } else {
              setCurrentUser({
                ...cachedClient,
                userType: 'client'
              });
              // Show cached data immediately, then refresh from API to keep server-derived
              // flags (like accountVerified) consistent.
              setLoading(false);
            }
          } catch (e) {
            // ignore parse errors; we'll fetch below
          }
        }
        
        // Fetch client data from API
        // @ts-ignore - Vite environment variables
        const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
        const response = await fetch(`${apiUrl}/api/client/current/?token=${token}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const client = data.client;
          
          // Check if client is active and has platform access
          if (!client.active || !client.platform_access) {
            // Client is disabled or doesn't have platform access - sign out
            storage.removeItem(ACCESS_TOKEN);
            storage.removeItem(CLIENT_ACCESS_TOKEN);
            storage.removeItem('userType');
            storage.removeItem('clientData');
            setCurrentUser(null);
            setLoading(false);
            // Redirect to login if on platform route
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/platform')) {
              window.location.href = '/login';
            }
            return;
          }
          
          setCurrentUser({
            ...client,
            userType: 'client'
          });
          storage.setItem('clientData', JSON.stringify(client));
        } else if (response.status === 403) {
          // Client is disabled or access denied - sign out
          storage.removeItem(ACCESS_TOKEN);
          storage.removeItem(CLIENT_ACCESS_TOKEN);
          storage.removeItem('userType');
          storage.removeItem('clientData');
          setCurrentUser(null);
          setLoading(false);
          // Redirect to login if on platform route
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/platform')) {
            window.location.href = '/login';
          }
          return;
        } else if (!clientData) {
          // Only fail hard if we had no cached clientData at all
          throw new Error('Failed to get client data');
        }
      } else {
        // Admin user (Django JWT) - userType is 'admin' or not set
        try {
          const response = await apiCall("/api/user/current/");
          setCurrentUser({
            ...response,
            userType: 'admin'
          });
        } catch (apiError: any) {
          // If API call fails, it might be because token is invalid
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error("Erreur lors de la récupération de l'utilisateur", error);
      
      // If token is invalid (401) and it's an admin user, try to refresh it
      if ((error?.status === 401 || error?.message?.includes('token')) && userType !== 'client') {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN);
        if (refreshToken) {
          try {
            // @ts-ignore - Vite environment variables
            const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
            const refreshResponse = await fetch(`${apiUrl}/api/token/refresh/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                refresh: refreshToken,
              }),
            });

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              if (refreshData.access) {
                localStorage.setItem(ACCESS_TOKEN, refreshData.access);
                // Retry the request with new token
                try {
                  const response = await apiCall("/api/user/current/");
                  setCurrentUser(response);
                  setLoading(false);
                  return;
                } catch (retryError) {
                  console.error("Erreur après refresh du token", retryError);
                }
              }
            }
          } catch (refreshError) {
            console.error("Erreur lors du refresh du token", refreshError);
          }
        }
        
        // If refresh failed or no refresh token, clear tokens
        localStorage.removeItem(ACCESS_TOKEN);
        localStorage.removeItem(REFRESH_TOKEN);
        localStorage.removeItem('userType');
      }
      
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getCurrentUser();
  }, []);

  const refreshUser = async () => {
    await getCurrentUser();
  };

  return (
    <UserContext.Provider value={{ currentUser, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export function useUser() {
  const context = useContext(UserContext);
  // Context now always has a value, no need to check for undefined
  return context;
}

