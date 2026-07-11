import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Controller('health')
export class HealthController {
  private readonly authServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    const authHost = this.configService.get<string>('AUTH_SERVICE_HOST') ?? 'localhost';
    const authPort = this.configService.get<string>('AUTH_SERVICE_PORT') ?? '3001';
    this.authServiceUrl = `http://${authHost}:${authPort}`;
  }

  @Get()
  async check() {
    return this.readiness();
  }

  @Get('live')
  liveness() {
    return {
      status: 'alive',
      service: 'user-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async readiness() {
    try {
      await axios.get(`${this.authServiceUrl}/health`);
      return {
        status: 'ready',
        checks: { authService: 'up' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { authService: 'down' },
      });
    }
  }
}