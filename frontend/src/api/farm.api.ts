import { httpClient } from './client';
import type { Farm, CreateFarmPayload, UpdateFarmPayload } from '../types/farm.types';

/**
 * Couche API du domaine Farm — contrat aligné sur le code du farm-service
 * (apps/farm-service/src/modules/farms/farms.controller.ts), appelé via
 * l'API Gateway (baseURL httpClient = /api/v1).
 *
 *   GET    /farms        → Farm[]  (isolation par ownerId via JWT)
 *   POST   /farms        → Farm    (404 si l'utilisateur n'existe pas côté auth-service)
 *   GET    /farms/:id    → Farm    (404 introuvable, 403 si non propriétaire)
 *   PATCH  /farms/:id    → Farm
 *   DELETE /farms/:id    → void    (409 si la ferme possède des parcelles)
 */
export const farmApi = {
  list: async (): Promise<Farm[]> => {
    const { data } = await httpClient.get<Farm[]>('/farms');
    return data;
  },

  get: async (farmId: string): Promise<Farm> => {
    const { data } = await httpClient.get<Farm>(`/farms/${farmId}`);
    return data;
  },

  create: async (payload: CreateFarmPayload): Promise<Farm> => {
    const { data } = await httpClient.post<Farm>('/farms', payload);
    return data;
  },

  update: async (farmId: string, payload: UpdateFarmPayload): Promise<Farm> => {
    const { data } = await httpClient.patch<Farm>(`/farms/${farmId}`, payload);
    return data;
  },

  remove: async (farmId: string): Promise<void> => {
    await httpClient.delete(`/farms/${farmId}`);
  },
};
