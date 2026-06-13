import { Module } from '@nestjs/common';
import { SensorDataConsumer } from './sensor-data.consumer';
import { MongodbModule } from '../mongodb/mongodb.module';

@Module({
  imports: [MongodbModule],
  controllers: [SensorDataConsumer],
})
export class KafkaConsumerModule {}