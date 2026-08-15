import {httpClient} from './client'
import type {AuthUser} from '../types/auth.types'
import type { UpdateProfilePayload } from '../types/user.types';


export const userApi={
    /**
   * Calls the real user-service endpoint: GET /api/v1/user/profile.
   * Requests to get the user's profile`.
   */

   getProfile: async (): Promise <AuthUser> => {
     const {data} = await httpClient.get('/user/profile');
     return data;
   },

   /**
   * Calls the real user-service endpoint: POST /api/v1/user/profile.
   * Requests to update the user's profile`.
   */

   updateProfile: async (payload:UpdateProfilePayload): Promise <AuthUser> => {
     const {data} = await httpClient.post('user/profile', payload);
     return data;
   }
}