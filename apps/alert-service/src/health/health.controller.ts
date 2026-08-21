import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RecommendationsConsumer } from '../consumers/recommendations.consumer';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly recommendationsConsumer: RecommendationsConsumer,
  ) {}

  @Get()
  liveness() {
    return {
      status: 'ok',
      service: 'alert-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async readiness() {
    let database = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    const kafka = this.recommendationsConsumer.isConnected() ? 'up' : 'down';

    const allUp = database === 'up' && kafka === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      dependencies: { database, kafka },
      timestamp: new Date().toISOString(),
    };
  }
}
