import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { apiCall, clearApiCache } from '../utils/api';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN, REFRESH_TOKEN } from '../utils/constants';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

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

// Cache for user data with TTL (2 minutes)
const USER_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
let userCache: { user: any; timestamp: number; tokenHash: string; userType: string } | null = null;
let isLoadingUser = false;

function getTokenHash(token: string | null): string {
  if (!token) return '';
  return token.substring(0, 10) + token.substring(token.length - 10);
}

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const getCurrentUser = async (forceRefresh: boolean = false) => {
    // Prevent concurrent requests
    if (isLoadingUser && !forceRefresh) {
      return;
    }

    isLoadingUser = true;
    const path =
      typeof window !== 'undefined' ? (window.location?.pathname || '') : '';
    const isAdminRoute = path.startsWith('/admin');
    const isImpersonateRoute = path.startsWith('/platform/impersonate');

    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
    const sessionUserType = sessionStorage.getItem('userType');
    const isSessionClient =
      Boolean(sessionToken) && (sessionUserType === 'client' || sessionToken!.startsWith('client_'));

    let storage: Storage;
    let token: string | null;
    let userType: string | null;

    // On /platform/impersonate: prefer client session if already set (impersonation in progress),
    // otherwise use admin token for the initial role check.
    if (isImpersonateRoute && isSessionClient) {
      storage = sessionStorage;
      token = sessionToken;
      userType = 'client';
    } else if (isAdminRoute || isImpersonateRoute) {
      // Admin routes and impersonate (before client session is set) use admin auth from localStorage.
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
      if (isMountedRef.current) {
        setCurrentUser(null);
        setLoading(false);
      }
      isLoadingUser = false;
      return;
    }

    const tokenHash = getTokenHash(token);
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && userCache) {
      const now = Date.now();
      const cacheAge = now - userCache.timestamp;
      
      // Use cache if it's still valid and token hasn't changed
      if (cacheAge < USER_CACHE_TTL && userCache.tokenHash === tokenHash && userCache.userType === userType) {
        console.log('UserContext: Using cached user data');
        if (isMountedRef.current) {
          setCurrentUser(userCache.user);
          setLoading(false);
        }
        isLoadingUser = false;
        return;
      }
    }
    
    try {
      // Check if it's a client or admin user
      // Token format is the source of truth: client_ tokens go to client API, JWTs go to admin API.
      // userType in storage can be wrong (e.g. corrupted session), so we require token.startsWith('client_').
      const isClientToken = token.startsWith('client_');
      if (isClientToken) {
        // Client user
        const clientData = storage.getItem('clientData');
        if (clientData) {
          try {
            const cachedClient = JSON.parse(clientData);
            // Check cached data - if client is disabled, don't use cached data
            if (!cachedClient.active) {
              // Clear invalid cached data
              storage.removeItem('clientData');
              storage.removeItem(ACCESS_TOKEN);
              storage.removeItem(CLIENT_ACCESS_TOKEN);
              storage.removeItem('userType');
            } else {
              const cachedUserData = {
                ...cachedClient,
                userType: 'client'
              };
              if (isMountedRef.current) {
                setCurrentUser(cachedUserData);
                // Show cached data immediately, then refresh from API to keep server-derived
                // flags (like accountVerified) consistent.
                setLoading(false);
              }
              // Update cache
              userCache = {
                user: cachedUserData,
                timestamp: Date.now(),
                tokenHash,
                userType: 'client'
              };
            }
          } catch (e) {
            // ignore parse errors; we'll fetch below
          }
        }
        
        // Fetch client data from API
        const apiUrl = getApiBaseUrl();
        const response = await fetch(`${apiUrl}/api/client/current/?token=${token}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const client = data.client;
          
          // Check if client is active
          if (!client.active) {
            // Client is disabled - sign out
            storage.removeItem(ACCESS_TOKEN);
            storage.removeItem(CLIENT_ACCESS_TOKEN);
            storage.removeItem('userType');
            storage.removeItem('clientData');
            if (isMountedRef.current) {
              setCurrentUser(null);
              setLoading(false);
            }
            userCache = null;
            // Redirect to login if on platform route
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/platform')) {
              window.location.href = '/login';
            }
            isLoadingUser = false;
            return;
          }
          
          const userData = {
            ...client,
            userType: 'client'
          };
          if (isMountedRef.current) {
            setCurrentUser(userData);
          }
          storage.setItem('clientData', JSON.stringify(client));
          // Update cache
          userCache = {
            user: userData,
            timestamp: Date.now(),
            tokenHash,
            userType: 'client'
          };
        } else if (response.status === 403) {
          // Client is disabled or access denied - sign out
          storage.removeItem(ACCESS_TOKEN);
          storage.removeItem(CLIENT_ACCESS_TOKEN);
          storage.removeItem('userType');
          storage.removeItem('clientData');
          if (isMountedRef.current) {
            setCurrentUser(null);
            setLoading(false);
          }
          userCache = null;
          // Redirect to login if on platform route
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/platform')) {
            window.location.href = '/login';
          }
          isLoadingUser = false;
          return;
        } else if (!clientData) {
          // Only fail hard if we had no cached clientData at all
          throw new Error('Failed to get client data');
        }
      } else {
        // Admin user (Django JWT) - userType is 'admin' or not set
        try {
          const response = await apiCall("/api/user/current/");
          const userData = {
            ...response,
            userType: 'admin'
          };
          if (isMountedRef.current) {
            setCurrentUser(userData);
          }
          // Update cache
          userCache = {
            user: userData,
            timestamp: Date.now(),
            tokenHash,
            userType: userType || 'admin'
          };
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
            const apiUrl = getApiBaseUrl();
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
                  const userData = {
                    ...response,
                    userType: 'admin'
                  };
                  if (isMountedRef.current) {
                    setCurrentUser(userData);
                    setLoading(false);
                  }
                  // Update cache with new token hash
                  const newTokenHash = getTokenHash(localStorage.getItem(ACCESS_TOKEN));
                  userCache = {
                    user: userData,
                    timestamp: Date.now(),
                    tokenHash: newTokenHash,
                    userType: 'admin'
                  };
                  isLoadingUser = false;
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
      
      if (isMountedRef.current) {
        setCurrentUser(null);
      }
      userCache = null;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      isLoadingUser = false;
    }
  };

  useEffect(() => {
    getCurrentUser();
  }, []);

  const refreshUser = async () => {
    // Clear cache and force refresh
    userCache = null;
    clearApiCache('/api/user');
    await getCurrentUser(true);
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

