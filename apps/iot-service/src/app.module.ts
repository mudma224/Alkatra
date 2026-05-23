import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { MetricsModule } from './metrics/metrics.module';
import { MqttModule } from './mqtt/mqtt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    KafkaModule,
    MqttModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
