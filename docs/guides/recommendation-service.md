# `apps/recommendation-service` — Documentation factuelle

> Cette documentation reflète l'état du code source, de la configuration et des tests. Elle est basée uniquement sur le code implémenté, pas sur les commentaires.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Arborescence complète](#3-arborescence-complète)
4. [Démarrage](#4-démarrage)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Routes HTTP](#6-routes-http)
7. [Fonctionnement interne par fichier](#7-fonctionnement-interne-par-fichier)
8. [Authentification et sécurité](#8-authentification-et-sécurité)
9. [Modèle de données (PostgreSQL)](#9-modèle-de-données-postgresql)
10. [Logique métier implémentée](#10-logique-métier-implémentée)
11. [Consumer Kafka et pipeline de persistance](#11-consumer-kafka-et-pipeline-de-persistance)
12. [Observabilité (métriques Prometheus)](#12-observabilité-métriques-prometheus)
13. [Gestion des erreurs](#13-gestion-des-erreurs)
14. [Health checks](#14-health-checks)
15. [Tests](#15-tests)
16. [Docker](#16-docker)
17. [Ce que le service NE fait PAS](#17-ce-que-le-service-ne-fait-pas)
18. [Comportements notables](#18-comportements-notables)
19. [Résumé opérationnel](#19-résumé-opérationnel)

---

## 1. Rôle du service

`recommendation-service` est un microservice NestJS (port 3004) qui joue deux rôles complémentaires dans le pipeline d'irrigation intelligente :

1. **API REST de lecture** — expose les recommandations d'irrigation stockées dans PostgreSQL (`recommendation_db`) aux clients (mobile/web)
2. **Consumer Kafka** — consomme le topic `recommendations-generated` produit par le `ml-inference-service`, valide et projette les prédictions ML vers PostgreSQL

**Ce qu'il fait :**

- Il consomme les recommandations ML depuis Kafka et les persiste dans PostgreSQL (avec idempotence)
- Il valide les messages Kafka entrants (DTO + class-validator) et redirige les invalides vers une Dead Letter Queue (DLQ)
- Il expose la recommandation du jour par parcelle (avec passage automatique `pending → seen`)
- Il expose l'historique paginé des recommandations par parcelle
- Il gère le feedback de l'agriculteur (`accepted`, `rejected`, `ignored`) avec une matrice de transitions strictes
- Il permet de marquer une recommandation comme `executed` (irrigation déclenchée)
- Il authentifie toutes les requêtes métier via JWT validé localement
- Il vérifie la propriété des parcelles auprès du `farm-service` avec un circuit breaker
- Il expose des métriques Prometheus (`/metrics`)
- Il expose deux endpoints de santé (liveness + readiness avec test DB + Kafka)

**Ce qu'il ne fait PAS :**

- ❌ Il ne génère pas de recommandations (rôle du `ml-inference-service`)
- ❌ Il ne persiste pas dans MongoDB (rôle du `ml-inference-service`)
- ❌ Il ne calcule pas `duration_minutes` : ce champ est alimenté depuis le payload Kafka (`event.duration_minutes ?? null`), donc laissé à `null` lorsque le producteur ne le fournit pas. Le `ml-inference-service` actuel laisse `duration_minutes` à `None` car il ne dispose pas du débit et de la surface dans la requête, mais le contrat Kafka le permet.
- ❌ Il ne crée pas le schéma DB automatiquement (`synchronize: false`)

---

## 2. Architecture et flux

### Flux de consommation Kafka (persistance)

```
ml-inference-service
  ├→ sauvegarde dans MongoDB (irrigation_recommendations)
  └→ publie sur Kafka topic "recommendations-generated"
                                              │
                                              ▼
recommendation-service
  ├→ Kafka consumer : valide → persiste PostgreSQL (table recommendations)
  ├→ En cas d'échec → DLQ "recommendations-generated-dlq"
  └→ REST API : lit recommendation_db → répond au frontend
```

### Flux de requête REST (lecture)

```
┌──────────┐     ┌──────────────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │ recommendation-  │     │  farm-   │     │PostgreSQL │
│ (mobile/ │     │    service       │     │ service  │     │  reco_db  │
│   web)   │     │    (NestJS)      │     │          │     │           │
└────┬─────┘     └────────┬─────────┘     └────┬─────┘     └─────┬─────┘
     │                    │                    │                 │
     │ 1. GET /today      │                    │                 │
     │    Authorization:  │                    │                 │
     │    Bearer <JWT>    │                    │                 │
     │───────────────────▶│                    │                 │
     │                    │ 2. JwtStrategy     │                 │
     │                    │    valide token    │                 │
     │                    │    → { userId }    │                 │
     │                    │ 3. assertParcelOwnership(parcelId)   │
     │                    │───────────────────▶│                 │
     │                    │    GET /parcels/:id (circuit breaker)│
     │                    │◀───────────────────│                 │
     │                    │ 4. SELECT recommandation du jour     │
     │                    │──────────────────────────────────▶  │
     │                    │ 5. { recommandation + explications } │
     │◀───────────────────│                    │                 │
```

### Architecture des dépendances

```
recommendation-service (port 3004)
│
├── PostgreSQL — recommendation_db (via TypeORM)
│   └── Table: recommendations
│
├── Kafka (via kafkajs)
│   ├── Consumer : topic "recommendations-generated" (group: recommendation-sync-group)
│   └── Producer : topic "recommendations-generated-dlq" (Dead Letter Queue)
│
└── farm-service (via HTTP, @nestjs/axios — avec circuit breaker)
    └── GET /api/v1/parcels/:id → vérification propriété parcelle
```

---

## 3. Arborescence complète

```
apps/recommendation-service/
├── .env.example                          # Modèle de variables d'environnement
├── .gitkeep
├── Dockerfile                            # Build multi-stage (deps → builder → dev → runner)
├── jest.config.js                        # Configuration Jest (ts-jest, coverage)
├── package.json                          # Dépendances et scripts NestJS
├── tsconfig.json                         # Configuration TypeScript
├── tsconfig.build.json                   # Config build (exclut tests)
│
├── src/
│   ├── main.ts                           # Point d'entrée NestJS (CORS, pipes, filtres, interceptors)
│   ├── app.module.ts                     # Module racine (imports tous les modules)
│   │
│   ├── config/
│   │   └── configuration.ts              # Configuration centralisée (registerAs 'app')
│   │
│   ├── database/
│   │   └── database.module.ts            # Module TypeORM (connexion PostgreSQL via DATABASE_URL)
│   │
│   ├── entities/
│   │   └── recommendation.entity.ts      # Entité Recommendation (table recommendations)
│   │
│   ├── dto/
│   │   ├── prediction-event.dto.ts       # DTO événement Kafka entrant (validation)
│   │   ├── recommendation-response.dto.ts # DTO de réponse API
│   │   └── feedback.dto.ts               # DTO feedback agriculteur
│   │
│   ├── common/
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts           # Stratégie Passport JWT + types AuthenticatedUser
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts         # Guard JWT (extends AuthGuard('jwt'))
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts # Décorateur @CurrentUser()
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts  # Filtre d'erreurs global (flattening message)
│   │   └── interceptors/
│   │       └── logging.interceptor.ts    # Interceptor HTTP (logs + métriques Prometheus)
│   │
│   ├── recommendations/
│   │   ├── recommendations.controller.ts # Controller /api/v1/recommendations
│   │   ├── recommendations.service.ts    # Service (lecture, feedback, execute, transitions)
│   │   ├── recommendations.module.ts     # Module (JWT, Passport, HttpModule, TypeORM)
│   │   └── farm-client.service.ts        # Client HTTP farm-service + circuit breaker
│   │
│   ├── sync/
│   │   ├── sync-consumer.service.ts      # Consumer Kafka + DLQ + métriques
│   │   ├── double-write.service.ts       # Projection Kafka → PostgreSQL (idempotence). Le nom DoubleWriteService est hérité de l'architecture initiale ; le service actuel est une projection simple du topic Kafka `recommendations-generated` vers PostgreSQL (`recommendation_db`). MongoDB (`irrigation_recommendations`) est écrit par le `ml-inference-service`, pas par le recommendation-service.
│   │   └── sync.module.ts               # Module sync (TypeORM + Explanation + Metrics)
│   │
│   ├── explanation/
│   │   ├── explanation.service.ts        # Génération explications FR/Darija
│   │   ├── explanation.templates.ts      # Templates de raisons d'irrigation
│   │   └── explanation.module.ts         # Module explanation
│   │
│   ├── metrics/
│   │   ├── metrics.module.ts             # Métriques métier sur le registre partagé @alkatra/observability
│   │   └── metrics.service.ts            # Compteurs Kafka/DLQ/persistance + gauge latence legacy
│   │
│   └── health/
│       └── health.controller.ts          # Controller health (live + ready avec DB + Kafka)
│
└── tests/
    ├── double-write.service.spec.ts          # Tests DoubleWriteService (idempotence, mapping)
    ├── explanation.service.spec.ts           # Tests ExplanationService (raisons)
    ├── farm-client.service.spec.ts           # Tests FarmClientService (circuit breaker)
    ├── jwt.strategy.spec.ts                  # Tests JwtStrategy (validation payload)
    ├── health.controller.spec.ts             # Tests HealthController (liveness, readiness)
    ├── sync-consumer.service.spec.ts         # Tests SyncConsumerService (validation, DLQ, métriques)
    ├── recommendations.service.spec.ts       # Tests RecommendationsService (transitions, execute)
    ├── recommendations.controller.spec.ts    # Tests RecommendationsController (délégation)
    └── e2e/
        └── recommendations.e2e-spec.ts       # Test E2E (pipeline complet avec JWT réel)
```

> **Note :** Seuls les fichiers `.ts` sont conservés dans le contrôle de version. Les artefacts de compilation (`.js`, `.d.ts`) vont dans `dist/` (exclu du VCS).

---

## 4. Démarrage

### Depuis le package du service

```bash
cd apps/recommendation-service

npm run build          # nest build
npm run start          # nest start
npm run start:dev      # nest start --watch (hot reload)
npm run start:prod     # node dist/src/main.js
npm run lint           # eslint "{src,tests}/**/*.ts" --fix
npm run test           # jest
npm run test:watch     # jest --watch
npm run test:cov       # jest --coverage
```

### Depuis la racine du monorepo

```bash
npm run dev            # Lance tous les workspaces via Turbo
```

### Prérequis

- PostgreSQL avec une base `recommendation_db` et le schéma `recommendations` déjà créé (`synchronize: false`)
- Kafka accessible avec les topics `recommendations-generated` et `recommendations-generated-dlq`
- `farm-service` accessible à l'URL configurée (défaut : `http://farm-service:3003`)
- `ml-inference-service` produisant sur le topic `recommendations-generated`
- `JWT_SECRET` identique à celui utilisé par `auth-service`
- `@alkatra/shared-types` et `@alkatra/observability` buildés (`npm run build --workspace @alkatra/shared-types && npm run build --workspace @alkatra/observability`) — consommés via les workspaces

---

## 5. Variables d'environnement

### Configuration centralisée (`src/config/configuration.ts`)

La configuration utilise `registerAs('app')` et expose une structure imbriquée.

```typescript
{
  env: string;              // NODE_ENV
  port: number;             // 3004
  corsOrigins: string[];    // CORS_ORIGINS split par virgules
  database: {
    url: string;            // DATABASE_URL (format URL unique)
    synchronize: boolean;   // DB_SYNCHRONIZE
    logging: boolean;       // DB_LOGGING
  };
  jwt: { secret: string };  // JWT_SECRET
  kafka: {
    brokers: string[];      // KAFKA_BROKERS
    clientId: string;       // KAFKA_CLIENT_ID
    groupId: string;        // KAFKA_GROUP_ID
    topicRecommendations: string; // KAFKA_RECOMMENDATIONS_TOPIC
    topicDlq: string;       // KAFKA_TOPIC_DLQ
    consumerEnabled: boolean; // KAFKA_CONSUMER_ENABLED
  };
  farmService: {
    url: string;            // FARM_SERVICE_URL
    timeoutMs: number;      // FARM_SERVICE_TIMEOUT_MS
  };
}
```

### Tableau récapitulatif

| Variable | Défaut | Utilisation |
|----------|--------|-------------|
| `PORT` | `3004` | Port d'écoute du service |
| `NODE_ENV` | `development` | Environnement |
| `TZ` | — | Fuseau horaire (`Africa/Casablanca` en conteneur — nécessaire pour `todayRange()`) |
| `DATABASE_URL` | — | URL PostgreSQL (format `postgresql://user:pass@host:5432/db`) |
| `DB_SYNCHRONIZE` | `false` | Synchronisation schéma TypeORM (désactivée) |
| `DB_LOGGING` | `false` | Logging SQL TypeORM |
| `JWT_SECRET` | `CHANGE_ME_JWT_SECRET_32_CHARS` | Secret JWT (doit être identique à auth-service) |
| `KAFKA_BROKERS` | `localhost:9092` | Brokers Kafka (séparés par virgules) |
| `KAFKA_CLIENT_ID` | `recommendation-service` | Identifiant client Kafka |
| `KAFKA_GROUP_ID` | `recommendation-sync-group` | Group ID du consumer |
| `KAFKA_RECOMMENDATIONS_TOPIC` | `recommendations-generated` | Topic source des recommandations |
| `KAFKA_TOPIC_DLQ` | `recommendations-generated-dlq` | Topic Dead Letter Queue |
| `KAFKA_CONSUMER_ENABLED` | `true` | Active/désactive le consumer Kafka |
| `FARM_SERVICE_URL` | `http://localhost:3002` | URL du farm-service |
| `FARM_SERVICE_TIMEOUT_MS` | `5000` | Timeout des appels HTTP au farm-service |
| `CORS_ORIGINS` | `*` | Origines CORS autorisées (séparées par virgules) |

### Fichier `.env.example`

```env
NODE_ENV=development
PORT=3004
TZ=Africa/Casablanca

# PostgreSQL (base dédiée au service — format URL comme les autres services)
DATABASE_URL=postgresql://recommendation_user:recommendation_pass@localhost:5432/recommendation_db
DB_SYNCHRONIZE=false
DB_LOGGING=false

# JWT (validation locale du token — même secret que l'auth-service)
JWT_SECRET=CHANGE_ME_JWT_SECRET_32_CHARS

# Kafka
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=recommendation-service
KAFKA_GROUP_ID=recommendation-sync-group
KAFKA_RECOMMENDATIONS_TOPIC=recommendations-generated
KAFKA_TOPIC_DLQ=recommendations-generated-dlq
KAFKA_CONSUMER_ENABLED=true

# Farm service (vérification propriété parcelle)
FARM_SERVICE_URL=http://farm-service:3003
FARM_SERVICE_TIMEOUT_MS=5000

# CORS
CORS_ORIGINS=http://localhost:3000
```

> ⚠️ `JWT_SECRET` doit être **identique** à celui utilisé par `auth-service` pour que la validation des tokens fonctionne.

---

## 6. Routes HTTP

Toutes les routes métier sont préfixées par `/api/v1/` et protégées par `JwtAuthGuard`. Les endpoints `/health` et `/metrics` ne sont pas protégés.

### Recommendations — `/api/v1/recommendations` (protégé JWT)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/parcel/:parcelId/today` | Retourne la dernière recommandation du jour pour la parcelle. **Vérifie la propriété** via farm-service. Passage automatique `pending → seen` (update atomique). **404** si aucune reco aujourd'hui. |
| `GET` | `/parcel/:parcelId/history` | Historique paginé (`limit` max 100, `offset`). **Vérifie la propriété**. Retourne `{ total, items }`. |
| `PATCH` | `/:id/feedback` | Enregistre le feedback (`accepted`, `rejected`, `ignored`). **Vérifie la propriété**. Valide la transition via la matrice des statuts. |
| `PATCH` | `/:id/execute` | Marque la recommandation comme `executed`. **Vérifie la propriété**. Seule une reco `accepted` peut être exécutée. |

### Health — non protégé

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/health` | Liveness : `{ status: 'ok', service, timestamp }` |
| `GET` | `/health/ready` | Readiness : test DB (`SELECT 1`) + Kafka (`isConnected()`). Statut `degraded` si l'un est down. |

### Metrics — non protégé

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/metrics` | Exposition des métriques au format Prometheus (text/plain). |

---

## 7. Fonctionnement interne par fichier

### Détail par fichier source

| Fichier | Rôle réel |
|---------|-----------|
| `src/main.ts` | Point d'entrée NestJS. Active `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`). Active `AllExceptionsFilter` global. Active `LoggingInterceptor` (reçoit `MetricsService` pour les compteurs HTTP). Active CORS, shutdown hooks. Démarre sur le port `app.port` (3004). |
| `src/app.module.ts` | Module racine. Importe `ConfigModule` (global), `ObservabilityModule.forRoot({ prefix: 'recommendation' })`, `DatabaseModule`, `MetricsModule`, `RecommendationsModule`, `SyncModule`. Déclare `HealthController`. |
| `src/config/configuration.ts` | Configuration via `registerAs('app')`. Lit `DATABASE_URL`, `JWT_SECRET`, `KAFKA_*`, `FARM_SERVICE_URL`. Expose `consumerEnabled` pour désactiver le consumer. |
| `src/database/database.module.ts` | Module TypeORM. `forRootAsync` avec `url` depuis `app.database.url`. Entité : `[Recommendation]`. `synchronize` et `logging` depuis la config. |
| `src/entities/recommendation.entity.ts` | Entité `Recommendation` (table `recommendations`). Voir [modèle de données](#9-modèle-de-données-postgresql). |
| `src/dto/prediction-event.dto.ts` | DTO de l'événement Kafka entrant. Valide `parcel_id` (UUID), `should_irrigate`, `irrigation_probability` (0-1), `water_amount_mm`, `top_factors` (array validé), + champs optionnels (`duration_minutes`, `soil_humidity_pct`, `eto`, `generated_at`, `demo_mode`). |
| `src/dto/recommendation-response.dto.ts` | DTO de réponse API. Inclut `demoMode`, `durationMinutes`, `explanation` (`{fr, darija}`), `topFactors`. |
| `src/dto/feedback.dto.ts` | DTO feedback. Valide `feedback` ∈ `{accepted, rejected, ignored}`. |
| `src/common/strategies/jwt.strategy.ts` | Stratégie Passport JWT. Importe `JwtPayload` depuis `@alkatra/shared-types`. Extrait le token Bearer. Secret depuis `app.jwt.secret`. `validate()` retourne `{ userId, phone, authorization: '' }`. Définit `AuthenticatedUser` (`{ userId, phone?, authorization }`). |
| `src/common/guards/jwt-auth.guard.ts` | Guard JWT. `extends AuthGuard('jwt')`. Log la tentative d'accès. `handleRequest()` : throw 401 si token absent/expiré/invalide. |
| `src/common/decorators/current-user.decorator.ts` | Décorateur `@CurrentUser()`. Lit `req.user` (rempli par Passport). Injecte le header `authorization` brut dans `user.authorization` pour le forward au farm-service. |
| `src/common/filters/http-exception.filter.ts` | Filtre global. `extractMessage()` : gère string / array (join) / object. Format réponse : `{ statusCode, message, path, timestamp }`. |
| `src/common/interceptors/logging.interceptor.ts` | Interceptor HTTP. Log chaque requête (méthode, URL pattern, statut, durée). Incrémente la métrique de latence moyenne legacy via `recordHttpDuration(durationMs)`. Les compteurs/ histogrammes HTTP standards (`recommendation_http_requests_total`, `recommendation_http_request_duration_seconds`) sont produits par l'intercepteur du package partagé `@alkatra/observability`. |
| `src/recommendations/recommendations.module.ts` | Module recommendations. Importe `TypeOrmModule.forFeature([Recommendation])`, `PassportModule`, `JwtModule`, `HttpModule`. Déclare controller + service + `FarmClientService` + `JwtStrategy`. |
| `src/recommendations/recommendations.controller.ts` | Controller `/api/v1/recommendations`. `@UseGuards(JwtAuthGuard)` au niveau classe. 4 endpoints. Utilise `@CurrentUser()` et `farmClient.assertParcelOwnership()`. |
| `src/recommendations/recommendations.service.ts` | Service recommendations. `findTodayByParcel` (update atomique `pending→seen`), `findHistoryByParcel` (paginé), `submitFeedback` (matrice de transitions), `markAsExecuted` (seulement si `accepted`), `getParcelIdOf`, `toDto`. |
| `src/recommendations/farm-client.service.ts` | Client HTTP farm-service + **circuit breaker** (`CLOSED`/`OPEN`/`HALF_OPEN`). Seuil : 5 échecs. Reset : 30 s. 403/404 = erreur métier (ne compte pas). Voir [sécurité](#8-authentification-et-sécurité). |
| `src/sync/sync.module.ts` | Module sync. Importe `TypeOrmModule.forFeature([Recommendation])`, `ExplanationModule`, `MetricsModule`. Déclare `DoubleWriteService` + `SyncConsumerService`. |
| `src/sync/sync-consumer.service.ts` | Consumer Kafka. `onModuleInit` : connecte consumer + producer DLQ (non bloquant). `handleMessage` : parse JSON → valide DTO → persiste. En cas d'échec → DLQ + métriques. Expose `isConnected()`. Voir [pipeline](#11-consumer-kafka-et-pipeline-de-persistance). |
| `src/sync/double-write.service.ts` | Projection Kafka → PostgreSQL. **Idempotence** : vérifie `(parcelId, generatedAt)` avant insert. Génère les explications via `ExplanationService`. Mappe les champs (`duration_minutes`, `soil_humidity_pct`, `eto`, `demo_mode`). Le nom `DoubleWriteService` est hérité de l'architecture initiale : le service actuel effectue une projection simple du topic Kafka `recommendations-generated` vers PostgreSQL (`recommendation_db`). L'écriture dans MongoDB (`irrigation_recommendations`) est effectuée par le `ml-inference-service`, pas par le recommendation-service. |
| `src/explanation/explanation.service.ts` | Génère les textes d'explication FR/Darija + `reasonCode` à partir de `{ irrigate, quantityMm, confidenceScore, topFactors }`. |
| `src/explanation/explanation.templates.ts` | Templates de raisons (`LOW_SOIL_MOISTURE`, `HIGH_WATER_DEFICIT`, `HIGH_EVAPOTRANSPIRATION`, `HIGH_TEMPERATURE`, `STRONG_WIND`, `RECENT_RAIN`, `SUFFICIENT_MOISTURE`, `MILD_WEATHER`, `GENERIC`). |
| `src/metrics/metrics.module.ts` | Module des métriques métier. Provisionne uniquement `MetricsService` (l'exposition `/metrics` — registre, intercepteur HTTP, métriques Node par défaut — est fournie par `ObservabilityModule.forRoot({ prefix: 'recommendation' })`). |
| `src/metrics/metrics.service.ts` | Métriques métier via `prom-client` sur le registre partagé (`@alkatra/observability`) : Kafka (`KafkaMetrics`), gauge de latence moyenne legacy, erreurs persistance, recommandations persistées, feedbacks. Voir [observabilité](#12-observabilité-métriques-prometheus). |
| `src/health/health.controller.ts` | Controller health. `GET /health` : statique. `GET /health/ready` : `SELECT 1` + `syncConsumer.isConnected()`. Statut `degraded` si DB ou Kafka down. |

---

## 8. Authentification et sécurité

### Principe

L'authentification repose sur **JWT validé localement** (le secret est partagé avec `auth-service`). Les types `JwtPayload` sont importés depuis `@alkatra/shared-types`.

```
Client → Authorization: Bearer <JWT> → JwtStrategy.validate() → { userId, phone } → request.user
```

### JwtStrategy

- **Extraction** : `ExtractJwt.fromAuthHeaderAsBearerToken()`
- **Expiration** : `ignoreExpiration: false`
- **Secret** : `configService.get<string>('app.jwt.secret')`
- **Validation** : vérifie `payload.sub` (sinon 401), retourne `{ userId: payload.sub, phone, authorization: '' }`

### JwtAuthGuard

- Appliqué au niveau **classe** du `RecommendationsController`
- **Non appliqué** sur `HealthController` et `MetricsController`
- Rejette avec 401 si token absent, expiré ou invalide

### Circuit Breaker (FarmClientService)

Le service vérifie la propriété des parcelles auprès du `farm-service`. Pour éviter qu'une indisponibilité du farm-service ne provoque des 503 en cascade, un **circuit breaker** protège les appels :

| État | Comportement |
|------|-------------|
| `CLOSED` | Appel normal au farm-service. Sur succès → reset compteur. Sur erreur d'indisponibilité → incrément compteur. |
| `OPEN` | Rejet immédiat (503) sans appeler le farm-service. Après 30 s → passage en `HALF_OPEN`. |
| `HALF_OPEN` | Laisse passer une requête de test. Succès → `CLOSED`. Échec → `OPEN`. |

- **Seuil d'ouverture** : 5 erreurs consécutives
- **Erreurs métier** (403, 404) : ne comptent pas pour le circuit breaker (lèvent `ForbiddenException`)
- **Erreurs d'indisponibilité** (timeout, 5xx, connexion) : incrémentent le compteur

### Isolation par propriétaire

Chaque endpoint vérifie que l'utilisateur JWT possède la parcelle via `farmClient.assertParcelOwnership(parcelId, user.authorization)` :

| Opération | Vérification |
|-----------|-------------|
| `GET /today` | Propriété de `parcelId` |
| `GET /history` | Propriété de `parcelId` |
| `PATCH /feedback` | Propriété de la parcelle de la recommandation (`getParcelIdOf`) |
| `PATCH /execute` | Propriété de la parcelle de la recommandation (`getParcelIdOf`) |

---

## 9. Modèle de données (PostgreSQL)

### Table `recommendations`

```sql
CREATE TABLE recommendations (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id                UUID NOT NULL,
    generated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    irrigate                 BOOLEAN NOT NULL,
    confidence_score         DECIMAL(4,3),            -- 0.000 à 1.000
    quantity_mm              DECIMAL(6,2),            -- quantité d'eau en mm
    duration_minutes         INT,                     -- durée d'irrigation (peut être NULL)
    reason_code              VARCHAR(50),             -- code de raison (LOW_SOIL_MOISTURE, etc.)
    shap_factors             JSONB,                   -- top facteurs SHAP
    explanation_text_fr      TEXT,                    -- explication en français
    explanation_text_darija  TEXT,                    -- explication en darija
    soil_humidity_pct_at_gen DECIMAL(5,2),            -- humidité sol au moment de la génération
    eto_at_gen               DECIMAL(6,2),            -- Évapotranspiration au moment de la génération
    model_version            VARCHAR(20),
    status                   recommendation_status_enum DEFAULT 'pending',
    user_feedback            recommendation_feedback_enum,
    feedback_at              TIMESTAMP WITH TIME ZONE,
    demo_mode                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (parcel_id, generated_at),                 -- idempotence (P15/P24)
    CHECK (confidence_score BETWEEN 0 AND 1),
    CHECK (quantity_mm >= 0),
    CHECK (duration_minutes >= 0)
);
```

### Enums

```sql
CREATE TYPE recommendation_status_enum AS ENUM
    ('pending', 'seen', 'accepted', 'rejected', 'executed', 'expired');

CREATE TYPE recommendation_feedback_enum AS ENUM
    ('accepted', 'rejected', 'ignored');
```

### Index

```sql
CREATE INDEX idx_recommendations_parcel_id ON recommendations(parcel_id);
CREATE INDEX idx_recommendations_generated_at ON recommendations(generated_at DESC);
CREATE INDEX idx_recommendations_irrigate ON recommendations(irrigate);
-- Index composite pour findTodayByParcel (filtrage parcelle + journée)
CREATE INDEX idx_recommendations_parcel_generated
    ON recommendations(parcel_id, generated_at DESC);
```

### Cycle de vie d'une recommandation

```
pending (création par le consumer Kafka)
   │
   │  GET /today (passage automatique, update atomique)
   ▼
seen
   │
   │  PATCH /feedback (accepted | rejected | ignored)
   ├──→ accepted ──→ PATCH /execute ──→ executed (verrouillé)
   ├──→ rejected
   └──→ ignored ──→ expired (verrouillé)
```

> ⚠️ `synchronize: false` → le schéma DB doit être créé via `infra/postgres/schemas/recommendation-db.sql` avant de démarrer le service.

---

## 10. Logique métier implémentée

### Matrice des transitions de feedback

Le feedback alimente la **boucle de ré-entraînement du modèle ML**. Des transitions incohérentes corrompraient le dataset. La matrice est donc stricte mais autorise le changement d'avis :

| Statut courant | Feedbacks autorisés |
|----------------|---------------------|
| `pending` | `accepted`, `rejected`, `ignored` |
| `seen` | `accepted`, `rejected`, `ignored` |
| `accepted` | `rejected` (changement d'avis) |
| `rejected` | `accepted` (changement d'avis) |
| `executed` | aucun (verrouillé — l'irrigation a eu lieu) |
| `expired` | aucun (verrouillé — recommandation obsolète) |

Si le feedback n'est pas autorisé → `BadRequestException`.

Un feedback `ignored` fait passer le statut à `expired`.

### Passage automatique `pending → seen`

À la première consultation (`GET /today`), si la recommandation est `pending`, un **update atomique** est exécuté :

```sql
UPDATE recommendations SET status = 'seen'
WHERE id = :id AND status = 'pending';
```

Cela évite la race condition d'un read-then-save (deux requêtes concurrentes ne peuvent pas toutes deux passer à `seen`).

### Marquage `executed`

`PATCH /:id/execute` : seule une recommandation `accepted` peut être exécutée. Sinon `BadRequestException`.

### Historique paginé

`GET /history` retourne `{ total, items }` avec `limit` plafonné à 100. Tri par `generatedAt DESC`.

---

## 11. Consumer Kafka et pipeline de persistance

### Flux de consommation

```
Kafka "recommendations-generated"
   │
   ▼
SyncConsumerService.handleMessage(raw)
   │
   ├── 1. JSON.parse(raw)
   │      └── échec → DLQ + métrique "invalid"
   │
   ├── 2. plainToInstance(PredictionEventDto) + validate(whitelist)
   │      └── invalide → DLQ + métrique "invalid"
   │
   └── 3. DoubleWriteService.persist(dto)
          ├── idempotence : SELECT (parcel_id, generated_at) → doublon ignoré
          ├── explication : ExplanationService.build(...)
          ├── mapping : duration_minutes, soil_humidity_pct, eto, demo_mode
          ├── INSERT
          └── échec → DLQ + métrique "error" + "persistence_error"
```

### Idempotence

Avant chaque insert, `DoubleWriteService` vérifie si une ligne avec `(parcelId, generatedAt)` existe déjà. Si oui → log "doublon ignoré" + skip. Cette garde applicative est **renforcée par une contrainte `UNIQUE(parcel_id, generated_at)`** au niveau base de données — un replay Kafka ne peut pas créer de doublon même si la garde applicative est contournée.

> **Note sur le nom `DoubleWriteService`** : ce nom est hérité de l'architecture initiale. Le service actuel effectue une projection simple du topic Kafka `recommendations-generated` vers PostgreSQL (`recommendation_db`). L'écriture dans MongoDB (`irrigation_recommendations`) est assurée par le `ml-inference-service`, pas par le recommendation-service.

### Dead Letter Queue (DLQ)

Si un message échoue (JSON invalide, validation DTO, erreur persistance), il est publié sur le topic `recommendations-generated-dlq` avec :

```json
{
  "original": "<message brut>",
  "error_reason": "Validation failed: parcel_id",
  "failed_at": "2026-08-06T14:00:00.000Z"
}
```

Le producer DLQ se connecte de manière **non bloquante** : s'il échoue au démarrage, les messages invalides sont seulement loggés en `warn` (le consumer continue de tourner).

### Résilience au démarrage

Si Kafka est indisponible au démarrage (`onModuleInit`), le service **continue en mode lecture seule** (l'API REST reste disponible). Le consumer et la gauge `connected` restent à `false`.

---

## 12. Observabilité (métriques Prometheus)

### Endpoint `/metrics`

Fourni par `ObservabilityModule.forRoot({ prefix: 'recommendation' })` (package `@alkatra/observability`) : registre `prom-client` dédié, métriques par défaut Node (`process_*`, `nodejs_*`) et intercepteur HTTP global qui produit `recommendation_http_requests_total` (counter, labels `method`, `route`, `status`) et l'histogramme `recommendation_http_request_duration_seconds`.

### Métriques métier

Déclarées par `MetricsService` sur le même registre via `prom-client`, en conservant les noms historiques :

| Nom Prometheus | Type | Labels | Description | Source |
|----------------|------|--------|-------------|--------|
| `recommendation_http_requests_total` | counter | `method`, `route`, `status` | Requêtes HTTP par méthode/route/statut | Intercepteur HTTP du package partagé |
| `recommendation_http_request_duration_seconds` | histogram | — | Latence HTTP | Intercepteur HTTP du package partagé |
| `recommendation_http_request_duration_ms_avg` | gauge | — | Latence HTTP **moyenne** en ms (gauge legacy conservée pour compatibilité) | `LoggingInterceptor` |
| `recommendation_kafka_messages_consumed_total` | counter | `topic`, `status` (`ok`/`error`/`invalid`) | Messages Kafka consommés par statut (label `topic` ajouté au standard) | `SyncConsumerService` |
| `recommendation_kafka_consumer_connected` | gauge | — | État du consumer Kafka (1=connecté, 0=déconnecté) | `SyncConsumerService` |
| `recommendations_persisted_total` | counter | — | Recommandations persistées avec succès dans PostgreSQL | `SyncConsumerService` |
| `recommendation_persistence_errors_total` | counter | — | Erreurs de persistance PostgreSQL | `SyncConsumerService` |
| `recommendation_feedback_total` | counter | `decision` (`accepted`/`rejected`/`ignored`) | Feedbacks agriculteurs enregistrés | `RecommendationsService.submitFeedback` |

### Implémentation

`MetricsService` est un **singleton NestJS** construit sur le registre partagé (`MetricsRegistryService` de `@alkatra/observability`). Les compteurs sont incrémentés par le `LoggingInterceptor` (HTTP), le `SyncConsumerService` (Kafka + persistance) et le `RecommendationsService` (feedbacks). La sérialisation est assurée par `prom-client`.

---

## 13. Gestion des erreurs

### Filtre global (`AllExceptionsFilter`)

Toutes les exceptions sont capturées et formatées en JSON :

```json
{
  "statusCode": 404,
  "message": "Aucune recommandation disponible aujourd'hui pour la parcelle ...",
  "path": "/api/v1/recommendations/parcel/.../today",
  "timestamp": "2026-08-06T14:00:00.000Z"
}
```

La méthode `extractMessage()` gère trois cas :
- **String** → retourné tel quel
- **Array** (erreurs class-validator) → join avec `, `
- **Object** → extraction de `.message`, fallback `JSON.stringify`

### Messages d'erreur métier (français)

| Code | Message | Contexte |
|------|---------|----------|
| 401 | `Non autorisé — Le token JWT est absent, expiré ou invalide.` | Token invalide |
| 403 | `Parcelle non accessible pour cet utilisateur` | farm-service 403/404 |
| 404 | `Aucune recommandation disponible aujourd'hui pour la parcelle ...` | Pas de reco du jour |
| 404 | `Recommandation <id> introuvable` | Reco inexistante |
| 400 | `Seule une recommandation acceptée peut être exécutée` | Execute sur non-accepted |
| 400 | `Feedback "<f>" non autorisé depuis le statut "<s>"` | Transition interdite |
| 503 | `Service de gestion des parcelles indisponible (circuit ouvert)` | Circuit breaker OPEN |
| 503 | `Service de gestion des parcelles indisponible` | farm-service injoignable |

---

## 14. Health checks

### `GET /health` (liveness)

```json
{
  "status": "ok",
  "service": "recommendation-service",
  "timestamp": "2026-08-06T14:00:00.000Z"
}
```

Ne dépend d'aucun service externe.

### `GET /health/ready` (readiness)

```json
// Tout est up
{
  "status": "ok",
  "dependencies": { "database": "up", "kafka": "up" },
  "timestamp": "2026-08-06T14:00:00.000Z"
}

// Kafka down
{
  "status": "degraded",
  "dependencies": { "database": "up", "kafka": "down" },
  "timestamp": "2026-08-06T14:00:00.000Z"
}
```

- Exécute `SELECT 1` sur la DB
- Vérifie `syncConsumer.isConnected()` pour Kafka
- Statut `degraded` si l'une des deux dépendances est down

### Healthcheck Docker

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3004/health/ready || exit 1
```

---

## 15. Tests

### Configuration Jest (`jest.config.js`)

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.spec.ts', '<rootDir>/tests/**/*.e2e-spec.ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
```

### Tests unitaires

| Fichier de test | Ce qu'il teste |
|-----------------|----------------|
| `tests/recommendations.service.spec.ts` | `RecommendationsService` — findToday (passage seen atomique), history (pagination), submitFeedback (matrice de transitions + verrouillage executed/expired + changement d'avis), markAsExecuted (accepté/refusé) |
| `tests/farm-client.service.spec.ts` | `FarmClientService` — 200, 403, 404, injoignable, circuit breaker (ouverture après 5 échecs, reset après succès) |
| `tests/double-write.service.spec.ts` | `DoubleWriteService` — persistance, idempotence (doublon ignoré), mapping des champs |
| `tests/explanation.service.spec.ts` | `ExplanationService` — génération des raisons et textes |
| `tests/jwt.strategy.spec.ts` | `JwtStrategy` — payload valide, sub manquant (401) |
| `tests/health.controller.spec.ts` | `HealthController` — liveness, readiness (DB up/down, Kafka up/down) |
| `tests/sync-consumer.service.spec.ts` | `SyncConsumerService` — message valide (métrique ok), JSON invalide (métrique invalid), validation échec (métrique invalid), erreur persistance (métrique error + persistenceError) |
| `tests/recommendations.controller.spec.ts` | `RecommendationsController` — délégation au service + vérification propriété sur chaque endpoint |

### Test E2E

| Fichier | Ce qu'il teste |
|---------|----------------|
| `tests/e2e/recommendations.e2e-spec.ts` | Pipeline complet via `supertest` : 401 sans token, 200 avec JWT réel (signé avec `@nestjs/jwt`), feedback valide/invalide, `/metrics`. Mock de DB, Kafka, farm-service. |

### Commandes

```bash
npm run test          # Lance tous les tests Jest
npm run test:watch    # Mode watch
npm run test:cov      # Avec couverture
```

---

## 16. Docker

### Dockerfile (multi-stage, 4 stages)

```dockerfile
# Stage 1 : deps — Installer les dépendances
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /workspace
COPY package.json tsconfig.json ./
COPY apps/recommendation-service/package.json ./apps/recommendation-service/
COPY apps/recommendation-service/tsconfig.json ./apps/recommendation-service/
COPY apps/recommendation-service/tsconfig.build.json ./apps/recommendation-service/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/observability/package.json ./packages/observability/
COPY packages/observability/tsconfig.json ./packages/observability/tsconfig.json
# Filtre le package.json racine : workspaces = recommendation-service + shared-types + observability,
# dépendances racine vidées et devDependencies supprimées
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('./package.json','utf8'));p.workspaces=['apps/recommendation-service','packages/shared-types','packages/observability'];p.dependencies={};delete p.devDependencies;fs.writeFileSync('./package.json',JSON.stringify(p,null,2));"
RUN npm install --workspace @alkatra/recommendation-service

# Stage 2 : builder — Compile le TypeScript
FROM deps AS builder
WORKDIR /workspace
COPY packages/shared-types ./packages/shared-types
COPY packages/observability ./packages/observability
RUN npm run build --workspace @alkatra/shared-types && npm run build --workspace @alkatra/observability
COPY apps/recommendation-service ./apps/recommendation-service
RUN npm run build --workspace @alkatra/recommendation-service \
    && npm prune --omit=dev

# Stage 3 : development — Hot reload local
FROM deps AS development
WORKDIR /workspace
COPY packages/shared-types ./packages/shared-types
COPY packages/observability ./packages/observability
RUN npm run build --workspace @alkatra/shared-types && npm run build --workspace @alkatra/observability
COPY apps/recommendation-service ./apps/recommendation-service
EXPOSE 3004
CMD ["npm", "run", "start:dev", "-w", "apps/recommendation-service"]

# Stage 4 : runner — Exécute le code compilé (production)
FROM node:20-alpine AS runner
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Africa/Casablanca /etc/localtime && \
    echo "Africa/Casablanca" > /etc/timezone
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /workspace
ENV NODE_ENV=production
ENV TZ=Africa/Casablanca
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder /workspace/packages/shared-types/dist ./packages/shared-types/dist
# @alkatra/observability compilé (socle métriques Prometheus)
COPY --from=builder /workspace/packages/observability/package.json ./packages/observability/
COPY --from=builder /workspace/packages/observability/dist ./packages/observability/dist
COPY --from=builder /workspace/apps/recommendation-service/dist ./apps/recommendation-service/dist
COPY --from=builder /workspace/apps/recommendation-service/package.json ./apps/recommendation-service/
COPY --from=builder /workspace/apps/recommendation-service/node_modules ./apps/recommendation-service/node_modules
RUN chown -R nestjs:nodejs /workspace
USER nestjs
WORKDIR /workspace/apps/recommendation-service
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3004/health/ready || exit 1
CMD ["node", "dist/src/main.js"]
```

### Points clés du Dockerfile

| Élément | Valeur |
|---------|--------|
| Image de base | `node:20-alpine` |
| Contexte de build | Racine du monorepo |
| Workspaces filtrés | `apps/recommendation-service` + `packages/shared-types` + `packages/observability` (dépendances racine vidées) |
| Compilation ordonnée | `shared-types` puis `observability` compilés avant `recommendation-service` (leur `main` pointe vers `dist/`) |
| Utilisateur | `nestjs` (non-root, UID 1001) |
| Fuseau horaire | `Africa/Casablanca` (nécessaire pour `todayRange()`) |
| Port exposé | 3004 |
| Healthcheck | `wget --spider http://localhost:3004/health/ready` |
| Commande | `node dist/src/main.js` |

---

## 17. Ce que le service NE fait PAS

- ❌ Il ne génère pas de recommandations (rôle du `ml-inference-service`)
- ❌ Il ne persiste pas dans MongoDB (rôle du `ml-inference-service`)
- ❌ Il ne calcule pas `duration_minutes` : ce champ est alimenté depuis le payload Kafka (`event.duration_minutes ?? null`), donc laissé à `null` lorsque le producteur ne le fournit pas. Le `ml-inference-service` actuel laisse `duration_minutes` à `None` (débit et surface non disponibles dans la requête), mais le contrat Kafka autorise une valeur non nulle.
- ❌ Il ne stocke pas `water_amount_raw_mm` et `bias_applied_mm` (déjà dans MongoDB)
- ❌ Il n'expose pas de CRUD complet sur les recommandations (lecture + feedback + execute uniquement)
- ❌ Il n'a pas de rate limiting
- ❌ Il ne crée pas le schéma DB automatiquement (`synchronize: false`)

---

## 18. Comportements notables

1. **Sémantique at-most-once du consumer Kafka** : Le consumer Kafka utilise `subscribe({ fromBeginning: false })` avec auto-commit, ce qui produit une sémantique at-most-once (un message peut être perdu en cas de crash après consommation mais avant persistance). L'idempotence applicative (`UNIQUE(parcel_id, generated_at)`) garantit néanmoins l'absence de doublons en base.

2. **Incohérence de port pour `FARM_SERVICE_URL`** : La valeur par défaut `FARM_SERVICE_URL` dans `configuration.ts` est `http://localhost:3002` alors que le `docker-compose` met `http://farm-service:3003` (le port 3002 ne correspond pas au farm-service réel).

3. **`autoLoadEntities: false` avec entités explicites** : Le module TypeORM utilise `autoLoadEntities: false` alors que `entities: [Recommendation]` est fourni explicitement.


---

## 19. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Microservice de lecture recommandations + consumer Kafka |
| **Framework** | NestJS 11 |
| **Port** | 3004 |
| **Base de données** | PostgreSQL `recommendation_db` (TypeORM, table `recommendations`) |
| **ORM** | TypeORM 0.3.20 (`synchronize: false`) |
| **Authentification** | JWT (HS256, secret partagé avec auth-service, validé localement) |
| **Types partagés** | `@alkatra/shared-types` (`JwtPayload`) |
| **Consumer Kafka** | kafkajs (topic `recommendations-generated`, group `recommendation-sync-group`) |
| **DLQ** | Topic `recommendations-generated-dlq` |
| **Communication inter-service** | HTTP GET vers `farm-service` (avec circuit breaker) |
| **Validation** | class-validator + class-transformer (ValidationPipe global) |
| **Health checks** | `/health` + `/health/ready` (SELECT 1 + Kafka) |
| **Métriques** | Prometheus `/metrics` (HTTP, Kafka, persistance) |
| **Tests** | Jest (8 specs unitaires + 1 E2E) |
| **Langage** | TypeScript 5.7 |
| **Node.js** | 20 (Alpine) |
| **Docker** | Multi-stage, utilisateur non-root, TZ Africa/Casablanca, healthcheck sur `/ready` |

### Commandes essentielles

```bash
# Démarrer en développement
cd apps/recommendation-service && npm run start:dev

# Lancer les tests
cd apps/recommendation-service && npm test

# Vérifier la santé
curl http://localhost:3004/health
curl http://localhost:3004/health/ready

# Métriques Prometheus
curl http://localhost:3004/metrics

# Récupérer la recommandation du jour (nécessite un JWT valide)
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3004/api/v1/recommendations/parcel/<parcelId>/today

# Historique paginé
curl -H "Authorization: Bearer <JWT>" \
  "http://localhost:3004/api/v1/recommendations/parcel/<parcelId>/history?limit=30&offset=0"

# Feedback agriculteur
curl -X PATCH http://localhost:3004/api/v1/recommendations/<id>/feedback \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"feedback": "accepted"}'

# Marquer comme exécutée
curl -X PATCH http://localhost:3004/api/v1/recommendations/<id>/execute \
  -H "Authorization: Bearer <JWT>"
```
