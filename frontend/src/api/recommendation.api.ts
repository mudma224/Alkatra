import { httpClient } from './client';
import type {
  Recommendation,
  RecommendationFeedback,
  RecommendationHistoryResponse,
  SubmitRecommendationFeedbackPayload,
} from '../types/recommendation.types';

/**
 * API layer aligned with RecommendationsController.
 *
 * The shared httpClient already supplies the `/api/v1` prefix and bearer token.
 */
export const recommendationApi = {
  /** GET /recommendations/parcel/:parcelId/today */
  getToday: async (parcelId: string): Promise<Recommendation> => {
    const { data } = await httpClient.get<Recommendation>(
      `/recommendations/parcel/${parcelId}/today`,
    );

    return data;
  },

  /** GET /recommendations/parcel/:parcelId/history?limit=&offset= */
  getHistory: async (
    parcelId: string,
    limit = 30,
    offset = 0,
  ): Promise<RecommendationHistoryResponse> => {
    const { data } = await httpClient.get<RecommendationHistoryResponse>(
      `/recommendations/parcel/${parcelId}/history`,
      { params: { limit, offset } },
    );

    return data;
  },

  /** PATCH /recommendations/:id/feedback */
  submitFeedback: async (
    recommendationId: string,
    feedback: RecommendationFeedback,
  ): Promise<Recommendation> => {
    const payload: SubmitRecommendationFeedbackPayload = { feedback };
    const { data } = await httpClient.patch<Recommendation>(
      `/recommendations/${recommendationId}/feedback`,
      payload,
    );

    return data;
  },
};
