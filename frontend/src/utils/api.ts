import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN, REFRESH_TOKEN } from "./constants";
import { getApiBaseUrl } from "./apiBaseUrl";

const apiUrl = getApiBaseUrl();

function isClientAuth(token: string | null, userType: string | null): boolean {
  if (!token) return false;
  return userType === 'client' || token.startsWith('client_');
}

type ActiveAuth =
  | { kind: 'admin'; token: string | null; userType: string | null; storage: Storage }
  | { kind: 'client_session'; token: string; userType: 'client'; storage: Storage }
  | { kind: 'client_local'; token: string; userType: 'client'; storage: Storage };

function getActiveAuth(): ActiveAuth {
  const path =
    typeof window !== 'undefined' ? (window.location?.pathname || '') : '';
  const isAdminRoute = path.startsWith('/admin');

  // Never prefer the client (sessionStorage) token on admin routes, otherwise a
  // tab that previously impersonated a client can get kicked out of admin on
  // the next API call + HMR reload (401 -> redirect).
  if (!isAdminRoute) {
    // Prefer sessionStorage client context (per-tab) so an admin can keep the admin
    // panel open in another tab while viewing a client panel here.
    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
    const sessionUserType = sessionStorage.getItem('userType');
    if (sessionToken && isClientAuth(sessionToken, sessionUserType)) {
      return { kind: 'client_session', token: sessionToken, userType: 'client', storage: sessionStorage as Storage };
    }

    // Normal client login (persisted) uses a separate localStorage key so it
    // doesn't overwrite the admin JWT token.
    const clientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);
    if (clientToken) {
      return { kind: 'client_local', token: clientToken, userType: 'client', storage: localStorage as Storage };
    }
  }

  const token = localStorage.getItem(ACCESS_TOKEN);
  const userType = localStorage.getItem('userType');
  return { kind: 'admin', token, userType, storage: localStorage as Storage };
}

function clearAuth(auth: ActiveAuth) {
  if (auth.kind === 'client_session') {
    auth.storage.removeItem(ACCESS_TOKEN);
    auth.storage.removeItem('userType');
    auth.storage.removeItem('clientData');
    return;
  }
  if (auth.kind === 'client_local') {
    auth.storage.removeItem(CLIENT_ACCESS_TOKEN);
    auth.storage.removeItem('clientData');
    return;
  }
  auth.storage.removeItem(ACCESS_TOKEN);
  auth.storage.removeItem(REFRESH_TOKEN);
  auth.storage.removeItem('userType');
}

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

// API Cache system with TTL
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const apiCache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes default
const MAX_CACHE_SIZE = 100; // Maximum number of cached entries

// Clean up expired cache entries
function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of apiCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      apiCache.delete(key);
    }
  }
  
  // If cache is too large, remove oldest entries
  if (apiCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(apiCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, apiCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => apiCache.delete(key));
  }
}

// Generate cache key from endpoint and options
function getCacheKey(endpoint: string, options: RequestInit): string {
  const method = options.method || 'GET';
  const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
  return `${method}:${endpoint}:${body}`;
}

// Get cached data if available and valid
function getCachedData(key: string): any | null {
  cleanupCache();
  const entry = apiCache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    apiCache.delete(key);
    return null;
  }
  
  return entry.data;
}

// Set cached data
function setCachedData(key: string, data: any, ttl: number = DEFAULT_CACHE_TTL) {
  cleanupCache();
  apiCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
}

// Clear cache for a specific endpoint pattern or all cache
export function clearApiCache(endpointPattern?: string) {
  if (!endpointPattern) {
    apiCache.clear();
    return;
  }
  
  for (const [key] of apiCache.entries()) {
    if (key.includes(endpointPattern)) {
      apiCache.delete(key);
    }
  }
}

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
  const method = options.method || 'GET';
  const isGetRequest = method === 'GET';
  
  // Check cache for GET requests
  if (isGetRequest) {
    const cacheKey = getCacheKey(endpoint, options);
    const cachedData = getCachedData(cacheKey);
    if (cachedData !== null) {
      console.log(`API Cache hit: ${endpoint}`);
      return cachedData;
    }
  }
  
  const auth = getActiveAuth();
  let token = auth.token;
  const activeUserType = auth.userType;
  const activeStorage = auth.storage;
  
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
    // Client tokens are not refreshable (and must not clear admin localStorage).
    if (isClientAuth(token, activeUserType)) {
      if (!isRedirecting) {
        isRedirecting = true;
        clearAuth(auth);
        window.location.replace('/login');
        const redirectError = new Error('Redirecting to login');
        (redirectError as any).isRedirecting = true;
        throw redirectError;
      }
      const error = await response.json().catch(() => ({ detail: 'Authentication failed' }));
      const errorMessage = error.detail || error.error || error.message || 'Authentication failed';
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error;
      (errorObj as any).status = response.status;
      throw errorObj;
    }

    // For endpoints that allow public access, try without token if refresh fails
    // Only specific GET list endpoints are public - creation/update endpoints require authentication
    const isPublicEndpoint = endpoint.includes('/api/news/') || 
                             endpoint.includes('/api/settings/') ||
                             endpoint.includes('/api/assets/') ||
                             // Only GET /api/categories/ is public (list), exclude create/update/delete endpoints
                             ((endpoint === '/api/categories/' || endpoint === '/api/categories') && 
                              !endpoint.includes('/create') && 
                              !endpoint.includes('/update') && 
                              !endpoint.includes('/delete') &&
                              !endpoint.match(/\/categories\/[a-zA-Z0-9]+\//)) || // Exclude /categories/{id}/* routes
                             // Only GET /api/products/ is public (list), exclude all modification endpoints
                             ((endpoint === '/api/products/' || endpoint === '/api/products') && 
                              !endpoint.includes('/create') && 
                              !endpoint.includes('/update') && 
                              !endpoint.includes('/generate') &&
                              !endpoint.includes('/delete') &&
                              !endpoint.includes('/toggle-active') &&
                              !endpoint.includes('/duplicate') &&
                              !endpoint.includes('/contract-pdf') &&
                              !endpoint.match(/\/products\/[a-zA-Z0-9]+\//)) || // Exclude /products/{id}/* routes
                             (endpoint.includes('/api/clients/') && endpoint.includes('/assets/'));
    
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
        clearAuth({ kind: 'admin', token: null, userType: null, storage: localStorage as Storage });
        
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
      const userType = activeUserType || localStorage.getItem('userType');
      // Clear only the active auth storage (sessionStorage for impersonated client,
      // localStorage for normal logins), never wipe the other context.
      clearAuth(auth);
      
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

  const data = JSON.parse(text);
  
  // Cache GET requests
  if (isGetRequest && response.ok) {
    const cacheKey = getCacheKey(endpoint, options);
    // Use cache-control header if available, otherwise use default TTL
    const cacheControl = response.headers.get('cache-control');
    let ttl = DEFAULT_CACHE_TTL;
    
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        ttl = parseInt(maxAgeMatch[1], 10) * 1000; // Convert seconds to milliseconds
      }
    }
    
    setCachedData(cacheKey, data, ttl);
  }
  
  return data;
}

// Asset bulk import from index
export async function bulkImportAssetsFromIndex(data: {
  index: string;
  fetchFullDetails: boolean;
  skipDuplicates: boolean;
}) {
  return apiCall('/api/assets/bulk-import-from-index/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Get supported indices for bulk import
export async function getSupportedIndices() {
  return apiCall('/api/assets/supported-indices/');
}
