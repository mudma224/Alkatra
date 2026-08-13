import { httpClient } from './client';
import type {
  RequestOtpPayload,
  RequestOtpResponse,
  VerifyOtpPayload,
  VerifyOtpResponse,
  RefreshPayload,
} from '../types/auth.types';

export const authApi = {
  /** POST /api/v1/auth/register — requests an OTP for `payload.phone`. */
  requestOtp: async (payload: RequestOtpPayload): Promise<RequestOtpResponse> => {
    const { data } = await httpClient.post('/auth/register', payload);
    return data;
  },

  /** POST /api/v1/auth/verify-otp — verifies the code and returns a session. */
  verifyOtp: async (payload: VerifyOtpPayload): Promise<VerifyOtpResponse> => {
    const { data } = await httpClient.post('/auth/verify-otp', payload);
    return data;
  },

  /**
   * POST /api/v1/auth/refresh — exchanges a valid refresh token for a new
   * session. Exposed here for explicit/manual use; the silent 401 refresh
   * flow in `client.ts` calls the backend directly instead, to avoid
   * re-entering this same interceptor chain.
   */
  refresh: async (payload: RefreshPayload): Promise<VerifyOtpResponse> => {
    const { data } = await httpClient.post('/auth/refresh', payload);
    return data;
  },
};