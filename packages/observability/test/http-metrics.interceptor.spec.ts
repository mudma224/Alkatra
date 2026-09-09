import { ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from '../src/http-metrics.interceptor';
import { MetricsRegistryService } from '../src/metrics-registry.service';

describe('HttpMetricsInterceptor', () => {
  function buildInterceptor(prefix = 'testsvc') {
    const metricsRegistry = new MetricsRegistryService();
    const interceptor = new HttpMetricsInterceptor(metricsRegistry, { prefix });
    return { metricsRegistry, interceptor };
  }

  function buildContext(req: unknown, res: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  it('compte une requête réussie avec le pattern de route et le statut', async () => {
    const { metricsRegistry, interceptor } = buildInterceptor();
    const req = { method: 'GET', route: { path: '/api/v1/farms/:id' } };
    const res = { statusCode: 200 };

    interceptor
      .intercept(buildContext(req, res), { handle: () => of({ ok: true }) })
      .subscribe();

    const output = await metricsRegistry.getMetrics();
    expect(output).toContain(
      'testsvc_http_requests_total{method="GET",route="/api/v1/farms/:id",status="200"} 1',
    );
    expect(output).toContain('# TYPE testsvc_http_requests_total counter');
  });

  it('compte une erreur propagée avec le statut HTTP de l’exception', async () => {
    const { metricsRegistry, interceptor } = buildInterceptor();
    const req = { method: 'POST', route: { path: '/api/v1/auth/verify-otp' } };
    const res = { statusCode: 200 };

    interceptor
      .intercept(buildContext(req, res), {
        handle: () => throwError(() => ({ status: 422 })),
      })
      .subscribe({
        error: () => undefined,
      });

    const output = await metricsRegistry.getMetrics();
    expect(output).toContain('status="422"} 1');
  });

  it('expose un histogramme de latence borné (buckets)', async () => {
    const { metricsRegistry, interceptor } = buildInterceptor('lat');
    const req = { method: 'GET', route: { path: '/health' } };
    const res = { statusCode: 200 };

    interceptor
      .intercept(buildContext(req, res), { handle: () => of(null) })
      .subscribe();

    const output = await metricsRegistry.getMetrics();
    expect(output).toContain(
      '# TYPE lat_http_request_duration_seconds histogram',
    );
    expect(output).toContain('lat_http_request_duration_seconds_bucket');
    expect(output).toContain('le="+Inf"');
  });

  it('agrège sous route="unmatched" quand la requête n’a pas de route', async () => {
    const { metricsRegistry, interceptor } = buildInterceptor();
    const req = { method: 'GET' };
    const res = { statusCode: 404 };

    interceptor
      .intercept(buildContext(req, res), { handle: () => of(null) })
      .subscribe();

    const output = await metricsRegistry.getMetrics();
    expect(output).toContain('route="unmatched"');
  });
});
