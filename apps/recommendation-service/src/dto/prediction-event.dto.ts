import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShapFactorDto {
  @IsString() feature: string;
  @IsString() label_fr: string;
  @IsString() label_ar: string;
  @IsNumber() contribution: number;
}

export class PredictionEventDto {
  @IsUUID()
  parcel_id: string;

  @IsBoolean()
  should_irrigate: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  irrigation_probability: number;

  @IsNumber()
  @Min(0)
  water_amount_mm: number;

  @IsOptional()
  @IsNumber()
  water_amount_raw_mm?: number;

  @IsOptional()
  @IsNumber()
  bias_applied_mm?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShapFactorDto)
  top_factors: ShapFactorDto[];

  @IsOptional()
  @IsString()
  model_version?: string;

  @IsOptional()
  @IsBoolean()
  demo_mode?: boolean;

  /** ISO string — si absent, on prend NOW() côté service */
  @IsOptional()
  @IsString()
  generated_at?: string;

  /** Durée d'irrigation en minutes (alimenté depuis le payload Kafka) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_minutes?: number;

  /** Humidité du sol au moment de la génération (alimenté depuis le payload Kafka) */
  @IsOptional()
  @IsNumber()
  soil_humidity_pct?: number;

  /** Évapotranspiration ETo au moment de la génération (alimenté depuis le payload Kafka) */
  @IsOptional()
  @IsNumber()
  eto?: number;
}