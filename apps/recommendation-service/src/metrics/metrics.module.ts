import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Métriques métier de recommendation-service. L'exposition `/metrics`
 * (registre, intercepteur HTTP, métriques par défaut Node) est fournie par
 * `ObservabilityModule.forRoot({ prefix: 'recommendation' })` dans `AppModule`.
 */
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
