import { IsOptional, IsInt, IsString, MaxLength, Min, Max } from 'class-validator';

/**
 * Heartbeat capteur — appelé par l'iot-service (endpoint interne
 * PATCH /internal/sensors/:deviceId/seen) à chaque message raw-sensor-data.
 * Tous les champs sont optionnels : seul le last_seen_at est toujours mis à jour.
 */
export class SensorHeartbeatDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  firmwareVersion?: string;
}
