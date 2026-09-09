import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from './otp/redis.provider';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Health check endpoint — vérifie réellement les dépendances
   * (Postgres `SELECT 1`, Redis `PING`).
   * Utilisé par Docker healthcheck et scripts/health-check.sh.
   */
  @Get('health')
  async health(): Promise<object> {
    const checks: Record<string, string> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }

    const allUp = Object.values(checks).every((status) => status === 'up');
    if (!allUp) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'auth-service',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      service: 'auth-service',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
