import { apiCall } from './api';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN, REFRESH_TOKEN } from './constants';

// Get API base URL from environment or use default
const getEnvVar = (key: string): string | undefined => {
  // @ts-ignore - Vite environment variables
  return import.meta.env[key];
};

const apiUrl = getEnvVar('VITE_URL') || 'http://127.0.0.1:8000';

export async function signIn(username: string, password: string) {
  try {
    console.log('Attempting admin login for username:', username);
    const response = await fetch(`${apiUrl}/api/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim(), // Django REST Framework JWT uses 'username' field
        password: password,
      }),
    });

    console.log('Login response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Invalid credentials' }));
      console.error('Login error response:', errorData);
      const errorMessage = errorData.detail || errorData.error || Object.values(errorData).flat().join(', ') || 'Invalid credentials';
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Login successful, received data:', { hasAccess: !!data.access, hasRefresh: !!data.refresh });
    
    if (data.access) {
      localStorage.setItem(ACCESS_TOKEN, data.access);
      // Set userType to admin to distinguish from client
      localStorage.setItem('userType', 'admin');
      console.log('Token stored, userType set to admin');
    } else {
      throw new Error('No access token received from server');
    }
    
    if (data.refresh) {
      localStorage.setItem(REFRESH_TOKEN, data.refresh);
    }
    
    return data;
  } catch (error: any) {
    console.error('SignIn error:', error);
    throw error;
  }
}

export async function clientSignIn(email: string, password: string) {
  try {
    const response = await fetch(`${apiUrl}/api/client/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Invalid credentials' }));
      throw new Error(error.error || 'Email ou mot de passe incorrect');
    }

    const data = await response.json();
    
    if (data.token) {
      // Store client token under a dedicated key so it doesn't overwrite admin auth.
      localStorage.setItem(CLIENT_ACCESS_TOKEN, data.token);
      localStorage.setItem('clientData', JSON.stringify(data.client));
    }
    
    return data;
  } catch (error: any) {
    throw error;
  }
}

export async function signOut() {
  localStorage.removeItem(ACCESS_TOKEN);
  localStorage.removeItem(REFRESH_TOKEN);
  localStorage.removeItem('userType');
  // Don't clear client session here; admin and client sessions can coexist.
}

export async function clientSignOut() {
  // Clear per-tab client impersonation context (if any)
  sessionStorage.removeItem(ACCESS_TOKEN);
  sessionStorage.removeItem('userType');
  sessionStorage.removeItem('clientData');

  // Clear normal client login context (persisted)
  localStorage.removeItem(CLIENT_ACCESS_TOKEN);
  localStorage.removeItem('clientData');
}

export async function getSession() {
  const token = localStorage.getItem(ACCESS_TOKEN);
  
  if (!token) {
    return null;
  }

  try {
    // Verify token by getting current user
    const response = await apiCall('/api/user/current/');
    return {
      access_token: token,
      user: response,
    };
  } catch (error) {
    // Token is invalid, try to refresh
    const refreshToken = localStorage.getItem(REFRESH_TOKEN);
    if (refreshToken) {
      try {
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
            return {
              access_token: refreshData.access,
            };
          }
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens
        signOut();
        return null;
      }
    }
    
    signOut();
    return null;
  }
}
