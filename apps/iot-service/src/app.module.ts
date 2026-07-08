import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; // Ajout de ConfigService
import { MongooseModule } from '@nestjs/mongoose'; // Import manquant
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { MetricsModule } from './metrics/metrics.module';
import { MqttModule } from './mqtt/mqtt.module';
import { KafkaConsumerModule } from './kafka-consumer/kafka-consumer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Utilisation de useFactory pour attendre le chargement de la config
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    KafkaConsumerModule,
    KafkaModule,
    MqttModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}