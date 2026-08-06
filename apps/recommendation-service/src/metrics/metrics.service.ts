import { Injectable } from '@nestjs/common';

/**
 * Registre de métriques en mémoire, exposé au format Prometheus texte via
 * {@link MetricsController}. Suit le même pattern maison que l'iot-service
 * (pas de dépendance `prom-client`) pour rester cohérent avec le reste du
 * monorepo.
 *
 * Les compteurs sont incrémentés par le `LoggingInterceptor` (HTTP) et le
 * `SyncConsumerService` (Kafka). Le service étant un singleton NestJS, l'état
 * est partagé sans condition de course problématique (boucle événementielle
 * Node.js mono-thread).
 */
@Injectable()
export class MetricsService {
  // --- HTTP ---
  private httpRequests = new Map<string, number>(); // clé "METHOD|ROUTE|STATUS"
  private httpDurationSum = 0;
  private httpDurationCount = 0;

  // --- Kafka ---
  private kafkaMessages = new Map<string, number>(); // clé status: ok|error|invalid
  private kafkaConsumerConnected = 0;

  // --- Persistance ---
  private persistenceErrors = 0;

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
  recordKafkaMessage(status: 'ok' | 'error' | 'invalid'): void {
    this.kafkaMessages.set(status, (this.kafkaMessages.get(status) ?? 0) + 1);
  }

  /** Définit l'état de connexion du consumer Kafka (1 connecté, 0 déconnecté). */
  setKafkaConsumerConnected(connected: boolean): void {
    this.kafkaConsumerConnected = connected ? 1 : 0;
  }

  /** Incrémente le compteur d'erreurs de persistance PostgreSQL. */
  recordPersistenceError(): void {
    this.persistenceErrors++;
  }

  /**
   * Sérialise l'ensemble des métriques au format d'exposition Prometheus
   * (text/plain ; version=0.0.4).
   */
  format(): string {
    const lines: string[] = [];

    // --- HTTP requests total ---
    lines.push('# HELP recommendation_http_requests_total Total HTTP requests by method, route and status.');
    lines.push('# TYPE recommendation_http_requests_total counter');
    for (const [key, value] of this.httpRequests.entries()) {
      const [method, route, status] = key.split('|');
      const labels = `{method="${method}",route="${route}",status="${status}"}`;
      lines.push(`recommendation_http_requests_total${labels} ${value}`);
    }

    // --- HTTP average latency ---
    lines.push('# HELP recommendation_http_request_duration_ms_avg Average HTTP request duration in milliseconds.');
    lines.push('# TYPE recommendation_http_request_duration_ms_avg gauge');
    const avgDuration =
      this.httpDurationCount > 0
        ? Math.round((this.httpDurationSum / this.httpDurationCount) * 100) / 100
        : 0;
    lines.push(`recommendation_http_request_duration_ms_avg ${avgDuration}`);

    // --- Kafka messages consumed total ---
    lines.push('# HELP recommendation_kafka_messages_consumed_total Kafka messages consumed by status.');
    lines.push('# TYPE recommendation_kafka_messages_consumed_total counter');
    for (const [status, value] of this.kafkaMessages.entries()) {
      lines.push(
        `recommendation_kafka_messages_consumed_total{status="${status}"} ${value}`,
      );
    }

    // --- Kafka consumer connected ---
    lines.push('# HELP recommendation_kafka_consumer_connected Kafka consumer connection status (1=connected, 0=disconnected).');
    lines.push('# TYPE recommendation_kafka_consumer_connected gauge');
    lines.push(`recommendation_kafka_consumer_connected ${this.kafkaConsumerConnected}`);

    // --- Persistence errors ---
    lines.push('# HELP recommendation_persistence_errors_total PostgreSQL persistence errors.');
    lines.push('# TYPE recommendation_persistence_errors_total counter');
    lines.push(`recommendation_persistence_errors_total ${this.persistenceErrors}`);

    return `${lines.join('\n')}\n`;
  }
}
