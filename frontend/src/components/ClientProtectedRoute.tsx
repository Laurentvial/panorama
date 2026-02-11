import React from 'react';
import { Navigate } from "react-router-dom";
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from "../utils/constants";
import { useState, useEffect } from "react";

interface ClientProtectedRouteProps {
    children?: React.ReactNode;
}

// Cache for client authentication results with TTL (5 minutes)
const CLIENT_AUTH_CACHE_KEY = 'client_auth_cache';
const CLIENT_AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface ClientAuthCache {
    isAuthenticated: boolean;
    timestamp: number;
    tokenHash: string; // Hash of token to detect token changes
    storageType: 'session' | 'local';
}

function isNetworkLikeError(error: any): boolean {
    return (
        error instanceof TypeError ||
        error?.name === 'NetworkError' ||
        String(error?.message || '').includes('Failed to fetch') ||
        String(error?.message || '').includes('NetworkError') ||
        String(error?.message || '').includes('Network request failed')
    );
}

function getTokenHash(token: string | null): string {
    if (!token) return '';
    // Simple hash using first and last 10 chars
    return token.substring(0, 10) + token.substring(token.length - 10);
}

function getCachedClientAuth(storageType: 'session' | 'local'): ClientAuthCache | null {
    try {
        const storage = storageType === 'session' ? sessionStorage : localStorage;
        const cached = storage.getItem(CLIENT_AUTH_CACHE_KEY);
        if (!cached) return null;
        
        const authCache: ClientAuthCache = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - authCache.timestamp < CLIENT_AUTH_CACHE_TTL) {
            return authCache;
        }
        
        // Cache expired, remove it
        storage.removeItem(CLIENT_AUTH_CACHE_KEY);
        return null;
    } catch (e) {
        return null;
    }
}

function setCachedClientAuth(isAuthenticated: boolean, tokenHash: string, storageType: 'session' | 'local') {
    try {
        const storage = storageType === 'session' ? sessionStorage : localStorage;
        const authCache: ClientAuthCache = {
            isAuthenticated,
            timestamp: Date.now(),
            tokenHash,
            storageType
        };
        storage.setItem(CLIENT_AUTH_CACHE_KEY, JSON.stringify(authCache));
    } catch (e) {
        // Ignore storage errors
    }
}

function ClientProtectedRoute({ children }: ClientProtectedRouteProps) { 
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        authenticate();
    }, []);

    const authenticate = async () => {
        // Prefer per-tab client session (sessionStorage) to allow an admin to stay
        // logged into the admin panel while opening client panels in other tabs.
        const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
        const sessionUserType = sessionStorage.getItem('userType');
        const isSessionClient =
            Boolean(sessionToken) && (sessionUserType === 'client' || sessionToken!.startsWith('client_'));

        console.log('ClientProtectedRoute: Checking authentication', {
            sessionToken: sessionToken ? `${sessionToken.substring(0, 10)}...` : null,
            sessionUserType,
            isSessionClient
        });

        const storage: Storage = isSessionClient ? sessionStorage : localStorage;
        const storageType: 'session' | 'local' = isSessionClient ? 'session' : 'local';

        const token = isSessionClient ? sessionToken : localStorage.getItem(CLIENT_ACCESS_TOKEN);
        const userType = isSessionClient ? sessionUserType : (token ? 'client' : null);
        const tokenHash = getTokenHash(token);
        
        // Check cache first
        const cachedAuth = getCachedClientAuth(storageType);
        if (cachedAuth && cachedAuth.tokenHash === tokenHash) {
            console.log('ClientProtectedRoute: Using cached authentication result');
            setIsAuthenticated(cachedAuth.isAuthenticated);
            return;
        }
        
        if (!token) {
            console.log('ClientProtectedRoute: No token found, redirecting to login');
            setIsAuthenticated(false);
            setCachedClientAuth(false, tokenHash, storageType);
            return;
        }

        // Check if it's a client token
        if (userType === 'client' || token.startsWith('client_')) {
            console.log('ClientProtectedRoute: Client token detected, verifying...');
            // Verify client token is valid by checking if client data exists
            const clientData = storage.getItem('clientData');
            if (clientData) {
                try {
                    const client = JSON.parse(clientData);
                    // Check if client has platform access and is active
                    if (client.platform_access && client.active) {
                        console.log('ClientProtectedRoute: Client data found in storage, authenticated');
                        setIsAuthenticated(true);
                        setCachedClientAuth(true, tokenHash, storageType);
                        return;
                    } else {
                        console.log('ClientProtectedRoute: Client data found but access denied', {
                            platform_access: client.platform_access,
                            active: client.active
                        });
                    }
                } catch (e) {
                    console.error('ClientProtectedRoute: Invalid client data format', e);
                    // Invalid client data
                }
            }
            
            // Try to fetch client data from API
            try {
                console.log('ClientProtectedRoute: Fetching client data from API...');
                // @ts-ignore - Vite environment variables
                const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
                const response = await fetch(`${apiUrl}/api/client/current/?token=${token}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                
                console.log('ClientProtectedRoute: API response status', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.client && data.client.platform_access && data.client.active) {
                        storage.setItem('clientData', JSON.stringify(data.client));
                        console.log('ClientProtectedRoute: API authentication successful');
                        setIsAuthenticated(true);
                        setCachedClientAuth(true, tokenHash, storageType);
                        return;
                    } else {
                        console.log('ClientProtectedRoute: Client disabled or no platform access');
                        // Client is disabled or doesn't have platform access - clear session
                        storage.removeItem(ACCESS_TOKEN);
                        storage.removeItem(CLIENT_ACCESS_TOKEN);
                        storage.removeItem('userType');
                        storage.removeItem('clientData');
                        storage.removeItem(CLIENT_AUTH_CACHE_KEY);
                        setIsAuthenticated(false);
                        setCachedClientAuth(false, tokenHash, storageType);
                        return;
                    }
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('ClientProtectedRoute: API error', response.status, errorData);
                    // Only clear session on explicit auth failures.
                    if (response.status === 401 || response.status === 403) {
                        storage.removeItem(ACCESS_TOKEN);
                        storage.removeItem(CLIENT_ACCESS_TOKEN);
                        storage.removeItem('userType');
                        storage.removeItem('clientData');
                        storage.removeItem(CLIENT_AUTH_CACHE_KEY);
                        setIsAuthenticated(false);
                        setCachedClientAuth(false, tokenHash, storageType);
                        return;
                    }

                    // For transient/backend errors (5xx, etc.), keep existing session.
                    console.warn('ClientProtectedRoute: transient API error, keeping client session');
                    setIsAuthenticated(true);
                    setCachedClientAuth(true, tokenHash, storageType);
                    return;
                }
            } catch (error) {
                console.error('ClientProtectedRoute: Network error', error);
                // Keep client session on transient network issues during navigation.
                if (isNetworkLikeError(error)) {
                    setIsAuthenticated(true);
                    setCachedClientAuth(true, tokenHash, storageType);
                    return;
                }
                // Unknown non-network exception: don't force logout either.
                setIsAuthenticated(true);
                setCachedClientAuth(true, tokenHash, storageType);
                return;
            }
        }
        
        console.log('ClientProtectedRoute: Not a client token or authentication failed');
        setIsAuthenticated(false);
        setCachedClientAuth(false, tokenHash, storageType);
    }
    
    if (isAuthenticated === null) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <div>Chargement...</div>
            </div>
        );
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

export default ClientProtectedRoute;
