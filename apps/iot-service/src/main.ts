import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3005;

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // ❌ NE PAS inclure health/metrics dans le prefix — les exclure explicitement
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'metrics', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });

  await app.listen(port, '0.0.0.0');

  logger.log(`IoT Service started on port ${port}`);
  logger.log(`API: http://localhost:${port}/api/v1`);
  logger.log(`Health: http://localhost:${port}/health`);
  logger.log(`Metrics: http://localhost:${port}/metrics`);
}

bootstrap();
