import { httpClient } from './client';
import type { RequestOtpPayload, RequestOtpResponse, VerifyOtpPayload, VerifyOtpResponse, RefreshTokenPayload, AuthResult, } from '../types/auth.types';

export const authApi = {
  /**
   * Calls the real auth-service endpoint: POST /api/v1/auth/register.
   * Requests an OTP to be sent to `payload.phone`.
   */
  requestOtp: async (payload: RequestOtpPayload): Promise<RequestOtpResponse> => {
    const { data } = await httpClient.post('/auth/register', payload);
    return data;
  },

  verifyOtp: async (payload: VerifyOtpPayload): Promise<VerifyOtpResponse> => {
    const { data } = await httpClient.post('/auth/verify-otp', payload);
    return data;
  },

  /**
   * Calls POST /api/v1/auth/refresh (alias of /login).
   * Exchanges a refresh token for a new token pair.
   */
  refresh: async (payload: RefreshTokenPayload): Promise<AuthResult> => {
    const { data } = await httpClient.post('/auth/refresh', payload);
    return data;
  }
};
