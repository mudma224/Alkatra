import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Alert } from '../database/entities/alert.entity';
import { ChannelsModule } from '../channels/channels.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AlertDispatcher } from './alert-dispatcher.service';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { FarmClientService } from './farm-client.service';
import { InternalAlertsController } from './internal-alerts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert]),
    ChannelsModule,
    MetricsModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('app.farmService.timeoutMs') ?? 5000,
        maxRedirects: 0,
      }),
    }),
  ],
  controllers: [AlertsController, InternalAlertsController],
  providers: [AlertsService, AlertDispatcher, FarmClientService],
  exports: [AlertDispatcher, AlertsService, FarmClientService],
})
export class AlertsModule {}
