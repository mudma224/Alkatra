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

/**
 * User preferred language, aligned with auth-service's user entity
 * (`preferred_language` column, defaults to 'darija').
 * Returned on every authenticated response (verify-otp, refresh, profile).
 */
export type PreferredLanguage = 'french' | 'arabic' | 'darija';

/**
 * Public user shape returned by auth-service (`toUserResponse`).
 * Mirrors the `UserEntity` columns exposed through the API.
 */
export interface AuthUser {
  id: string;
  phone: string;
  /** Nullable until the user completes their profile. */
  name: string | null;
  preferredLanguage: PreferredLanguage;
  createdAt: string;
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
}

/**
 * Response body of POST /api/v1/auth/refresh (alias of /login).
 * Same contract as VerifyOtpResponse.
 */
export type AuthResult = VerifyOtpResponse;

/**
 * Payload for POST /api/v1/auth/refresh.
 * `phone` must match auth-service's validated format: /^\+212[67]\d{8}$/
 */
export interface RefreshTokenPayload {
  phone: string;
  refreshToken: string;
}
