import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@alkatra/observability';
import { AlertsModule } from './alerts/alerts.module';
import { ChannelsModule } from './channels/channels.module';
import configuration from './config/configuration';
import { ConsumersModule } from './consumers/consumers.module';
import { DatabaseModule } from './database/database.module';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ObservabilityModule.forRoot({ prefix: 'alert' }),
    DatabaseModule,
    MetricsModule,
    DevicesModule,
    ChannelsModule,
    AlertsModule,
    ConsumersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
