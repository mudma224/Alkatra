import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as promClient from 'prom-client';
import {
  KafkaMetrics,
  MetricsRegistryService,
} from '@alkatra/observability';

/**
 * Métriques de recommendation-service, migrées sur le registre partagé
 * (`@alkatra/observability`), en conservant les noms historiques :
 *
 *  - `recommendation_kafka_messages_consumed_total{topic, status}` (label
 *    `topic` ajouté au standard)
 *  - `recommendation_kafka_consumer_connected`
 *  - `recommendation_persistence_errors_total`
 *  - `recommendation_http_request_duration_ms_avg` (gauge historique de
 *    latence moyenne — conservée pour compatibilité ; l'histogramme standard
 *    `recommendation_http_request_duration_seconds` et le compteur
 *    `recommendation_http_requests_total` sont produits par l'intercepteur
 *    HTTP du package partagé)
 *
 * Ajouts : `recommendations_persisted_total` et
 * `recommendation_feedback_total{decision}`.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private kafka!: KafkaMetrics;
  private httpDurationAvg!: promClient.Gauge<string>;
  private persistenceErrors!: promClient.Counter<string>;
  private recommendationsPersisted!: promClient.Counter<string>;
  private feedbackTotal!: promClient.Counter<string>;

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
      this.config.get<string>('app.kafka.topicRecommendations') ??
      this.topic;

    this.kafka = new KafkaMetrics(register, 'recommendation');

    this.httpDurationAvg = new promClient.Gauge({
      name: 'recommendation_http_request_duration_ms_avg',
      help: 'Average HTTP request duration in milliseconds (legacy gauge).',
      registers: [register],
    });

    this.persistenceErrors = new promClient.Counter({
      name: 'recommendation_persistence_errors_total',
      help: 'PostgreSQL persistence errors.',
      registers: [register],
    });

    this.recommendationsPersisted = new promClient.Counter({
      name: 'recommendations_persisted_total',
      help: 'Recommendations successfully persisted to PostgreSQL.',
      registers: [register],
    });

    this.feedbackTotal = new promClient.Counter({
      name: 'recommendation_feedback_total',
      help: 'Farmer feedback received, by decision.',
      labelNames: ['decision'],
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
  recordKafkaMessage(status: 'ok' | 'error' | 'invalid'): void {
    this.kafka.recordMessage(this.topic, status);
  }

  /** Définit l'état de connexion du consumer Kafka. */
  setKafkaConsumerConnected(connected: boolean): void {
    this.kafka.setConnected(connected);
  }

  /** Incrémente le compteur d'erreurs de persistance PostgreSQL. */
  recordPersistenceError(): void {
    this.persistenceErrors.inc();
  }

  /** Une recommandation a été persistée avec succès. */
  recordRecommendationPersisted(): void {
    this.recommendationsPersisted.inc();
  }

  /** Un feedback agriculteur a été enregistré. */
  recordFeedback(decision: 'accepted' | 'rejected' | 'ignored'): void {
    this.feedbackTotal.inc({ decision });
  }
}
