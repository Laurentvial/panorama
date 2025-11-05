import React from 'react';
import { Navigate } from "react-router-dom";
import {jwtDecode} from "jwt-decode";
import api from "../utils/api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../utils/constants";
import { useState, useEffect } from "react";

function ProtectedRoute({ children }) { 
    const [isAuthenticated, setIsAuthenticated] = useState(null)

    useEffect(() => {
        authenticate().catch(() => setIsAuthenticated(false));
    }, []);

    const refreshToken = async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN);
        try {
            const res = await api.post('/api/token/refresh/', { 
                refresh: refreshToken,
            });
            if (res.status === 200) {   
                localStorage.setItem(ACCESS_TOKEN, res.data.access);
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
        if (!token) {
            setIsAuthenticated(false);
            return;
        }

        const decoded = jwtDecode(token);
        const tokenExpiry = decoded.exp;
        const currentTime = Date.now() / 1000;

        if (tokenExpiry < currentTime) {
            await refreshToken();
        } else {
            setIsAuthenticated(true);
        }
    }
    
    if (isAuthenticated === null) {
        return <div>Loading...</div>
    }

    return isAuthenticated ? children : <Navigate to="/login" />
}

export default ProtectedRoute;