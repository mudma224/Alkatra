import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * Champs consommés du topic `recommendations-generated` (produit par
 * ml-inference-service) — uniquement ceux requis par la règle hydric-stress.
 * Les autres champs du message (top_factors, model_version…) sont ignorés.
 */
export class RecommendationEventDto {
  @IsUUID()
  parcel_id: string;

  @IsBoolean()
  should_irrigate: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  irrigation_probability: number;

  @IsOptional()
  @IsNumber()
  soil_humidity_pct?: number;
}
