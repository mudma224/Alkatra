import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

import { Alert } from '../database/entities/alert.entity';
import { MetricsService } from '../metrics/metrics.service';
import type { ChannelSendResult } from './notification-channel.interface';

export interface DistributionStatus {
  fcm: ChannelSendResult;
}

/**
 * Publie chaque alerte distribuée sur le topic Kafka `alerts-outbound`
 * (best-effort) : traçabilité du flux d'alertes et point d'entrée pour les
 * canaux futurs (passerelle SMS Phase 2). Aucun consommateur aujourd'hui —
 * une panne du producer n'impacte jamais la création d'alerte.
 */
@Injectable()
export class AlertsOutboundPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsOutboundPublisher.name);
  private producer: Producer | null = null;
  private connected = false;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.config.get<string[]>('app.kafka.brokers');
    const clientId = this.config.get<string>('app.kafka.clientId');
    const kafka = new Kafka({ clientId, brokers, retry: { retries: 8 } });
    this.producer = kafka.producer();

    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Producer alerts-outbound connecté');
    } catch (err) {
      // Non fatal : le service reste pleinement fonctionnel sans publication.
      this.connected = false;
      this.logger.warn(
        `Producer alerts-outbound non connecté : ${(err as Error).message}. Les alertes ne seront pas publiées (in-app inchangé).`,
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(alert: Alert, distribution: DistributionStatus): Promise<void> {
    if (!this.producer || !this.connected) return;

    const topic = this.config.get<string>('app.kafka.topicOutbound');
    const payload = {
      alert_id: alert.id,
      alert_type: alert.alertType,
      user_id: alert.userId,
      parcel_id: alert.parcelId,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      data: alert.data,
      created_at: alert.createdAt,
      distribution,
      published_at: new Date().toISOString(),
    };

    await this.producer.send({
      topic,
      messages: [{ key: alert.userId ?? alert.id, value: JSON.stringify(payload) }],
    });
    this.metrics.recordOutboundPublished();
    this.logger.debug(`Alerte publiée sur ${topic} — id=${alert.id}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected && this.producer) {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.log('Producer alerts-outbound déconnecté');
    }
  }
}
