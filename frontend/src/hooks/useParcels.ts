/**
 * Hooks du domaine Parcel — même approche maison que useFarms (pas de
 * react-query) : hooks de lecture avec `LoadStatus` + flag `cancelled`,
 * hooks de mutation retournant un booléen et exposant le message d'erreur
 * backend (AllExceptionsFilter) pour affichage dans les formulaires/modales.
 */

import { useCallback, useEffect, useState } from 'react';

import { parcelApi, sensorApi } from '../api/parcel.api';
import type {
  AssociateSensorPayload,
  CreateParcelPayload,
  Parcel,
  Sensor,
  UpdateParcelPayload,
} from '../types/parcel.types';
import { getApiErrorMessage } from '../utils/apiError';

type LoadStatus = 'loading' | 'success' | 'error';

/** Liste des parcelles d'une ferme (avec leur capteurs — extension Phase 4). */
export function useParcels(farmId: string | undefined) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!farmId) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    parcelApi
      .listByFarm(farmId)
      .then((data) => {
        if (!cancelled) {
          setParcels(data);
          setStatus('success');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('parcelApi.listByFarm failed', error);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [farmId, reloadCount]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { parcels, status, refetch };
}

/** Détail d'une parcelle (relations `farm` et `sensors` incluses). */
export function useParcel(parcelId: string | undefined) {
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!parcelId) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    parcelApi
      .get(parcelId)
      .then((data) => {
        if (!cancelled) {
          setParcel(data);
          setStatus('success');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('parcelApi.get failed', error);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parcelId, reloadCount]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { parcel, status, refetch };
}

/**
 * Création d'une parcelle. Le message d'erreur backend est conservé (422
 * dépassement de surface, 404 ferme introuvable) pour affichage sous le
 * bouton Enregistrer — maquette « ParcelCreate - Surface Error ».
 */
export function useCreateParcel() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const create = useCallback(async (payload: CreateParcelPayload): Promise<boolean> => {
    setIsCreating(true);
    setError(null);
    try {
      await parcelApi.create(payload);
      return true;
    } catch (caught) {
      console.error('parcelApi.create failed', caught);
      setError(getApiErrorMessage(caught, 'Impossible de créer la parcelle. Réessayez.'));
      return false;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { create, isCreating, error, clearError };
}

export function useUpdateParcel() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const update = useCallback(
    async (parcelId: string, payload: UpdateParcelPayload): Promise<boolean> => {
      setIsUpdating(true);
      setError(null);
      try {
        await parcelApi.update(parcelId, payload);
        return true;
      } catch (caught) {
        console.error('parcelApi.update failed', caught);
        setError(getApiErrorMessage(caught, 'Impossible de modifier la parcelle. Réessayez.'));
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  return { update, isUpdating, error, clearError };
}

export function useDeleteParcel() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const remove = useCallback(async (parcelId: string): Promise<boolean> => {
    setIsDeleting(true);
    setError(null);
    try {
      await parcelApi.remove(parcelId);
      return true;
    } catch (caught) {
      console.error('parcelApi.remove failed', caught);
      setError(getApiErrorMessage(caught, 'Impossible de supprimer la parcelle. Réessayez.'));
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return { remove, isDeleting, error, clearError };
}

/**
 * Association d'un capteur (POST /sensors/associate). Retourne le capteur
 * associé en cas de succès pour mise à jour locale, `null` en échec.
 */
export function useAssociateSensor() {
  const [isAssociating, setIsAssociating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const associate = useCallback(async (payload: AssociateSensorPayload): Promise<Sensor | null> => {
    setIsAssociating(true);
    setError(null);
    try {
      return await sensorApi.associate(payload);
    } catch (caught) {
      console.error('sensorApi.associate failed', caught);
      setError(getApiErrorMessage(caught, "Impossible d'associer le capteur. Réessayez."));
      return null;
    } finally {
      setIsAssociating(false);
    }
  }, []);

  return { associate, isAssociating, error, clearError };
}

/**
 * Dissociation (DELETE /sensors/:sensorId) — suppression de la ligne SQL
 * uniquement : les mesures MongoDB (clé device_id) sont conservées.
 */
export function useDissociateSensor() {
  const [isDissociating, setIsDissociating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const remove = useCallback(async (sensorId: string): Promise<boolean> => {
    setIsDissociating(true);
    setError(null);
    try {
      await sensorApi.dissociate(sensorId);
      return true;
    } catch (caught) {
      console.error('sensorApi.dissociate failed', caught);
      setError(getApiErrorMessage(caught, 'Impossible de dissocier le capteur. Réessayez.'));
      return false;
    } finally {
      setIsDissociating(false);
    }
  }, []);

  return { remove, isDissociating, error, clearError };
}
