/**
 * Al Katra Bel Qatra — Auth Service
 * Phase 1 Placeholder — OTP SMS + JWT + Keycloak seront ajoutés en Phase 1 S1-S2
 * Ne contient pour l'instant qu'un endpoint /health minimal
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`[Auth Service] Running on port ${port}`);
  console.log(`[Auth Service] Phase 1 placeholder — OTP/JWT/Keycloak à implémenter`);
  console.log(`[Auth Service] Health: http://localhost:${port}/health`);
}
bootstrap();