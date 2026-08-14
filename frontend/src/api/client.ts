import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';
import { router } from '../router';
import type { AuthResult } from '../types/auth.types';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

export const httpClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: inject the access token from the auth store
 * into every outgoing request.
 */
httpClient.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().accessToken;

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

/**
 * Response interceptor: on a 401, attempt to refresh the token pair
 * (single-flight: concurrent 401s share one refresh call). If the refresh
 * succeeds, retry the original request with the new token. If it fails,
 * clear the auth state and redirect to /login.
 *
 * A raw `axios.post` (not `httpClient`) is used for the refresh call itself
 * so it never re-enters this same interceptor.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { phone, refreshToken, setAuth, clearAuth } = useAuthStore.getState();

  if (!phone || !refreshToken) {
    clearAuth();
    return null;
  }

  try {
    const { data } = await axios.post<AuthResult>(`${baseURL}/auth/refresh`, {
      phone,
      refreshToken,
    });

    setAuth(data);

    return data.accessToken;
  } catch {
    clearAuth();
    return null;
  }
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/verify-otp') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/login');

    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint;

    if (shouldAttemptRefresh) {
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

      router.navigate('/login');
    }

    return Promise.reject(error);
  },
);
