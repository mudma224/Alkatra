import { Injectable, OnModuleInit } from '@nestjs/common';
import * as promClient from 'prom-client';
import { MetricsRegistryService } from '@alkatra/observability';

/**
 * Métriques métier de user-service (BFF profil), déclarées sur le registre
 * partagé (`@alkatra/observability`) et exposées sur `GET /metrics`.
 *
 * Les compteurs sont incrémentés par `UserService` (proxy vers auth-service).
 */
@Injectable()
export class UserMetricsService implements OnModuleInit {
  private profileRequests!: promClient.Counter<string>;
  private profileUpdates!: promClient.Counter<string>;
  private authCalls!: promClient.Counter<string>;

  constructor(private readonly metricsRegistry: MetricsRegistryService) {}

  onModuleInit(): void {
    const register = this.metricsRegistry.registry;

    this.profileRequests = new promClient.Counter({
      name: 'user_profile_requests_total',
      help: 'Nombre total de requêtes de profil servies par le BFF',
      registers: [register],
    });

    this.profileUpdates = new promClient.Counter({
      name: 'user_profile_updates_total',
      help: 'Nombre total de mises à jour de profil transmises au BFF',
      registers: [register],
    });

    this.authCalls = new promClient.Counter({
      name: 'user_auth_calls_total',
      help: "Appels HTTP du BFF vers auth-service, par opération et statut",
      labelNames: ['operation', 'status'],
      registers: [register],
    });
  }

  /** Une requête GET profil a été servie. */
  recordProfileRequest(): void {
    this.profileRequests.inc();
  }

  /** Une mise à jour PATCH profil a été transmise. */
  recordProfileUpdate(): void {
    this.profileUpdates.inc();
  }

  /** Résultat d'un appel proxy vers auth-service. */
  recordAuthCall(operation: string, status: string): void {
    this.authCalls.inc({ operation, status });
  }
}
