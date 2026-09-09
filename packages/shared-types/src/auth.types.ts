// packages/shared-types/src/auth.types.ts

export type PreferredLanguage = 'fr' | 'ar' | 'darija';

export interface RegisterRequest {
  phone: string; // "+2126XXXXXXXX"
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  expiresAt: string; // ISO date, +5 min
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string; // 6 chiffres
}

export interface LoginRequest {
  phone: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  name: string | null;
  preferredLanguage: PreferredLanguage;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 3600
  tokenType: 'Bearer';
  user: AuthUser;
}

export interface JwtPayload {
  sub: string; // user.id (UUID)
  phone: string;
  iat?: number;
  exp?: number;
}
