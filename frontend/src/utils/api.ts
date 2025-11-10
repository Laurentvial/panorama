import axios from "axios";
import { ACCESS_TOKEN } from "./constants";

// Use environment variable if set, otherwise use Choreo proxy path
// For production on Choreo, this should be the Choreo proxy path
// For direct backend access, use: https://42b73c45-e46a-4ab7-8e13-f21ad7bee0b9-dev.e1-eu-west-cdp.choreoapis.dev/panorama/backend/v1.0
const getEnvVar = (key: string): string | undefined => {
  // @ts-ignore - Vite environment variables
  return import.meta.env[key];
};

const apiUrl = getEnvVar('VITE_API_URL');

const api = axios.create({
  baseURL: apiUrl,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper function for API calls that returns data directly
export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem(ACCESS_TOKEN);
  
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'API request failed' }));
    const errorMessage = error.detail || error.error || error.message || 'API request failed';
    const errorObj = new Error(errorMessage);
    (errorObj as any).response = error;
    (errorObj as any).status = response.status;
    throw errorObj;
  }

  return await response.json();
}

export default api;
