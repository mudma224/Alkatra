import { Module } from '@nestjs/common';
import { IotMetricsService } from './iot-metrics.service';

/**
 * Métriques métier d'iot-service. L'exposition `/metrics` (registre,
 * intercepteur HTTP, métriques par défaut Node) est fournie par
 * `ObservabilityModule.forRoot({ prefix: 'iot' })` dans `AppModule`.
 */
@Module({
  providers: [IotMetricsService],
  exports: [IotMetricsService],
})
export class MetricsModule {}
