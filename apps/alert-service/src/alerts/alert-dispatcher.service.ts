import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { Alert, type AlertData, type AlertTypeValue } from '../database/entities/alert.entity';
import { MetricsService } from '../metrics/metrics.service';
import { AlertsOutboundPublisher } from '../channels/alerts-outbound.publisher';
import { FcmChannel } from '../channels/fcm.channel';
import { DispatchAlertDto } from './dto/dispatch-alert.dto';

/** Titres par défaut (FR) lorsque l'émetteur n'en fournit pas. */
const DEFAULT_TITLES: Record<AlertTypeValue, string> = {
  hydric_stress_critical: 'Alerte stress hydrique critique',
  daily_recommendation: 'Recommandation du jour',
  sensor_offline: 'Capteur hors ligne',
  low_battery: 'Batterie capteur faible',
  rain_detected: 'Pluie détectée',
  frost_risk: 'Risque de gel',
  sensor_anomaly: 'Anomalie capteur',
  subscription_expiring: 'Abonnement bientôt expiré',
};

/**
 * Pipeline unique de création d'alerte, partagé par toutes les sources
 * (endpoint interne HTTP poussé par les services, consumer Kafka) :
 *
 *   1. déduplication fenêtre glissante par (user, parcelle, type) ;
 *   2. persistance in-app (source de vérité pour le frontend) ;
 *   3. distribution best-effort en tâche de fond (FCM + alerts-outbound) —
 *      un échec de canal ne fait jamais échouer la création de l'alerte.
 */
@Injectable()
export class AlertDispatcher {
  private readonly logger = new Logger(AlertDispatcher.name);

  constructor(
    @InjectRepository(Alert)
    private alertsRepository: Repository<Alert>,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly fcmChannel: FcmChannel,
    private readonly outboundPublisher: AlertsOutboundPublisher,
  ) {}

  async dispatch(dto: DispatchAlertDto): Promise<Alert> {
    const alert = await this.persist(dto);

    // Distribution découplée : la latence des canaux externes (FCM, Kafka)
    // ne doit jamais bloquer l'appelant (cycle horaire farm-service, consumer
    // Kafka auto-commit). Les erreurs sont attrapées par distribute().
    void this.distribute(alert);

    return alert;
  }

  private async persist(dto: DispatchAlertDto): Promise<Alert> {
    const severity = dto.severity ?? 'info';

    // 1. Dédup fenêtre glissante par (user, parcelle, type, sévérité) : si
    // une alerte identique a déjà été émise dans la fenêtre configurée, on
    // skip. Un capteur silencieux est notifié au maximum 1×/24 h à chaque
    // niveau (info à 2 h, critical à 24 h) — les deux niveaux sont des
    // alertes distinctes, la sévérité fait partie de la clé pour que la
    // critique ne soit jamais bloquée par la légère.
    const windowHours = this.config.get<number>('app.dedup.windowHours') ?? 24;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const duplicate = await this.alertsRepository.findOne({
      where: {
        userId: dto.userId,
        parcelId: dto.parcelId ?? IsNull(),
        alertType: dto.alertType,
        severity,
        createdAt: MoreThan(windowStart),
      },
      select: ['id'],
    });

    if (duplicate) {
      this.metrics.recordDedupSkipped(dto.alertType);
      this.logger.log(
        `Alerte ${dto.alertType}/${severity} ignorée (doublon < ${windowHours} h) — user=${dto.userId} parcel=${dto.parcelId ?? 'sans parcelle'}`,
      );
      throw new ConflictException(
        `Une alerte "${dto.alertType}" (${severity}) identique a déjà été émise il y a moins de ${windowHours} h.`,
      );
    }

    // 2. Persistance in-app.
    const alert = this.alertsRepository.create({
      userId: dto.userId,
      parcelId: dto.parcelId ?? null,
      alertType: dto.alertType,
      severity,
      title: dto.title ?? DEFAULT_TITLES[dto.alertType],
      message: dto.message,
      data: (dto.data ?? {}) as AlertData,
    });

    const saved = await this.alertsRepository.save(alert);
    this.metrics.recordAlertCreated(dto.alertType);
    this.logger.log(
      `Alerte ${dto.alertType} créée — id=${saved.id} user=${saved.userId} parcel=${saved.parcelId ?? 'sans parcelle'}`,
    );
    return saved;
  }

  private async distribute(alert: Alert): Promise<void> {
    try {
      const fcmResult = await this.fcmChannel
        .notify(alert)
        .catch((err) => {
          this.logger.warn(`Canal FCM en échec : ${String(err)}`);
          return 'error' as const;
        });

      await this.outboundPublisher
        .publish(alert, { fcm: fcmResult })
        .catch((err) => {
          this.logger.warn(`Publication alerts-outbound en échec : ${String(err)}`);
        });
    } catch (err) {
      // Ceinture de sécurité : distribute ne doit jamais rejeter (void call).
      this.logger.error(`Distribution inattendue en échec : ${String(err)}`);
    }
  }
}
