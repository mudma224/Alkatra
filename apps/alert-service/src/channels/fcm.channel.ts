import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

import { Alert } from '../database/entities/alert.entity';
import { DevicesService } from '../devices/devices.service';
import { MetricsService } from '../metrics/metrics.service';
import type { ChannelSendResult, NotificationChannel } from './notification-channel.interface';

/** Codes d'erreur FCM signalant un token définitivement mort. */
const DEAD_TOKEN_CODES = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered', 'messaging/invalid-argument']);

/**
 * Canal push Firebase Cloud Messaging.
 *
 * Dégradation gracieuse : si les trois variables FIREBASE_* ne sont pas
 * renseignées (cas du dev par défaut), le canal reste inactif — le service
 * fonctionne en in-app uniquement, chaque appel vaut 'disabled' sans erreur.
 *
 * Hygiène des tokens : les réponses FCM signalant un token mort entraînent sa
 * révocation automatique en base pour ne plus le solliciter.
 */
@Injectable()
export class FcmChannel implements NotificationChannel, OnModuleInit, OnModuleDestroy {
  readonly name = 'fcm';

  private readonly logger = new Logger(FcmChannel.name);
  private messaging: admin.messaging.Messaging | null = null;
  private appName = 'alkatra-alerts';

  constructor(
    private readonly config: ConfigService,
    private readonly devices: DevicesService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    const projectId = this.config.get<string>('app.firebase.projectId');
    const clientEmail = this.config.get<string>('app.firebase.clientEmail');
    const privateKey = this.config.get<string>('app.firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
      this.metrics.setFcmEnabled(false);
      this.logger.warn(
        'Canal FCM désactivé — FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY incomplets (mode in-app uniquement)',
      );
      return;
    }

    try {
      this.appName = `alkatra-alerts-${projectId}`;
      admin.initializeApp(
        {
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        },
        this.appName,
      );
      this.messaging = admin.messaging(admin.app(this.appName));
      this.metrics.setFcmEnabled(true);
      this.logger.log('Canal FCM activé');
    } catch (err) {
      this.metrics.setFcmEnabled(false);
      this.logger.error(`Initialisation Firebase impossible : ${String(err)} — canal FCM désactivé`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.messaging) {
      try {
        await admin.app(this.appName).delete();
      } catch {
        // Déjà supprimée ou jamais créée — rien à faire.
      }
    }
  }

  isEnabled(): boolean {
    return this.messaging !== null;
  }

  async notify(alert: Alert): Promise<ChannelSendResult> {
    if (!this.messaging) {
      return 'disabled';
    }

    let tokens: string[];
    try {
      tokens = await this.devices.getActiveTokens(alert.userId ?? '');
    } catch (err) {
      this.metrics.recordFcmFailed();
      this.logger.error(`Lecture des tokens impossible : ${String(err)}`);
      return 'error';
    }

    if (tokens.length === 0) {
      return 'skipped_no_tokens';
    }

    try {
      // FCM impose des valeurs string dans data — sérialisation defensive.
      const data: Record<string, string> = {
        alertId: alert.id,
        alertType: alert.alertType,
        severity: alert.severity,
        parcelId: alert.parcelId ?? '',
      };
      for (const [key, value] of Object.entries(alert.data ?? {})) {
        data[key] = String(value);
      }

      const response = await this.messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: alert.title ?? alert.alertType,
          body: alert.message,
        },
        data,
      });

      // Révocation des tokens morts signalés par FCM.
      await Promise.all(
        response.responses.map(async (res, index) => {
          if (!res.success && res.error && DEAD_TOKEN_CODES.has(res.error.code)) {
            await this.devices
              .revokeInternal(tokens[index])
              .catch(() => undefined);
            this.logger.warn(`Token FCM révoqué (mort selon FCM) — index=${index}`);
          }
        }),
      );

      if (response.successCount > 0) {
        this.metrics.recordFcmSent();
        return 'sent';
      }

      this.metrics.recordFcmFailed();
      this.logger.warn(
        `Envoi FCM échoué pour tous les tokens (${response.failureCount}) — alerte=${alert.id}`,
      );
      return 'error';
    } catch (err) {
      this.metrics.recordFcmFailed();
      this.logger.error(`Envoi FCM en échec : ${String(err)}`);
      return 'error';
    }
  }
}
