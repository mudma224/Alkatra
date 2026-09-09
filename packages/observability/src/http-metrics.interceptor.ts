import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Inject,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as promClient from 'prom-client';
import { Observable, tap } from 'rxjs';
import {
  OBSERVABILITY_OPTIONS,
  ObservabilityOptions,
} from './observability-options';
import { MetricsRegistryService } from './metrics-registry.service';
import { RouteNormalizerUtil } from './route-normalizer.util';

/**
 * Intercepteur HTTP global : compteur de requêtes + histogramme de latence.
 *
 * Produit les métriques standard de la plateforme :
 *   `<prefix>_http_requests_total{method, route, status}`
 *   `<prefix>_http_request_duration_seconds{method, route, status}`
 *
 * La durée est mesurée en nanosecondes (`process.hrtime.bigint()`) et exposée
 * en secondes. Les erreurs propagées par le handler sont comptées avec le
 * statut HTTP de l'exception (500 par défaut).
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly requestsTotal: promClient.Counter<string>;
  private readonly requestDuration: promClient.Histogram<string>;

  constructor(
    private readonly metricsRegistry: MetricsRegistryService,
    @Inject(OBSERVABILITY_OPTIONS) options: ObservabilityOptions,
  ) {
    const { prefix } = options;

    this.requestsTotal = new promClient.Counter({
      name: `${prefix}_http_requests_total`,
      help: `Total HTTP requests handled by ${prefix}-service.`,
      labelNames: ['method', 'route', 'status'],
      registers: [metricsRegistry.registry],
    });

    this.requestDuration = new promClient.Histogram({
      name: `${prefix}_http_request_duration_seconds`,
      help: `HTTP request duration in seconds for ${prefix}-service.`,
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [metricsRegistry.registry],
    });
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const method = req.method;
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          this.record(method, req, res.statusCode, startedAt);
        },
        error: (err: { status?: number }) => {
          this.record(method, req, err?.status ?? 500, startedAt);
        },
      }),
    );
  }

  private record(
    method: string,
    req: { route?: { path?: string | string[] | RegExp } },
    status: number,
    startedAt: bigint,
  ): void {
    const route = RouteNormalizerUtil.normalize(req);
    const labels = {
      method,
      route,
      status: String(status),
    };
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

    this.requestsTotal.inc(labels);
    this.requestDuration.observe(labels, seconds);
  }
}
