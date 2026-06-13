/**
 * Al Katra Bel Qatra — ET0 Collection
 * Stockage des évapotranspirations calculées par parcelle
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type Et0Document = Et0 & Document;

@Schema({
  collection: 'et0',
  timestamps: false,
  versionKey: false,
})
export class Et0 {
  @Prop({ required: true, index: true })
  farm_id: string;

  @Prop({ required: true, index: true })
  parcel_id: string;

  @Prop({ required: true, index: true })
  ts: number; // epoch time

  // =========================
  // ET0 VALUE
  // =========================
  @Prop({ required: true })
  et0_mm_day: number;

  // =========================
  // INPUTS USED (traceabilité)
  // =========================

  @Prop()
  temperature_avg_c: number;

  @Prop()
  humidity_pct: number;

  @Prop()
  wind_speed_ms: number;

  @Prop()
  solar_radiation_mj_m2_day: number;

  @Prop({ type: Date, default: Date.now, index: true })
  calculated_at: Date;
}

export const Et0Schema = SchemaFactory.createForClass(Et0);

// Index important (query dashboard)
Et0Schema.index({
  farm_id: 1,
  parcel_id: 1,
  ts: -1,
});

// TTL optionnel (si tu veux historiser court terme)
Et0Schema.index(
  { calculated_at: 1 },
  { expireAfterSeconds: 7776000 } // 90 jours comme sensor data
);