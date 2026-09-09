import * as promClient from 'prom-client';

/**
 * Helpers métriques Kafka pour un service consommateur.
 *
 * Produit les métriques standard de la plateforme :
 *   `<prefix>_kafka_messages_consumed_total{topic, status}`
 *   `<prefix>_kafka_consumer_connected`
 *
 * Le lag des consumer groups n'est PAS couvert ici : il est supervisé par
 * kafka-exporter côté infrastructure (source de vérité = offsets broker).
 */
export class KafkaMetrics {
  private readonly messagesConsumed: promClient.Counter<string>;
  private readonly consumerConnected: promClient.Gauge<string>;

  constructor(registry: promClient.Registry, prefix: string) {
    this.messagesConsumed = new promClient.Counter({
      name: `${prefix}_kafka_messages_consumed_total`,
      help: `Kafka messages consumed by ${prefix}-service, by topic and status.`,
      labelNames: ['topic', 'status'],
      registers: [registry],
    });

    this.consumerConnected = new promClient.Gauge({
      name: `${prefix}_kafka_consumer_connected`,
      help: `Kafka consumer connection status for ${prefix}-service (1 connected, 0 disconnected).`,
      registers: [registry],
    });
  }

  /** Incrémente le compteur de messages consommés pour un topic et un statut. */
  recordMessage(topic: string, status: string): void {
    this.messagesConsumed.inc({ topic, status });
  }

  /** Positionne la gauge d'état de connexion du consumer. */
  setConnected(connected: boolean): void {
    this.consumerConnected.set(connected ? 1 : 0);
  }
}
