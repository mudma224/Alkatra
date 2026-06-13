import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

import {
  AiSensorFeature,
  AiSensorFeatureSchema,
} from './schemas/ai-sensor-feature.schema';

import { AiSensorFeatureRepository } from './repositories/ai-sensor-reading.repository';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),

        // optimisation connexion MongoDB
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }),
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([
      {
        name: AiSensorFeature.name,
        schema: AiSensorFeatureSchema,
      },
    ]),
  ],

  providers: [AiSensorFeatureRepository],
  exports: [AiSensorFeatureRepository],
})
export class MongodbModule {}