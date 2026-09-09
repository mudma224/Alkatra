import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [KafkaService],
  exports: [KafkaService], // ← Exporté pour que MqttModule puisse l'utiliser
})
export class KafkaModule {}
