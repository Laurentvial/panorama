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
import axios from 'axios';
import { ACCESS_TOKEN } from './constants';

const apiUrl = "/choreo-apis/panorama/backend/v1";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : apiUrl,
})

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
)

export default api;