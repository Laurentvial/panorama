import React from 'react';
import { Navigate } from "react-router-dom";
import { ACCESS_TOKEN } from "../utils/constants";
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
        const storage: Storage = sessionToken ? sessionStorage : localStorage;

        const token = sessionToken || localStorage.getItem(ACCESS_TOKEN);
        const userType = sessionUserType || localStorage.getItem('userType');
        
        if (!token) {
            setIsAuthenticated(false);
            return;
        }

        // Check if it's a client token
        if (userType === 'client' || token.startsWith('client_')) {
            // Verify client token is valid by checking if client data exists
            const clientData = storage.getItem('clientData');
            if (clientData) {
                try {
                    const client = JSON.parse(clientData);
                    // Check if client has platform access and is active
                    if (client.platform_access && client.active) {
                        setIsAuthenticated(true);
                        return;
                    }
                } catch (e) {
                    // Invalid client data
                }
            }
            
            // Try to fetch client data from API
            try {
                // @ts-ignore - Vite environment variables
                const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
                const response = await fetch(`${apiUrl}/api/client/current/?token=${token}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.client && data.client.platform_access && data.client.active) {
                        storage.setItem('clientData', JSON.stringify(data.client));
                        setIsAuthenticated(true);
                        return;
                    }
                }
            } catch (error) {
                console.error('Client authentication error:', error);
            }
        }
        
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
