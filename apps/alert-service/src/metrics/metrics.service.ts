import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as promClient from 'prom-client';
import {
  KafkaMetrics,
  MetricsRegistryService,
} from '@alkatra/observability';

/**
 * Métriques d'alert-service, migrées sur le registre partagé
 * (`@alkatra/observability`), en conservant à l'identique les noms historiques
 * des 12 métriques :
 *
 *  - `alert_kafka_messages_consumed_total{topic, status}` (label `topic`
 *    ajouté au standard)
 *  - `alert_kafka_consumer_connected`
 *  - `alert_kafka_dlq_total`
 *  - `alerts_outbound_published_total`
 *  - `alerts_created_total{type}`
 *  - `alerts_dedup_skipped_total{type}`
 *  - `alert_persistence_errors_total`
 *  - `alert_http_request_duration_ms_avg` (gauge historique — l'histogramme
 *    standard et le compteur `alert_http_requests_total` sont produits par
 *    l'intercepteur HTTP du package partagé)
 *  - `fcm_enabled`, `fcm_sent_total`, `fcm_failed_total`
 *
 * Les compteurs sont incrémentés par le `LoggingInterceptor` (latence HTTP),
 * le `RecommendationsConsumer` (Kafka/DLQ), l'`AlertDispatcher` (cycle de vie
 * des alertes) et le `FcmChannel` (push).
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private kafka!: KafkaMetrics;
  private httpDurationAvg!: promClient.Gauge<string>;
  private dlqSent!: promClient.Counter<string>;
  private outboundPublished!: promClient.Counter<string>;
  private alertsCreated!: promClient.Counter<string>;
  private dedupSkipped!: promClient.Counter<string>;
  private persistenceErrors!: promClient.Counter<string>;
  private fcmEnabled!: promClient.Gauge<string>;
  private fcmSent!: promClient.Counter<string>;
  private fcmFailed!: promClient.Counter<string>;

  private topic = 'recommendations-generated';
  private httpDurationSum = 0;
  private httpDurationCount = 0;

  constructor(
    private readonly metricsRegistry: MetricsRegistryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const register = this.metricsRegistry.registry;
    this.topic =
      this.config.get<string>('app.kafka.topicRecommendations') ?? this.topic;

    this.kafka = new KafkaMetrics(register, 'alert');

    this.httpDurationAvg = new promClient.Gauge({
      name: 'alert_http_request_duration_ms_avg',
      help: 'Average HTTP request duration in milliseconds (legacy gauge).',
      registers: [register],
    });

    this.dlqSent = new promClient.Counter({
      name: 'alert_kafka_dlq_total',
      help: 'Messages routed to the dead letter queue.',
      registers: [register],
    });

    this.outboundPublished = new promClient.Counter({
      name: 'alerts_outbound_published_total',
      help: 'Alert events published to alerts-outbound topic.',
      registers: [register],
    });

    this.alertsCreated = new promClient.Counter({
      name: 'alerts_created_total',
      help: 'Alerts created by type.',
      labelNames: ['type'],
      registers: [register],
    });

    this.dedupSkipped = new promClient.Counter({
      name: 'alerts_dedup_skipped_total',
      help: 'Alerts skipped by sliding-window deduplication, by type.',
      labelNames: ['type'],
      registers: [register],
    });

    this.persistenceErrors = new promClient.Counter({
      name: 'alert_persistence_errors_total',
      help: 'PostgreSQL persistence errors.',
      registers: [register],
    });

    this.fcmEnabled = new promClient.Gauge({
      name: 'fcm_enabled',
      help: 'Firebase Cloud Messaging channel status (1=enabled, 0=disabled).',
      registers: [register],
    });

    this.fcmSent = new promClient.Counter({
      name: 'fcm_sent_total',
      help: 'Push notifications successfully delivered.',
      registers: [register],
    });

    this.fcmFailed = new promClient.Counter({
      name: 'fcm_failed_total',
      help: 'Push notification delivery failures.',
      registers: [register],
    });
  }

  /** Enregistre la durée d'une requête HTTP (ms) — gauge moyenne historique. */
  recordHttpDuration(durationMs: number): void {
    this.httpDurationSum += durationMs;
    this.httpDurationCount++;
    const avg =
      this.httpDurationCount > 0 ? this.httpDurationSum / this.httpDurationCount : 0;
    this.httpDurationAvg.set(Math.round(avg * 100) / 100);
  }

  /** Incrémente le compteur de messages Kafka par statut. */
  recordKafkaMessage(status: 'ok' | 'error' | 'invalid' | 'skipped_no_owner'): void {
    this.kafka.recordMessage(this.topic, status);
  }

  /** Définit l'état de connexion du consumer Kafka (1 connecté, 0 déconnecté). */
  setKafkaConsumerConnected(connected: boolean): void {
    this.kafka.setConnected(connected);
  }

  /** Incrémente le compteur de messages envoyés en DLQ. */
  recordDlqSent(): void {
    this.dlqSent.inc();
  }

  /** Incrémente le compteur d'événements publiés sur alerts-outbound. */
  recordOutboundPublished(): void {
    this.outboundPublished.inc();
  }

  /** Incrémente le compteur d'alertes créées par type. */
  recordAlertCreated(type: string): void {
    this.alertsCreated.inc({ type });
  }

  /** Incrémente le compteur d'alertes ignorées par déduplication, par type. */
  recordDedupSkipped(type: string): void {
    this.dedupSkipped.inc({ type });
  }

  /** Incrémente le compteur d'erreurs de persistance PostgreSQL. */
  recordPersistenceError(): void {
    this.persistenceErrors.inc();
  }

  /** Définit l'état du canal FCM (1 activé, 0 désactivé — credentials absents). */
  setFcmEnabled(enabled: boolean): void {
    this.fcmEnabled.set(enabled ? 1 : 0);
  }

  /** Incrémente le compteur de notifications push envoyées avec succès. */
  recordFcmSent(): void {
    this.fcmSent.inc();
  }

  /** Incrémente le compteur d'échecs d'envoi push. */
  recordFcmFailed(): void {
    this.fcmFailed.inc();
  }
}
