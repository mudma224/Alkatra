import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { MqttModule } from '../mqtt/mqtt.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [TerminusModule, MqttModule, KafkaModule],
  controllers: [HealthController],
})
export class HealthModule {}
