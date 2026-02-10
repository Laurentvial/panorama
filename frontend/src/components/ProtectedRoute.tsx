import React from 'react';
import { Navigate } from "react-router-dom";
import {jwtDecode} from "jwt-decode";
import { apiCall } from "../utils/api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../utils/constants";
import { useState, useEffect } from "react";

interface ProtectedRouteProps {
    children?: React.ReactNode;
}

// Cache for authentication results with TTL (5 minutes)
const AUTH_CACHE_KEY = 'admin_auth_cache';
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface AuthCache {
    isAuthenticated: boolean;
    timestamp: number;
    tokenHash: string; // Hash of token to detect token changes
}

function getTokenHash(token: string | null): string {
    if (!token) return '';
    // Simple hash using first and last 10 chars
    return token.substring(0, 10) + token.substring(token.length - 10);
}

function getCachedAuth(): AuthCache | null {
    try {
        const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
        if (!cached) return null;
        
        const authCache: AuthCache = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - authCache.timestamp < AUTH_CACHE_TTL) {
            return authCache;
        }
        
        // Cache expired, remove it
        sessionStorage.removeItem(AUTH_CACHE_KEY);
        return null;
    } catch (e) {
        return null;
    }
}

function setCachedAuth(isAuthenticated: boolean, tokenHash: string) {
    try {
        const authCache: AuthCache = {
            isAuthenticated,
            timestamp: Date.now(),
            tokenHash
        };
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authCache));
    } catch (e) {
        // Ignore storage errors
    }
}

function ProtectedRoute({ children }: ProtectedRouteProps) { 
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

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
                // Clear cache on token refresh
                sessionStorage.removeItem(AUTH_CACHE_KEY);
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
        const tokenHash = getTokenHash(token);
        
        // Check cache first
        const cachedAuth = getCachedAuth();
        if (cachedAuth && cachedAuth.tokenHash === tokenHash) {
            console.log('ProtectedRoute: Using cached authentication result');
            setIsAuthenticated(cachedAuth.isAuthenticated);
            return;
        }
        
        console.log('ProtectedRoute: Checking admin authentication', {
            hasToken: !!token,
            userType,
            tokenPrefix: token ? token.substring(0, 20) : null
        });
        
        if (!token) {
            console.log('ProtectedRoute: No admin token found');
            setIsAuthenticated(false);
            setCachedAuth(false, tokenHash);
            return;
        }

        // Check if it's a client trying to access admin routes
        if (userType === 'client' || token.startsWith('client_')) {
            console.log('ProtectedRoute: Blocked - Client token detected in admin route');
            setIsAuthenticated(false);
            setCachedAuth(false, tokenHash);
            return;
        }

        try {
            // Try to decode JWT token
            const decoded = jwtDecode(token);
            const tokenExpiry = decoded.exp;
            const currentTime = Date.now() / 1000;

            if (tokenExpiry && tokenExpiry < currentTime) {
                console.log('ProtectedRoute: Token expired, attempting refresh');
                await refreshToken();
            } else {
                console.log('ProtectedRoute: Token valid, authenticated');
                setIsAuthenticated(true);
                setCachedAuth(true, tokenHash);
            }
        } catch (error) {
            // Invalid JWT token (might be client token or malformed)
            console.error('ProtectedRoute: JWT decode error', error);
            setIsAuthenticated(false);
            setCachedAuth(false, tokenHash);
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