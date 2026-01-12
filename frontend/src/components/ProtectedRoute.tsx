import React from 'react';
import { Navigate } from "react-router-dom";
import {jwtDecode} from "jwt-decode";
import { apiCall } from "../utils/api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../utils/constants";
import { useState, useEffect } from "react";

interface ProtectedRouteProps {
    children?: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) { 
    const [isAuthenticated, setIsAuthenticated] = useState(null)

    useEffect(() => {
        authenticate().catch(() => setIsAuthenticated(false));
    }, []);

    const refreshToken = async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN);
        try {
            const res = await apiCall('/api/token/refresh/', {
                method: 'POST',
                body: JSON.stringify({ refresh: refreshToken }),
            });
            if (res.access) {   
                localStorage.setItem(ACCESS_TOKEN, res.access);
                setIsAuthenticated(true);
            } else {
                setIsAuthenticated(false);
                return;
            }
        } catch (error) {
            console.error(error);
            setIsAuthenticated(false);
            return;
        }
    }

    const authenticate = async () => {
        const token = localStorage.getItem(ACCESS_TOKEN);
        const userType = localStorage.getItem('userType');
        
        if (!token) {
            setIsAuthenticated(false);
            return;
        }

        // Check if it's a client trying to access admin routes
        if (userType === 'client' || token.startsWith('client_')) {
            console.log('Blocked: Client token detected in admin route');
            setIsAuthenticated(false);
            return;
        }

        try {
            // Try to decode JWT token
            const decoded = jwtDecode(token);
            const tokenExpiry = decoded.exp;
            const currentTime = Date.now() / 1000;

            if (tokenExpiry && tokenExpiry < currentTime) {
                console.log('Token expired, attempting refresh');
                await refreshToken();
            } else {
                console.log('Token valid, authenticated');
                setIsAuthenticated(true);
            }
        } catch (error) {
            // Invalid JWT token (might be client token or malformed)
            console.error('JWT decode error:', error);
            setIsAuthenticated(false);
        }
    }
    
    if (isAuthenticated === null) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <div>Chargement...</div>
            </div>
        );
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/admin/login" />
}

export default ProtectedRoute;