import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [TerminusModule, MqttModule],
  controllers: [HealthController],
})
export class HealthModule {}
