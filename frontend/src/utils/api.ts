// import { projectId, publicAnonKey } from './supabase/info';

// const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-35b53642`;

// export async function apiCall(endpoint: string, options: RequestInit = {}) {
//   const token = localStorage.getItem('access_token');

//   const response = await fetch(`${API_URL}${endpoint}`, {
//     ...options,
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': token ? `Bearer ${token}` : `Bearer ${publicAnonKey}`,
//       ...options.headers,
//     },
//   });

//   const data = await response.json();

//   if (!response.ok) {
//     console.error(`API Error on ${endpoint}:`, data);
//     throw new Error(data.error || 'API request failed');
//   }

//   return data;
// }
import axios from "axios";
import { ACCESS_TOKEN } from "./constants";

// Use environment variable if set, otherwise use Choreo proxy path
// For production on Choreo, this should be the Choreo proxy path
// For direct backend access, use: https://42b73c45-e46a-4ab7-8e13-f21ad7bee0b9-dev.e1-eu-west-cdp.choreoapis.dev/panorama/backend/v1.0
const getEnvVar = (key: string): string | undefined => {
  // @ts-ignore - Vite environment variables
  return import.meta.env[key];
};
const apiUrl = getEnvVar('VITE_API_URL') || "/choreo-apis/panorama/backend/v1.0";

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

export default api;
