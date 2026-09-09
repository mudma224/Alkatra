import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as promClient from 'prom-client';
import { Repository } from 'typeorm';
import { MetricsRegistryService } from '@alkatra/observability';
import { Farm } from '../database/entities/farm.entity';
import { Parcel } from '../database/entities/parcel.entity';
import { Sensor } from '../database/entities/sensor.entity';

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Métriques métier de farm-service, déclarées sur le registre partagé
 * (`@alkatra/observability`) et exposées sur `GET /metrics`.
 *
 * - `farm_heartbeats_processed_total{result}` : incrémentée par
 *   `SensorsService.recordHeartbeat` (heartbeat iot-service).
 * - `farm_entities{type}` et `farm_sensor_health{status}` : gauges rafraîchies
 *   périodiquement (60 s) par comptage repository — jamais au scrape, pour ne
 *   pas lier la latence de `/metrics` aux requêtes SQL.
 */
@Injectable()
export class FarmMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FarmMetricsService.name);
  private readonly heartbeats!: promClient.Counter<string>;
  private readonly entities!: promClient.Gauge<string>;
  private readonly sensorHealth!: promClient.Gauge<string>;
  private refreshTimer?: NodeJS.Timeout;

  constructor(
    private readonly metricsRegistry: MetricsRegistryService,
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
    @InjectRepository(Parcel)
    private readonly parcelsRepository: Repository<Parcel>,
    @InjectRepository(Sensor)
    private readonly sensorsRepository: Repository<Sensor>,
  ) {
    const register = this.metricsRegistry.registry;

    this.heartbeats = new promClient.Counter({
      name: 'farm_heartbeats_processed_total',
      help: 'Heartbeats capteur traités par farm-service (PATCH /internal/sensors/:id/seen).',
      labelNames: ['result'],
      registers: [register],
    });

    this.entities = new promClient.Gauge({
      name: 'farm_entities',
      help: "Nombre d'entités gérées par farm-service, par type.",
      labelNames: ['type'],
      registers: [register],
    });

    this.sensorHealth = new promClient.Gauge({
      name: 'farm_sensor_health',
      help: "Capteurs par statut de santé (machine à états SensorActivityService).",
      labelNames: ['status'],
      registers: [register],
    });
  }

  onModuleInit(): void {
    void this.refreshGauges();
    this.refreshTimer = setInterval(
      () => void this.refreshGauges(),
      REFRESH_INTERVAL_MS,
    );
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  /** Heartbeat traité avec succès. */
  recordHeartbeatOk(): void {
    this.heartbeats.inc({ result: 'ok' });
  }

  /** Heartbeat rejeté (capteur inconnu ou erreur). */
  recordHeartbeatError(): void {
    this.heartbeats.inc({ result: 'error' });
  }

  private async refreshGauges(): Promise<void> {
    try {
      const [farms, parcels, sensors] = await Promise.all([
        this.farmsRepository.count(),
        this.parcelsRepository.count(),
        this.sensorsRepository.count(),
      ]);

      this.entities.set({ type: 'farm' }, farms);
      this.entities.set({ type: 'parcel' }, parcels);
      this.entities.set({ type: 'sensor' }, sensors);

      const rows: Array<{ healthStatus: string; count: string }> =
        await this.sensorsRepository
          .createQueryBuilder('sensor')
          .select('sensor.healthStatus', 'healthStatus')
          .addSelect('COUNT(*)', 'count')
          .groupBy('sensor.healthStatus')
          .getRawMany();

      this.sensorHealth.reset();
      for (const row of rows) {
        this.sensorHealth.set({ status: row.healthStatus }, Number(row.count));
      }
    } catch (error) {
      this.logger.warn(
        `Rafraîchissement des gauges farm impossible : ${(error as Error).message}`,
      );
    }
  }
}
