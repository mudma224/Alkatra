import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@alkatra/observability';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ObservabilityModule.forRoot({ prefix: 'recommendation' }),
    DatabaseModule,
    MetricsModule,
    RecommendationsModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}