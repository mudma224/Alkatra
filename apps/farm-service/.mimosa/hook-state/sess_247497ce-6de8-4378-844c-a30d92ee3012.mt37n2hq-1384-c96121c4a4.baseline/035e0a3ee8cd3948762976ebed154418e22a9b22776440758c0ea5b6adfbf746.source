import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { Sensor } from '../../database/entities/sensor.entity';
import { AlertNotifierService } from './alert-notifier.service';

export interface SensorHealthCheckResult {
  deactivated: number;
  escalated: number;
  lowBattery: number;
}

/**
 * Cycle de santé des capteurs (machine à états), cadence et seuils
 * configurables (app.sensorActivity.*) :
 *
 *   pending ──heartbeat──► active ──silence > inactiveHours──► inactive
 *   inactive ──silence > failingHours──► failing
 *   n'importe quel état + heartbeat ──► active
 *
 * - active → inactive (2 h par défaut) : notification légère (info).
 * - inactive → failing (24 h par défaut) : alerte critique (rouge).
 * - pending (jamais vu) n'est jamais touché : un capteur associé mais pas
 *   encore posé reste « En attente » sans générer de bruit.
 *
 * Un simple setInterval plutôt que @nestjs/schedule : aucune dépendance
 * supplémentaire pour une tâche unique, et chaque transition
 * (deactivateSilentSensors / escalateToFailingSensors /
 * notifyLowBatterySensors) reste publiquement testable.
 */
@Injectable()
export class SensorActivityService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SensorActivityService.name);
  private interval: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(Sensor)
    private sensorsRepository: Repository<Sensor>,
    private readonly alertNotifier: AlertNotifierService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMinutes =
      this.config.get<number>('app.sensorActivity.checkIntervalMinutes') ?? 15;
    this.interval = setInterval(
      () => void this.runChecks(),
      intervalMinutes * 60 * 1000,
    );
    // Premier passage au démarrage pour rattraper les silences accumulés.
    void this.runChecks();
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async runChecks(): Promise<void> {
    try {
      await this.runSensorHealthChecks();
    } catch (error) {
      // Cycle en arrière-plan (setInterval) : une erreur DB ne doit pas
      // produire de promesse rejetée non gérée — le prochain cycle retentera.
      this.logger.error(`Cycle de santé capteurs échoué : ${String(error)}`);
    }
  }

  /** Exécute les trois transitions du cycle — exposé pour les tests E2E/docs. */
  async runSensorHealthChecks(): Promise<SensorHealthCheckResult> {
    const deactivated = await this.deactivateSilentSensors();
    const escalated = await this.escalateToFailingSensors();
    const lowBattery = await this.notifyLowBatterySensors();
    return { deactivated, escalated, lowBattery };
  }

  /**
   * active → inactive : silence supérieur au seuil configuré
   * (SENSOR_INACTIVE_HOURS, 2 h par défaut). Notification légère par capteur.
   */
  async deactivateSilentSensors(): Promise<number> {
    const inactiveHours =
      this.config.get<number>('app.sensorActivity.inactiveHours') ?? 2;
    const threshold = new Date(Date.now() - inactiveHours * 60 * 60 * 1000);

    // LessThan exclut implicitement les NULL (SQL : NULL < x est faux) —
    // les capteurs jamais vus (pending) ne sont de toute façon pas ciblés.
    const silentSensors = await this.sensorsRepository.find({
      where: { healthStatus: 'active', lastSeenAt: LessThan(threshold) },
      relations: { parcel: { farm: true } },
    });

    if (silentSensors.length === 0) {
      return 0;
    }

    await this.sensorsRepository.update(
      silentSensors.map((sensor) => sensor.id),
      { healthStatus: 'inactive' },
    );

    this.logger.log(
      `${silentSensors.length} capteur(s) passé(s) inactive — silence > ${inactiveHours} h`,
    );

    for (const sensor of silentSensors) {
      await this.alertNotifier
        .notifySensorSilent(sensor, inactiveHours)
        .catch((error) =>
          this.logger.warn(
            `Notification capteur silencieux échouée pour ${sensor.deviceId} : ${String(error)}`,
          ),
        );
    }

    return silentSensors.length;
  }

  /**
   * inactive → failing : silence supérieur au seuil configuré
   * (SENSOR_FAILING_HOURS, 24 h par défaut). Alerte critique (rouge).
   */
  async escalateToFailingSensors(): Promise<number> {
    const failingHours =
      this.config.get<number>('app.sensorActivity.failingHours') ?? 24;
    const threshold = new Date(Date.now() - failingHours * 60 * 60 * 1000);

    const failingSensors = await this.sensorsRepository.find({
      where: { healthStatus: 'inactive', lastSeenAt: LessThan(threshold) },
      relations: { parcel: { farm: true } },
    });

    if (failingSensors.length === 0) {
      return 0;
    }

    await this.sensorsRepository.update(
      failingSensors.map((sensor) => sensor.id),
      { healthStatus: 'failing' },
    );

    this.logger.log(
      `${failingSensors.length} capteur(s) escaladé(s) failing — silence > ${failingHours} h`,
    );

    for (const sensor of failingSensors) {
      await this.alertNotifier
        .notifySensorFailing(sensor, failingHours)
        .catch((error) =>
          this.logger.warn(
            `Notification capteur défaillant échouée pour ${sensor.deviceId} : ${String(error)}`,
          ),
        );
    }

    return failingSensors.length;
  }

  /**
   * Signale à alert-service les capteurs actifs dont la batterie est sous le
   * seuil. Appelé à chaque cycle : la dédup 24 h côté alert-service garantit
   * qu'un fermier n'est pas re-notifié avant 24 h.
   */
  async notifyLowBatterySensors(): Promise<number> {
    const thresholdPct = this.config.get<number>('app.lowBatteryThresholdPct') ?? 20;

    // Seuls les capteurs actifs émettent leur batterie (heartbeat) — un
    // capteur silencieux ne peut pas avoir de batterie fraîche.
    const lowBatterySensors = await this.sensorsRepository.find({
      where: { healthStatus: 'active', batteryPct: LessThan(thresholdPct) },
      relations: { parcel: { farm: true } },
    });

    for (const sensor of lowBatterySensors) {
      await this.alertNotifier.notifyLowBattery(sensor).catch((error) =>
        this.logger.warn(
          `Notification low_battery échouée pour ${sensor.deviceId} : ${String(error)}`,
        ),
      );
    }

    return lowBatterySensors.length;
  }
}
