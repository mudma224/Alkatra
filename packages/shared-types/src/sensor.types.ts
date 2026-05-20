/**
 * Al Katra Bel Qatra — Types capteurs IoT
 * Format MQTT décrit dans CdC Section 6.2.2
 */

export interface RawSensorPayload {
  ts: number;              // Unix timestamp
  device_id: string;       // "esp32-001"
  farm_id: string;         // UUID ferme
  parcel_id: string;       // UUID parcelle
  soil_moisture_1: number; // Humidité sol couche 1 (0-100%)
  soil_moisture_2: number; // Humidité sol couche 2 (0-100%)
  soil_temp: number;       // Température sol (°C)
  air_temp: number;        // Température air (°C)
  air_humidity: number;    // Humidité air (%)
  rain_mm: number;         // Précipitations (mm)
  ec: number;              // Conductivité électrique (dS/m)
  battery_pct: number;     // Niveau batterie (0-100%)
}

export interface ProcessedSensorData extends RawSensorPayload {
  received_at: string;         // ISO datetime — quand iot-service a reçu
  is_anomaly: boolean;         // Détection anomalie basique
  // Features ajoutées par Spark (S3)
  eto_mm_day?: number;         // Evapotranspiration de référence (mm/jour)
  kc_coefficient?: number;     // Coefficient cultural
  etc_mm_day?: number;         // ETc = ETo × Kc
  rain_cumul_1j?: number;      // Cumul pluie 1 jour
  rain_cumul_2j?: number;      // Cumul pluie 2 jours
  rain_cumul_3j?: number;      // Cumul pluie 3 jours
  enriched_at?: string;        // Quand Spark a enrichi
  enrichment_version?: string; // Version de l'algo d'enrichissement
}

export interface SensorAnomaly {
  device_id: string;
  parcel_id: string;
  anomaly_type: 'OUT_OF_RANGE' | 'MISSING_DATA' | 'BATTERY_LOW' | 'OFFLINE';
  field?: string;
  value?: number;
  threshold?: number;
  detected_at: string;
}

export const MQTT_TOPIC_PATTERN = 'alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{sensor_id}/data';