import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SyncConsumerService } from '../sync/sync-consumer.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly syncConsumer: SyncConsumerService,
  ) {}

  @Get()
  liveness() {
    return {
      status: 'ok',
      service: 'recommendation-service',
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

    const kafka = this.syncConsumer.isConnected() ? 'up' : 'down';

    const allUp = database === 'up' && kafka === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      dependencies: { database, kafka },
      timestamp: new Date().toISOString(),
    };
  }
}