import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    return new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      maxRetriesPerRequest: 3,
    });
  },
};

