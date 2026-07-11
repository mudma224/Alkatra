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
    // Métriques métier pour user-service
    new promClient.Counter({
      name: 'user_profile_requests_total',
      help: 'Nombre total de requêtes de profil',
      registers: [this.registry],
    });

    new promClient.Counter({
      name: 'user_profile_updates_total',
      help: 'Nombre total de mises à jour de profil',
      registers: [this.registry],
    });

    new promClient.Histogram({
      name: 'user_request_duration_seconds',
      help: 'Durée des requêtes HTTP en secondes',
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
      labelNames: ['method', 'route', 'status_code'],
    });

    new promClient.Counter({
      name: 'user_auth_calls_total',
      help: 'Nombre total d\'appels HTTP à auth-service',
      registers: [this.registry],
      labelNames: ['operation', 'status'],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}