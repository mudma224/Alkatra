// packages/shared-types/src/user.types.ts

import { PreferredLanguage } from './auth.types';

export interface UserProfile {
  id: string;
  phone: string;
  name: string | null;
  preferredLanguage: PreferredLanguage;
  createdAt: string;
}

export interface UpdateProfileDto {
  name?: string;
  preferredLanguage?: PreferredLanguage;
}
