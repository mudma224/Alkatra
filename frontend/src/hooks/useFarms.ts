import { useCallback, useEffect, useState } from 'react';
import { farmApi } from '../api/farm.api';
import { getApiErrorMessage } from '../utils/apiError';
import type { CreateFarmPayload, Farm, UpdateFarmPayload } from '../types/farm.types';

/** Statut de chargement partagé par les hooks de lecture. */
type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Charge la liste des fermes de l'utilisateur connecté (GET /farms).
 * `refetch` relance le chargement (bouton « Réessayer » de l'état erreur).
 */
export function useFarms() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setStatus('loading');

    farmApi
      .list()
      .then((data) => {
        if (!cancelled) {
          setFarms(data);
          setStatus('success');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('farmApi.list failed', error);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { farms, status, refetch };
}

/**
 * Charge une ferme par son identifiant (GET /farms/:id).
 * `farmId` vient du paramètre de route ; undefined pendant le rendu initial.
 */
export function useFarm(farmId: string | undefined) {
  const [farm, setFarm] = useState<Farm | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!farmId) {
      setStatus('error');
      return;
    }

    let cancelled = false;

    setStatus('loading');

    farmApi
      .get(farmId)
      .then((data) => {
        if (!cancelled) {
          setFarm(data);
          setStatus('success');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('farmApi.get failed', error);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [farmId, reloadCount]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  return { farm, status, refetch };
}

/**
 * Création d'une ferme (POST /farms).
 * Retourne true en cas de succès ; l'écran affiche un message générique sinon.
 */
export function useCreateFarm() {
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(async (payload: CreateFarmPayload): Promise<boolean> => {
    setIsCreating(true);

    try {
      await farmApi.create(payload);
      return true;
    } catch (error) {
      console.error('farmApi.create failed', error);
      return false;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { create, isCreating };
}

/**
 * Mise à jour d'une ferme (PATCH /farms/:id — UpdateFarmDto).
 * Retourne true en cas de succès ; l'écran affiche un message générique sinon.
 */
export function useUpdateFarm() {
  const [isUpdating, setIsUpdating] = useState(false);

  const update = useCallback(
    async (farmId: string, payload: UpdateFarmPayload): Promise<boolean> => {
      setIsUpdating(true);

      try {
        await farmApi.update(farmId, payload);
        return true;
      } catch (error) {
        console.error('farmApi.update failed', error);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  return { update, isUpdating };
}

/**
 * Suppression d'une ferme (DELETE /farms/:id).
 * Expose le message du backend (ex. 409 « la ferme possède N parcelle(s) »)
 * pour affichage dans la modale de confirmation.
 */
export function useDeleteFarm() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (farmId: string): Promise<boolean> => {
    setIsDeleting(true);
    setError(null);

    try {
      await farmApi.remove(farmId);
      return true;
    } catch (caught) {
      console.error('farmApi.remove failed', caught);
      setError(
        getApiErrorMessage(caught, 'Impossible de supprimer la ferme. Réessayez.'),
      );
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { remove, isDeleting, error, clearError };
}
