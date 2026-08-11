/**
 * Payload for POST /api/v1/auth/register.
 * `phone` must match auth-service's validated format: /^\+212[67]\d{8}$/
 */
export interface RequestOtpPayload {
  phone: string;
}

/**
 * Response body of POST /api/v1/auth/register, per auth.controller.ts:
 *   { success: true, message: 'OTP envoyé', expiresAt: ISOString }
 */
export interface RequestOtpResponse {
  success: true;
  message: string;
  expiresAt: string;
}

export interface VerifyOtpPayload {
  phone: string;
  otp: string;
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: {
    id: string;
    phone: string;
    createdAt: string;
  };
}