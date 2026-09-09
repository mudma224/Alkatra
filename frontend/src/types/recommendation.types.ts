/**
 * Frontend contracts for recommendation-service.
 *
 * The names and nullable fields mirror RecommendationResponseDto exactly.
 * Dates are strings here because JSON serializes backend Date values as ISO strings.
 */

export type RecommendationStatus =
  | 'pending'
  | 'seen'
  | 'accepted'
  | 'rejected'
  | 'executed'
  | 'expired';

export type RecommendationFeedback = 'accepted' | 'rejected' | 'ignored';

export interface RecommendationFactor {
  feature: string;
  label_fr: string;
  label_ar: string;
  contribution: number;
}

export interface RecommendationExplanation {
  fr: string;
  darija: string;
}

export interface Recommendation {
  id: string;
  parcelId: string;
  generatedAt: string;
  irrigate: boolean;
  confidenceScore: number | null;
  quantityMm: number | null;
  durationMinutes: number | null;
  reasonCode: string | null;
  topFactors: RecommendationFactor[];
  explanation: RecommendationExplanation;
  modelVersion: string | null;
  status: RecommendationStatus;
  userFeedback: RecommendationFeedback | null;
  demoMode: boolean;
}

export interface RecommendationHistoryResponse {
  total: number;
  items: Recommendation[];
}

export interface SubmitRecommendationFeedbackPayload {
  feedback: RecommendationFeedback;
}
