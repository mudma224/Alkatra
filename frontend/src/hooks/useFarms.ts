import { useCallback, useEffect, useState } from 'react';

import { farmApi } from '../api/farm.api';
import type {
  CreateFarmPayload,
  Farm,
  UpdateFarmPayload,
} from '../types/farm.types';
import { getApiErrorMessage } from '../utils/apiError';

type LoadStatus = 'loading' | 'success' | 'error';

/** Loads the farms owned by the authenticated user. */
export function useFarms() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setStatus('loading');
    farmApi
      .list()
      .then((loadedFarms) => {
        if (!cancelled) {
          setFarms(loadedFarms);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      // Ignore a response that arrives after the consuming screen unmounts.
      cancelled = true;
    };
  }, [reloadCount]);

  const refetch = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return { farms, status, refetch };
}

/** Loads one farm when its route identifier is available. */
export function useFarm(farmId: string | undefined) {
  const [farm, setFarm] = useState<Farm | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!farmId) {
      setFarm(null);
      setStatus('error');
      return;
    }

    setStatus('loading');
    farmApi
      .get(farmId)
      .then((loadedFarm) => {
        if (!cancelled) {
          setFarm(loadedFarm);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFarm(null);
          setStatus('error');
        }
      });

    return () => {
      // Ignore a response that arrives after the consuming screen unmounts.
      cancelled = true;
    };
  }, [farmId, reloadCount]);

  const refetch = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return { farm, status, refetch };
}

/** Creates one farm and exposes the request state to the shared form. */
export function useCreateFarm() {
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (payload: CreateFarmPayload): Promise<boolean> => {
      setIsCreating(true);

      try {
        await farmApi.create(payload);
        return true;
      } catch {
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  return { create, isCreating };
}

/** Updates one farm without placing server data in the global auth store. */
export function useUpdateFarm() {
  const [isUpdating, setIsUpdating] = useState(false);

  const update = useCallback(
    async (
      farmId: string,
      payload: UpdateFarmPayload,
    ): Promise<boolean> => {
      setIsUpdating(true);

      try {
        await farmApi.update(farmId, payload);
        return true;
      } catch {
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  return { update, isUpdating };
}

/** Deletes one farm and preserves the backend conflict message for the dialog. */
export function useDeleteFarm() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const remove = useCallback(async (farmId: string): Promise<boolean> => {
    setIsDeleting(true);
    setError(null);

    try {
      await farmApi.remove(farmId);
      return true;
    } catch (caught) {
      setError(
        getApiErrorMessage(
          caught,
          'Impossible de supprimer la ferme. Réessayez.',
        ),
      );
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return { remove, isDeleting, error, clearError };
}