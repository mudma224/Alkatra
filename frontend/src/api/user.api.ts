import { httpClient } from './client';
import type { AuthUser } from '../types/auth.types';
import type { UpdateProfilePayload } from '../types/user.types';

/**
 * Wraps user-service's profile endpoints:
 *   GET   /api/v1/user/profile
 *   PATCH /api/v1/user/profile
 *
 * Follows auth.api.ts's exact pattern: each function performs the HTTP
 * call and returns the response body only — error handling belongs to
 * whichever screen calls it, not here.
 *
 * Both endpoints are guarded by JwtAuthGuard on the backend and resolve
 * the user from the JWT's `sub` claim (see user-service's
 * UserController) — no user id is ever passed from the frontend, and
 * none should be: the backend never trusts a client-supplied id for
 * this kind of "my own resource" endpoint.
 */
export const userApi = {
  /** Returns the authenticated user's current profile. */
  getProfile: async (): Promise<AuthUser> => {
    const { data } = await httpClient.get<AuthUser>('/user/profile');
    return data;
  },

  /**
   * Updates `name` and/or `preferredLanguage`. Returns the full updated
   * profile, in the same shape as `getProfile`.
   */
  updateProfile: async (payload: UpdateProfilePayload): Promise<AuthUser> => {
    const { data } = await httpClient.patch<AuthUser>('/user/profile', payload);
    return data;
  },
};