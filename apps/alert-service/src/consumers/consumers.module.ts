import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module';
import { MetricsModule } from '../metrics/metrics.module';
import { RecommendationsConsumer } from './recommendations.consumer';

@Module({
  imports: [AlertsModule, MetricsModule],
  providers: [RecommendationsConsumer],
  exports: [RecommendationsConsumer],
})
export class ConsumersModule {}
