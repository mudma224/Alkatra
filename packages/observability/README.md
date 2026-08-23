# @alkatra/observability

Socle d'observabilité partagé des services NestJS de la plateforme Al Katra :
exposition Prometheus standardisée (`/metrics`), métriques HTTP globales,
helpers Kafka, métriques par défaut Node.

## Intégration dans un service

1. **Dépendance** (`apps/<service>/package.json`) :

   ```json
   "dependencies": {
     "@alkatra/observability": "*"
   }
   ```

2. **Bootstrap du module** (`app.module.ts`) :

   ```typescript
   import { ObservabilityModule } from '@alkatra/observability';

   @Module({
     imports: [
       ObservabilityModule.forRoot({ prefix: 'farm' }),
       // ...
     ],
   })
   export class AppModule {}
   ```

   Le module est `@Global()` : `MetricsRegistryService` est injectable partout.

3. **Préfixe global** (`main.ts`) — si le service utilise
   `app.setGlobalPrefix('api/v1')`, exclure `metrics` (et `health`) :

   ```typescript
   app.setGlobalPrefix('api/v1', {
     exclude: [
       { path: 'metrics', method: RequestMethod.GET },
       { path: 'health', method: RequestMethod.GET },
     ],
   });
   ```

## Ce que le module fournit

| Élément | Détail |
|---|---|
| `GET /metrics` | Registre Prometheus dédié, format exposition standard |
| Métriques par défaut Node | `process_*`, `nodejs_*` (event loop, GC, heap…) |
| `<prefix>_http_requests_total{method,route,status}` | Intercepteur HTTP global |
| `<prefix>_http_request_duration_seconds{…}` | Histogramme de latence (buckets 5 ms → 10 s) |
| `KafkaMetrics` | `<prefix>_kafka_messages_consumed_total{topic,status}` + `<prefix>_kafka_consumer_connected` |

Le label `route` contient le **pattern Express** (`/api/v1/farms/:id`), jamais
l'URL réelle — la cardinalité des labels reste bornée.

## Déclarer des métriques métier

Dans le service hôte, créer un service qui s'appuie sur le registre partagé :

```typescript
@Injectable()
export class XxxMetricsService implements OnModuleInit {
  private readonly persisted: promClient.Counter<string>;

  constructor(private readonly registryService: MetricsRegistryService) {}

  onModuleInit() {
    this.persisted = new promClient.Counter({
      name: 'xxx_items_persisted_total',
      help: 'Items persisted by xxx-service.',
      registers: [this.registryService.registry],
    });
  }
}
```

## Conventions de nommage

`<service>_<objet>_<unité>[_<type>]` — voir `design_prometheus.md` §5.1.
Exceptions historiques conservées : `alkatra_iot_*` (iot-service), `ml_*`
(ml-inference, Python).

Le **lag Kafka** n'est pas instrumenté côté applicatif : kafka-exporter le
supervise au niveau de l'infrastructure (offsets broker = source de vérité).

## Tests

```bash
npm run test --workspace @alkatra/observability
```
