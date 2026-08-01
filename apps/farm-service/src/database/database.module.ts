import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Farm } from './entities/farm.entity';
import { Parcel } from './entities/parcel.entity';
import { Sensor } from './entities/sensor.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('app.database.host', 'postgres'),
        port: configService.get<number>('app.database.port', 5432),
        username: configService.get<string>('app.database.username', 'farm_user'),
        password: configService.get<string>('app.database.password', 'farm_dev_pass'),
        database: configService.get<string>('app.database.name', 'farm_db'),
        entities: [Farm, Parcel, Sensor],
        synchronize: false,
        logging: configService.get<string>('app.nodeEnv') !== 'production',
      }),
    }),
    TypeOrmModule.forFeature([Farm, Parcel, Sensor]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}