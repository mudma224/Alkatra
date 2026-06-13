/**
 * Al Katra Bel Qatra — AI Sensor Features Schema
 * Sprint 3 — Feature Engineering Layer (Kafka → MongoDB)
 * Stocke données enrichies + anomalies détectées
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiSensorFeatureDocument = AiSensorFeature & Document;

@Schema({
  collection: 'ai_sensor_features',
  timestamps: false,
  versionKey: false,
})
export class AiSensorFeature {
  // =========================
  // IDENTIFIERS (IoT context)
  // =========================

  @Prop({ required: true, index: true })
  device_id: string;

  @Prop({ required: true, index: true })
  farm_id: string;

  @Prop({ required: true, index: true })
  parcel_id: string;

  @Prop({ required: true, index: true })
  ts: number; // epoch time from MQTT

  // =========================
  // AI FEATURES (engineered)
  // =========================

  @Prop({ required: true })
  temperature_min_c: number;

  @Prop({ required: true })
  temperature_max_c: number;

  @Prop({ required: true })
  wind_speed_ms: number;

  @Prop({ required: true })
  solar_radiation_mj_m2_day: number;

  @Prop({ required: true })
  soil_humidity_pct: number;

  @Prop({ required: true })
  air_humidity_pct: number;

  @Prop({ required: true })
  rain_mm_day: number;

  // =========================
  // ANOMALY DETECTION
  // =========================

  @Prop({ default: false, index: true })
  is_anomaly: boolean;

  @Prop({ type: [String], default: [] })
  anomaly_reasons: string[];

  // =========================
  // METADATA
  // =========================

  @Prop({ required: true })
  schema_version: string;

  @Prop({ type: Date, default: Date.now})
  received_at: Date;
}

export const AiSensorFeatureSchema =
  SchemaFactory.createForClass(AiSensorFeature);

// =========================
// INDEXES (performance)
// =========================

// Query dashboard farm + parcel sorted by time
AiSensorFeatureSchema.index({
  farm_id: 1,
  parcel_id: 1,
  ts: -1,
});

// Device monitoring
AiSensorFeatureSchema.index({
  device_id: 1,
  ts: -1,
});

// TTL (90 jours retention)
AiSensorFeatureSchema.index(
  { received_at: 1 },
  { expireAfterSeconds: 7776000 }, // 90 days
);

// Anomaly monitoring
AiSensorFeatureSchema.index({
  is_anomaly: 1,
  ts: -1,
});