import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Erreur interne du serveur';

    const message = this.extractMessage(payload as string | Record<string, unknown>);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private extractMessage(payload: string | Record<string, unknown>): string {
    if (typeof payload === 'string') return payload;

    const msg = (payload as Record<string, unknown>).message;
    if (msg === undefined) return JSON.stringify(payload);
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
    return String(msg);
  }
}
