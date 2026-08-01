import { Controller, Get, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  @Get('api/v1/health/live')
  checkLive() {
    return {
      status: 'ok',
      service: 'farm-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('api/v1/health/ready')
  async checkReady() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        service: 'farm-service',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Ready check - DB connection failed: ${error.message}`);
      return {
        status: 'error',
        service: 'farm-service',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }
}