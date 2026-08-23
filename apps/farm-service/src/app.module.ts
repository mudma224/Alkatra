import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@alkatra/observability';
import { DatabaseModule } from './database/database.module';
import { FarmsModule } from './modules/farms/farms.module';
import { ParcelsModule } from './modules/parcels/parcels.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { AuthClientModule } from './auth/auth-client.module';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './modules/health/health.controller';
import appConfig from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    ObservabilityModule.forRoot({ prefix: 'farm' }),
    DatabaseModule,
    AuthClientModule,
    FarmsModule,
    ParcelsModule,
    SensorsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}