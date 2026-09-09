import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  assertValidPrefix,
  OBSERVABILITY_OPTIONS,
  ObservabilityOptions,
} from './observability-options';
import { MetricsRegistryService } from './metrics-registry.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

/**
 * Socle d'observabilité partagé des services NestJS de la plateforme.
 *
 * `ObservabilityModule.forRoot({ prefix: 'farm' })` fournit :
 *  - `GET /metrics` à la racine (registre Prometheus dédié) ;
 *  - les métriques par défaut Node (`process_*`, `nodejs_*`…) ;
 *  - l'intercepteur HTTP global (`<prefix>_http_requests_total` + histogramme
 *    de latence) ;
 *  - l'accès au registre pour déclarer les métriques métier du service.
 *
 * Le service hôte DOIT exclure `metrics` (et `health`) de son éventuel
 * préfixe global (`app.setGlobalPrefix('api/v1', { exclude: [...] })`).
 *
 * @Global() : `MetricsRegistryService` est injectable partout sans réimport.
 */
@Global()
@Module({
  providers: [MetricsRegistryService],
  exports: [MetricsRegistryService],
})
export class ObservabilityModule {
  static forRoot(options: ObservabilityOptions): DynamicModule {
    assertValidPrefix(options.prefix);

    return {
      module: ObservabilityModule,
      providers: [
        { provide: OBSERVABILITY_OPTIONS, useValue: options },
        MetricsRegistryService,
        {
          provide: APP_INTERCEPTOR,
          useClass: HttpMetricsInterceptor,
        },
      ],
      controllers: [MetricsController],
      exports: [MetricsRegistryService, OBSERVABILITY_OPTIONS],
    };
  }
}
