/**
 * Couche API du domaine Parcel — contrat aligné sur le code du farm-service
 * (apps/farm-service/src/modules/parcels + sensors), via la gateway (8080) :
 *
 *   GET    /parcels/farm/:farmId  → Parcel[] (avec `sensors` depuis la Phase 4)
 *   POST   /parcels               → Parcel  (422 si dépassement de surface ferme)
 *   GET    /parcels/:id           → Parcel  (avec `farm` et `sensors`)
 *   PATCH  /parcels/:id           → Parcel
 *   DELETE /parcels/:id           → void
 *
 *   POST   /sensors/associate     → Sensor  (idempotent, 403 anti-vol)
 *   DELETE /sensors/:sensorId     → void    (dissociation, mesures conservées)
 *   GET    /sensors/parcel/:id    → Sensor[]
 */

import { httpClient } from './client';
import type {
  AssociateSensorPayload,
  CreateParcelPayload,
  Parcel,
  Sensor,
  UpdateParcelPayload,
} from '../types/parcel.types';

export const parcelApi = {
  listByFarm: async (farmId: string): Promise<Parcel[]> => {
    const { data } = await httpClient.get<Parcel[]>(`/parcels/farm/${farmId}`);
    return data;
  },

  get: async (parcelId: string): Promise<Parcel> => {
    const { data } = await httpClient.get<Parcel>(`/parcels/${parcelId}`);
    return data;
  },

  create: async (payload: CreateParcelPayload): Promise<Parcel> => {
    const { data } = await httpClient.post<Parcel>('/parcels', payload);
    return data;
  },

  update: async (parcelId: string, payload: UpdateParcelPayload): Promise<Parcel> => {
    const { data } = await httpClient.patch<Parcel>(`/parcels/${parcelId}`, payload);
    return data;
  },

  remove: async (parcelId: string): Promise<void> => {
    await httpClient.delete(`/parcels/${parcelId}`);
  },
};

export const sensorApi = {
  associate: async (payload: AssociateSensorPayload): Promise<Sensor> => {
    const { data } = await httpClient.post<Sensor>('/sensors/associate', payload);
    return data;
  },

  dissociate: async (sensorId: string): Promise<void> => {
    await httpClient.delete(`/sensors/${sensorId}`);
  },

  listByParcel: async (parcelId: string): Promise<Sensor[]> => {
    const { data } = await httpClient.get<Sensor[]>(`/sensors/parcel/${parcelId}`);
    return data;
  },
};
