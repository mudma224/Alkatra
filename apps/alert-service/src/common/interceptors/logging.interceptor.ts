import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../../metrics/metrics.service';

/**
 * Intercepte chaque requête HTTP pour :
 *  - logger la requête (méthode, URL, durée, statut)
 *  - incrémenter les métriques Prometheus (compteur + latence)
 *
 * La "route" remontée est la pattern URL Express (req.route?.path) plutôt que
 * l'URL brute, afin d'éviter l'explosion de cardinalité des labels (une metric
 * par :id distinct).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metrics?: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { method, url } = req;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startedAt;
          this.logger.log(`${method} ${url} → ${res.statusCode} (${duration}ms)`);
          this.recordMetrics(method, req, res.statusCode, duration);
        },
        error: (err) => {
          const duration = Date.now() - startedAt;
          const status = err?.status ?? 500;
          this.logger.warn(`${method} ${url} → ${status} (${duration}ms)`);
          this.recordMetrics(method, req, status, duration);
        },
      }),
    );
  }

  private recordMetrics(
    method: string,
    req: Request,
    status: number,
    durationMs: number,
  ): void {
    if (!this.metrics) return;
    const route = (req.route?.path ?? req.url) as string;
    this.metrics.recordHttpRequest(method, route, status);
    this.metrics.recordHttpDuration(durationMs);
  }
}
