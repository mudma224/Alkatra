import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Consumer, Kafka, Producer } from 'kafkajs';

import { AlertDispatcher } from '../alerts/alert-dispatcher.service';
import { FarmClientService } from '../alerts/farm-client.service';
import {
  HydricStressRule,
  type HydricStressRuleConfig,
} from '../alerts/rules/hydric-stress.rule';
import { DispatchAlertDto } from '../alerts/dto/dispatch-alert.dto';
import { MetricsService } from '../metrics/metrics.service';
import { RecommendationEventDto } from './dto/recommendation-event.dto';

/**
 * Consumer Kafka du topic `recommendations-generated` — source des alertes
 * `hydric_stress_critical`. Même pattern que le SyncConsumerService de
 * recommendation-service : kafkajs brut, fromBeginning: false, auto-commit,
 * DLQ dédiée (`alerts-dlq`) en producteur non-fatal, kill-switch
 * KAFKA_CONSUMER_ENABLED, dégradation gracieuse si Kafka est down (le REST
 * et l'endpoint interne restent disponibles).
 */
@Injectable()
export class RecommendationsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecommendationsConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private dlqProducer: Producer;
  private connected = false;
  private dlqConnected = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dispatcher: AlertDispatcher,
    private readonly farmClient: FarmClientService,
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
      // Le service doit rester disponible même si Kafka est down.
      this.connected = false;
      this.metrics.setKafkaConsumerConnected(false);
      this.logger.error(
        `Kafka indisponible au démarrage : ${(err as Error).message}. Le service continue sans alertes hydriques.`,
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

    const dto = plainToInstance(RecommendationEventDto, parsed);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) {
      this.logger.warn(
        `Message Kafka invalide ignoré : ${errors.map((e) => e.property).join(', ')}`,
      );
      this.metrics.recordKafkaMessage('invalid');
      await this.sendToDlq(dlqTopic, raw, `Validation failed: ${errors.map((e) => e.property).join(', ')}`);
      return;
    }

    // 1. La règle décide d'alerter — un message non critique est un succès.
    const ruleConfig: HydricStressRuleConfig = {
      probabilityThreshold:
        this.config.get<number>('app.hydricStress.probabilityThreshold') ??
        HydricStressRule.DEFAULT_CONFIG.probabilityThreshold,
      soilHumidityMaxPct:
        this.config.get<number>('app.hydricStress.soilHumidityMaxPct') ??
        HydricStressRule.DEFAULT_CONFIG.soilHumidityMaxPct,
    };
    const evaluation = HydricStressRule.evaluate(dto, ruleConfig);
    if (!evaluation.triggered) {
      this.metrics.recordKafkaMessage('ok');
      return;
    }

    // 2. Résolution du destinataire (parcelle → propriétaire) via farm-service.
    let ownerId: string;
    try {
      const owner = await this.farmClient.getParcelOwner(dto.parcel_id);
      if (!owner) {
        // Parcelle inconnue de farm-service : personne à notifier, message
        // sain — skip sans DLQ.
        this.logger.warn(
          `Parcelle ${dto.parcel_id} inconnue de farm-service — alerte hydrique ignorée`,
        );
        this.metrics.recordKafkaMessage('skipped_no_owner');
        return;
      }
      ownerId = owner.ownerId;
    } catch (err) {
      // farm-service injoignable (circuit breaker ouvert) : le message est
      // sain mais intraitable maintenant → DLQ pour replay manuel.
      this.logger.error(
        `Résolution owner impossible parcel=${dto.parcel_id} : ${(err as Error).message}`,
      );
      this.metrics.recordKafkaMessage('error');
      await this.sendToDlq(dlqTopic, raw, `Owner resolution failed: ${(err as Error).message}`);
      return;
    }

    // 3. Dispatch via le pipeline unique (dédup → persist → fan-out).
    const alertDto = new DispatchAlertDto();
    alertDto.alertType = 'hydric_stress_critical';
    alertDto.userId = ownerId;
    alertDto.parcelId = dto.parcel_id;
    alertDto.severity = 'critical';
    alertDto.title = 'Alerte stress hydrique critique';
    alertDto.message =
      `Stress hydrique critique détecté — irrigation fortement recommandée ` +
      `(probabilité ${Math.round(dto.irrigation_probability * 100)} %, ` +
      `humidité du sol ${dto.soil_humidity_pct} %).`;
    alertDto.data = evaluation.data;

    try {
      await this.dispatcher.dispatch(alertDto);
      this.metrics.recordKafkaMessage('ok');
    } catch (err) {
      if (err instanceof ConflictException) {
        // Dédup : l'alerte a déjà été émise dans la fenêtre — succès fonctionnel.
        this.metrics.recordKafkaMessage('ok');
        return;
      }
      this.logger.error(
        `Échec création alerte hydrique parcel=${dto.parcel_id} : ${(err as Error).message}`,
      );
      this.metrics.recordKafkaMessage('error');
      this.metrics.recordPersistenceError();
      await this.sendToDlq(dlqTopic, raw, `Alert dispatch failed: ${(err as Error).message}`);
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
      this.metrics.recordDlqSent();
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
