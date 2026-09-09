import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../entities/recommendation.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('app.database.url'),
        entities: [Recommendation],
        synchronize: config.get<boolean>('app.database.synchronize'),
        logging: config.get<boolean>('app.database.logging'),
        autoLoadEntities: false,
      }),
    }),
  ],
})
export class DatabaseModule {}