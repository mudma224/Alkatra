import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(`${method} ${url} → OK (${Date.now() - startedAt}ms)`),
        error: (err) =>
          this.logger.warn(
            `${method} ${url} → ${err?.status ?? 500} (${Date.now() - startedAt}ms)`,
          ),
      }),
    );
  }
}