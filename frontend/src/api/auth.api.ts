import { httpClient } from './client';
import type { RequestOtpPayload, RequestOtpResponse, VerifyOtpPayload, VerifyOtpResponse, } from '../types/auth.types';

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
  }
};