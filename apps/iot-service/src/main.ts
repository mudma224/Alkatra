/**
 * Al Katra Bel Qatra — IoT Service
 * Point d'entrée NestJS — Bridge MQTT → Kafka
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3005;

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Prefix global pour toutes les routes
  app.setGlobalPrefix('api/v1');

  await app.listen(port);
  logger.log(`🌿 IoT Service démarré sur le port ${port}`);
  logger.log(`📊 Health check : http://localhost:${port}/health`);
}

bootstrap();