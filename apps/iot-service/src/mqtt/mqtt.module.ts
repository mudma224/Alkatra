import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { KafkaModule } from '../kafka/kafka.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [KafkaModule, MetricsModule], // ← KafkaModule pour injecter KafkaService
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
