import { Injectable, OnModuleInit } from '@nestjs/common';
import * as promClient from 'prom-client';

/**
 * Registre Prometheus dédié au service hôte, exposé sur `GET /metrics`.
 *
 * Singleton fourni par `ObservabilityModule.forRoot()`. Les métriques métier du
 * service se déclarent sur ce même registre (`registry.register()` ou via
 * `registers: [registry]`) afin d'être exposées au même endpoint que les
 * métriques standard.
 *
 * Les métriques par défaut Node (`process_*`, `nodejs_*`, event loop…) ne sont
 * collectées qu'une fois, à l'initialisation du module — pas à chaque scrape.
 */
@Injectable()
export class MetricsRegistryService implements OnModuleInit {
  readonly registry = new promClient.Registry();

  private defaultsCollected = false;

  onModuleInit(): void {
    this.enableDefaultMetrics();
  }

  /** Idempotent : la double invocation ne duplique pas les séries. */
  enableDefaultMetrics(): void {
    if (this.defaultsCollected) {
      return;
    }
    promClient.collectDefaultMetrics({ register: this.registry });
    this.defaultsCollected = true;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
