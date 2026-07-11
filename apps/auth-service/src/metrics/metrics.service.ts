
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as promClient from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: promClient.Registry;

  constructor() {
    this.registry = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: this.registry });
  }

  onModuleInit() {
    // Métriques métier pour auth-service
    new promClient.Counter({
      name: 'auth_otp_requests_total',
      help: 'Nombre total de demandes OTP',
      registers: [this.registry],
    });

    new promClient.Counter({
      name: 'auth_otp_verified_total',
      help: 'Nombre total d\'OTP vérifiés avec succès',
      registers: [this.registry],
    });

    new promClient.Counter({
      name: 'auth_otp_failed_total',
      help: 'Nombre total d\'échecs de vérification OTP',
      registers: [this.registry],
    });

    new promClient.Counter({
      name: 'auth_login_total',
      help: 'Nombre total de connexions (via refresh token)',
      registers: [this.registry],
    });

    new promClient.Histogram({
      name: 'auth_request_duration_seconds',
      help: 'Durée des requêtes HTTP en secondes',
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
      labelNames: ['method', 'route', 'status_code'],
    });

    new promClient.Gauge({
      name: 'auth_users_total',
      help: 'Nombre total d\'utilisateurs en base',
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}