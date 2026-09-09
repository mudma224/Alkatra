import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FarmMetricsService } from './farm-metrics.service';

/**
 * Métriques métier de farm-service. L'exposition `/metrics` (registre,
 * intercepteur HTTP, métriques par défaut Node) est fournie par
 * `ObservabilityModule.forRoot({ prefix: 'farm' })` dans `AppModule`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [FarmMetricsService],
  exports: [FarmMetricsService],
})
export class MetricsModule {}
