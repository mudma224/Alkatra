# `apps/farm-service` — Documentation factuelle

> Cette documentation décrit le code source, la configuration et les tests de `farm-service`. Elle s'appuie uniquement sur le code implémenté, pas sur les commentaires.

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
11. [Validation des entrées (DTOs)](#11-validation-des-entrées-dtos)
12. [Gestion des erreurs](#12-gestion-des-erreurs)
13. [Health checks](#13-health-checks)
14. [Tests](#14-tests)
15. [Docker](#15-docker)
16. [Configuration TypeScript et Jest](#16-configuration-typescript-et-jest)
17. [Ce que le service NE fait PAS](#17-ce-que-le-service-ne-fait-pas)
18. [Comportements notables](#18-comportements-notables)
19. [Résumé opérationnel](#19-résumé-opérationnel)

---

## 1. Rôle du service

`farm-service` est un microservice REST NestJS chargé de gérer le cycle de vie des **fermes**, **parcelles** et **capteurs IoT** d'une plateforme agricole. Il assure l'isolation des données par propriétaire et la cohérence métier entre fermes et parcelles.

**Ce qu'il fait :**

- Il gère le CRUD complet des fermes (création, lecture, modification, suppression)
- Il gère le CRUD complet des parcelles (création, lecture par ferme, modification, suppression)
- Il gère l'association de capteurs IoT à des parcelles (`POST /associate`) ainsi que leur dissociation (`DELETE /:sensorId`) et leur listing par parcelle (`GET /parcel/:parcelId`)
- Il reçoit les heartbeats des capteurs depuis `iot-service` (endpoint interne `PATCH /internal/sensors/:deviceId/seen` : `last_seen_at`, `health_status = 'active'`, batterie, firmware)
- Il pilote la **machine à états de santé des capteurs** (`SensorActivityService`, cycle configurable) : silence > `SENSOR_INACTIVE_HOURS` (2 h par défaut) → `inactive` (notification légère), silence > `SENSOR_FAILING_HOURS` (24 h par défaut) → `failing` (alerte critique) — seuils configurables par variable d'environnement
- Il notifie `alert-service` des événements capteurs (silencieux, défaillant, batterie faible) via `POST /internal/alerts`, et résout une parcelle vers son propriétaire pour les autres services (`GET /internal/parcels/:parcelId/owner`)
- Il vérifie l'existence d'un utilisateur auprès de `auth-service` avant la création d'une ferme
- Il valide la cohérence des surfaces : la somme des parcelles ne peut pas dépasser la surface de la ferme
- Il empêche la suppression d'une ferme qui possède des parcelles
- Il empêche le « vol » de capteur entre utilisateurs (association, réassociation et dissociation)
- Il expose deux endpoints de santé (liveness + readiness avec test DB)
- Il authentifie toutes les requêtes métier via JWT (sauf health et endpoints internes)

**Ce qu'il ne fait PAS :**

- ❌ Il n'ingère pas de données de mesures capteurs (température, humidité, etc.) — il ne conserve que l'état d'activité du capteur (heartbeat)
- ❌ Il n'a pas de pagination sur les listes
- ❌ Il n'a pas de métriques Prometheus
- ❌ Il n'a pas de tests d'intégration (uniquement des tests unitaires avec mocks)
- ❌ Il ne crée pas le schéma DB automatiquement (`synchronize: false`)

---

## 2. Architecture et flux

### Flux d'authentification et création de ferme

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │ farm-service │     │  auth-   │     │PostgreSQL │
│ (mobile/ │     │   (NestJS)   │     │ service  │     │  farm_db  │
│   web)   │     │              │     │          │     │           │
└────┬─────┘     └──────┬───────┘     └────┬─────┘     └─────┬─────┘
     │                  │                  │                 │
     │ 1. POST /farms   │                  │                 │
     │    Authorization:│                  │                 │
     │    Bearer <JWT>  │                  │                 │
     │    { name, ... } │                  │                 │
     │─────────────────▶│                  │                 │
     │                  │ 2. JwtStrategy   │                 │
     │                  │    valide token  │                 │
     │                  │    → { userId }  │                 │
     │                  │ 3. verifyUserExists(userId)        │
     │                  │─────────────────▶│                 │
     │                  │    GET /internal/user/:userId      │
     │                  │◀─────────────────│                 │
     │                  │ 4. INSERT farm   │                 │
     │                  │    ownerId=userId│                 │
     │                  │──────────────────────────────────▶│
     │                  │ 5. { id, name, ownerId, ... }      │
     │◀─────────────────│                  │                 │
```

### Architecture des dépendances

```
farm-service (port 3003)
│
├── PostgreSQL — farm_db (via TypeORM)
│   ├── Table: farms
│   ├── Table: parcels
│   └── Table: sensors (health_status : machine à états)
│
├── auth-service (via HTTP, @nestjs/axios)
│   └── GET /internal/user/:userId → vérification existence utilisateur
│
└── alert-service (via fetch natif, best-effort)
    ├── POST /internal/alerts → notifications capteurs (silencieux/défaillant/batterie)
    └── appelé par alert-service : GET /internal/parcels/:parcelId/owner
```

### Hiérarchie des données

```
User (auth-service)
 └── Farm (ownerId = user.id)
      └── Parcel (farmId = farm.id)
           └── Sensor (parcelId = parcel.id)
```

---

## 3. Arborescence complète

```
apps/farm-service/
├── .env.example                          # Modèle de variables d'environnement
├── Dockerfile                            # Build multi-stage (deps → builder → runner)
├── jest.config.js                        # Configuration Jest (ts-jest, coverage)
├── package.json                          # Dépendances et scripts NestJS
├── tsconfig.json                         # Configuration TypeScript (étend la racine)
│
├── src/
│   ├── main.ts                           # Point d'entrée NestJS (CORS, ValidationPipe, filtre global)
│   ├── app.module.ts                     # Module racine (imports tous les modules)
│   │
│   ├── config/
│   │   └── configuration.ts              # Configuration centralisée (registerAs 'app')
│   │
│   ├── database/
│   │   ├── database.module.ts            # Module TypeORM (connexion PostgreSQL)
│   │   └── entities/
│   │       ├── farm.entity.ts            # Entité Farm (table farms)
│   │       ├── parcel.entity.ts          # Entité Parcel (table parcels)
│   │       └── sensor.entity.ts          # Entité Sensor (table sensors)
│   │
│   ├── auth/
│   │   ├── auth-client.module.ts         # Module client auth (HttpModule + Passport)
│   │   └── auth-client.service.ts        # Service d'appel HTTP vers auth-service
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts # Décorateur @CurrentUser()
│   │   │   └── index.ts                  # Barrel export
│   │   ├── filters/
│   │   │   ├── all-exceptions.filter.ts  # Filtre d'erreurs global (format JSON français)
│   │   │   └── index.ts                  # Barrel export
│   │   ├── guards/
│   │   │   ├── internal-token.guard.ts  # Guard endpoints internes (token optionnel X-Internal-Token)
│   │   │   └── jwt-auth.guard.ts         # Guard JWT (extends AuthGuard('jwt'))
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts           # Stratégie Passport JWT (extraction Bearer)
│   │   ├── types/
│   │   │   └── geojson.ts                # Types GeoJsonPoint, GeoJsonPolygon, GeoJsonPosition
│   │   └── validators/                   # (vide — aucun fichier)
│   │
│   └── modules/
│       ├── farms/
│       │   ├── farms.controller.ts       # Controller /api/v1/farms (CRUD)
│       │   ├── farms.module.ts           # Module farms
│       │   ├── farms.service.ts          # Service farms (logique métier + vérif auth)
│       │   └── dto/
│       │       ├── create-farm.dto.ts    # DTO création ferme
│       │       └── update-farm.dto.ts    # DTO modification ferme
│       │
│       ├── parcels/
│       │   ├── parcels.controller.ts     # Controller /api/v1/parcels (CRUD)
│       │   ├── parcels.module.ts         # Module parcels
│       │   ├── parcels.service.ts        # Service parcels (logique + cohérence surfaces)
│       │   ├── internal-parcels.controller.ts # Controller /internal/parcels (résolution owner pour alert-service)
│       │   └── dto/
│       │       ├── create-parcel.dto.ts  # DTO création parcelle
│       │       └── update-parcel.dto.ts  # DTO modification parcelle
│       │
│       ├── sensors/
│       │   ├── internal-sensors.controller.ts  # Controller /internal/sensors (heartbeat iot-service)
│       │   ├── sensors.controller.ts     # Controller /api/v1/sensors (associate, list, dissociate)
│       │   ├── sensors.module.ts         # Module sensors
│       │   ├── sensors.service.ts        # Service sensors (association/dissociation/heartbeat)
│       │   ├── sensor-activity.service.ts # Machine à états santé capteurs (seuils configurables)
│       │   ├── alert-notifier.service.ts # Notifications capteurs → alert-service (best-effort)
│       │   └── dto/
│       │       ├── associate-sensor.dto.ts  # DTO association capteur
│       │       └── sensor-heartbeat.dto.ts  # DTO heartbeat capteur (interne)
│       │
│       │
│       └── health/
│           └── health.controller.ts      # Controller health (live + ready)
│
└── test/
    ├── farms.controller.spec.ts          # Tests unitaires du FarmsController
    ├── parcels.service.spec.ts           # Tests unitaires du ParcelsService
    ├── sensor-activity.service.spec.ts   # Tests unitaires du SensorActivityService
    └── sensors.service.spec.ts           # Tests unitaires du SensorsService
```

> **Note :** Le dossier `src/` ne contient que les fichiers source `.ts`. Les artefacts de compilation TypeScript (`.js`, `.d.ts`, `.js.map`) sont générés dans `dist/` par `nest build`.

---

## 4. Démarrage

### Depuis le package du service

```bash
cd apps/farm-service

npm run build          # nest build
npm run start          # nest start
npm run start:dev      # nest start --watch (hot reload)
npm run start:prod     # node dist/main
npm run lint           # eslint "{src,test}/**/*.ts" --fix
npm run format         # prettier --write "src/**/*.ts" "test/**/*.ts"
npm run test           # jest
npm run test:watch     # jest --watch
npm run test:cov       # jest --coverage
npm run test:debug     # node --inspect-brk ... jest --runInBand
```

### Depuis la racine du monorepo

```bash
npm run dev            # Lance tous les workspaces via Turbo
```

### Prérequis

- PostgreSQL avec une base `farm_db` et le schéma `farms`, `parcels`, `sensors` déjà créé (`synchronize: false`)
- `auth-service` accessible à l'URL configurée (défaut : `http://auth-service:3001`)
- `JWT_SECRET` identique à celui utilisé par `auth-service`

---

## 5. Variables d'environnement

### Configuration centralisée (`src/config/configuration.ts`)

La configuration utilise `registerAs('app')` et expose une interface `AppConfig` typée.

```typescript
export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  authServiceUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
}
```

### Logique de parsing de la configuration DB

Le code implémente un **double mode de configuration** de la base de données :

1. **Si `DATABASE_URL` est définie** : l'URL est parsée avec `new URL()` pour extraire `hostname`, `port`, `username`, `password`, et `pathname` (nom de la base).
2. **Variables individuelles** (`POSTGRES_HOST`, `FARM_DB_USER`, etc.) : prennent le dessus sur les valeurs issues de `DATABASE_URL`.

### Tableau récapitulatif

| Variable | Défaut | Utilisation |
|----------|--------|-------------|
| `PORT` | `3003` | Port d'écoute du service |
| `NODE_ENV` | `development` | Environnement (active le logging SQL si ≠ `production`) |
| `DATABASE_URL` | (vide) | URL PostgreSQL (parsée si présente) |
| `POSTGRES_HOST` | `postgres` (ou hostname de `DATABASE_URL`) | Hôte PostgreSQL |
| `POSTGRES_PORT` | `5432` (ou port de `DATABASE_URL`) | Port PostgreSQL |
| `FARM_DB_USER` | `farm_user` (ou username de `DATABASE_URL`) | Utilisateur PostgreSQL |
| `FARM_DB_PASSWORD` | `farm_dev_pass` (ou password de `DATABASE_URL`) | Mot de passe PostgreSQL |
| `FARM_DB_NAME` | `farm_db` (ou pathname de `DATABASE_URL`) | Nom de la base |
| `AUTH_SERVICE_URL` | `http://auth-service:3001` | URL du service d'authentification |
| `ALERT_SERVICE_URL` | `http://alert-service:3006` | URL d'alert-service (notifications capteurs) |
| `JWT_SECRET` | `CHANGE_ME_IN_PRODUCTION` | Secret JWT (doit être identique à auth-service) |
| `CORS_ORIGINS` | `http://localhost:3000` | Origines CORS autorisées (séparées par virgules) |
| `INTERNAL_TOKEN` | (vide) | Si définie, exigée par les endpoints `/internal/*` via le header `X-Internal-Token` (heartbeat iot-service, résolution owner par alert-service). Absente → isolation par le réseau Docker uniquement. |
| `LOW_BATTERY_THRESHOLD` | `20` | Seuil (%) de batterie faible — alerte `low_battery` |
| `SENSOR_INACTIVE_HOURS` | `2` | Silence (heures, **décimales acceptées** : `0.05` = 3 min) au-delà duquel un capteur `active` passe `inactive` + notification légère |
| `SENSOR_FAILING_HOURS` | `24` | Silence (heures) au-delà duquel un capteur `inactive` est escaladé `failing` + alerte critique. Doit rester strictement supérieur à `SENSOR_INACTIVE_HOURS` (validé au démarrage) |
| `SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES` | `15` | Cadence du cycle de santé (minutes, ≥ 1) |

### Fichier `.env.example`

```env
PORT=3003
NODE_ENV=development
DATABASE_URL=postgresql://farm_user:farm_dev_pass@postgres:5432/farm_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
FARM_DB_USER=farm_user
FARM_DB_PASSWORD=farm_dev_pass
FARM_DB_NAME=farm_db
AUTH_SERVICE_URL=http://auth-service:3001
JWT_SECRET=change_me_in_production_use_32_chars_minimum
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
```

> ⚠️ `JWT_SECRET` doit être **identique** à celui utilisé par `auth-service` pour que la validation des tokens fonctionne.

---

## 6. Routes HTTP

Toutes les routes métier sont préfixées par `/api/v1/` et protégées par `JwtAuthGuard`, sauf les endpoints de santé.

### Farms — `/api/v1/farms` (protégé JWT)

| Méthode | Route | DTO | Comportement |
|---------|-------|-----|-------------|
| `POST` | `/` | `CreateFarmDto` | Crée une ferme. **Vérifie via auth-service que l'utilisateur existe** (sinon 404). Assigne `ownerId = userId` du token JWT. |
| `GET` | `/` | — | Liste les fermes de l'utilisateur connecté (`WHERE ownerId = userId`), avec relations `parcels`. |
| `GET` | `/:id` | — | Récupère une ferme par ID avec relations `parcels`. **404** si introuvable, **403** si `ownerId !== userId`. |
| `PATCH` | `/:id` | `UpdateFarmDto` | Modifie une ferme (après vérification de propriété via `findOne`). |
| `DELETE` | `/:id` | — | Supprime une ferme. **Refuse si des parcelles existent** (compte les parcelles → 409 CONFLICT si > 0). |

### Parcels — `/api/v1/parcels` (protégé JWT)

| Méthode | Route | DTO | Comportement |
|---------|-------|-----|-------------|
| `POST` | `/` | `CreateParcelDto` | Crée une parcelle. Vérifie : (1) la ferme appartient à l'utilisateur, (2) **la somme des surfaces des parcelles + la nouvelle ne dépasse pas `totalAreaHa`** de la ferme (sinon 422). |
| `GET` | `/farm/:farmId` | — | Liste les parcelles d'une ferme (vérifie propriété de la ferme → 404 si non autorisé). **Relation `sensors` incluse** dans chaque parcelle. |
| `GET` | `/:id` | — | Récupère une parcelle avec relations `farm` **et `sensors`**. **404** si introuvable, **403** si `farm.ownerId !== userId`. |
| `PATCH` | `/:id` | `UpdateParcelDto` | Modifie une parcelle. Si `areaHa` change, **re-vérifie la cohérence des surfaces** (422 si dépassement). |
| `DELETE` | `/:id` | — | Supprime une parcelle (après vérification de propriété). Les capteurs liés sont supprimés en cascade par la base. |

### Sensors — `/api/v1/sensors` (protégé JWT)

| Méthode | Route | DTO | Comportement |
|---------|-------|-----|-------------|
| `POST` | `/associate` | `AssociateSensorDto` | Associe ou réassocie un capteur (`deviceId`) à une parcelle (`parcelId`). Voir [logique détaillée](#logique-dassociation-sensorsserviceassociate). |
| `GET` | `/parcel/:parcelId` | — | Liste les capteurs d'une parcelle (vérifie propriété via `parcel.farm.ownerId` → 404 / 403). |
| `DELETE` | `/:sensorId` | — | Dissocie un capteur : supprime la ligne SQL (les mesures MongoDB, clé `device_id`, sont conservées). Vérifie que la parcelle porteuse appartient à l'utilisateur (404 / 403). |

### Internal sensors — `/internal/sensors` (non routé par la gateway, `InternalTokenGuard`)

| Méthode | Route | DTO | Comportement |
|---------|-------|-----|-------------|
| `PATCH` | `/:deviceId/seen` | `SensorHeartbeatDto` | Heartbeat appelé par `iot-service` à chaque message `raw-sensor-data`. Met à jour `last_seen_at = now()`, `health_status = 'active'` (quel que soit l'état précédent), et `batteryPct` / `firmwareVersion` si fournis. **404** si le `deviceId` est inconnu. |

### Internal parcels — `/internal/parcels` (non routé par la gateway, `InternalTokenGuard`)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/:parcelId/owner` | Résout une parcelle vers son propriétaire : `{ parcelId, farmId, ownerId }`. Utilisé par alert-service pour le flux Kafka (recommandations critiques sans contexte utilisateur). **404** si parcelle inconnue. |

### Health — non protégé

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/api/v1/health/live` | Retourne `{ status: 'ok', service: 'farm-service', timestamp }` |
| `GET` | `/api/v1/health/ready` | Exécute `SELECT 1` sur la DB. Retourne `database: 'connected'` ou `'disconnected'`. |

---

## 7. Fonctionnement interne par fichier

### Détail par fichier source

| Fichier | Rôle |
|---------|-----------|
| `src/main.ts` | Point d'entrée NestJS. Active CORS (origines depuis `CORS_ORIGINS`, méthodes GET/POST/PUT/PATCH/DELETE/OPTIONS, credentials). Active `ValidationPipe` global (`whitelist`, `transform`, `forbidNonWhitelisted`, `enableImplicitConversion`). Active `AllExceptionsFilter` global. Active les shutdown hooks. Démarre sur le port `process.env.PORT` ou 3003. |
| `src/app.module.ts` | Module racine. Importe `ConfigModule` (global, `load: [appConfig]`), `DatabaseModule`, `AuthClientModule`, `FarmsModule`, `ParcelsModule`, `SensorsModule`. Déclare `HealthController`. Fournit `AllExceptionsFilter` comme `APP_FILTER` global. |
| `src/config/configuration.ts` | Configuration centralisée via `registerAs('app')`. Parse `DATABASE_URL` avec `new URL()` si présente. Expose `port`, `nodeEnv`, `database` (host, port, username, password, name), `authServiceUrl`, `jwtSecret`, `corsOrigins`. |
| `src/database/database.module.ts` | Module TypeORM. Configure `TypeOrmModule.forRootAsync` avec `type: 'postgres'`, host/port/user/password/database depuis la config. Entités : `[Farm, Parcel, Sensor]`. `synchronize: false`. Logging SQL si `nodeEnv !== 'production'`. Exporte `TypeOrmModule`. |
| `src/database/entities/farm.entity.ts` | Entité `Farm` mappée à la table `farms`. Voir [modèle de données](#9-modèle-de-données-postgresql). |
| `src/database/entities/sensor.entity.ts` | Entité `Sensor` mappée à la table `sensors`. `deviceId` unique. Voir [modèle de données](#9-modèle-de-données-postgresql). |
| `src/auth/auth-client.module.ts` | Module client auth. Importe `ConfigModule`, `PassportModule` (stratégie `jwt`), `HttpModule` (timeout 5000ms). Déclare `AuthClientService` et `JwtStrategy`. Exporte `AuthClientService` et `PassportModule`. |
| `src/auth/auth-client.service.ts` | Service d'appel HTTP vers `auth-service`. `verifyUserExists(userId)` : GET `/internal/user/:userId` → `true` si 200, `false` si 404, throw 503 sinon. `getUserInfo(userId)` : retourne `AuthUserInfo` ou `null`. Interface `AuthUserInfo` : `{ id, phone, name, preferredLanguage }`. |
| `src/common/strategies/jwt.strategy.ts` | Stratégie Passport JWT. Extrait le token du header `Authorization: Bearer`. `ignoreExpiration: false`. Secret depuis `app.jwtSecret`. `validate()` vérifie `payload.sub` (sinon 401) et retourne `{ userId: payload.sub, phone: payload.phone }`. Interfaces : `JwtPayload` (`sub`, `phone?`, `iat?`, `exp?`), `AuthenticatedUser` (`userId`, `phone?`). |
| `src/common/guards/jwt-auth.guard.ts` | Guard JWT. `extends AuthGuard('jwt')`. Log la tentative d'accès (méthode, URL, IP). `handleRequest()` : throw si erreur, throw 401 si pas d'utilisateur, retourne l'utilisateur sinon. |
| `src/common/decorators/current-user.decorator.ts` | Décorateur `@CurrentUser()`. `createParamDecorator` qui extrait `request.user`. Si `data` est fourni (ex: `'userId'`), retourne la propriété correspondante. Interface `CurrentUserPayload` : `{ userId, phone? }`. |
| `src/common/filters/all-exceptions.filter.ts` | Filtre d'erreurs global. Capture toutes les exceptions. Pour `HttpException` : extrait status, message, errorCode, details. Pour `Error` : 500, `INTERNAL_ERROR`. Format de réponse : `{ statusCode, errorCode, message, details?, timestamp, path, method }`. Map status → errorCode (400→BAD_REQUEST, 401→UNAUTHORIZED, etc.). |
| `src/common/types/geojson.ts` | Types TypeScript pour GeoJSON. `GeoJsonPosition` : `[number, number]` ou `[number, number, number]`. `GeoJsonPoint` : `{ type: 'Point', coordinates: GeoJsonPosition }`. `GeoJsonPolygon` : `{ type: 'Polygon', coordinates: GeoJsonPosition[][] }`. |
| `src/modules/farms/farms.module.ts` | Module farms. Importe `TypeOrmModule.forFeature([Farm, Parcel])` et `AuthClientModule`. Déclare `FarmsController` et `FarmsService`. Exporte `FarmsService`. |
| `src/modules/farms/farms.controller.ts` | Controller `/api/v1/farms`. `@UseGuards(JwtAuthGuard)`. 5 endpoints : POST (create), GET (findAll), GET/:id (findOne), PATCH/:id (update), DELETE/:id (remove). Utilise `@CurrentUser()` pour obtenir `userId`. |
| `src/modules/farms/farms.service.ts` | Service farms. `create()` : vérifie l'utilisateur via `authClient.verifyUserExists()`, crée la ferme avec `ownerId = userId`. `findAllByOwner()` : `find({ where: { ownerId }, relations: { parcels: true } })`. `findOne()` : 404 si introuvable, 403 si pas propriétaire. `update()` : via `findOne` + `Object.assign` + `save`. `remove()` : compte les parcelles, 409 si > 0, sinon `remove`. |
| `src/modules/farms/dto/create-farm.dto.ts` | DTO création ferme. Valide `name` (string, max 150), `totalAreaHa` (number, min 0.01), `region` (optionnel, string, max 100), `location` (optionnel, `GeoJsonPointDto` validé). |
| `src/modules/farms/dto/update-farm.dto.ts` | DTO modification ferme. Tous les champs sont optionnels : `name?`, `totalAreaHa?`, `region?`, `location?`. |
| `src/modules/parcels/parcels.module.ts` | Module parcels. Importe `TypeOrmModule.forFeature([Parcel, Farm])`. Déclare `ParcelsController` et `ParcelsService`. Exporte `ParcelsService`. |
| `src/modules/parcels/parcels.controller.ts` | Controller `/api/v1/parcels`. `@UseGuards(JwtAuthGuard)`. 5 endpoints : POST (create), GET/farm/:farmId (findByFarm), GET/:id (findOne), PATCH/:id (update), DELETE/:id (remove). |
| `src/modules/parcels/parcels.service.ts` | Service parcels. `create()` : vérifie propriété ferme, vérifie cohérence des surfaces (somme + nouvelle ≤ totalAreaHa), crée avec mapping explicite. `findAllByFarm()` : vérifie propriété ferme, retourne les parcelles **avec relation `sensors`**. `findOne()` : 404 si introuvable, 403 si pas propriétaire via `parcel.farm.ownerId`, relations `farm` + `sensors`. `update()` : si `areaHa` change, re-vérifie cohérence. `remove()` : supprime après vérification. |
| `src/modules/parcels/dto/create-parcel.dto.ts` | DTO création parcelle. Valide `farmId` (UUID), `name` (string, max 150), `areaHa` (number, min 0.01), `cropType` (enum), `soilType` (enum), `irrigationMethod` (enum), + champs optionnels. |
| `src/modules/parcels/dto/update-parcel.dto.ts` | DTO modification parcelle. Tous les champs optionnels (pas de `farmId` — la parcelle ne change pas de ferme). |
| `src/modules/sensors/sensors.module.ts` | Module sensors. Importe `TypeOrmModule.forFeature([Sensor, Parcel])`. Déclare `SensorsController`, `InternalSensorsController`, `SensorsService`, `SensorActivityService` et `AlertNotifierService`. Exporte `SensorsService`. |
| `src/modules/sensors/sensors.controller.ts` | Controller `/api/v1/sensors`. `@UseGuards(JwtAuthGuard)`. 3 endpoints : POST `/associate`, GET `/parcel/:parcelId`, DELETE `/:sensorId`. |
| `src/modules/sensors/internal-sensors.controller.ts` | Controller `/internal/sensors`. `@UseGuards(InternalTokenGuard)` (pas de JWT — réservé au réseau interne des services). 1 endpoint : PATCH `/:deviceId/seen` (heartbeat iot-service). |
| `src/modules/parcels/internal-parcels.controller.ts` | Controller `/internal/parcels`. `@UseGuards(InternalTokenGuard)`. 1 endpoint : GET `/:parcelId/owner` (résolution parcelle → propriétaire pour alert-service). |
| `src/modules/sensors/sensors.service.ts` | Service sensors. `associate()` : vérifie propriété parcelle, cherche capteur par `deviceId`, gère création/réassociation/idempotence (nouveau capteur ou réassociation → `health_status = 'pending'`). `findByParcel()` : liste avec vérification de propriété. `dissociate()` : supprime la ligne après garde anti-vol. `recordHeartbeat()` : `last_seen_at` + `health_status = 'active'` + batterie/firmware si fournis. |
| `src/modules/sensors/sensor-activity.service.ts` | Machine à états de santé (cycle `setInterval` à cadence configurable + premier passage au démarrage). `deactivateSilentSensors()` : capteurs `active` silencieux > `SENSOR_INACTIVE_HOURS` → `inactive` + notification légère. `escalateToFailingSensors()` : capteurs `inactive` silencieux > `SENSOR_FAILING_HOURS` → `failing` + alerte critique. `notifyLowBatterySensors()` : capteurs `active` sous `LOW_BATTERY_THRESHOLD` → alerte `low_battery`. Les capteurs jamais vus (`pending`) ne sont jamais touchés. |
| `src/modules/sensors/alert-notifier.service.ts` | Notifications vers alert-service (`POST /internal/alerts`, header `X-Internal-Token`) : `notifySensorSilent()` (info), `notifySensorFailing()` (critical), `notifyLowBattery()` (warning). Best-effort : échec réseau loggé en warning, jamais de rejet ; 409 (dédup) toléré silencieusement. |
| `src/modules/sensors/dto/associate-sensor.dto.ts` | DTO association capteur. Valide `deviceId` (string) et `parcelId` (UUID). |
| `src/modules/sensors/dto/sensor-heartbeat.dto.ts` | DTO heartbeat capteur. Tous champs optionnels : `batteryPct` (int, 0–100), `firmwareVersion` (string, max 20). |
| `src/common/guards/internal-token.guard.ts` | Guard des endpoints `/internal/*`. Si `INTERNAL_TOKEN` est définie, exige le header `X-Internal-Token` correspondant (sinon 401). Absente → accès autorisé (isolation par le réseau Docker, préfixe non routé par la gateway). |
| `src/database/entities/parcel.entity.ts` | Entité `Parcel` mappée à la table `parcels`. Contrainte unique sur `(farmId, name)`. Relation inverse `@OneToMany` vers `Sensor` (chargée par `GET /parcels/farm/:farmId` et `GET /parcels/:id`). Voir [modèle de données](#9-modèle-de-données-postgresql). |
| `src/modules/health/health.controller.ts` | Controller health. `GET /api/v1/health/live` : statique. `GET /api/v1/health/ready` : exécute `SELECT 1` via `DataSource.query()`. |

---

## 8. Authentification et sécurité

### Principe

L'authentification repose sur **JWT** validé localement (le secret est partagé avec `auth-service`).

```
Client → Authorization: Bearer <JWT> → JwtStrategy.validate() → { userId, phone } → request.user
```

### JwtStrategy

- **Extraction** : `ExtractJwt.fromAuthHeaderAsBearerToken()` (header `Authorization: Bearer <token>`)
- **Expiration** : `ignoreExpiration: false` (les tokens expirés sont rejetés)
- **Secret** : `configService.get<string>('app.jwtSecret')`
- **Validation** : vérifie que `payload.sub` existe (sinon `UnauthorizedException`), retourne `{ userId: payload.sub, phone: payload.phone }`

### JwtAuthGuard

- Appliqué sur **tous** les controllers métier (`FarmsController`, `ParcelsController`, `SensorsController`)
- **Non appliqué** sur `HealthController` ni `InternalSensorsController`
- Log la tentative d'accès (méthode, URL, IP)
- Rejette avec 401 si token absent, expiré ou invalide

### Endpoints internes (`/internal/*`)

- `InternalSensorsController` (heartbeat capteurs) est protégé par `InternalTokenGuard`, **pas** par JWT
- Le préfixe `/internal` **n'est pas routé par la gateway Nginx** : ces endpoints ne sont joignables que depuis le réseau Docker des services (appelant actuel : `iot-service`)
- Si la variable `INTERNAL_TOKEN` est définie, le header `X-Internal-Token` correspondant est exigé (double protection); sinon, l'isolation réseau suffit en développement

### Isolation par propriétaire

Chaque ferme a un `ownerId`. Toutes les opérations vérifient que l'utilisateur JWT est propriétaire :

| Opération | Vérification |
|-----------|-------------|
| `GET /farms` | `WHERE ownerId = userId` |
| `GET /farms/:id` | `farm.ownerId === userId` (sinon 403) |
| `PATCH /farms/:id` | via `findOne` (403 si pas propriétaire) |
| `DELETE /farms/:id` | via `findOne` (403 si pas propriétaire) |
| `POST /parcels` | `farm.ownerId === userId` (sinon 404) |
| `GET /parcels/farm/:farmId` | `farm.ownerId === userId` (sinon 404) |
| `GET /parcels/:id` | `parcel.farm.ownerId === userId` (sinon 403) |
| `POST /sensors/associate` | `parcel.farm.ownerId === userId` (sinon 403) |
| `GET /sensors/parcel/:parcelId` | `parcel.farm.ownerId === userId` (sinon 404/403) |
| `DELETE /sensors/:sensorId` | `sensor.parcel → farm.ownerId === userId` (sinon 403) |

### Communication inter-services

`AuthClientService` appelle `auth-service` via HTTP (sortant) :

```
GET http://auth-service:3001/internal/user/:userId
```

- **Utilisé uniquement à la création d'une ferme** (`FarmsService.create`)
- 200 → utilisateur existe, création autorisée
- 404 → utilisateur introuvable, création bloquée (404)
- Autre erreur → 503 SERVICE_UNAVAILABLE

`iot-service` appelle farm-service via HTTP (entrant) pour les heartbeats capteurs :

```
PATCH http://farm-service:3003/internal/sensors/:deviceId/seen
```

- Appelé à chaque message `raw-sensor-data` consommé (best-effort côté iot-service)
- Body : `SensorHeartbeatDto` (`batteryPct?`, `firmwareVersion?` — tous optionnels)
- 404 si le `deviceId` est inconnu (capteur jamais associé)

---

## 9. Modèle de données (PostgreSQL)

### Table `farms`

```sql
CREATE TABLE farms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,           -- indexé
  name            VARCHAR(150) NOT NULL,
  total_area_ha   DECIMAL(10,2) NOT NULL,
  region          VARCHAR(100) NULL,
  location        geometry(Point, 4326) NULL,  -- GeoJSON Point
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table `parcels`

```sql
CREATE TABLE parcels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID NOT NULL,       -- indexé, FK → farms(id) ON DELETE CASCADE
  name                VARCHAR(150) NOT NULL,
  area_ha             DECIMAL(10,2) NOT NULL,
  crop_type           VARCHAR NOT NULL,    -- enum: olive, citrus, cereal, vegetable, other
  soil_type           VARCHAR NOT NULL,    -- enum: clay, silt, sandy, calcareous, mixed
  irrigation_method   VARCHAR NOT NULL,    -- enum: drip, sprinkler, gravity
  crop_variety        VARCHAR(100) NULL,
  flow_rate_m3h       DECIMAL(8,2) NULL,
  tree_age_years      INT NULL,
  tree_density_per_ha INT NULL,
  polygon             geometry(Polygon, 4326) NULL,  -- GeoJSON Polygon
  centroid            geometry(Point, 4326) NULL,    -- GeoJSON Point
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(farm_id, name)  -- contrainte d'unicité
);
```

### Table `sensors`

```sql
CREATE TABLE sensors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id         UUID NOT NULL,         -- indexé, FK → parcels(id) ON DELETE CASCADE
  device_id         VARCHAR(100) NOT NULL UNIQUE,  -- identifiant physique unique
  device_type       VARCHAR(50) DEFAULT 'esp32-wroom-32',
  health_status     sensor_health_status_enum NOT NULL DEFAULT 'pending',
                    -- enum : pending | active | inactive | failing (indexé)
  last_seen_at      TIMESTAMPTZ NULL,
  battery_pct       INT NULL,
  firmware_version  VARCHAR(20) NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Relations entre entités

```
Farm (1) ──OneToMany──▶ (N) Parcel ──OneToMany──▶ (N) Sensor
  │                         │                          │
  │ onDelete: CASCADE       │ onDelete: CASCADE        │ onDelete: CASCADE
  │                         │                          │
  └── owner_id (UUID)       └── parcel_id (UUID)       └── parcel_id (UUID)
```

> La relation inverse `Parcel.sensors` (`@OneToMany`) est déclarée sur l'entité `Parcel` : elle est chargée par `GET /parcels/farm/:farmId` et `GET /parcels/:id` (le frontend en déduit l'indicateur « capteur associé » sans requête supplémentaire). Les réponses des capteurs n'embarquent jamais la parcelle.

### Types GeoJSON

```typescript
// src/common/types/geojson.ts
type GeoJsonPosition = [number, number] | [number, number, number];

interface GeoJsonPoint {
  type: 'Point';
  coordinates: GeoJsonPosition;
}

interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: GeoJsonPosition[][];
}
```

> ⚠️ `synchronize: false` dans `database.module.ts` → TypeORM ne crée ni ne modifie le schéma. Les tables doivent exister préalablement (migrations ou script SQL externe).

---

## 10. Logique métier implémentée

### Cohérence des surfaces (parcels)

À la **création** d'une parcelle (`ParcelsService.create`) :

```
somme_surfaces_existantes + nouvelle_surface ≤ farm.totalAreaHa
```

Si dépassement → `422 UNPROCESSABLE_ENTITY`

À la **modification** d'une parcelle (`ParcelsService.update`) :

```
somme_autres_parcelles + nouvelle_surface ≤ farm.totalAreaHa
```

Si dépassement → `422 UNPROCESSABLE_ENTITY`

### Intégrité référentielle (farms)

La suppression d'une ferme est **bloquée** si elle possède des parcelles :

```
parcelCount = COUNT(parcels WHERE farmId = farm.id)
if (parcelCount > 0) → 409 CONFLICT
```

### Logique d'association (`SensorsService.associate`)

```
1. Vérifier que la parcelle cible existe et appartient à l'utilisateur
   → parcel = findOne(parcelId, relations: { farm: true })
   → 404 si introuvable
   → 403 si parcel.farm.ownerId !== userId

2. Chercher le capteur par deviceId
   → sensor = findOne({ deviceId })

3. Si le capteur existe :
   a. Si sensor.parcelId === parcelId :
      → Retourner le capteur sans écriture DB (idempotence)
   b. Si sensor.parcelId !== parcelId :
      → Vérifier que l'ancienne parcelle appartient aussi à l'utilisateur
      → 403 si oldParcel.farm.ownerId !== userId (anti-vol de capteur)
      → Réassocier : sensor.parcelId = parcelId, sensor.isActive = true
      → Save

4. Si le capteur n'existe pas :
   → Créer avec deviceType = 'esp32-wroom-32', isActive = true
   → Save
```

### Logique de dissociation (`SensorsService.dissociate`)

```
1. Charger le capteur par id → 404 si introuvable
2. Charger sa parcelle (relations: { farm: true })
   → 403 si la parcelle n'existe plus ou si farm.ownerId !== userId (anti-vol)
3. Supprimer la ligne SQL (remove)
```

- Les **mesures MongoDB** (iot-service) sont indexées par `device_id` : elles **survivent à la dissociation**
- Réassocier le même `deviceId` plus tard recrée la ligne (l'unicité `device_id` ne gêne plus après suppression)

### Cycle d'activité d'un capteur (heartbeat + désactivation auto)

```
Association (POST /associate)          Heartbeat (PATCH /internal/.../seen)
        │                                       │
        ▼                                       ▼
  isActive = true                       last_seen_at = now()
  last_seen_at = NULL                   isActive = true
        │                                       │
        └──────────────┬────────────────────────┘
                       ▼
         SensorActivityService (cycle à cadence configurable)
         active → inactive si silence > SENSOR_INACTIVE_HOURS (2 h)
         inactive → failing si silence > SENSOR_FAILING_HOURS (24 h)
```

Machine à états complète (seuils configurables par env, décimales acceptées) :

- **`pending`** (jamais vu, `last_seen_at NULL`) : reste « En attente » indéfiniment — un capteur associé mais pas encore posé ne génère pas de bruit
- **`active`** : heartbeat récent ; tout heartbeat ramène le capteur à `active` quel que soit l'état précédent
- **`inactive`** (« Désactivé ») : silence > `SENSOR_INACTIVE_HOURS` → notification légère `sensor_offline` (sévérité `info`) vers alert-service
- **`failing`** (« Défaillant ») : silence > `SENSOR_FAILING_HOURS` → alerte rouge `sensor_offline` (sévérité `critical`)
- Le premier passage s'exécute au démarrage (`onApplicationBootstrap`) pour rattraper les silences accumulés pendant un arrêt — un capteur silencieux depuis plus des deux seuils enchaîne les deux transitions (et les deux alertes) dans le même cycle
- La config est validée au démarrage : `SENSOR_INACTIVE_HOURS >= SENSOR_FAILING_HOURS` ou un intervalle < 1 minute → refus de démarrer

### Unicité

| Contrainte | Table | Colonnes |
|------------|-------|----------|
| Unique | `sensors` | `device_id` |
| Unique | `parcels` | `(farm_id, name)` |

---

## 11. Validation des entrées (DTOs)

### Configuration globale

`ValidationPipe` configuré dans `main.ts` :

```typescript
new ValidationPipe({
  whitelist: true,           // supprime les propriétés non décorées
  transform: true,           // transforme les types
  forbidNonWhitelisted: true, // rejette les propriétés non décorées
  transformOptions: {
    enableImplicitConversion: true,
  },
})
```

### `CreateFarmDto`

| Champ | Type | Validation |
|-------|------|------------|
| `name` | string | `@IsString()`, `@MaxLength(150)` |
| `totalAreaHa` | number | `@IsNumber()`, `@Min(0.01)` |
| `region` | string? | `@IsOptional()`, `@IsString()`, `@MaxLength(100)` |
| `location` | GeoJsonPointDto? | `@IsOptional()`, `@ValidateNested()`, `@Type(() => GeoJsonPointDto)` |

### `UpdateFarmDto`

Identique à `CreateFarmDto` mais tous les champs sont optionnels.

### `CreateParcelDto`

| Champ | Type | Validation |
|-------|------|------------|
| `farmId` | UUID | `@IsUUID()` |
| `name` | string | `@IsString()`, `@MaxLength(150)` |
| `areaHa` | number | `@IsNumber()`, `@Min(0.01)` |
| `cropType` | enum | `@IsEnum(['olive', 'citrus', 'cereal', 'vegetable', 'other'])` |
| `soilType` | enum | `@IsEnum(['clay', 'silt', 'sandy', 'calcareous', 'mixed'])` |
| `irrigationMethod` | enum | `@IsEnum(['drip', 'sprinkler', 'gravity'])` |
| `cropVariety` | string? | `@IsOptional()`, `@IsString()`, `@MaxLength(100)` |
| `flowRateM3h` | number? | `@IsOptional()`, `@IsNumber()`, `@Min(0)` |
| `treeAgeYears` | number? | `@IsOptional()`, `@IsNumber()`, `@Min(0)` |
| `treeDensityPerHa` | number? | `@IsOptional()`, `@IsNumber()`, `@Min(0)` |
| `centroid` | GeoJsonPointDto? | `@IsOptional()`, `@ValidateNested()` |
| `polygon` | GeoJsonPolygonDto? | `@IsOptional()`, `@ValidateNested()` |

### `UpdateParcelDto`

Identique à `CreateParcelDto` mais :
- Tous les champs sont optionnels
- **Pas de `farmId`** (une parcelle ne peut pas changer de ferme)

### `AssociateSensorDto`

| Champ | Type | Validation |
|-------|------|------------|
| `deviceId` | string | `@IsString()` |
| `parcelId` | UUID | `@IsUUID()` |

### `SensorHeartbeatDto` (interne — heartbeat iot-service)

| Champ | Type | Validation |
|-------|------|------------|
| `batteryPct` | number? | `@IsOptional()`, `@IsInt()`, `@Min(0)`, `@Max(100)` |
| `firmwareVersion` | string? | `@IsOptional()`, `@IsString()`, `@MaxLength(20)` |

Tous les champs sont optionnels : seul `last_seen_at` est toujours mis à jour par le heartbeat.

### DTOs GeoJSON imbriqués

```typescript
class GeoJsonPointDto {
  @IsString()
  type: 'Point';

  @IsNumber({}, { each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  coordinates: [number, number];
}

class GeoJsonPolygonDto {
  @IsString()
  type: 'Polygon';

  @ValidateNested({ each: true })
  @Type(() => Object)
  coordinates: number[][][];
}
```

---

## 12. Gestion des erreurs

### Filtre global (`AllExceptionsFilter`)

Toutes les exceptions sont capturées et formatées en JSON :

```json
{
  "statusCode": 404,
  "errorCode": "NOT_FOUND",
  "message": "Ferme introuvable dans la base de données.",
  "timestamp": "2026-07-30T12:00:00.000Z",
  "path": "/api/v1/farms/123",
  "method": "GET"
}
```

### Map status → errorCode

| Status HTTP | errorCode |
|-------------|-----------|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `TOO_MANY_REQUESTS` |
| 500 | `INTERNAL_ERROR` |
| 502 | `BAD_GATEWAY` |
| 503 | `SERVICE_UNAVAILABLE` |
| (autre) | `UNKNOWN_ERROR` |

### Messages d'erreur métier (français)

| Code | Message | Contexte |
|------|---------|----------|
| 404 | `Aucun utilisateur trouvé pour cet ID. Création de ferme bloquée.` | Création ferme, utilisateur non trouvé dans auth-service |
| 404 | `Ferme introuvable dans la base de données.` | Ferme non trouvée |
| 403 | `Accès refusé : cette ferme n'appartient pas à l'utilisateur connecté.` | Ferme d'un autre utilisateur |
| 409 | `Suppression impossible : la ferme possède N parcelle(s). Veuillez d'abord les supprimer.` | Suppression ferme avec parcelles |
| 404 | `Ferme parente introuvable ou accès non autorisé à cette ferme.` | Création parcelle, ferme inexistante ou d'un autre user |
| 422 | `La surface totale des parcelles (X ha) dépasse la surface de la ferme (Y ha).` | Dépassement de surface |
| 404 | `Ferme introuvable ou accès refusé.` | Liste parcelles, ferme d'un autre user |
| 404 | `Parcelle introuvable.` | Parcelle non trouvée |
| 403 | `Accès refusé à cette parcelle.` | Parcelle d'un autre utilisateur |
| 404 | `Parcelle introuvable pour association capteur.` | Association capteur, parcelle inexistante |
| 403 | `Action interdite : la parcelle ne vous appartient pas.` | Association capteur, parcelle d'un autre user |
| 403 | `Action interdite : le capteur appartient à une parcelle d'un autre utilisateur.` | Anti-vol de capteur |
| 404 | `Parcelle introuvable.` | Listing/dissociation capteur, parcelle inexistante |
| 403 | `Accès refusé à cette parcelle.` | Listing capteurs, parcelle d'un autre user |
| 404 | `Capteur introuvable.` | Dissociation, capteur inexistant |
| 403 | `Action interdite : le capteur ne vous appartient pas.` | Dissociation, capteur sur une parcelle d'un autre user |
| 404 | `Capteur inconnu : <deviceId>.` | Heartbeat interne, device jamais associé |
| 401 | `Accès interne non autorisé.` | Endpoint interne sans `X-Internal-Token` valide (si `INTERNAL_TOKEN` définie) |
| 503 | `Service d'authentification temporairement indisponible. Veuillez réessayer.` | auth-service injoignable |
| 401 | `Non autorise - Le token JWT est absent, expire ou invalide.` | Token JWT invalide |

---

## 13. Health checks

### `GET /api/v1/health/live` (liveness)

```json
{
  "status": "ok",
  "service": "farm-service",
  "timestamp": "2026-07-30T12:00:00.000Z"
}
```

- Ne dépend d'aucun service externe
- Indique que le processus Node.js tourne

### `GET /api/v1/health/ready` (readiness)

```json
// Succès
{
  "status": "ok",
  "service": "farm-service",
  "database": "connected",
  "timestamp": "2026-07-30T12:00:00.000Z"
}

// Échec DB
{
  "status": "error",
  "service": "farm-service",
  "database": "disconnected",
  "timestamp": "2026-07-30T12:00:00.000Z"
}
```

- Exécute `SELECT 1` via `DataSource.query()`
- Teste la connexion réelle à PostgreSQL

### Healthcheck Docker

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3003/api/v1/health/ready || exit 1
```

---

## 14. Tests

### Configuration Jest (`jest.config.js`)

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.module.ts',    // exclus modules
    '!src/**/*.entity.ts',    // exclus entités
    '!src/main.ts',           // exclus point d'entrée
    '!src/config/**',         // exclus config
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 10000,
  verbose: true,
};
```

### Tests unitaires

| Fichier de test | Ce qu'il teste | Nombre de cas |
|-----------------|----------------|---------------|
| `test/farms.controller.spec.ts` | `FarmsController` — create, findAll, findOne, remove. Mock `FarmsService` et `AuthClientService`. Override `JwtAuthGuard`. | 10 cas |
| `test/parcels.service.spec.ts` | `ParcelsService` — create (succès, ferme inexistante, autre user, dépassement surface, doublon nom), findOne (succès, 404). Mock repositories. | 7 cas |
| `test/sensors.service.spec.ts` | `SensorsService` — associate (nouveau capteur, réassociation, idempotence, 403 autre user, 404 parcelle, anti-vol capteur, doublon deviceId), findByParcel (succès, vide, 404, 403), dissociate (succès, 404, 403), recordHeartbeat (succès, champs absents, 404). Mock repositories. | 17 cas |
| `test/sensor-activity.service.spec.ts` | `SensorActivityService` — transitions `active → inactive` (seuil 2 h) et `inactive → failing` (seuil 24 h), notifications par niveau, `runSensorHealthChecks` agrégé. Mock repository `find`/`update`. | 7 cas |
| `test/alert-notifier.service.spec.ts` | `AlertNotifierService` — payload `notifySensorSilent` (info) / `notifySensorFailing` (critical), header `X-Internal-Token`, 409 toléré, erreur réseau avalée (best-effort), owner irrésoluble ignoré. Mock `global.fetch`. | 5 cas |
| `test/internal-parcels.controller.spec.ts` | `InternalParcelsController` — résolution owner 200, propagation 404. | 2 cas |

### Commandes

```bash
npm run test          # Lance tous les tests Jest
npm run test:watch    # Mode watch
npm run test:cov      # Avec couverture (exclut modules, entités, main, config)
npm run test:debug    # Mode debug
```

### Caractéristiques des tests

- **Tests unitaires uniquement** : tous les tests utilisent des mocks (`jest.fn()`, `useValue`)
- **Pas de test d'intégration** : aucun test contre une vraie base PostgreSQL
- **Pas de test E2E** : aucun test HTTP de bout en bout
- Le `JwtAuthGuard` est overridé dans les tests controller (`{ canActivate: () => true }`)

---

## 15. Docker

### Dockerfile (multi-stage, 3 stages)

```dockerfile
# Stage 1 : deps — Installer les dépendances
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /workspace
COPY package*.json ./
COPY tsconfig.json ./
COPY apps/farm-service/package*.json ./apps/farm-service/
COPY apps/farm-service/tsconfig.json ./apps/farm-service/
RUN npm ci --workspace @alkatra/farm-service

# Stage 2 : builder — Compile le TypeScript
FROM deps AS builder
WORKDIR /workspace
COPY apps/farm-service ./apps/farm-service
RUN npm run build --workspace @alkatra/farm-service \
    && npm prune --omit=dev --workspace @alkatra/farm-service

# Stage 3 : runner — Exécute le code compilé
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/farm-service/dist ./apps/farm-service/dist
COPY --from=builder /workspace/apps/farm-service/package*.json ./apps/farm-service/
COPY --from=builder /workspace/apps/farm-service/node_modules ./apps/farm-service/node_modules
RUN chown -R nestjs:nodejs /workspace
USER nestjs
WORKDIR /workspace/apps/farm-service
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3003/api/v1/health/ready || exit 1
CMD ["node", "dist/main.js"]
```

### Points clés du Dockerfile

| Élément | Valeur |
|---------|--------|
| Image de base | `node:20-alpine` |
| Contexte de build | Racine du monorepo (copie `package.json` racine + `apps/farm-service/`) |
| Installation | `npm ci --workspace @alkatra/farm-service` |
| Build | `npm run build --workspace @alkatra/farm-service` |
| Utilisateur | `nestjs` (non-root, UID 1001) |
| Port exposé | 3003 |
| Healthcheck | `wget --spider http://localhost:3003/api/v1/health/ready` |
| Commande | `node dist/main.js` |

---

## 16. Configuration TypeScript et Jest

### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "coverage"]
}
```

### `package.json`

| Élément | Valeur |
|---------|--------|
| Nom | `@alkatra/farm-service` |
| Version | `0.1.0` |
| Description | `Farm & Parcels CRUD microservice — Sprint 2` |
| Type | `commonjs` |
| Framework | NestJS 11 |
| ORM | TypeORM 0.3.20 |
| DB driver | `pg` 8.13.1 |
| Validation | `class-validator` 0.14.1 + `class-transformer` 0.5.1 |
| Auth | `@nestjs/passport` 11 + `passport-jwt` 4.0.1 + `@nestjs/jwt` 11 |
| HTTP client | `@nestjs/axios` 4 + `axios` 1.18.1 |
| Tests | Jest 29.7 + ts-jest 29.2 |

### Dépendances complètes

**Production :**
- `@nestjs/axios`, `@nestjs/config`, `@nestjs/core`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/platform-express`, `@nestjs/typeorm`
- `axios`, `class-transformer`, `class-validator`
- `passport`, `passport-jwt`
- `pg` (driver PostgreSQL)
- `reflect-metadata`
- `typeorm`

**Développement :**
- `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`
- `@types/express`, `@types/jest`, `@types/node`, `@types/passport-jwt`
- `jest`, `prettier`, `source-map-support`, `ts-jest`, `ts-loader`, `ts-node`, `tsconfig-paths`, `typescript`

---

## 17. Ce que le service NE fait PAS

### Endpoints capteurs restant à couvrir

- ❌ Aucun endpoint `GET /:id` pour récupérer un capteur par ID
- ❌ Aucun endpoint public `PATCH /:id` pour renommer/mettre à jour manuellement un capteur (la mise à jour passe uniquement par le heartbeat interne : `last_seen_at`, `health_status`, batterie, firmware)
- ❌ Aucun endpoint de liste globale des capteurs d'un utilisateur (au-delà d'une parcelle)

### Ingestion de données

- ❌ Aucune ingestion de mesures capteurs (température, humidité, etc.) — c'est le rôle de `iot-service`
- ❌ Aucune connexion à Kafka ou MQTT
- ❌ Aucun endpoint pour recevoir des payloads capteurs

### Fonctionnalités API

- ❌ Aucune pagination sur les listes (`findAll` retourne tout)
- ❌ Aucun filtrage avancé (par cropType, soilType, region, etc.)
- ❌ Aucun tri configurable
- ❌ Aucun endpoint de recherche

### Observabilité

- ❌ Aucune métrique Prometheus (pas de module metrics)
- ❌ Aucun endpoint `/metrics`
- ❌ Aucun structured logging (les logs utilisent `Logger` NestJS standard)

### Tests

- ❌ Aucun test d'intégration (contre une vraie DB)
- ❌ Aucun test E2E (HTTP de bout en bout)
- ❌ Aucun test du `HealthController`
- ❌ Aucun test du `AllExceptionsFilter`
- ❌ Aucun test du `JwtStrategy` / `JwtAuthGuard`

### Infrastructure

- ❌ `synchronize: false` — le schéma DB n'est pas créé automatiquement
- ❌ Aucune migration TypeORM dans le service
- ❌ Aucun fichier de configuration Docker Compose dans le service (géré au niveau `infra/docker/`)

---

## 18. Comportements notables

### Observations

1. **Double enregistrement du filtre global** : `AllExceptionsFilter` est enregistré à la fois via le provider `APP_FILTER` (dans `app.module.ts`) et via `app.useGlobalFilters()` (dans `main.ts`). Les deux mécanismes sont actifs simultanément.

2. **`deviceType` figé à la création du capteur** : Dans `SensorsService.associate`, le `deviceType` est forcé à `'esp32-wroom-32'` lors de la création d'un capteur. Le type d'appareil n'est pas configurable via l'API.

3. **Utilisation de `.toPromise()`** : `auth-client.service.ts` emploie `.toPromise()` pour consommer les observables `HttpService`. Cette méthode est une API RxJS dépréciée.

4. **`@nestjs/jwt` déclaré mais non utilisé** : La dépendance `@nestjs/jwt` est listée dans `package.json` mais le module `JwtModule` n'est pas importé. L'authentification JWT s'appuie directement sur `passport-jwt` via `PassportModule`.

5. **Log de réassociation** : Dans `SensorsService.associate`, le log de réassociation imprime la nouvelle parcelle (`sensor.parcelId` après réaffectation) au lieu de l'ancienne parcelle.

---

## 19. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Microservice de gestion fermes/parcelles/capteurs (CRUD) |
| **Framework** | NestJS 11 |
| **Port** | 3003 |
| **Base de données** | PostgreSQL `farm_db` (TypeORM, tables `farms`, `parcels`, `sensors`) |
| **ORM** | TypeORM 0.3.20 (`synchronize: false`) |
| **Authentification** | JWT (HS256, secret partagé avec auth-service) |
| **Communication inter-service** | Sortant : HTTP GET vers `auth-service` `/internal/user/:userId`. Entrant : HTTP PATCH depuis `iot-service` `/internal/sensors/:deviceId/seen` (heartbeat, non routé par la gateway). |
| **Tâche planifiée** | `SensorActivityService` — cycle configurable (`SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES`, 15 min) : `inactive` après 2 h de silence (notification info), `failing` après 24 h (alerte critical) — seuils configurables |
| **Validation** | class-validator + class-transformer (ValidationPipe global) |
| **Health checks** | `/api/v1/health/live` + `/api/v1/health/ready` (SELECT 1) |
| **Métriques** | Aucune |
| **Tests** | Jest (36 cas unitaires, mocks uniquement) |
| **Langage** | TypeScript 5.7 |
| **Node.js** | 20 (Alpine) |
| **Docker** | Multi-stage, utilisateur non-root, healthcheck sur `/ready` |

### Commandes essentielles

```bash
# Démarrer en développement
cd apps/farm-service && npm run start:dev

# Lancer les tests
cd apps/farm-service && npm test

# Vérifier la santé
curl http://localhost:3003/api/v1/health/live
curl http://localhost:3003/api/v1/health/ready

# Créer une ferme (nécessite un JWT valide)
curl -X POST http://localhost:3003/api/v1/farms \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Ferme Al Haouz", "totalAreaHa": 15.5, "region": "Marrakech-Safi"}'

# Lister ses fermes
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3003/api/v1/farms

# Créer une parcelle
curl -X POST http://localhost:3003/api/v1/parcels \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"farmId": "<farm-uuid>", "name": "Parcelle Nord", "areaHa": 2.5, "cropType": "olive", "soilType": "clay", "irrigationMethod": "drip"}'

# Associer un capteur
curl -X POST http://localhost:3003/api/v1/sensors/associate \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "SENSOR-OL-001", "parcelId": "<parcel-uuid>"}'

# Lister les capteurs d'une parcelle
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3003/api/v1/sensors/parcel/<parcel-uuid>

# Dissocier un capteur (les mesures collectées sont conservées)
curl -X DELETE http://localhost:3003/api/v1/sensors/<sensor-uuid> \
  -H "Authorization: Bearer <JWT>"

# Heartbeat interne (réservé à iot-service, non routé par la gateway)
curl -X PATCH http://farm-service:3003/internal/sensors/SENSOR-OL-001/seen \
  -H "Content-Type: application/json" \
  -d '{"batteryPct": 87}'