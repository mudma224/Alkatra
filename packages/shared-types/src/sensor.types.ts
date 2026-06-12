export const SENSOR_SCHEMA_VERSION = 'sensor-ai-v2';

export interface RawSensorPayload {
  ts: number;
  device_id: string;
  farm_id: string;
  parcel_id: string;
  temperature_min_c: number;
  temperature_max_c: number;
  wind_speed_ms: number;
  solar_radiation_mj_m2_day: number;
  soil_humidity_pct: number;
  air_humidity_pct: number;
  rain_mm_day: number;
}

export interface KafkaSensorReading extends RawSensorPayload {
  schema_version: typeof SENSOR_SCHEMA_VERSION;
  received_at: string;
  is_anomaly: boolean;
  anomaly_reasons: string[];
}

export interface ProcessedSensorData extends KafkaSensorReading {
  eto_mm_day?: number;
  kc_coefficient?: number;
  etc_mm_day?: number;
  water_deficit_mm?: number;
  enriched_at?: string;
  enrichment_version?: string;
}

export interface SensorAnomaly {
  device_id: string;
  parcel_id: string;
  anomaly_type: 'OUT_OF_RANGE' | 'MISSING_DATA' | 'INCONSISTENT_TEMPERATURE' | 'OFFLINE';
  field?: keyof RawSensorPayload;
  value?: number;
  threshold?: number;
  detected_at: string;
}

export const MQTT_TOPIC_PATTERN =
  'alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data';
