import { Module } from '@nestjs/common';
import { UserMetricsService } from './user-metrics.service';

/**
 * Métriques métier de user-service. L'exposition `/metrics` (registre,
 * intercepteur HTTP, métriques par défaut Node) est fournie par
 * `ObservabilityModule.forRoot({ prefix: 'user' })` dans `AppModule`.
 */
@Module({
  providers: [UserMetricsService],
  exports: [UserMetricsService],
})
export class MetricsModule {}
