import { ACCESS_TOKEN, REFRESH_TOKEN } from "./constants";

// Use environment variable if set, otherwise use Choreo proxy path
// For production on Choreo, this should be the Choreo proxy path
// For direct backend access, use: https://42b73c45-e46a-4ab7-8e13-f21ad7bee0b9-dev.e1-eu-west-cdp.choreoapis.dev/panorama/backend/v1.0
const getEnvVar = (key: string): string | undefined => {
  // @ts-ignore - Vite environment variables
  return import.meta.env[key];
};

const apiUrl = getEnvVar('VITE_URL') || 'http://127.0.0.1:8000';

// Helper function to check if an error is a network error (server restarting)
function isNetworkError(error: any): boolean {
  return (
    error instanceof TypeError ||
    error?.message?.includes('Failed to fetch') ||
    error?.message?.includes('NetworkError') ||
    error?.message?.includes('Network request failed') ||
    error?.name === 'NetworkError'
  );
}

// Helper function to refresh access token
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN);
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${apiUrl}/api/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.access) {
        localStorage.setItem(ACCESS_TOKEN, data.access);
        return data.access;
      }
    }
    
    // If we get a 401/403, then token is actually invalid
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      return null;
    }
  } catch (error: any) {
    // Don't clear tokens on network errors (server restarting)
    if (isNetworkError(error)) {
      console.warn('Network error during token refresh - server may be restarting');
      return null; // Return null but don't clear tokens
    }
    console.error('Error refreshing token:', error);
    // For other errors, don't clear tokens - might be temporary
  }
  
  return null;
}

// Flag to prevent multiple redirects
let isRedirecting = false;

// Helper function to retry a request with exponential backoff
async function retryRequest(
  url: string,
  options: RequestInit,
  retries: number = 3,
  delay: number = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // If we get a response (even if error status), it means server is up
      return response;
    } catch (error: any) {
      if (isNetworkError(error) && i < retries - 1) {
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Helper function for API calls that returns data directly
export async function apiCall(endpoint: string, options: RequestInit = {}) {
  let token = localStorage.getItem(ACCESS_TOKEN);
  
  // Don't set Content-Type for FormData, let the browser set it with boundary
  const isFormData = options.body instanceof FormData;
  const headers: HeadersInit = {
    ...options.headers,
  };
  
  // Only add Authorization header if we have a token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  let response: Response;
  
  try {
    // Use retry logic for network errors (server restarting)
    response = await retryRequest(`${apiUrl}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (error: any) {
    // Handle network errors gracefully - don't treat as auth failure
    if (isNetworkError(error)) {
      const errorObj = new Error('Server is restarting. Please try again in a moment.');
      (errorObj as any).isNetworkError = true;
      (errorObj as any).status = 0;
      throw errorObj;
    }
    // Re-throw other errors
    throw error;
  }

  // If 401, try to refresh token and retry once
  if (response.status === 401 && token) {
    // For endpoints that allow public access, try without token if refresh fails
    const isPublicEndpoint = endpoint.includes('/api/news/') || 
                             endpoint.includes('/api/settings/') ||
                             endpoint.includes('/api/clients/') && endpoint.includes('/assets/');
    
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Retry the request with the new token
      const retryHeaders: HeadersInit = {
        'Authorization': `Bearer ${newToken}`,
        ...options.headers,
      };
      if (!isFormData) {
        retryHeaders['Content-Type'] = 'application/json';
      }
      try {
        response = await retryRequest(`${apiUrl}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        });
      } catch (error: any) {
        // Handle network errors during retry
        if (isNetworkError(error)) {
          const errorObj = new Error('Server is restarting. Please try again in a moment.');
          (errorObj as any).isNetworkError = true;
          (errorObj as any).status = 0;
          throw errorObj;
        }
        throw error;
      }
    } else if (isPublicEndpoint) {
      // For public endpoints, try without token if refresh failed
      const noAuthHeaders: HeadersInit = {
        ...options.headers,
      };
      if (!isFormData) {
        noAuthHeaders['Content-Type'] = 'application/json';
      }
      try {
        response = await retryRequest(`${apiUrl}${endpoint}`, {
          ...options,
          headers: noAuthHeaders,
        });
      } catch (error: any) {
        // If still fails, throw the original error
        const errorObj = await response.json().catch(() => ({ detail: 'API request failed' }));
        const errorMessage = errorObj.detail || errorObj.error || errorObj.message || 'API request failed';
        const finalError = new Error(errorMessage);
        (finalError as any).response = errorObj;
        (finalError as any).status = response.status;
        throw finalError;
      }
    } else {
      // Refresh failed - token is invalid, redirect to login immediately
      // Only redirect if we actually got a 401 response (not a network error)
      if (!isRedirecting) {
        isRedirecting = true;
        const userType = localStorage.getItem('userType');
        localStorage.removeItem(ACCESS_TOKEN);
        localStorage.removeItem(REFRESH_TOKEN);
        localStorage.removeItem('userType');
        localStorage.removeItem('clientData');
        
        // Use replace instead of href for immediate redirect
        if (userType === 'client') {
          window.location.replace('/login');
        } else {
          window.location.replace('/admin/login');
        }
        // Throw error to stop execution (page will navigate away anyway)
        const redirectError = new Error('Redirecting to login');
        (redirectError as any).isRedirecting = true;
        throw redirectError;
      }
      
      // If already redirecting, throw error to stop execution
      const error = await response.json().catch(() => ({ detail: 'Authentication failed' }));
      const errorMessage = error.detail || error.error || error.message || 'Authentication failed';
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error;
      (errorObj as any).status = response.status;
      throw errorObj;
    }
  }

  if (!response.ok) {
    // If still 401 after refresh attempt, handle it
    if (response.status === 401 && token && !isRedirecting) {
      isRedirecting = true;
      const userType = localStorage.getItem('userType');
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      localStorage.removeItem('userType');
      localStorage.removeItem('clientData');
      
      // Use replace for immediate redirect
      if (userType === 'client') {
        window.location.replace('/login');
      } else {
        window.location.replace('/admin/login');
      }
      // Throw error to stop execution (page will navigate away anyway)
      const redirectError = new Error('Redirecting to login');
      (redirectError as any).isRedirecting = true;
      throw redirectError;
    }
    
    const error = await response.json().catch(() => ({ detail: 'API request failed' }));
    const errorMessage = error.detail || error.error || error.message || 'API request failed';
    const errorObj = new Error(errorMessage);
    (errorObj as any).response = error;
    (errorObj as any).status = response.status;
    throw errorObj;
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return null;
  }

  // Check if response has content before parsing JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}
