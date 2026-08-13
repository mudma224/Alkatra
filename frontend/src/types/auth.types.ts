/**
 * Payload for POST /api/v1/auth/register.
 * `phone` must match auth-service's validated format: /^\+212[67]\d{8}$/
 */
export interface RequestOtpPayload {
  phone: string;
}

/** Response body of POST /api/v1/auth/register (auth.controller.ts). */
export interface RequestOtpResponse {
  success: true;
  message: string;
  expiresAt: string;
}

export interface VerifyOtpPayload {
  phone: string;
  otp: string;
}

/** Payload for POST /api/v1/auth/refresh (same contract as LoginDto). */
export interface RefreshPayload {
  phone: string;
  refreshToken: string;
}

/**
 * Mirrors AuthService.toUserResponse() exactly (auth.service.ts).
 *
 * ⚠️ ASSUMPTION / TO VERIFY: the Phase 1 guide's sample JSON payloads use
 * preferredLanguage: "fr" | "ar" | "darija", but the actual UserEntity and
 * UpdateProfileDto in md.md use "french" | "arabic" | "darija". This type
 * follows the real backend code (source of truth) — confirm with backend
 * before building the profile-editing screen.
 */
export interface AuthUser {
  id: string;
  phone: string;
  name: string | null;
  preferredLanguage: 'french' | 'arabic' | 'darija';
  createdAt: string;
}

/** Response body of POST /api/v1/auth/verify-otp and POST /api/v1/auth/refresh. */
export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: AuthUser;
}