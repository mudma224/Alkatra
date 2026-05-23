import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3005;

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });

  await app.listen(port);
  logger.log(`IoT Service started on port ${port}`);
  logger.log(`Health check: http://localhost:${port}/health`);
  logger.log(`Metrics: http://localhost:${port}/metrics`);
}

bootstrap();
