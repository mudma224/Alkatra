import { Module } from '@nestjs/common';
import { SensorDataConsumer } from './sensor-data.consumer';
import { MongodbModule } from '../mongodb/mongodb.module';

@Module({
  imports: [MongodbModule],
  // Enregistré en provider (et non en controller : aucune route) pour être
  // injectable par le HealthController tout en conservant ses hooks de cycle
  // de vie Nest (onModuleInit / onModuleDestroy).
  providers: [SensorDataConsumer],
  exports: [SensorDataConsumer],
})
export class KafkaConsumerModule {}