# Guide — alert-service

> **Sprint 5 — Alert Service (notifications)**
> Service NestJS responsable de la détection, la persistance et la distribution des alertes destinées aux fermiers : in-app (PostgreSQL + REST), push FCM et traçabilité événementielle Kafka.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Arborescence complète](#3-arborescence-complete)
4. [Démarrage](#4-démarrage)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Routes HTTP](#6-routes-http)
7. [Fonctionnement interne par fichier](#7-fonctionnement-interne-par-fichier)
8. [Authentification et sécurité](#8-authentification-et-sécurité)
9. [Modèle de données (PostgreSQL)](#9-modèle-de-données-postgresql)
10. [Logique métier implémentée](#10-logique-métier-implémentée)
11. [Consumer Kafka et pipeline d'alertes](#11-consumer-kafka-et-pipeline-dalertes)
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

alert-service centralise les **notifications** de la plateforme Al Katra. Trois types d'alertes sont implémentés (l'enum SQL en accepte 8) :

| Type | Déclencheur | Source | Sévérité |
|---|---|---|---|
| `sensor_offline` (niveau 1) | Capteur silencieux > `SENSOR_INACTIVE_HOURS` (2 h par défaut) | farm-service (push HTTP interne) | `info` — notification légère |
| `sensor_offline` (niveau 2) | Capteur silencieux > `SENSOR_FAILING_HOURS` (24 h par défaut) | farm-service (push HTTP interne) | `critical` — alerte rouge |
| `low_battery` | Capteur actif avec batterie < `LOW_BATTERY_THRESHOLD` (20 %) | farm-service (push HTTP interne) | `warning` |
| `hydric_stress_critical` | Recommandation ML critique (proba ≥ 0.75 ET humidité sol ≤ 25 %) | Consumer Kafka `recommendations-generated` | `critical` |

Canaux de distribution :

- **In-app** : persistance `notification_db.alerts` + API REST (source du frontend, polling) ;
- **Push FCM** : envoi réel via `firebase-admin` vers les tokens de `device_tokens` ; **dégradation gracieuse** (no-op + métrique) si `FIREBASE_*` vides ;
- **Traçabilité** : publication best-effort sur le topic Kafka `alerts-outbound` (prépare la passerelle SMS Phase 2).

## 2. Architecture et flux

```
farm-service (cycle de santé, seuils configurables)
  ├─ active → inactive (silence > 2 h)  ──► POST /internal/alerts  (info)
  └─ inactive → failing (silence > 24 h) ─►   header X-Internal-Token
       (ownerId + parcelId déjà résolus par farm-service)

ml-inference-service ──► Kafka "recommendations-generated"
                              │
                              ▼
     RecommendationsConsumer (kafkajs, group alert-service-group)
       Règle HydricStressRule (proba ≥ 0.75 && humidité sol ≤ 25 %)
       Résolution parcelId → ownerId : GET farm-service:3003/internal/parcels/:id/owner
       (circuit breaker 5 échecs / 30 s ; 404 = skip silencieux)
                              │
                              ▼
     AlertDispatcher — pipeline unique :
       1. Dédup fenêtre glissante 24 h par (user, parcelle, type, SÉVÉRITÉ)
       2. Persistance notification_db.alerts
       3. Distribution best-effort fire-and-forget :
          ├─ FcmChannel (tokens actifs, révocation auto des tokens morts)
          └─ AlertsOutboundPublisher (topic alerts-outbound)

Frontend (polling REST via gateway, JWT) :
  GET /api/v1/alerts · /api/v1/alerts/unread-count ·
  PATCH /api/v1/alerts/:id/read · PATCH /api/v1/alerts/read-all ·
  POST /api/v1/devices · DELETE /api/v1/devices/:token
```

Principes :

- **Un pipeline unique** (`AlertDispatcher.dispatch()`) pour toutes les sources — dédup, formatage et fan-out écrits une seule fois.
- **Fan-out découplé** : l'échec FCM ou Kafka n'entraîne jamais la perte de l'alerte in-app.
- **Le propriétaire de l'information résout les identifiants** : farm-service pousse `ownerId` résolu ; alert-service ne fait de résolution HTTP que pour le flux Kafka (pas le choix).

## 3. Arborescence complète

```
apps/alert-service/
├── src/
│   ├── main.ts                        # Bootstrap (ValidationPipe, filtre, CORS, shutdown hooks)
│   ├── app.module.ts                  # Config, Database, Metrics, Devices, Channels, Alerts, Consumers
│   ├── config/configuration.ts        # registerAs('app') — tous les defaults
│   ├── database/
│   │   ├── database.module.ts         # TypeORM forRootAsync (notification_db)
│   │   └── entities/
│   │       ├── alert.entity.ts        # Enum SQL alert_type/severity/status + data jsonb
│   │       └── device-token.entity.ts # Tokens FCM (révocation logique revoked_at)
│   ├── common/
│   │   ├── strategies/jwt.strategy.ts # HS256, sub → { userId, phone }
│   │   ├── guards/jwt-auth.guard.ts   # AuthGuard('jwt')
│   │   ├── guards/internal-token.guard.ts # X-Internal-Token ↔ INTERNAL_TOKEN
│   │   ├── decorators/current-user.decorator.ts
│   │   ├── filters/http-exception.filter.ts
│   │   └── interceptors/logging.interceptor.ts
│   ├── alerts/
│   │   ├── alerts.controller.ts       # REST publique (JWT)
│   │   ├── internal-alerts.controller.ts # POST /internal/alerts (guard interne)
│   │   ├── alerts.service.ts          # Liste paginée, unread-count, markRead
│   │   ├── alert-dispatcher.service.ts # Pipeline : dédup → persist → fan-out
│   │   ├── farm-client.service.ts     # GET /internal/parcels/:id/owner + circuit breaker
│   │   ├── rules/hydric-stress.rule.ts # Règle pure (matrice de seuils)
│   │   └── dto/ (dispatch-alert, list-alerts.query)
│   ├── devices/
│   │   ├── devices.controller.ts      # POST/DELETE /api/v1/devices
│   │   ├── devices.service.ts         # Upsert, révocation, tokens actifs
│   │   └── dto/register-device.dto.ts
│   ├── consumers/
│   │   ├── recommendations.consumer.ts # kafkajs + DLQ alerts-dlq
│   │   └── dto/recommendation-event.dto.ts
│   ├── channels/
│   │   ├── notification-channel.interface.ts # Contrat des canaux (SMS Phase 2)
│   │   ├── fcm.channel.ts             # firebase-admin + dégradation gracieuse
│   │   └── alerts-outbound.publisher.ts # Producer kafkajs best-effort
│   ├── health/health.controller.ts    # /health + /health/ready
│   └── metrics/ (service, controller, module)
├── tests/                             # 10 specs jest (voir §15)
├── Dockerfile                         # 4 stages, contexte racine, port 3006
├── package.json · tsconfig.json · jest.config.js · .env.example
```

## 4. Démarrage

```bash
# Via la stack complète (profil phase1) — prérequis : .env à la racine
npm run docker:up-phase1

# Santé
curl http://localhost:3006/health
curl http://localhost:3006/health/ready   # { dependencies: { database, kafka } }

# Développement local hors Docker (nécessite Postgres + Kafka accessibles)
cd apps/alert-service
cp .env.example .env   # adapter DATABASE_URL / KAFKA_BROKERS
npm run start:dev
```

La base `notification_db` est créée par `infra/postgres/00-create-databases.sh` + `schemas/notification-db.sql` (nouvelles bases uniquement — un volume existant doit être recréé si le schéma a évolué).

## 5. Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3006` | Port d'écoute |
| `DATABASE_URL` | — | `postgresql://notify_user:${NOTIFY_DB_PASSWORD}@postgres:5432/notification_db` |
| `JWT_SECRET` | dev | Même secret que auth-service (validation locale) |
| `INTERNAL_TOKEN` | `''` | Token inter-services (header `X-Internal-Token` sur `/internal/*`) — vide = isolation réseau Docker |
| `KAFKA_BROKERS` | `localhost:9092` | Brokers Kafka |
| `KAFKA_GROUP_ID` | `alert-service-group` | Consumer group |
| `KAFKA_RECOMMENDATIONS_TOPIC` | `recommendations-generated` | Topic consommé |
| `KAFKA_TOPIC_DLQ` | `alerts-dlq` | DLQ dédiée (distincte de `recommendations-generated-dlq`) |
| `KAFKA_OUTBOUND_TOPIC` | `alerts-outbound` | Topic de publication |
| `KAFKA_CONSUMER_ENABLED` | `true` | Kill-switch du consumer |
| `FARM_SERVICE_URL` | `http://localhost:3003` | Résolution parcelle → owner |
| `FARM_SERVICE_TIMEOUT_MS` | `5000` | Timeout HTTP |
| `HYDRIC_STRESS_PROBABILITY_THRESHOLD` | `0.75` | Seuil proba (politique de notification, pas ML) |
| `HYDRIC_STRESS_SOIL_HUMIDITY_MAX_PCT` | `25` | Seuil humidité sol maximale |
| `DEDUP_WINDOW_HOURS` | `24` | Fenêtre de dédup par (user, parcelle, type, sévérité) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | `''` | Les trois requis pour activer FCM — sinon canal désactivé |
| `CORS_ORIGINS` | `*` | Origines autorisées |

## 6. Routes HTTP

### API publique (JWT, via gateway)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/v1/alerts?limit=&offset=&status=&unreadOnly=` | Liste paginée user-scopée (`created_at DESC`) |
| `GET` | `/api/v1/alerts/unread-count` | `{ count }` — badge frontend |
| `PATCH` | `/api/v1/alerts/:id/read` | Marque lue (idempotent ; 404/403 sinon) |
| `PATCH` | `/api/v1/alerts/read-all` | `{ updated }` — toutes les non-lues |
| `POST` | `/api/v1/devices` | Enregistre/upsert un token FCM (201 ; 409 si token d'un autre user) |
| `DELETE` | `/api/v1/devices/:token` | Révocation logique (204) |

### Endpoints internes (X-Internal-Token, NON routés par la gateway)

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/internal/alerts` | Ingestion d'une alerte résolue (farm-service). 201 créée · 409 dédup (< 24 h même user+parcelle+type+sévérité) · 401 token invalide |

### Santé & métriques (direct, sans gateway)

`GET /health` · `GET /health/ready` · `GET /metrics`

## 7. Fonctionnement interne par fichier

- **`alert-dispatcher.service.ts`** — cœur du service. `dispatch(dto)` : (1) `findOne` dédup fenêtre 24 h incluant la **sévérité** dans la clé (l'alerte rouge 24 h n'est jamais bloquée par la légère 2 h) → `ConflictException` (409) si doublon ; (2) persistance avec title par défaut par type (FR) ; (3) `void this.distribute(alert)` en fire-and-forget (FCM puis publication outbound avec le statut de distribution).
- **`recommendations.consumer.ts`** — copie du pattern `SyncConsumerService` de recommendation-service : kafkajs brut, `fromBeginning: false`, auto-commit, producer DLQ non-fatal, validation class-validator, métriques par statut (`ok`/`invalid`/`error`/`skipped_no_owner`), dégradation gracieuse si Kafka down.
- **`hydric-stress.rule.ts`** — classe pure statique : déclenche si `should_irrigate && proba ≥ seuil && humidité_sol ≤ seuil`. Champ `soil_humidity_pct` absent → non (défaut sûr).
- **`farm-client.service.ts`** — circuit breaker maison (5 échecs / reset 30 s, copie de recommendation-service) ; 404 = `null` (réponse métier, pas comptée) ; header `X-Internal-Token`.
- **`fcm.channel.ts`** — `initializeApp` au boot si les 3 `FIREBASE_*` sont présents, sinon mode désactivé (`fcm_enabled 0`) ; `sendEachForMulticast` ; **révocation automatique** des tokens `UNREGISTERED`/`INVALID_ARGUMENT` ; jamais d'exception (`'error'` en retour).
- **`alerts-outbound.publisher.ts`** — producer kafkajs connecté non-fatalement au boot ; payload = alerte + `distribution: { fcm }`.
- **`devices.service.ts`** — upsert par token (unique en base) : réenregistrement = `last_seen_at` + réactivation ; token d'un autre user → 409 ; `getActiveTokens(userId)` pour FCM.
- **`alerts.service.ts`** — lecture user-scopée stricte (403 si alerte d'un autre user), `markRead` idempotent, `markAllRead` par `update` en masse.

## 8. Authentification et sécurité

- **Routes publiques** : `JwtAuthGuard` (HS256, `sub` → `userId`), isolation par utilisateur sur TOUTES les lectures/écritures.
- **Routes internes** `/internal/*` : `InternalTokenGuard` — header `X-Internal-Token` comparé à `process.env.INTERNAL_TOKEN` ; si la variable est vide la garde laisse passer (isolation réseau Docker en dev, le préfixe `/internal` n'est jamais routé par la gateway).
- Clé de dédup incluant la sévérité : un émetteur légitime ne peut pas spammer, chaque niveau vit sa fenêtre 24 h.
- Les tokens FCM appartiennent à un seul utilisateur (contrainte UNIQUE + 409).

## 9. Modèle de données (PostgreSQL)

Base `notification_db` (rôle `notify_user`), schéma `infra/postgres/schemas/notification-db.sql`.

### Table `alerts`

| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID | Destinataire (pas de FK cross-base) |
| `parcel_id` | UUID NULL | Contexte parcelle |
| `alert_type` | `alert_type_enum` | 8 valeurs (3 utilisées en S5) |
| `severity` | `alert_severity_enum` | `info` / `warning` / `critical` |
| `status` | `alert_status_enum` | `unread` / `read` / `resolved` |
| `title` | VARCHAR(255) NULL | Généré par défaut si absent |
| `message` | TEXT | FR (localisation = évolution) |
| `data` | JSONB DEFAULT '{}' | Contexte structuré (deviceId, silentHours, seuils…) |
| `read_at` | TIMESTAMPTZ NULL | CHECK `read_at IS NULL OR status <> 'unread'` |
| `created_at` / `updated_at` | TIMESTAMPTZ | Trigger `updated_at` |

Index : `(user_id, created_at DESC)` (liste paginée), `(user_id, status)` (unread-count), `parcel_id`, `alert_type`.

### Table `device_tokens`

| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | |
| `token` | VARCHAR(255) UNIQUE | Token FCM |
| `platform` | VARCHAR(20) | `android` / `ios` / `web` (CHECK) |
| `created_at` / `last_seen_at` | TIMESTAMPTZ | `last_seen_at` mis à jour à chaque upsert |
| `revoked_at` | TIMESTAMPTZ NULL | NULL = actif (révocation logique) |

Index partiel `(user_id) WHERE revoked_at IS NULL`.

## 10. Logique métier implémentée

- **Déduplication fenêtre glissante** : `DEDUP_WINDOW_HOURS` (24 h) par `(user_id, parcel_id, alert_type, severity)` via `findOne` applicatif. Un capteur silencieux est notifié au max 1×/24 h par niveau.
- **Règle hydrique** : les seuils appartiennent à la NOTIFICATION, pas au ML — le modèle produit la probabilité, ce service décide d'alerter. `soil_humidity_pct` absent → pas de déclenchement (défaut sûr).
- **Résolution d'ownership** : farm-service pousse `ownerId` résolu ; pour le flux Kafka, `GET /internal/parcels/:parcelId/owner` (404 → skip silencieux compté `skipped_no_owner`, pas de DLQ).
- **Cycle de vie device tokens** : upsert idempotent, réactivation après révocation, purge automatique des tokens morts signalés par FCM.
- **Messages FR + `data` JSONB** : la localisation par langue utilisateur (darija/arabe via auth-service) est une évolution — le contexte structuré est déjà stocké.

## 11. Consumer Kafka et pipeline d'alertes

```
recommendations-generated (3 partitions, 24 h)
  │  group alert-service-group · fromBeginning: false · auto-commit
  ▼
handleMessage :
  JSON invalide        → métrique invalid + DLQ alerts-dlq
  DTO invalide         → métrique invalid + DLQ
  Règle non déclenchée → métrique ok (message sain, pas d'alerte)
  Parcelle inconnue    → métrique skipped_no_owner (pas de DLQ)
  farm-service down    → métrique error + DLQ (replay manuel possible)
  Dispatch             → métrique ok ; ConflictException (dédup) = ok
                          autre erreur → métrique error + recordPersistenceError + DLQ
```

`alerts-dlq` (3 partitions, 7 j) est **dédiée** à ce consumer — ne pas partager `recommendations-generated-dlq` (appartient au consumer de recommendation-service) pour distinguer la provenance.

Sémantique at-most-once (auto-commit), sans perte grâce à la DLQ.

## 12. Observabilité (métriques Prometheus)

| Métrique | Type | Labels |
|---|---|---|
| `alert_http_requests_total` | counter | method, route, status |
| `alert_http_request_duration_ms_avg` | gauge | — |
| `alert_kafka_messages_consumed_total` | counter | status = ok / invalid / error / skipped_no_owner |
| `alert_kafka_consumer_connected` | gauge | — |
| `alert_kafka_dlq_total` | counter | — |
| `alerts_outbound_published_total` | counter | — |
| `alerts_created_total` | counter | type |
| `alerts_dedup_skipped_total` | counter | type |
| `alert_persistence_errors_total` | counter | — |
| `fcm_enabled` | gauge | 0/1 |
| `fcm_sent_total` / `fcm_failed_total` | counter | — |

Scrapé par Prometheus (job `alert-service`, `alert-service:3006/metrics`, interval 5 s). Format texte maison (pattern MetricsService, pas de prom-client).

## 13. Gestion des erreurs

- `AllExceptionsFilter` global : JSON normalisé `{ statusCode, message, path, timestamp }` (FR).
- Toute erreur de distribution (FCM, publisher) est attrapée et loggée — l'alerte in-app reste créée.
- Kafka down au démarrage : le service démarre quand même (`degraded`), consumer désactivable via `KAFKA_CONSUMER_ENABLED=false`.
- farm-service injoignable : circuit breaker → 503 côté client interne, messages en DLQ.

## 14. Health checks

- `GET /health` (liveness) : statique.
- `GET /health/ready` : `SELECT 1` + flag consumer `isConnected()` → `{ status: 'ok' | 'degraded', dependencies: { database, kafka } }` — jamais de non-200 (le healthcheck Docker vérifie la joignabilité HTTP). Le conteneur démarre même dégradé.

## 15. Tests

10 suites jest (`tests/` plat, ts-jest, mocks `getRepositoryToken`/`HttpService`, handlers privés appelés par cast — jamais de broker Kafka ni de DB réelle) :

`alert-dispatcher` (dédup, fan-out non bloquant, titres par défaut, sévérités distinctes) · `hydric-stress.rule` (matrice seuils + bornes) · `recommendations.consumer` (invalid/ok/skipped/dédup/erreur) · `farm-client` (200/404/réseau, breaker 5→OPEN→reset 30 s) · `fcm.channel` (désactivé, no-tokens, envoi, révocation token mort, échec sans throw) · `alerts.service` (isolation 403/404, idempotence) · `alerts.controller` · `internal-alerts.controller` (+ guard 401) · `devices.service` (upsert, 409, révocation) · `health.controller` (matrice up/degraded).

```bash
npm run test --workspace=@alkatra/alert-service -- --coverage
```

## 16. Docker

Dockerfile 4 stages (contexte = racine du repo, cf. recommendation-service) : `deps` (filtre workspaces) → `builder` (shared-types puis service, prune) → `development` (hot reload, volume `src/`) → `runner` (non-root `nestjs`, `TZ=Africa/Casablanca`, healthcheck wget `/health/ready`, `node dist/src/main.js`).

Compose : service `alert-service` (conteneur `alkatra-alert`, profil `phase1`, port 3006, `depends_on` postgres/kafka/farm-service healthy). La gateway dépend d'alert-service healthy.

## 17. Ce que le service NE fait PAS

- Pas de SMS (Phase 2 — le topic `alerts-outbound` prépare la passerelle) ;
- pas de WebSocket/SSE (le frontend poll) ;
- pas d'alerte « capteur de retour en ligne » (pas dans l'enum) ;
- pas de localisation multi-langue des messages (FR stocké, `data` JSONB prêt) ;
- n'émet pas lui-même la détection capteur — il consomme les événements de farm-service (le propriétaire de l'information) ;
- n'expose aucun endpoint d'administration des seuils (env uniquement).

## 18. Comportements notables

- Le **409** de `POST /internal/alerts` est un signal de dédup, pas une erreur : farm-service le tolère silencieusement.
- Le fan-out est **fire-and-forget** : la latence FCM (jusqu'à plusieurs secondes) ne bloque jamais le cycle farm-service ni le consumer Kafka.
- `pending` (capteur jamais vu) ne génère jamais d'alerte — la détection appartient à farm-service (voir guide farm-service).
- Un token FCM révoqué manuellement peut être **réactivé** par ré-enregistrement (réinstallation d'app).
- E2E : `scripts/e2e-sprint5-alerts.sh` (machine à états capteur incluse — voir §19).

## 19. Résumé opérationnel

```bash
# Stack
npm run docker:up-phase1
curl -s http://localhost:3006/health/ready | jq .

# E2E complet (prérequis : SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES=1 dans .env)
bash scripts/e2e-sprint5-alerts.sh

# Ingestion interne manuelle (simule farm-service)
curl -X POST http://localhost:3006/internal/alerts \
  -H "Content-Type: application/json" \
  -d '{"alertType":"low_battery","userId":"<uuid>","parcelId":null,
       "severity":"warning","message":"Batterie à 12 %."}'

# Métriques
curl -s http://localhost:3006/metrics | grep -E "alerts_created|fcm_enabled"

# DLQ (messages en échec)
docker exec alkatra-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server kafka:9092 --topic alerts-dlq --from-beginning
```

Sources de vérité : `apps/alert-service/src/` (code), `infra/postgres/schemas/notification-db.sql` (DDL), `design_alert.md` (design Sprint 5).
