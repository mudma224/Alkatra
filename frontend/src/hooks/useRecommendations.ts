import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';

import { recommendationApi } from '../api/recommendation.api';
import type {
  Recommendation,
  RecommendationFeedback,
  RecommendationHistoryResponse,
} from '../types/recommendation.types';
import { getApiErrorMessage } from '../utils/apiError';

export type RecommendationLoadStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error';

/** Loads today's recommendation and treats the backend 404 as an empty state. */
export function useTodayRecommendation(
  parcelId: string | undefined,
  enabled = true,
) {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [status, setStatus] = useState<RecommendationLoadStatus>(
    enabled ? 'loading' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setStatus('idle');
      return () => {
        cancelled = true;
      };
    }

    if (!parcelId) {
      setError('Identifiant de parcelle manquant.');
      setStatus('error');
      return () => {
        cancelled = true;
      };
    }

    setRecommendation(null);
    setError(null);
    setStatus('loading');

    recommendationApi
      .getToday(parcelId)
      .then((result) => {
        if (!cancelled) {
          setRecommendation(result);
          setStatus('success');
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }

        // The controller deliberately returns 404 when no recommendation exists today.
        if (isAxiosError(caught) && caught.response?.status === 404) {
          setStatus('empty');
          return;
        }

        setError(
          getApiErrorMessage(
            caught,
            "Impossible de charger la recommandation aujourd'hui.",
          ),
        );
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, parcelId, reloadCount]);

  const refetch = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return { recommendation, status, error, refetch };
}

/** Loads the paginated history only when the history tab is active. */
export function useRecommendationHistory(
  parcelId: string | undefined,
  enabled: boolean,
  limit = 8,
) {
  const [history, setHistory] = useState<RecommendationHistoryResponse>({
    total: 0,
    items: [],
  });
  const [status, setStatus] = useState<RecommendationLoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      return () => {
        cancelled = true;
      };
    }

    if (!parcelId) {
      setError('Identifiant de parcelle manquant.');
      setStatus('error');
      return () => {
        cancelled = true;
      };
    }

    setError(null);
    setStatus('loading');

    recommendationApi
      .getHistory(parcelId, limit, 0)
      .then((result) => {
        if (!cancelled) {
          setHistory(result);
          setStatus(result.items.length > 0 ? 'success' : 'empty');
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              caught,
              "Impossible de charger l'historique des recommandations.",
            ),
          );
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, limit, parcelId, reloadCount]);

  const refetch = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return { history, status, error, refetch };
}

/** Submits one of the three feedback values accepted by FeedbackDto. */
export function useSubmitRecommendationFeedback() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const submit = useCallback(
    async (
      recommendationId: string,
      feedback: RecommendationFeedback,
    ): Promise<Recommendation | null> => {
      setIsSubmitting(true);
      setError(null);

      try {
        return await recommendationApi.submitFeedback(recommendationId, feedback);
      } catch (caught) {
        setError(
          getApiErrorMessage(
            caught,
            "Impossible d'envoyer votre avis. Réessayez.",
          ),
        );
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  return { submit, isSubmitting, error, clearError };
}
