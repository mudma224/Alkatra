/**
 * Al Katra Bel Qatra — Kafka Producer Service
 * Envoie les données capteurs vers le topic raw-sensor-data
 * Requis CdC Section 6.3 étape 2
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, CompressionTypes, logLevel } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const brokers = (this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9094').split(
      ',',
    );

    this.kafka = new Kafka({
      clientId: 'alkatra-iot-service',
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 1000,
        retries: 10,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });

    await this.connect();
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.logger.log('Kafka producer déconnecté');
    }
  }

  private async connect() {
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('✅ Kafka producer connecté');
    } catch (error: unknown) {
      this.logger.error(`❌ Kafka connexion échouée: ${(error as Error).message}`);
      this.logger.warn('Retry dans 5 secondes...');
      setTimeout(() => this.connect(), 5000);
    }
  }

  /**
   * Envoie un message dans un topic Kafka
   * @param topic  Nom du topic (ex: 'raw-sensor-data')
   * @param key    Clé du message (device_id ou parcel_id pour le partitionnement)
   * @param value  Données à envoyer (objet JS → sérialisé en JSON)
   */
  async send(topic: string, key: string, value: object): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn(`Kafka non connecté — message perdu (topic: ${topic})`);
      return;
    }

    try {
      await this.producer.send({
        topic,
        compression: CompressionTypes.GZIP,
        messages: [
          {
            key,
            value: JSON.stringify(value),
            timestamp: Date.now().toString(),
          },
        ],
      });
    } catch (error: unknown) {
      this.logger.error(`Erreur envoi Kafka [${topic}]: ${(error as Error).message}`);
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }
}
