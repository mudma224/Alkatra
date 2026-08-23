import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

import { useAuthStore } from '../store/auth.store';
import { router } from '../router';
import type { AuthResult } from '../types/auth.types';

const baseURL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

/**
 * Shared API client used by the authenticated frontend.
 */
export const httpClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Adds the current in-memory access token to authenticated requests.
 *
 * No token is read from localStorage/sessionStorage.
 */
httpClient.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().accessToken;

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

/**
 * Prevents several simultaneous 401 responses from triggering
 * several refresh requests.
 */
let refreshPromise: Promise<string | null> | null = null;

/**
 * Exchanges the current refresh token for a new token pair.
 *
 * A separate Axios request is intentionally used here so the refresh
 * request does not trigger this same response interceptor recursively.
 */
async function refreshAccessToken(): Promise<string | null> {
  const {
    phone,
    refreshToken,
    setAuth,
    clearAuth,
  } = useAuthStore.getState();

  // A refresh is impossible without both values required by the backend.
  if (!phone || !refreshToken) {
    clearAuth();
    return null;
  }

  try {
    const { data } = await axios.post<AuthResult>(
      `${baseURL}/auth/refresh`,
      {
        phone,
        refreshToken,
      },
    );

    // The new access/refresh pair remains memory-only.
    setAuth(data);

    return data.accessToken;
  } catch {
    // Invalid/expired refresh token means the local session is no longer valid.
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

    /**
     * Authentication endpoints must not trigger automatic refresh.
     *
     * Otherwise a failed login/OTP/refresh request could recursively
     * enter the refresh flow.
     */
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/verify-otp') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/login');

    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      Boolean(originalRequest) &&
      !originalRequest?._retry &&
      !isAuthEndpoint;

    if (shouldAttemptRefresh && originalRequest) {
      // Mark this request so a failed retry cannot refresh indefinitely.
      originalRequest._retry = true;

      /**
       * Reuse an existing refresh request when another request is
       * already refreshing the session.
       */
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newAccessToken = await refreshPromise;

      if (newAccessToken) {
        // Retry the original request with the newly issued access token.
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        return httpClient(originalRequest);
      }

      // No valid refresh session remains, so return the user to login.
      router.navigate('/login');
    }

    return Promise.reject(error);
  },
);