import { Injectable } from '@nestjs/common';

/**
 * Registre de métriques en mémoire, exposé au format Prometheus texte via
 * {@link MetricsController}. Suit le même pattern maison que l'iot-service et
 * le recommendation-service (pas de dépendance `prom-client`) pour rester
 * cohérent avec le reste du monorepo.
 *
 * Les compteurs sont incrémentés par le `LoggingInterceptor` (HTTP), le
 * `RecommendationsConsumer` (Kafka), l'`AlertDispatcher` (cycle de vie des
 * alertes) et le `FcmChannel` (push). Le service étant un singleton NestJS,
 * l'état est partagé sans condition de course problématique (boucle
 * événementielle Node.js mono-thread).
 */
@Injectable()
export class MetricsService {
  // --- HTTP ---
  private httpRequests = new Map<string, number>(); // clé "METHOD|ROUTE|STATUS"
  private httpDurationSum = 0;
  private httpDurationCount = 0;

  // --- Kafka ---
  private kafkaMessages = new Map<string, number>(); // clé status: ok|error|invalid|skipped_no_owner
  private kafkaConsumerConnected = 0;
  private dlqSent = 0;
  private outboundPublished = 0;

  // --- Alertes ---
  private alertsCreated = new Map<string, number>(); // clé type
  private dedupSkipped = new Map<string, number>(); // clé type
  private persistenceErrors = 0;

  // --- FCM ---
  private fcmEnabled = 0;
  private fcmSent = 0;
  private fcmFailed = 0;

  /** Incrémente le compteur de requêtes HTTP pour un triplet method/route/status. */
  recordHttpRequest(method: string, route: string, status: number): void {
    const key = `${method}|${route}|${status}`;
    this.httpRequests.set(key, (this.httpRequests.get(key) ?? 0) + 1);
  }

  /** Enregistre la durée d'une requête HTTP (ms) pour le calcul de latence moyenne. */
  recordHttpDuration(durationMs: number): void {
    this.httpDurationSum += durationMs;
    this.httpDurationCount++;
  }

  /** Incrémente le compteur de messages Kafka par statut. */
  recordKafkaMessage(
    status: 'ok' | 'error' | 'invalid' | 'skipped_no_owner',
  ): void {
    this.kafkaMessages.set(status, (this.kafkaMessages.get(status) ?? 0) + 1);
  }

  /** Définit l'état de connexion du consumer Kafka (1 connecté, 0 déconnecté). */
  setKafkaConsumerConnected(connected: boolean): void {
    this.kafkaConsumerConnected = connected ? 1 : 0;
  }

  /** Incrémente le compteur de messages envoyés en DLQ. */
  recordDlqSent(): void {
    this.dlqSent++;
  }

  /** Incrémente le compteur d'événements publiés sur alerts-outbound. */
  recordOutboundPublished(): void {
    this.outboundPublished++;
  }

  /** Incrémente le compteur d'alertes créées par type. */
  recordAlertCreated(type: string): void {
    this.alertsCreated.set(type, (this.alertsCreated.get(type) ?? 0) + 1);
  }

  /** Incrémente le compteur d'alertes ignorées par déduplication, par type. */
  recordDedupSkipped(type: string): void {
    this.dedupSkipped.set(type, (this.dedupSkipped.get(type) ?? 0) + 1);
  }

  /** Incrémente le compteur d'erreurs de persistance PostgreSQL. */
  recordPersistenceError(): void {
    this.persistenceErrors++;
  }

  /** Définit l'état du canal FCM (1 activé, 0 désactivé — credentials absents). */
  setFcmEnabled(enabled: boolean): void {
    this.fcmEnabled = enabled ? 1 : 0;
  }

  /** Incrémente le compteur de notifications push envoyées avec succès. */
  recordFcmSent(): void {
    this.fcmSent++;
  }

  /** Incrémente le compteur d'échecs d'envoi push. */
  recordFcmFailed(): void {
    this.fcmFailed++;
  }

  /**
   * Sérialise l'ensemble des métriques au format d'exposition Prometheus
   * (text/plain ; version=0.0.4).
   */
  format(): string {
    const lines: string[] = [];

    // --- HTTP requests total ---
    lines.push('# HELP alert_http_requests_total Total HTTP requests by method, route and status.');
    lines.push('# TYPE alert_http_requests_total counter');
    for (const [key, value] of this.httpRequests.entries()) {
      const [method, route, status] = key.split('|');
      const labels = `{method="${method}",route="${route}",status="${status}"}`;
      lines.push(`alert_http_requests_total${labels} ${value}`);
    }

    // --- HTTP average latency ---
    lines.push('# HELP alert_http_request_duration_ms_avg Average HTTP request duration in milliseconds.');
    lines.push('# TYPE alert_http_request_duration_ms_avg gauge');
    const avgDuration =
      this.httpDurationCount > 0
        ? Math.round((this.httpDurationSum / this.httpDurationCount) * 100) / 100
        : 0;
    lines.push(`alert_http_request_duration_ms_avg ${avgDuration}`);

    // --- Kafka messages consumed total ---
    lines.push('# HELP alert_kafka_messages_consumed_total Kafka messages consumed by status.');
    lines.push('# TYPE alert_kafka_messages_consumed_total counter');
    for (const [status, value] of this.kafkaMessages.entries()) {
      lines.push(`alert_kafka_messages_consumed_total{status="${status}"} ${value}`);
    }

    // --- Kafka consumer connected ---
    lines.push('# HELP alert_kafka_consumer_connected Kafka consumer connection status (1=connected, 0=disconnected).');
    lines.push('# TYPE alert_kafka_consumer_connected gauge');
    lines.push(`alert_kafka_consumer_connected ${this.kafkaConsumerConnected}`);

    // --- DLQ / outbound ---
    lines.push('# HELP alert_kafka_dlq_total Messages routed to the dead letter queue.');
    lines.push('# TYPE alert_kafka_dlq_total counter');
    lines.push(`alert_kafka_dlq_total ${this.dlqSent}`);

    lines.push('# HELP alerts_outbound_published_total Alert events published to alerts-outbound topic.');
    lines.push('# TYPE alerts_outbound_published_total counter');
    lines.push(`alerts_outbound_published_total ${this.outboundPublished}`);

    // --- Alerts lifecycle ---
    lines.push('# HELP alerts_created_total Alerts created by type.');
    lines.push('# TYPE alerts_created_total counter');
    for (const [type, value] of this.alertsCreated.entries()) {
      lines.push(`alerts_created_total{type="${type}"} ${value}`);
    }

    lines.push('# HELP alerts_dedup_skipped_total Alerts skipped by sliding-window deduplication, by type.');
    lines.push('# TYPE alerts_dedup_skipped_total counter');
    for (const [type, value] of this.dedupSkipped.entries()) {
      lines.push(`alerts_dedup_skipped_total{type="${type}"} ${value}`);
    }

    lines.push('# HELP alert_persistence_errors_total PostgreSQL persistence errors.');
    lines.push('# TYPE alert_persistence_errors_total counter');
    lines.push(`alert_persistence_errors_total ${this.persistenceErrors}`);

    // --- FCM ---
    lines.push('# HELP fcm_enabled Firebase Cloud Messaging channel status (1=enabled, 0=disabled).');
    lines.push('# TYPE fcm_enabled gauge');
    lines.push(`fcm_enabled ${this.fcmEnabled}`);

    lines.push('# HELP fcm_sent_total Push notifications successfully delivered.');
    lines.push('# TYPE fcm_sent_total counter');
    lines.push(`fcm_sent_total ${this.fcmSent}`);

    lines.push('# HELP fcm_failed_total Push notification delivery failures.');
    lines.push('# TYPE fcm_failed_total counter');
    lines.push(`fcm_failed_total ${this.fcmFailed}`);

    return `${lines.join('\n')}\n`;
  }
}
