import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Activer CORS pour le frontend web
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Filtre d'erreur global — messages en français
  app.useGlobalFilters(new AllExceptionsFilter());

  // Hooks de shutdown (pour graceful shutdown)
  app.enableShutdownHooks();

  const port = process.env.PORT || 3003;
  await app.listen(port);

  logger.log(`🌾 farm-service démarré sur le port ${port}`);
  logger.log(`   Base de données : farm_db`);
  logger.log(`   Auth service : ${process.env.AUTH_SERVICE_URL || 'http://auth-service:3001'}`);
}

bootstrap();