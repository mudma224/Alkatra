import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export const httpClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Request interceptor: attach the JWT to every outgoing call. ---------
httpClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// --- Response interceptor: silent refresh on 401, single-flight guarded. -
// A raw `axios.post` (not `httpClient`) is used for the refresh call itself
// so it never re-enters this same interceptor.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, user, setSession, clearSession } = useAuthStore.getState();

  if (!refreshToken || !user) {
    clearSession();
    return null;
  }

  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, {
      phone: user.phone,
      refreshToken,
    });

    setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });

    return data.accessToken as string;
  } catch {
    clearSession();
    return null;
  }
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/verify-otp') ||
      originalRequest?.url?.includes('/auth/refresh');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newAccessToken = await refreshPromise;

      if (newAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return httpClient(originalRequest);
      }

      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);