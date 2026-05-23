import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from './mqtt/mqtt.module';
import { KafkaModule } from './kafka/kafka.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Variables d'environnement disponibles dans toute l'app
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Modules métier
    KafkaModule, // Kafka doit être chargé AVANT MQTT (MQTT en dépend)
    MqttModule,
    HealthModule,
  ],
})
export class AppModule {}
