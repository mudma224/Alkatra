import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Sensor } from '../../database/entities/sensor.entity';

/**
 * Désactive automatiquement les capteurs silencieux — choix validé : 48 h.
 *
 * Un simple setInterval horaire plutôt que @nestjs/schedule : aucune
 * dépendance supplémentaire pour une tâche unique, et la logique
 * (deactivateStaleSensors) reste publiquement testable.
 *
 * Les capteurs jamais vus (last_seen_at NULL) restent actifs : ils affichent
 * l'état « En attente » côté frontend tant qu'aucun heartbeat n'est reçu.
 */
@Injectable()
export class SensorActivityService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SensorActivityService.name);
  private interval: NodeJS.Timeout | undefined;

  /** Vérification toutes les heures. */
  static readonly CHECK_INTERVAL_MS = 60 * 60 * 1000;
  /** Silence au-delà duquel un capteur passe inactif : 48 heures. */
  static readonly SILENCE_MS = 48 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Sensor)
    private sensorsRepository: Repository<Sensor>,
  ) {}

  onApplicationBootstrap(): void {
    this.interval = setInterval(
      () => void this.deactivateStaleSensors(),
      SensorActivityService.CHECK_INTERVAL_MS,
    );
    // Premier passage au démarrage pour rattraper les silences accumulés.
    void this.deactivateStaleSensors();
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /** Passe is_active = false pour tout capteur muet depuis plus de 48 h. */
  async deactivateStaleSensors(): Promise<number> {
    const threshold = new Date(Date.now() - SensorActivityService.SILENCE_MS);

    const result = await this.sensorsRepository
      .createQueryBuilder()
      .update(Sensor)
      .set({ isActive: false })
      .where(
        '"is_active" = true AND "last_seen_at" IS NOT NULL AND "last_seen_at" < :threshold',
        { threshold },
      )
      .execute();

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`${affected} capteur(s) passé(s) inactif(s) — silence > 48 h`);
    }
    return affected;
  }
}
