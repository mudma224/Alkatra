import { Module } from '@nestjs/common';
import { KafkaModule } from '../kafka/kafka.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [MqttModule, KafkaModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
