import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AiSensorFeature,
  AiSensorFeatureDocument,
} from '../schemas/ai-sensor-feature.schema';
/*import { RawSensorPayload } from '@alkatra/shared-types';*/

@Injectable()
export class AiSensorFeatureRepository {
  private readonly logger = new Logger(AiSensorFeatureRepository.name);

  constructor(
    @InjectModel(AiSensorFeature.name)
    private readonly model: Model<AiSensorFeatureDocument>,
  ) {}

  async saveFeature(payload: any): Promise<void> {
    const doc = new this.model({
      device_id: payload.device_id,
      farm_id: payload.farm_id,
      parcel_id: payload.parcel_id,
      ts: payload.ts,

      temperature_min_c: payload.temperature_min_c,
      temperature_max_c: payload.temperature_max_c,
      wind_speed_ms: payload.wind_speed_ms,
      solar_radiation_mj_m2_day: payload.solar_radiation_mj_m2_day,
      soil_humidity_pct: payload.soil_humidity_pct,
      air_humidity_pct: payload.air_humidity_pct,
      rain_mm_day: payload.rain_mm_day,

      is_anomaly: payload.is_anomaly,
      anomaly_reasons: payload.anomaly_reasons,

      schema_version: payload.schema_version,
      received_at: new Date(payload.received_at),
    });

    await doc.save();

    this.logger.debug(
      `Saved AI feature for device ${payload.device_id}`,
    );
  }

  async getLatestByParcel(parcelId: string, limit = 48) {
    return this.model
      .find({ parcel_id: parcelId })
      .sort({ ts: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async getLastByDevice(deviceId: string) {
    return this.model
      .findOne({ device_id: deviceId })
      .sort({ ts: -1 })
      .lean()
      .exec();
  }
}