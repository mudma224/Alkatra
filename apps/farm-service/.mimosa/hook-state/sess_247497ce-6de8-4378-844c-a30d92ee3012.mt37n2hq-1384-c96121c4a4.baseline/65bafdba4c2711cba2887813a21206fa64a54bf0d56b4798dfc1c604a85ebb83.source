import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Sensor } from '../../database/entities/sensor.entity';

/**
 * Notifie alert-service des événements capteurs qui déclenchent une alerte
 * (capteur silencieux > 2 h en info, capteur défaillant > 24 h en critical,
 * batterie faible en warning).
 *
 * Best-effort, même philosophie que le heartbeat iot-service → farm-service :
 * un échec réseau est loggé en warning et n'interrompt jamais le cycle de
 * vérification. La dédup 24 h côté alert-service rend le 409 (alerte déjà
 * émise) silencieux.
 */
@Injectable()
export class AlertNotifierService {
  private readonly logger = new Logger(AlertNotifierService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Niveau 1 — active → inactive (silence > seuil configuré) : notification
   * légère (sévérité info), pas d'alerte rouge.
   */
  async notifySensorSilent(sensor: Sensor, silentHours: number): Promise<void> {
    await this.sendAlert({
      alertType: 'sensor_offline',
      userId: sensor.parcel?.farm?.ownerId ?? '',
      parcelId: sensor.parcelId,
      severity: 'info',
      title: 'Capteur silencieux',
      message: `Le capteur ${sensor.deviceId} n'envoie plus de données depuis plus de ${silentHours} h.`,
      data: {
        deviceId: sensor.deviceId,
        lastSeenAt: sensor.lastSeenAt ? sensor.lastSeenAt.toISOString() : null,
        batteryPct: sensor.batteryPct,
        silentHours,
      },
    });
  }

  /**
   * Niveau 2 — inactive → failing (silence > seuil configuré) : alerte
   * critique (rouge).
   */
  async notifySensorFailing(sensor: Sensor, silentHours: number): Promise<void> {
    await this.sendAlert({
      alertType: 'sensor_offline',
      userId: sensor.parcel?.farm?.ownerId ?? '',
      parcelId: sensor.parcelId,
      severity: 'critical',
      title: 'Capteur défaillant',
      message: `Le capteur ${sensor.deviceId} est muet depuis plus de ${silentHours} h — vérifiez son alimentation ou son emplacement.`,
      data: {
        deviceId: sensor.deviceId,
        lastSeenAt: sensor.lastSeenAt ? sensor.lastSeenAt.toISOString() : null,
        batteryPct: sensor.batteryPct,
        silentHours,
      },
    });
  }

  async notifyLowBattery(sensor: Sensor): Promise<void> {
    await this.sendAlert({
      alertType: 'low_battery',
      userId: sensor.parcel?.farm?.ownerId ?? '',
      parcelId: sensor.parcelId,
      severity: 'warning',
      title: 'Batterie capteur faible',
      message: `Le capteur ${sensor.deviceId} a une batterie à ${sensor.batteryPct} %.`,
      data: {
        deviceId: sensor.deviceId,
        batteryPct: sensor.batteryPct,
      },
    });
  }

  private async sendAlert(event: Record<string, unknown>): Promise<void> {
    const baseUrl = this.config.get<string>('app.alertServiceUrl');
    const internalToken = this.config.get<string>('app.internalToken');
    if (!baseUrl || !event['userId']) {
      this.logger.warn('Notification alerte ignorée (alert-service non configuré ou owner inconnu)');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/internal/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalToken ? { 'X-Internal-Token': internalToken } : {}),
        },
        body: JSON.stringify(event),
      });

      // 409 = dédup : l'alerte a déjà été émise dans les dernières 24 h.
      if (!response.ok && response.status !== 409) {
        this.logger.warn(
          `alert-service a répondu ${response.status} pour ${event['alertType']}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Impossible de joindre alert-service (${String(error)}) — notification perdue, le capteur sera re-notifié au prochain cycle`,
      );
    }
  }
}
