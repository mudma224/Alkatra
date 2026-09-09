import { Controller, Get, Header } from '@nestjs/common';
import { MetricsRegistryService } from './metrics-registry.service';

/**
 * Exposition du registre Prometheus sur `GET /metrics` (à la racine — le
 * service hôte doit exclure `metrics` de son éventuel préfixe global).
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsRegistry: MetricsRegistryService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsRegistry.getMetrics();
  }
}
