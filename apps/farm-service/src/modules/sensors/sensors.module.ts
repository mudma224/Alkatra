import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SensorsController } from './sensors.controller';
import { InternalSensorsController } from './internal-sensors.controller';
import { SensorsService } from './sensors.service';
import { SensorActivityService } from './sensor-activity.service';
import { AlertNotifierService } from './alert-notifier.service';
import { Sensor } from '../../database/entities/sensor.entity';
import { Parcel } from '../../database/entities/parcel.entity';
import { MetricsModule } from '../../metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sensor, Parcel]),
    MetricsModule,
  ],
  controllers: [SensorsController, InternalSensorsController],
  providers: [SensorsService, SensorActivityService, AlertNotifierService],
  exports: [SensorsService],
})
export class SensorsModule {}
