import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsService } from './metrics/metrics.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Le LoggingInterceptor reçoit le MetricsService (singleton) pour alimenter
  // les compteurs Prometheus.
  app.useGlobalInterceptors(
    new LoggingInterceptor(app.get(MetricsService)),
  );

  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = config.get<number>('app.port') ?? 3004;
  await app.listen(port, '0.0.0.0');
  logger.log(`recommendation-service démarré sur le port ${port}`);
}

void bootstrap();