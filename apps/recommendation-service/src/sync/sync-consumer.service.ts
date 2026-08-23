import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Consumer, Kafka, Producer } from 'kafkajs';
import { PredictionEventDto } from '../dto/prediction-event.dto';
import { MetricsService } from '../metrics/metrics.service';
import { DoubleWriteService } from './double-write.service';

@Injectable()
export class SyncConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private dlqProducer: Producer;
  private connected = false;
  private dlqConnected = false;

  constructor(
    private readonly config: ConfigService,
    private readonly doubleWrite: DoubleWriteService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const consumerEnabled = this.config.get<boolean>('app.kafka.consumerEnabled');
    if (!consumerEnabled) {
      this.logger.warn('Consumer Kafka désactivé (KAFKA_CONSUMER_ENABLED=false)');
      return;
    }

    const brokers = this.config.get<string[]>('app.kafka.brokers');
    const clientId = this.config.get<string>('app.kafka.clientId');
    const groupId = this.config.get<string>('app.kafka.groupId');
    const topic = this.config.get<string>('app.kafka.topicRecommendations');
    const dlqTopic = this.config.get<string>('app.kafka.topicDlq');

    this.kafka = new Kafka({ clientId, brokers, retry: { retries: 8 } });
    this.consumer = this.kafka.consumer({ groupId });
    this.dlqProducer = this.kafka.producer();

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.connected = true;
      this.metrics.setKafkaConsumerConnected(true);
      this.logger.log(
        `Consumer Kafka connecté — topic="${topic}" group="${groupId}"`,
      );

      // Connexion au producer DLQ
      try {
        await this.dlqProducer.connect();
        this.dlqConnected = true;
        this.logger.log(`Producer DLQ connecté — topic="${dlqTopic}"`);
      } catch (err) {
        this.logger.warn(
          `Producer DLQ non connecté : ${(err as Error).message}. Les messages invalides seront loggés uniquement.`,
        );
      }

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          const raw = message.value?.toString();
          if (!raw) return;
          await this.handleMessage(raw, dlqTopic);
        },
      });
    } catch (err) {
      // Le service REST doit rester disponible même si Kafka est down
      this.connected = false;
      this.metrics.setKafkaConsumerConnected(false);
      this.logger.error(
        `Kafka indisponible au démarrage : ${(err as Error).message}. Le service continue en lecture seule.`,
      );
    }
  }

  private async handleMessage(raw: string, dlqTopic: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Message Kafka non-JSON ignoré : ${raw.slice(0, 120)}`);
      this.metrics.recordKafkaMessage('invalid');
      await this.sendToDlq(dlqTopic, raw, 'JSON parse error');
      return;
    }

    const dto = plainToInstance(PredictionEventDto, parsed);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) {
      this.logger.warn(
        `Message Kafka invalide ignoré : ${errors.map((e) => e.property).join(', ')}`,
      );
      this.metrics.recordKafkaMessage('invalid');
      await this.sendToDlq(dlqTopic, raw, `Validation failed: ${errors.map((e) => e.property).join(', ')}`);
      return;
    }

    try {
      await this.doubleWrite.persist(dto);
      this.metrics.recordKafkaMessage('ok');
      this.metrics.recordRecommendationPersisted();
    } catch (err) {
      this.logger.error(
        `Échec persistance recommandation parcel=${dto.parcel_id} : ${(err as Error).message}`,
      );
      this.metrics.recordKafkaMessage('error');
      this.metrics.recordPersistenceError();
      await this.sendToDlq(dlqTopic, raw, `Persistence error: ${(err as Error).message}`);
    }
  }

  private async sendToDlq(dlqTopic: string, raw: string, reason: string): Promise<void> {
    if (!this.dlqConnected) return;
    try {
      await this.dlqProducer.send({
        topic: dlqTopic,
        messages: [
          {
            value: JSON.stringify({
              original: raw,
              error_reason: reason,
              failed_at: new Date().toISOString(),
            }),
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Échec envoi DLQ : ${(err as Error).message}`);
    }
  }

  /** Exposé pour le health check */
  isConnected(): boolean {
    return this.connected;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dlqConnected) {
      await this.dlqProducer.disconnect();
      this.logger.log('Producer DLQ déconnecté');
    }
    if (this.connected) {
      await this.consumer.disconnect();
      this.connected = false;
      this.metrics.setKafkaConsumerConnected(false);
      this.logger.log('Consumer Kafka déconnecté');
    }
  }
}