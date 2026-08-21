import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  type AlertSeverityValue,
  type AlertTypeValue,
} from '../../database/entities/alert.entity';

/**
 * Contrat de l'endpoint interne POST /internal/alerts — les services émetteurs
 * (ex: farm-service pour sensor_offline / low_battery) résolvent eux-mêmes le
 * destinataire (`userId`), propriétaire de la donnée d'ownership.
 */
export class DispatchAlertDto {
  @IsEnum(ALERT_TYPES)
  alertType: AlertTypeValue;

  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  parcelId?: string | null;

  @IsOptional()
  @IsEnum(ALERT_SEVERITIES)
  severity?: AlertSeverityValue;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsString()
  message: string;

  /** Contexte structuré libre (deviceId, seuils, mesures…). */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
