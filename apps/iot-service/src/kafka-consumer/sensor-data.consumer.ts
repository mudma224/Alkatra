/**
 * Al Katra Bel Qatra — Kafka Consumer : raw-sensor-data → MongoDB
 * Sprint S3 — Dev1
 *
 * Ce consumer lit les messages du topic raw-sensor-data et les persiste
 * dans MongoDB. C'est different du bridge MQTT→Kafka (Dev2 S2) qui lui
 * produit vers Kafka.
 *
 * Architecture intentionnelle : on consomme depuis Kafka (pas directement
 * depuis MQTT) pour beneficier de la durabilite et du replay Kafka.
 */

import {
  Controller,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, EachMessagePayload } from 'kafkajs';

import { AiSensorFeatureRepository } from '../mongodb/repositories/ai-sensor-reading.repository';

@Controller()
export class SensorDataConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SensorDataConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly sensorReadingRepo: AiSensorFeatureRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.config
      .get<string>('KAFKA_BROKERS', 'kafka:9092')
      .split(',');

    this.kafka = new Kafka({
      clientId: 'iot-service-consumer',
      brokers,
      retry: {
        initialRetryTime: 3000,
        retries: 10,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: 'iot-service-mongodb-persister',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      await this.consumer.connect();

      await this.consumer.subscribe({
        topic: 'raw-sensor-data',
        fromBeginning: false,
      });

      this.isRunning = true;

      this.consume().catch((err) => {
        this.logger.error('Consumer loop error', err);
        this.isRunning = false;
      });

      this.logger.log(
        'Kafka consumer connected — listening on raw-sensor-data',
      );
    } catch (err) {
      this.logger.error('Failed to connect Kafka consumer', err);
      setTimeout(() => this.connect(), 10000);
    }
  }

  private async consume(): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({
        message,
        topic,
        partition,
      }: EachMessagePayload) => {
        if (!message.value) {
          this.logger.warn('Received empty message from Kafka');
          return;
        }

        try {
          const payload = JSON.parse(message.value.toString());

          // Validation minimale avant persistance
          if (
            !payload.device_id ||
            !payload.farm_id ||
            !payload.parcel_id
          ) {
            this.logger.warn(
              `Invalid payload — missing required fields: ${message.value.toString()}`,
            );
            return;
          }

          await this.sensorReadingRepo.saveFeature(payload);

          // Heartbeat vers farm-service (best-effort : ne jamais bloquer
          // l'ingestion si farm-service est indisponible).
          await this.notifySensorSeen(payload);
        } catch (err: unknown) {
            const error = err as Error;
            this.logger.error(
                `Failed to process message from ${topic}[${partition}]: ${error.message}`,
              error.stack,
            );
}
      },
    });
  }

  /**
   * Signale au farm-service que le capteur vient d'émettre (met à jour
   * last_seen_at / is_active / batterie). Appel interne PATCH
   * /internal/sensors/:deviceId/seen — non exposé par la gateway.
   */
  private async notifySensorSeen(payload: Record<string, unknown>): Promise<void> {
    const farmServiceUrl = this.config.get<string>(
      'FARM_SERVICE_URL',
      'http://farm-service:3003',
    );
    const internalToken = this.config.get<string>('INTERNAL_TOKEN');

    const body: { batteryPct?: number; firmwareVersion?: string } = {};
    if (typeof payload.battery_pct === 'number') {
      body.batteryPct = payload.battery_pct;
    }
    if (typeof payload.firmware_version === 'string') {
      body.firmwareVersion = payload.firmware_version;
    }

    try {
      const response = await fetch(
        `${farmServiceUrl}/internal/sensors/${encodeURIComponent(String(payload.device_id))}/seen`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(internalToken ? { 'X-Internal-Token': internalToken } : {}),
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok && response.status !== 404) {
        this.logger.warn(
          `Heartbeat refusé par farm-service (${response.status}) pour ${payload.device_id}`,
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.warn(`Heartbeat impossible vers farm-service : ${error.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isRunning = false;
    await this.consumer?.disconnect();
    this.logger.log('Kafka consumer disconnected');
  }
}