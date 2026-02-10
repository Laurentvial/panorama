import React from 'react';
import { Navigate } from "react-router-dom";
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from "../utils/constants";
import { useState, useEffect } from "react";

interface ClientProtectedRouteProps {
    children?: React.ReactNode;
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

        const token = isSessionClient ? sessionToken : localStorage.getItem(CLIENT_ACCESS_TOKEN);
        const userType = isSessionClient ? sessionUserType : (token ? 'client' : null);
        
        if (!token) {
            console.log('ClientProtectedRoute: No token found, redirecting to login');
            setIsAuthenticated(false);
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
                        return;
                    } else {
                        console.log('ClientProtectedRoute: Client disabled or no platform access');
                        // Client is disabled or doesn't have platform access - clear session
                        storage.removeItem(ACCESS_TOKEN);
                        storage.removeItem(CLIENT_ACCESS_TOKEN);
                        storage.removeItem('userType');
                        storage.removeItem('clientData');
                        setIsAuthenticated(false);
                        return;
                    }
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('ClientProtectedRoute: API error', response.status, errorData);
                    // Any error response (401, 403, 404, 500, etc.) - clear session
                    storage.removeItem(ACCESS_TOKEN);
                    storage.removeItem(CLIENT_ACCESS_TOKEN);
                    storage.removeItem('userType');
                    storage.removeItem('clientData');
                    setIsAuthenticated(false);
                    return;
                }
            } catch (error) {
                console.error('ClientProtectedRoute: Network error', error);
                // Network error or other exception - clear session
                storage.removeItem(ACCESS_TOKEN);
                storage.removeItem(CLIENT_ACCESS_TOKEN);
                storage.removeItem('userType');
                storage.removeItem('clientData');
                setIsAuthenticated(false);
                return;
            }
        }
        
        console.log('ClientProtectedRoute: Not a client token or authentication failed');
        setIsAuthenticated(false);
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
