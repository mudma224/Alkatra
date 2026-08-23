import { Module } from '@nestjs/common';
import { AuthMetricsService } from './auth-metrics.service';

/**
 * Métriques métier d'auth-service. L'exposition `/metrics` (registre,
 * intercepteur HTTP, métriques par défaut Node) est fournie par
 * `ObservabilityModule.forRoot({ prefix: 'auth' })` dans `AppModule`.
 */
@Module({
  providers: [AuthMetricsService],
  exports: [AuthMetricsService],
})
export class MetricsModule {}
