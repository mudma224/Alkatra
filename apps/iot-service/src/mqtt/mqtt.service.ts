/**
 * Al Katra Bel Qatra - MQTT Subscriber Service
 * Ecoute les capteurs ESP32, valide le contrat IA, puis envoie vers Kafka.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { KafkaService } from '../kafka/kafka.service';

const MQTT_TOPIC = 'alkatra/farm/+/parcel/+/sensor/+/data';
const KAFKA_RAW_TOPIC = 'raw-sensor-data';

const SENSOR_SCHEMA_VERSION = 'sensor-ai-v1';
const REQUIRED_AI_FIELDS = [
  'temperature_min_c',
  'temperature_max_c',
  'wind_speed_ms',
  'solar_radiation_mj_m2_day',
  'soil_humidity_pct',
  'air_humidity_pct',
] as const;

const FIELD_ALIASES: Record<(typeof REQUIRED_AI_FIELDS)[number], string[]> = {
  temperature_min_c: ['temperature_min_c', 'temp_min_c', 'min_temperature_c'],
  temperature_max_c: ['temperature_max_c', 'temp_max_c', 'max_temperature_c'],
  wind_speed_ms: ['wind_speed_ms', 'wind_speed_mps', 'wind_m_s'],
  solar_radiation_mj_m2_day: [
    'solar_radiation_mj_m2_day',
    'solar_radiation',
    'solar_mj_m2_day',
  ],
  soil_humidity_pct: ['soil_humidity_pct', 'soil_moisture_pct', 'soil_moisture_1'],
  air_humidity_pct: ['air_humidity_pct', 'air_humidity'],
};

const ANOMALY_THRESHOLDS = {
  temperature_min_c_min: -10,
  temperature_max_c_max: 60,
  wind_speed_ms_min: 0,
  wind_speed_ms_max: 45,
  solar_radiation_mj_m2_day_min: 0,
  solar_radiation_mj_m2_day_max: 40,
  humidity_pct_min: 0,
  humidity_pct_max: 100,
};

type AiFieldName = (typeof REQUIRED_AI_FIELDS)[number];

type AiSensorFeatures = Record<AiFieldName, number>;

export interface SensorReading extends AiSensorFeatures {
  schema_version: typeof SENSOR_SCHEMA_VERSION;
  ts: number;
  device_id: string;
  farm_id: string;
  parcel_id: string;
  received_at: string;
  is_anomaly: boolean;
  anomaly_reasons: string[];
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private messagesReceived = 0;
  private messagesForwarded = 0;
  private anomaliesDetected = 0;
  private lastReading: SensorReading | null = null;
  private lastMessageReceivedAt: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    const brokerUrl = this.configService.get<string>('MQTT_BROKER_URL') || 'mqtt://localhost:1883';
    const username = this.configService.get<string>('MQTT_USERNAME') || undefined;
    const password = this.configService.get<string>('MQTT_PASSWORD') || undefined;

    this.logger.log(`Connexion MQTT -> ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId: `alkatra-iot-service-${Date.now()}`,
      username,
      password,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true,
    });

    this.setupEventHandlers();
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.logger.log('Client MQTT ferme');
    }
  }

  private setupEventHandlers() {
    this.client.on('connect', () => {
      this.logger.log('MQTT connecte a Mosquitto');
      this.client.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`Erreur subscription MQTT: ${err.message}`);
        } else {
          this.logger.log(`Abonne au topic: ${MQTT_TOPIC}`);
        }
      });
    });

    this.client.on('message', async (topic: string, payload: Buffer) => {
      await this.handleMessage(topic, payload);
    });

    this.client.on('error', (err) => {
      this.logger.error(`Erreur MQTT: ${err.message}`);
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT hors ligne - tentative reconnexion...');
    });

    this.client.on('reconnect', () => {
      this.logger.log('MQTT reconnexion en cours...');
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    this.messagesReceived++;

    let rawData: Record<string, unknown>;

    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      this.logger.warn(`Message JSON invalide sur topic ${topic}: ${payload.toString().substring(0, 100)}`);
      return;
    }

    const enrichedReading = this.buildSensorReading(topic, rawData);
    if (!enrichedReading) {
      this.logger.warn(`Payload invalide sur ${topic}: les 6 variables IA sont obligatoires`);
      return;
    }

    const { isAnomaly, anomalyReasons } = this.detectAnomalies(enrichedReading);
    enrichedReading.is_anomaly = isAnomaly;
    enrichedReading.anomaly_reasons = anomalyReasons;
    this.lastReading = enrichedReading;
    this.lastMessageReceivedAt = enrichedReading.received_at;

    if (isAnomaly) {
      this.anomaliesDetected++;
      this.logger.warn(`Anomalie detectee [${enrichedReading.device_id}]: ${anomalyReasons.join(', ')}`);
    }

    await this.kafkaService.send(
      KAFKA_RAW_TOPIC,
      `${enrichedReading.farm_id}:${enrichedReading.parcel_id}`,
      enrichedReading,
    );

    this.messagesForwarded++;

    if (this.messagesReceived % 10 === 0) {
      this.logger.log(
        `Stats: ${this.messagesReceived} recus | ${this.messagesForwarded} Kafka | ${this.anomaliesDetected} anomalies`,
      );
    }
  }

  private buildSensorReading(topic: string, data: Record<string, unknown>): SensorReading | null {
    const features = this.extractAiFeatures(data);
    if (!features) {
      return null;
    }

    const topicParts = topic.split('/');
    const farmId = this.stringValue(topicParts[2] ?? data.farm_id, 'unknown');
    const parcelId = this.stringValue(topicParts[4] ?? data.parcel_id, 'unknown');
    const deviceId = this.stringValue(topicParts[6] ?? data.device_id, 'unknown');

    return {
      schema_version: SENSOR_SCHEMA_VERSION,
      ts: this.numberValue(data.ts, Math.floor(Date.now() / 1000)),
      device_id: deviceId,
      farm_id: farmId,
      parcel_id: parcelId,
      ...features,
      received_at: new Date().toISOString(),
      is_anomaly: false,
      anomaly_reasons: [],
    };
  }

  private isValidPayload(data: Record<string, unknown>): boolean {
    return this.extractAiFeatures(data) !== null;
  }

  private extractAiFeatures(data: Record<string, unknown>): AiSensorFeatures | null {
    const values = {} as AiSensorFeatures;

    for (const field of REQUIRED_AI_FIELDS) {
      const value = this.pickNumericValue(data, FIELD_ALIASES[field]);
      if (value === null) {
        return null;
      }
      values[field] = value;
    }

    return values;
  }

  private pickNumericValue(data: Record<string, unknown>, aliases: string[]): number | null {
    for (const alias of aliases) {
      if (data[alias] !== undefined && data[alias] !== null && data[alias] !== '') {
        const value = Number(data[alias]);
        return Number.isFinite(value) ? value : null;
      }
    }

    return null;
  }

  private numberValue(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private stringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  private detectAnomalies(data: Partial<SensorReading> | Record<string, unknown>): {
    isAnomaly: boolean;
    anomalyReasons: string[];
  } {
    const features = this.extractAiFeatures(data);
    const reasons: string[] = [];

    if (!features) {
      return {
        isAnomaly: true,
        anomalyReasons: ['payload invalide: variables IA manquantes ou non numeriques'],
      };
    }

    if (features.temperature_min_c < ANOMALY_THRESHOLDS.temperature_min_c_min) {
      reasons.push(`temperature_min_c aberrante: ${features.temperature_min_c}C`);
    }

    if (features.temperature_max_c > ANOMALY_THRESHOLDS.temperature_max_c_max) {
      reasons.push(`temperature_max_c aberrante: ${features.temperature_max_c}C`);
    }

    if (features.temperature_min_c > features.temperature_max_c) {
      reasons.push(
        `temperature_min_c superieure a temperature_max_c: ${features.temperature_min_c}C > ${features.temperature_max_c}C`,
      );
    }

    if (
      features.wind_speed_ms < ANOMALY_THRESHOLDS.wind_speed_ms_min ||
      features.wind_speed_ms > ANOMALY_THRESHOLDS.wind_speed_ms_max
    ) {
      reasons.push(`wind_speed_ms hors limites: ${features.wind_speed_ms} m/s`);
    }

    if (
      features.solar_radiation_mj_m2_day < ANOMALY_THRESHOLDS.solar_radiation_mj_m2_day_min ||
      features.solar_radiation_mj_m2_day > ANOMALY_THRESHOLDS.solar_radiation_mj_m2_day_max
    ) {
      reasons.push(`solar_radiation_mj_m2_day hors limites: ${features.solar_radiation_mj_m2_day}`);
    }

    for (const field of ['soil_humidity_pct', 'air_humidity_pct'] as const) {
      if (
        features[field] < ANOMALY_THRESHOLDS.humidity_pct_min ||
        features[field] > ANOMALY_THRESHOLDS.humidity_pct_max
      ) {
        reasons.push(`${field} hors limites: ${features[field]}%`);
      }
    }

    return { isAnomaly: reasons.length > 0, anomalyReasons: reasons };
  }

  getStats() {
    return {
      messagesReceived: this.messagesReceived,
      messagesForwarded: this.messagesForwarded,
      anomaliesDetected: this.anomaliesDetected,
      mqttConnected: this.client?.connected ?? false,
      lastMessageReceivedAt: this.lastMessageReceivedAt,
      lastReading: this.lastReading,
    };
  }
}
