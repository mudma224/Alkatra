import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [KafkaModule],  // ← Importe KafkaModule pour pouvoir injecter KafkaService
  providers: [MqttService],
  exports: [MqttService]
})
export class MqttModule {}
