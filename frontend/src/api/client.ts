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
 * Response interceptor: on a 401, attempt to refresh the token pair.
 * If the refresh succeeds, retry the original request with the new token.
 * If it fails, clear the auth state and redirect to /login.
 */
httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const { phone, refreshToken, clearAuth } = useAuthStore.getState();

    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/verify-otp') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/login');

    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      phone &&
      refreshToken;

    if (shouldAttemptRefresh) {
      originalRequest._retry = true;

      try {
        const { data } = await httpClient.post<AuthResult>('/auth/refresh', {
          phone,
          refreshToken,
        });

        useAuthStore.getState().setAuth(data);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

        return httpClient(originalRequest);
      } catch (refreshError) {
        clearAuth();
        router.navigate('/login');
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);