import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  /**
   * Health check endpoint
   * Utilisé par Docker healthcheck et scripts/health-check.sh en Phase 1
   */
  @Get('health')
  health(): object {
    return {
      status: 'ok',
      service: 'auth-service',
      phase: 'placeholder — Phase 1 not implemented',
      timestamp: new Date().toISOString(),
    };
  }
}