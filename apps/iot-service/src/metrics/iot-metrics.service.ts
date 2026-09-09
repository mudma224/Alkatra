import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as promClient from 'prom-client';
import { MetricsRegistryService } from '@alkatra/observability';
import { SensorReading } from '../mqtt/mqtt.service';

/** Nombre maximal de capteurs suivis (bornage de la cardinalité des labels). */
const MAX_TRACKED_DEVICES = 200;

/**
 * Fenêtre de fraîcheur (2 h) — même seuil que la machine à états
 * SensorActivityService de farm-service (SENSOR_INACTIVE_HOURS).
 */
const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Métriques iot-service sur le registre partagé (`@alkatra/observability`).
 *
 * Noms conservés à l'identique de l'ancienne exposition texte :
 * `alkatra_iot_messages_received_total`, `alkatra_iot_messages_forwarded_total`,
 * `alkatra_iot_anomalies_detected_total`, `alkatra_iot_mqtt_connected`,
 * `alkatra_iot_kafka_ready`, `alkatra_iot_last_sensor_value`,
 * `alkatra_iot_last_message_timestamp_seconds`.
 *
 * Ajouts : `alkatra_iot_messages_invalid_total` (rejets de validation) et
 * `alkatra_iot_active_sensors` (capteurs ayant émis dans les 2 dernières
 * heures). L'exposition est désormais multi-capteurs (Map device → dernière
 * lecture, bornée à 200 entrées) au lieu de la seule dernière lecture globale.
 */
@Injectable()
export class IotMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IotMetricsService.name);

  private readonly messagesReceived!: promClient.Counter<string>;
  private readonly messagesForwarded!: promClient.Counter<string>;
  private readonly anomaliesDetected!: promClient.Counter<string>;
  private readonly messagesInvalid!: promClient.Counter<string>;
  private readonly mqttConnected!: promClient.Gauge<string>;
  private readonly kafkaReady!: promClient.Gauge<string>;
  private readonly lastSensorValue!: promClient.Gauge<string>;
  private readonly lastMessageTimestamp!: promClient.Gauge<string>;
  private readonly activeSensors!: promClient.Gauge<string>;

  /** Dernière lecture valide par capteur (ordre d'insertion = LRU simple). */
  private readonly readings = new Map<string, SensorReading>();

  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly metricsRegistry: MetricsRegistryService) {
    const register = this.metricsRegistry.registry;

    this.messagesReceived = new promClient.Counter({
      name: 'alkatra_iot_messages_received_total',
      help: 'Total MQTT messages received by iot-service.',
      registers: [register],
    });

    this.messagesForwarded = new promClient.Counter({
      name: 'alkatra_iot_messages_forwarded_total',
      help: 'Total sensor messages forwarded to Kafka.',
      registers: [register],
    });

    this.anomaliesDetected = new promClient.Counter({
      name: 'alkatra_iot_anomalies_detected_total',
      help: 'Total sensor anomalies detected.',
      registers: [register],
    });

    this.messagesInvalid = new promClient.Counter({
      name: 'alkatra_iot_messages_invalid_total',
      help: 'Total MQTT messages rejected (invalid JSON or missing AI variables).',
      registers: [register],
    });

    this.mqttConnected = new promClient.Gauge({
      name: 'alkatra_iot_mqtt_connected',
      help: 'MQTT connection status, 1 connected and 0 disconnected.',
      registers: [register],
    });

    this.kafkaReady = new promClient.Gauge({
      name: 'alkatra_iot_kafka_ready',
      help: 'Kafka producer status, 1 ready and 0 not ready.',
      registers: [register],
    });

    this.lastSensorValue = new promClient.Gauge({
      name: 'alkatra_iot_last_sensor_value',
      help: 'Latest received sensor values by field.',
      labelNames: ['farm_id', 'parcel_id', 'device_id', 'field'],
      registers: [register],
    });

    this.lastMessageTimestamp = new promClient.Gauge({
      name: 'alkatra_iot_last_message_timestamp_seconds',
      help: 'Timestamp of the latest valid sensor message.',
      labelNames: ['farm_id', 'parcel_id', 'device_id'],
      registers: [register],
    });

    this.activeSensors = new promClient.Gauge({
      name: 'alkatra_iot_active_sensors',
      help: 'Sensors that emitted at least one valid message in the last 2 hours.',
      registers: [register],
    });
  }

  onModuleInit(): void {
    this.refreshTimer = setInterval(
      () => this.refreshActiveSensors(),
      REFRESH_INTERVAL_MS,
    );
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  /** Un message MQTT a été reçu (avant validation). */
  recordMessageReceived(): void {
    this.messagesReceived.inc();
  }

  /** Un message valide a été publié sur Kafka. */
  recordMessageForwarded(): void {
    this.messagesForwarded.inc();
  }

  /** Une anomalie a été détectée sur une lecture valide. */
  recordAnomaly(): void {
    this.anomaliesDetected.inc();
  }

  /** Un message a été rejeté (JSON invalide ou variables IA manquantes). */
  recordMessageInvalid(): void {
    this.messagesInvalid.inc();
  }

  /** État de la connexion MQTT. */
  setMqttConnected(connected: boolean): void {
    this.mqttConnected.set(connected ? 1 : 0);
  }

  /** État du producer Kafka. */
  setKafkaReady(ready: boolean): void {
    this.kafkaReady.set(ready ? 1 : 0);
  }

  /** Enregistre la dernière lecture valide d'un capteur (toutes séries). */
  recordValidReading(reading: SensorReading): void {
    const key = `${reading.farm_id}|${reading.parcel_id}|${reading.device_id}`;
    if (this.readings.has(key)) {
      this.readings.delete(key);
    }
    this.readings.set(key, reading);

    while (this.readings.size > MAX_TRACKED_DEVICES) {
      const oldest = this.readings.keys().next().value;
      if (oldest === undefined) break;
      const stale = this.readings.get(oldest);
      this.readings.delete(oldest);
      if (stale) {
        this.clearDeviceSeries(stale);
      }
    }

    const labels = {
      farm_id: reading.farm_id,
      parcel_id: reading.parcel_id,
      device_id: reading.device_id,
    };

    for (const field of [
      'temperature_min_c',
      'temperature_max_c',
      'wind_speed_ms',
      'solar_radiation_mj_m2_day',
      'soil_humidity_pct',
      'air_humidity_pct',
      'rain_mm_day',
    ] as const) {
      this.lastSensorValue.set({ ...labels, field }, reading[field]);
    }

    this.lastMessageTimestamp.set(
      labels,
      Math.floor(Date.parse(reading.received_at) / 1000),
    );

    this.refreshActiveSensors();
  }

  /** Recalcule la gauge des capteurs actifs (fenêtre 2 h, décroissance incluse). */
  private refreshActiveSensors(): void {
    const threshold = Date.now() - ACTIVE_WINDOW_MS;
    let active = 0;
    for (const reading of this.readings.values()) {
      if (Date.parse(reading.received_at) >= threshold) {
        active++;
      }
    }
    this.activeSensors.set(active);
  }

  private clearDeviceSeries(reading: SensorReading): void {
    const labels = {
      farm_id: reading.farm_id,
      parcel_id: reading.parcel_id,
      device_id: reading.device_id,
    };
    this.lastMessageTimestamp.remove(labels);
    for (const field of [
      'temperature_min_c',
      'temperature_max_c',
      'wind_speed_ms',
      'solar_radiation_mj_m2_day',
      'soil_humidity_pct',
      'air_humidity_pct',
      'rain_mm_day',
    ] as const) {
      this.lastSensorValue.remove({ ...labels, field });
    }
  }
}
