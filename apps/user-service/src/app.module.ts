// apps/user-service/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { FarmsModule } from './farms/farms.module';
import { HealthController } from './health/health.controller';
import { User } from './user/entities/user.entity';

type EnvConfig = {
  DB_HOST: string;
  DB_PORT: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  JWT_SECRET: string;
};

function validateEnv(rawConfig: Record<string, unknown>): EnvConfig {
  const requiredVars = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
  ] as const;

  const missing = requiredVars.filter((key) => {
    const value = rawConfig[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const port = Number(rawConfig.DB_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }

  return {
    DB_HOST: String(rawConfig.DB_HOST),
    DB_PORT: String(rawConfig.DB_PORT),
    DB_USER: String(rawConfig.DB_USER),
    DB_PASSWORD: String(rawConfig.DB_PASSWORD),
    DB_NAME: String(rawConfig.DB_NAME),
    JWT_SECRET: String(rawConfig.JWT_SECRET),
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: Number(configService.getOrThrow<string>('DB_PORT')),
        username: configService.getOrThrow<string>('DB_USER'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        entities: [User],
        synchronize: false,
      }),
    }),
    UserModule,
    AuthModule,
    FarmsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
