import { ShapFactor } from '../entities/recommendation.entity';

export class ExplanationDto {
  fr: string;
  darija: string;
}

export class RecommendationResponseDto {
  id: string;
  parcelId: string;
  generatedAt: Date;
  irrigate: boolean;
  confidenceScore: number | null;
  quantityMm: number | null;
  durationMinutes: number | null;
  reasonCode: string | null;
  topFactors: ShapFactor[];
  explanation: ExplanationDto;
  modelVersion: string | null;
  status: string;
  userFeedback: string | null;
  demoMode: boolean;
}