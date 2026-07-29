# `apps/farm-service` — Documentation factuelle

> **Mise à jour : juillet 2026** — Cette documentation reflète l'état réel du code source, de la configuration Docker et de l'intégration dans le docker-compose.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Démarrage](#3-démarrage)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Routes HTTP](#5-routes-http)
6. [Fonctionnement interne par fichier](#6-fonctionnement-interne-par-fichier)
7. [Sécurité : authentification JWT](#7-sécurité--authentification-jwt)
8. [Communication inter-service : AuthClientService](#8-communication-inter-service--authclientservice)
9. [Modèle de données (PostgreSQL + PostGIS)](#9-modèle-de-données-postgresql--postgis)
10. [Validation des entrées](#10-validation-des-entrées)
11. [Health checks](#11-health-checks)
12. [Tests](#12-tests)
13. [Docker](#13-docker)
14. [Dépendances et ordre de démarrage](#14-dépendances-et-ordre-de-démarrage)
15. [Limites constatées](#15-limites-constatées)
16. [Résumé opérationnel](#16-résumé-opérationnel)

---

## 1. Rôle du service

`farm-service` est le microservice NestJS de gestion des exploitations agricoles (farms), des parcelles (parcels) et des capteurs IoT (sensors) de la plateforme Al Katra Bel Qatra.

**Ce qu'il fait :**
- Il gère le **CRUD complet des fermes** (création, lecture, mise à jour, suppression) avec vérification que l'utilisateur propriétaire existe via `auth-service`
- Il gère le **CRUD complet des parcelles** liées à une ferme, avec validation de cohérence des surfaces (somme des surfaces des parcelles ≤ surface de la ferme)
- Il gère **l'association de capteurs physiques** (`deviceId`) à des parcelles, avec réassociation possible et protection contre le vol de capteur
- Il expose des endpoints REST authentifiés par JWT
- Il utilise **PostGIS** pour les données géospatiales (polygones de parcelles, centroïdes, localisation des fermes)
- Il vérifie l'existence des utilisateurs auprès de `auth-service` via un endpoint interne HTTP

**Ce qu'il ne fait PAS :**
- ❌ Il ne gère pas l'authentification (login, OTP, inscription) — c'est le rôle de `auth-service`
- ❌ Il ne stocke pas les profils utilisateur — c'est le rôle de `auth-service`
- ❌ Il ne gère pas les données IoT temps réel (capteurs) — c'est le rôle de `iot-service`
- ❌ Il ne génère pas de recommandations d'irrigation — c'est le rôle de `recommendation-service`

---

## 2. Architecture et flux

### Flux de création d'une ferme

```
Client (mobile/web)
      │
      │ POST /api/v1/farms { name, totalAreaHa, region }
      │ Authorization: Bearer <JWT>
      ▼
┌──────────────────────────────────────────────────────────────┐
│                    farm-service (port 3003)                    │
│                                                                │
│  ┌──────────────────┐    ┌──────────────────────────────┐    │
│  │  JwtAuthGuard     │───▶│  JwtStrategy                 │    │
│  │  (garde NestJS)   │    │  (valide le token JWT,      │    │
│  │                   │    │   extrait userId + phone)    │    │
│  └──────────────────┘    └──────────────────────────────┘    │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                FarmsService.create()                    │   │
│  │  1. Vérifier que l'utilisateur existe                  │   │
│  │     → AuthClientService.verifyUserExists(userId)       │   │
│  │  2. Créer la ferme en base (PostgreSQL)                │   │
│  └──────────────────────┬─────────────────────────────────┘   │
│                         │                                      │
│  ┌──────────────────────▼─────────────────────────────────┐   │
│  │              AuthClientService                          │   │
│  │  GET http://auth-service:3001/internal/user/:userId     │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          │ HTTP (réseau Docker interne)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                  auth-service (port 3001)                      │
│  Endpoint INTERNE : GET /internal/user/:userId                │
│  Retourne : { id, phone, name, preferredLanguage, createdAt } │
└──────────────────────────────────────────────────────────────┘
```

### Flux de création d'une parcelle

```
Client
  │ POST /api/v1/parcels { farmId, name, areaHa, cropType, ... }
  ▼
ParcelsService.create()
  1. Vérifier que la ferme appartient à l'utilisateur
  2. Vérifier la cohérence des surfaces (total ≤ farm.totalAreaHa)
  3. Créer la parcelle en base (PostGIS pour polygon/centroid)
```

### Flux d'association d'un capteur

```
Client
  │ POST /api/v1/sensors/associate { deviceId, parcelId }
  ▼
SensorsService.associate()
  1. Vérifier que la parcelle appartient à l'utilisateur
  2. Chercher le capteur par deviceId
  3. Si le capteur existe déjà :
     a. Si déjà sur la même parcelle → ne rien faire (idempotent)
     b. Si sur une autre parcelle → vérifier que l'ancienne parcelle
        appartient aussi à l'utilisateur (anti-vol)
     c. Réassocier à la nouvelle parcelle
  4. Si le capteur n'existe pas → le créer
```

### Architecture des dépendances

```
farm-service
│
├── PostgreSQL (via TypeORM + PostGIS)
│   └── Base: farm_db
│       ├── Table: farms (id, owner_id, name, region, location, total_area_ha)
│       ├── Table: parcels (id, farm_id, name, area_ha, crop_type, soil_type,
│       │                   irrigation_method, polygon, centroid, ...)
│       └── Table: sensors (id, parcel_id, device_id, device_type, ...)
│
└── auth-service (via HTTP)
    └── GET /internal/user/:userId → vérification existence utilisateur
```

---

## 3. Démarrage

### Depuis le package du service

```bash
cd apps/farm-service

npm run build          # nest build
npm run start          # nest start
npm run start:dev      # nest start --watch
npm run start:prod     # node dist/main
npm run lint           # eslint "{src,test}/**/*.ts" --fix
npm run test           # jest
npm run test:watch     # jest --watch
npm run test:cov       # jest --coverage
```

### Depuis la racine du monorepo

```bash
npm run dev            # Lance tous les workspaces en parallèle via Turbo
```

### Avec Docker Compose

```bash
# Démarrer la stack complète avec le profil phase1 (inclut farm-service)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Voir les logs
docker compose -f infra/docker/docker-compose.yml logs -f farm-service
```

> ⚠️ `farm-service` est déclaré avec `profiles: ["phase1"]` dans le docker-compose.  
> Il ne démarre pas avec un simple `docker compose up` — il faut activer le profil `phase1`.

---

## 4. Variables d'environnement

### Configuration centralisée (`src/config/configuration.ts`)

```typescript
export default registerAs('app', (): AppConfig => ({
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.FARM_DB_USER || 'farm_user',
    password: process.env.FARM_DB_PASSWORD || 'farm_dev_pass',
    name: process.env.FARM_DB_NAME || 'farm_db',
  },
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  jwtSecret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
}));
```

### Tableau récapitulatif

| Variable | Défaut | Utilisation | Source |
|----------|--------|-------------|--------|
| `PORT` | `3003` | Port d'écoute | `configuration.ts` |
| `NODE_ENV` | `development` | Environnement | `configuration.ts` |
| `POSTGRES_HOST` | `postgres` | Hôte PostgreSQL | `configuration.ts` |
| `POSTGRES_PORT` | `5432` | Port PostgreSQL | `configuration.ts` |
| `FARM_DB_USER` | `farm_user` | Utilisateur PostgreSQL | `configuration.ts` |
| `FARM_DB_PASSWORD` | `farm_dev_pass` | Mot de passe PostgreSQL | `configuration.ts` |
| `FARM_DB_NAME` | `farm_db` | Nom de la base de données | `configuration.ts` |
| `AUTH_SERVICE_URL` | `http://auth-service:3001` | URL du auth-service | `configuration.ts` |
| `JWT_SECRET` | `CHANGE_ME_IN_PRODUCTION` | Secret HMAC pour JWT (HS256) | `configuration.ts` |
| `CORS_ORIGINS` | `http://localhost:3000` | Origines CORS autorisées | `configuration.ts` |

> ⚠️ `JWT_SECRET` doit être **strictement identique** à celui configuré dans `auth-service`, sinon la validation des tokens JWT échouera.

---

## 5. Routes HTTP

Toutes les routes sont protégées par `JwtAuthGuard` (sauf health checks).  
Le préfixe global est défini dans chaque contrôleur : `api/v1/farms`, `api/v1/parcels`, `api/v1/sensors`.

### Farms

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `POST` | `/api/v1/farms` | Crée une ferme. Vérifie que l'utilisateur existe via `auth-service`. Corps : `{ name, totalAreaHa, region?, location? }` |
| `GET` | `/api/v1/farms` | Liste toutes les fermes de l'utilisateur connecté (avec leurs parcelles) |
| `GET` | `/api/v1/farms/:id` | Détail d'une ferme (vérifie que l'utilisateur est le propriétaire) |
| `PATCH` | `/api/v1/farms/:id` | Met à jour une ferme (nom, région, surface, localisation) |
| `DELETE` | `/api/v1/farms/:id` | Supprime une ferme. **Bloqué si la ferme a des parcelles** (HTTP 409) |

### Parcels

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `POST` | `/api/v1/parcels` | Crée une parcelle. Vérifie l'appartenance de la ferme + cohérence des surfaces. Corps : `{ farmId, name, areaHa, cropType, soilType, irrigationMethod, ... }` |
| `GET` | `/api/v1/parcels/farm/:farmId` | Liste les parcelles d'une ferme |
| `GET` | `/api/v1/parcels/:id` | Détail d'une parcelle |
| `PATCH` | `/api/v1/parcels/:id` | Met à jour une parcelle (vérifie cohérence des surfaces si `areaHa` change) |
| `DELETE` | `/api/v1/parcels/:id` | Supprime une parcelle |

### Sensors

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `POST` | `/api/v1/sensors/associate` | Associe un capteur physique à une parcelle. Corps : `{ deviceId, parcelId }`. Idempotent (si déjà associé à la même parcelle, pas d'écriture DB). Vérifie l'appartenance de l'ancienne parcelle (anti-vol). |

### Health

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/api/v1/health/live` | Liveness probe — retourne `{ status: "ok", service: "farm-service", timestamp }` |
| `GET` | `/api/v1/health/ready` | Readiness probe — vérifie la connexion PostgreSQL via `SELECT 1`. Retourne `{ status: "ok", database: "connected" }` ou `{ status: "error", database: "disconnected" }` |

### Validation des entrées

Tous les DTOs utilisent `class-validator` avec une `ValidationPipe` globale configurée avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: true`.

#### `CreateFarmDto`

```typescript
class CreateFarmDto {
  @IsString() @MaxLength(150)          name: string;
  @IsNumber() @Min(0.01)               totalAreaHa: number;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @ValidateNested()      location?: GeoJsonPointDto;
}
```

#### `CreateParcelDto`

```typescript
class CreateParcelDto {
  @IsUUID()                            farmId: string;
  @IsString() @MaxLength(150)          name: string;
  @IsNumber() @Min(0.01)               areaHa: number;
  @IsEnum([...])                       cropType: string;
  @IsEnum([...])                       soilType: string;
  @IsEnum([...])                       irrigationMethod: string;
  @IsOptional() @IsString()            cropVariety?: string;
  @IsOptional() @IsNumber() @Min(0)    flowRateM3h?: number;
  @IsOptional() @IsNumber() @Min(0)    treeAgeYears?: number;
  @IsOptional() @IsNumber() @Min(0)    treeDensityPerHa?: number;
  @IsOptional() @ValidateNested()      centroid?: GeoJsonPointDto;
  @IsOptional() @ValidateNested()      polygon?: GeoJsonPolygonDto;
}
```

#### `AssociateSensorDto`

```typescript
class AssociateSensorDto {
  @IsString()    deviceId: string;   // Identifiant physique du capteur (ex: "SENSOR-OL-001")
  @IsUUID()      parcelId: string;
}
```

---

## 6. Fonctionnement interne par fichier

### Structure complète du projet

```
apps/farm-service/
├── Dockerfile               # Build multi-stage
├── package.json             # Dépendances et scripts NestJS
├── nest-cli.json            # Configuration NestJS CLI
├── tsconfig.json            # Configuration TypeScript
│
├── src/
│   ├── main.ts              # Point d'entrée NestJS
│   ├── app.module.ts        # Module racine
│   │
│   ├── config/
│   │   └── configuration.ts # Configuration centralisée
│   │
│   ├── auth/                # Module client d'authentification
│   │   ├── auth-client.module.ts
│   │   └── auth-client.service.ts  # HTTP client vers auth-service
│   │
│   ├── common/              # Éléments partagés
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts  # @CurrentUser() param decorator
│   │   │   └── index.ts
│   │   ├── filters/
│   │   │   ├── all-exceptions.filter.ts   # Filtre d'erreur global
│   │   │   └── index.ts
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts          # Guard JWT NestJS
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts            # Stratégie Passport JWT
│   │   └── types/
│   │       └── geojson.ts                 # Types GeoJSON (Point, Polygon)
│   │
│   ├── database/
│   │   ├── database.module.ts             # Module TypeORM (PostgreSQL + PostGIS)
│   │   └── entities/
│   │       ├── farm.entity.ts             # Entité Farm
│   │       ├── parcel.entity.ts           # Entité Parcel
│   │       └── sensor.entity.ts           # Entité Sensor
│   │
│   └── modules/
│       ├── farms/
│       │   ├── farms.module.ts
│       │   ├── farms.controller.ts        # CRUD /api/v1/farms
│       │   ├── farms.service.ts           # Logique métier farms
│       │   └── dto/
│       │       ├── create-farm.dto.ts
│       │       └── update-farm.dto.ts
│       ├── parcels/
│       │   ├── parcels.module.ts
│       │   ├── parcels.controller.ts      # CRUD /api/v1/parcels
│       │   ├── parcels.service.ts         # Logique métier parcels
│       │   └── dto/
│       │       ├── create-parcel.dto.ts
│       │       └── update-parcel.dto.ts
│       ├── sensors/
│       │   ├── sensors.module.ts
│       │   ├── sensors.controller.ts      # POST /api/v1/sensors/associate
│       │   ├── sensors.service.ts         # Logique métier sensors
│       │   └── dto/
│       │       └── associate-sensor.dto.ts
│       └── health/
│           └── health.controller.ts       # Liveness + Readiness probes
│
└── test/
    ├── farms.controller.spec.ts    # Tests du FarmsController
    ├── parcels.service.spec.ts     # Tests du ParcelsService
    └── sensors.service.spec.ts     # Tests du SensorsService
```

### Détail par fichier

| Fichier | Rôle réel |
|---------|-----------|
| `src/main.ts` | Point d'entrée NestJS. Active CORS (origines configurables), `ValidationPipe` global (whitelist, forbidNonWhitelisted, transform), `AllExceptionsFilter` global, shutdown hooks. Démarre sur le port configuré (défaut 3003). |
| `src/app.module.ts` | Module racine. Importe `ConfigModule` (global, avec `configuration.ts`), `DatabaseModule`, `AuthClientModule`, `FarmsModule`, `ParcelsModule`, `SensorsModule`. Déclare `HealthController`. Fournit `APP_FILTER` global. |
| `src/config/configuration.ts` | Fonction de configuration NestJS. Centralise toutes les variables d'environnement avec valeurs par défaut. Supporte `DATABASE_URL` complète ou champs individuels (`POSTGRES_HOST`, `FARM_DB_USER`, etc.). |
| `src/auth/auth-client.module.ts` | Module client auth. Importe `ConfigModule`, `PassportModule` (defaultStrategy: 'jwt'), `HttpModule` (timeout 5s). Déclare `AuthClientService` et `JwtStrategy`. Exporte `AuthClientService` et `PassportModule`. |
| `src/auth/auth-client.service.ts` | **Client HTTP vers auth-service**. `verifyUserExists(userId)` : appelle `GET /internal/user/:userId` sur auth-service. Retourne `true` si l'utilisateur existe (pas de 404), `false` si 404, lève `503` si le service est indisponible. `getUserInfo(userId)` : retourne les infos utilisateur ou `null` si 404, lève `503` pour les autres erreurs. |
| `src/common/decorators/current-user.decorator.ts` | Décorateur de paramètre `@CurrentUser()`. Extrait `request.user` du contexte HTTP. Supporte l'extraction d'une propriété spécifique : `@CurrentUser('userId')` retourne l'ID, `@CurrentUser()` retourne tout l'objet. |
| `src/common/filters/all-exceptions.filter.ts` | Filtre d'exception global (`@Catch()`). Capture toutes les exceptions (HttpException et non gérées). Formate une réponse JSON standardisée : `{ statusCode, errorCode, message, details?, timestamp, path, method }`. Log les erreurs avec le Logger NestJS. |
| `src/common/guards/jwt-auth.guard.ts` | Guard NestJS. `extends AuthGuard('jwt')`. Log les tentatives d'accès (méthode, URL, IP). `handleRequest()` : si pas d'utilisateur → `UnauthorizedException` avec message explicite. |
| `src/common/strategies/jwt.strategy.ts` | Stratégie Passport JWT. Extrait du header `Authorization: Bearer`. Vérifie avec `app.jwtSecret`. `validate()` retourne `{ userId: payload.sub, phone: payload.phone }`. |
| `src/common/types/geojson.ts` | Types TypeScript pour GeoJSON : `GeoJsonPosition`, `GeoJsonPoint`, `GeoJsonPolygon`. |
| `src/database/database.module.ts` | Module TypeORM asynchrone. Configure la connexion PostgreSQL avec PostGIS. Utilise `synchronize: false` (le schéma est géré par les scripts SQL). Entités : `Farm`, `Parcel`, `Sensor`. |
| `src/database/entities/farm.entity.ts` | Entité TypeORM `Farm` mappée à la table `farms`. Champs : `id` (UUID), `ownerId` (UUID, indexé), `name` (VARCHAR 150), `totalAreaHa` (DECIMAL 10,2), `region` (VARCHAR 100, nullable), `location` (GEOMETRY POINT 4326, nullable), `createdAt`, `updatedAt`. Relation `@OneToMany` vers `Parcel`. |
| `src/database/entities/parcel.entity.ts` | Entité TypeORM `Parcel` mappée à la table `parcels`. Champs : `id` (UUID), `farmId` (UUID, FK → farms), `name` (VARCHAR 150), `areaHa` (DECIMAL 10,2), `cropType` (ENUM), `soilType` (ENUM), `irrigationMethod` (ENUM), `cropVariety` (nullable), `flowRateM3h` (nullable), `treeAgeYears` (nullable), `treeDensityPerHa` (nullable), `polygon` (GEOMETRY POLYGON 4326, nullable), `centroid` (GEOMETRY POINT 4326, nullable), `isActive` (BOOLEAN). Index unique composite `(farmId, name)`. Relation `@ManyToOne` vers `Farm` avec `@JoinColumn({ name: 'farm_id' })`. |
| `src/database/entities/sensor.entity.ts` | Entité TypeORM `Sensor` mappée à la table `sensors`. Champs : `id` (UUID), `parcelId` (UUID, FK → parcels), `deviceId` (VARCHAR 100, UNIQUE), `deviceType` (VARCHAR 50, défaut 'esp32-wroom-32'), `isActive` (BOOLEAN), `lastSeenAt` (TIMESTAMP, nullable), `batteryPct` (INT, nullable), `firmwareVersion` (VARCHAR 20, nullable). Relation `@ManyToOne` vers `Parcel` avec `@JoinColumn({ name: 'parcel_id' })` et `onDelete: 'CASCADE'`. |
| `src/modules/farms/farms.module.ts` | Module farms. Importe `TypeOrmModule.forFeature([Farm, Parcel])` et `AuthClientModule`. Déclare `FarmsController` et `FarmsService`. Exporte `FarmsService`. |
| `src/modules/farms/farms.controller.ts` | Controller farms. Préfixe `api/v1/farms`. Protégé par `JwtAuthGuard`. 5 endpoints : `POST /` (create), `GET /` (findAll), `GET /:id` (findOne), `PATCH /:id` (update), `DELETE /:id` (remove). |
| `src/modules/farms/farms.service.ts` | **Cœur métier des fermes**. `create()` : vérifie l'existence de l'utilisateur via `AuthClientService`, crée la ferme. `findOne()` : vérifie que l'utilisateur est le propriétaire. `remove()` : vérifie que la ferme n'a pas de parcelles avant suppression (HTTP 409 si parcelles existent). |
| `src/modules/parcels/parcels.module.ts` | Module parcels. Importe `TypeOrmModule.forFeature([Parcel, Farm])`. Déclare `ParcelsController` et `ParcelsService`. Exporte `ParcelsService`. |
| `src/modules/parcels/parcels.controller.ts` | Controller parcels. Préfixe `api/v1/parcels`. Protégé par `JwtAuthGuard`. 5 endpoints : `POST /` (create), `GET /farm/:farmId` (findByFarm), `GET /:id` (findOne), `PATCH /:id` (update), `DELETE /:id` (remove). |
| `src/modules/parcels/parcels.service.ts` | **Cœur métier des parcelles**. `create()` : vérifie l'appartenance de la ferme, valide la cohérence des surfaces (somme ≤ `farm.totalAreaHa`), crée la parcelle avec mapping explicite. `update()` : si `areaHa` change, revalide la cohérence des surfaces. |
| `src/modules/sensors/sensors.module.ts` | Module sensors. Importe `TypeOrmModule.forFeature([Sensor, Parcel])`. Déclare `SensorsController` et `SensorsService`. Exporte `SensorsService`. |
| `src/modules/sensors/sensors.controller.ts` | Controller sensors. Préfixe `api/v1/sensors`. Protégé par `JwtAuthGuard`. 1 endpoint : `POST /associate`. |
| `src/modules/sensors/sensors.service.ts` | **Cœur métier des capteurs**. `associate()` : vérifie l'appartenance de la parcelle, cherche le capteur par `deviceId`. Si le capteur existe déjà sur une autre parcelle, vérifie que l'ancienne parcelle appartient aussi à l'utilisateur (anti-vol). Si déjà sur la même parcelle, ne fait rien (idempotent). |
| `src/modules/health/health.controller.ts` | Controller health. `GET /api/v1/health/live` : réponse statique. `GET /api/v1/health/ready` : exécute `SELECT 1` sur PostgreSQL pour vérifier la connexion. |

---

## 7. Sécurité : authentification JWT

### Fonctionnement

1. Le client envoie un token JWT dans le header `Authorization: Bearer <token>`.
2. `JwtAuthGuard` (via `JwtStrategy`) intercepte la requête.
3. `JwtStrategy` :
   - Extrait le token du header.
   - Vérifie la signature HMAC avec `JWT_SECRET` (algorithme HS256).
   - Vérifie que le token n'est pas expiré (`ignoreExpiration: false`).
   - Appelle `validate(payload)` qui retourne `{ userId: payload.sub, phone: payload.phone }`.
4. L'objet retourné est injecté dans `req.user` par Passport.
5. Les contrôleurs utilisent `@CurrentUser('userId')` pour récupérer l'ID de l'utilisateur connecté.

### Contrat du token JWT

Le token doit contenir au minimum :

```json
{
  "sub": "uuid-de-l-utilisateur",
  "phone": "+212612345678",
  "iat": 1234567890,
  "exp": 1234571490
}
```

> ⚠️ `JWT_SECRET` doit être **strictement identique** entre `farm-service` et `auth-service`, car c'est `auth-service` qui signe les tokens et `farm-service` qui les valide.

### Vérification d'appartenance

Toutes les opérations CRUD vérifient que l'utilisateur connecté est bien le propriétaire de la ressource :

- **Fermes** : `farm.ownerId === userId`
- **Parcelles** : `parcel.farm.ownerId === userId` (via la relation ManyToOne)
- **Capteurs** : `parcel.farm.ownerId === userId` (via la relation Parcel → Farm)

---

## 8. Communication inter-service : AuthClientService

### Principe

`farm-service` communique avec `auth-service` via HTTP pour vérifier l'existence des utilisateurs. Cette vérification est faite à la création d'une ferme.

### Endpoint appelé

```
GET http://auth-service:3001/internal/user/:userId
```

### Réponse attendue

```json
// Succès (200)
{
  "id": "uuid-v4",
  "phone": "+212612345678",
  "name": "Ahmed",
  "preferredLanguage": "darija",
  "createdAt": "2026-06-28T11:18:00.000Z"
}

// Utilisateur introuvable (404)
{
  "statusCode": 404,
  "message": "Utilisateur introuvable"
}
```

### Gestion des erreurs

| Cas | Comportement |
|-----|-------------|
| `auth-service` répond 200 | `verifyUserExists()` retourne `true` |
| `auth-service` répond 404 | `verifyUserExists()` retourne `false` → création de ferme bloquée (HTTP 404) |
| `auth-service` indisponible (timeout, 500, réseau) | `verifyUserExists()` lève une exception HTTP 503 → création de ferme impossible |

---

## 9. Modèle de données (PostgreSQL + PostGIS)

### Base de données : `farm_db`

Le schéma est défini dans `infra/postgres/schemas/farm-db.sql`.  
L'utilisateur PostgreSQL est `farm_user`.

### Extensions

- `uuid-ossp` : Génération d'UUID v4
- `postgis` : Types géométriques (POINT, POLYGON) avec SRID 4326 (WGS84)

### ENUMs

```sql
CREATE TYPE crop_type_enum AS ENUM ('olive', 'citrus', 'cereal', 'vegetable', 'other');
CREATE TYPE soil_type_enum AS ENUM ('clay', 'silt', 'sandy', 'calcareous', 'mixed');
CREATE TYPE irrigation_method_enum AS ENUM ('drip', 'sprinkler', 'gravity');
```

### Table `farms`

```sql
CREATE TABLE farms (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id       UUID NOT NULL,
    name           VARCHAR(150) NOT NULL,
    region         VARCHAR(100),
    location       GEOMETRY(POINT, 4326),
    total_area_ha  DECIMAL(10,2),
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (total_area_ha > 0)
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK, auto-généré | Identifiant unique de la ferme |
| `owner_id` | UUID | NOT NULL, indexé | Propriétaire de la ferme (dans auth_db, pas de FK) |
| `name` | VARCHAR(150) | NOT NULL | Nom de la ferme |
| `region` | VARCHAR(100) | nullable | Région géographique |
| `location` | GEOMETRY(POINT, 4326) | nullable, index GIST | Coordonnées GPS |
| `total_area_ha` | DECIMAL(10,2) | > 0 | Surface totale en hectares |
| `created_at` | TIMESTAMPTZ | NOT NULL, auto | Date de création |
| `updated_at` | TIMESTAMPTZ | NOT NULL, auto | Date de modification |

**Index** : `idx_farms_owner_id` (B-tree), `idx_farms_location` (GIST)

### Table `parcels`

```sql
CREATE TABLE parcels (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id             UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    area_ha             DECIMAL(10,2) NOT NULL,
    crop_type           crop_type_enum NOT NULL DEFAULT 'olive',
    crop_variety        VARCHAR(100),
    soil_type           soil_type_enum NOT NULL DEFAULT 'mixed',
    irrigation_method   irrigation_method_enum NOT NULL DEFAULT 'drip',
    flow_rate_m3h       DECIMAL(8,2),
    tree_age_years      INT,
    tree_density_per_ha INT,
    polygon             GEOMETRY(POLYGON, 4326),
    centroid            GEOMETRY(POINT, 4326),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (area_ha > 0),
    CHECK (flow_rate_m3h >= 0),
    CHECK (tree_age_years >= 0),
    CHECK (tree_density_per_ha >= 0),
    CHECK (polygon IS NULL OR ST_IsValid(polygon)),
    UNIQUE(farm_id, name)
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique |
| `farm_id` | UUID | FK → farms(id) CASCADE | Ferme parente |
| `name` | VARCHAR(150) | NOT NULL, UNIQUE(farm_id) | Nom de la parcelle |
| `area_ha` | DECIMAL(10,2) | > 0 | Surface en hectares |
| `crop_type` | ENUM | défaut 'olive' | Type de culture |
| `crop_variety` | VARCHAR(100) | nullable | Variété de la culture |
| `soil_type` | ENUM | défaut 'mixed' | Type de sol |
| `irrigation_method` | ENUM | défaut 'drip' | Méthode d'irrigation |
| `flow_rate_m3h` | DECIMAL(8,2) | >= 0 | Débit d'irrigation (m³/h) |
| `tree_age_years` | INT | >= 0 | Âge des arbres |
| `tree_density_per_ha` | INT | >= 0 | Densité d'arbres/ha |
| `polygon` | GEOMETRY(POLYGON, 4326) | ST_IsValid | Polygone de la parcelle |
| `centroid` | GEOMETRY(POINT, 4326) | nullable | Centre de la parcelle |
| `is_active` | BOOLEAN | défaut TRUE | Parcelle active |
| `created_at` | TIMESTAMPTZ | auto | Date de création |
| `updated_at` | TIMESTAMPTZ | auto | Date de modification |

**Index** : `idx_parcels_farm_id` (B-tree), `idx_parcels_centroid` (GIST), `idx_parcels_active` (partiel, WHERE is_active = TRUE)

### Table `sensors`

```sql
CREATE TABLE sensors (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id        UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    device_id        VARCHAR(100) UNIQUE NOT NULL,
    device_type      VARCHAR(50) NOT NULL DEFAULT 'esp32-wroom-32',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at     TIMESTAMP WITH TIME ZONE,
    battery_pct      INT,
    firmware_version VARCHAR(20),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (battery_pct BETWEEN 0 AND 100)
);
```

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique |
| `parcel_id` | UUID | FK → parcels(id) CASCADE | Parcelle associée |
| `device_id` | VARCHAR(100) | UNIQUE, NOT NULL | Identifiant matériel du capteur |
| `device_type` | VARCHAR(50) | défaut 'esp32-wroom-32' | Type de capteur |
| `is_active` | BOOLEAN | défaut TRUE | Capteur actif |
| `last_seen_at` | TIMESTAMPTZ | nullable | Dernière communication |
| `battery_pct` | INT | 0-100 | Niveau de batterie |
| `firmware_version` | VARCHAR(20) | nullable | Version du firmware |
| `created_at` | TIMESTAMPTZ | auto | Date de création |
| `updated_at` | TIMESTAMPTZ | auto | Date de modification |

**Index** : `idx_sensors_parcel_id` (B-tree), `idx_sensors_device_id` (B-tree), `idx_sensors_active` (B-tree)

---

## 10. Validation des entrées

### Validation globale

Une `ValidationPipe` globale est configurée dans `main.ts` :

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,                // Supprime les champs non déclarés dans le DTO
    transform: true,                // Transforme les types (ex: string → number)
    forbidNonWhitelisted: true,     // Rejette les champs inconnus (HTTP 400)
    transformOptions: {
      enableImplicitConversion: true, // Conversion implicite des types
    },
  }),
);
```

### Validations spécifiques

| Champ | Validation | Message d'erreur |
|-------|-----------|------------------|
| `name` (farm/parcel) | `@MaxLength(150)` | Longueur max 150 caractères |
| `totalAreaHa` / `areaHa` | `@Min(0.01)` | Doit être > 0 |
| `cropType` | `@IsEnum([...])` | Doit être une valeur de l'enum |
| `soilType` | `@IsEnum([...])` | Doit être une valeur de l'enum |
| `irrigationMethod` | `@IsEnum([...])` | Doit être une valeur de l'enum |
| `flowRateM3h` | `@Min(0)` | Doit être ≥ 0 |
| `treeAgeYears` | `@Min(0)` | Doit être ≥ 0 |
| `treeDensityPerHa` | `@Min(0)` | Doit être ≥ 0 |
| `coordinates` (GeoJSON Point) | `@ArrayMinSize(2)` + `@ArrayMaxSize(2)` | Exactement 2 coordonnées [lng, lat] |
| `farmId` (parcel) | `@IsUUID()` | Doit être un UUID valide |
| `parcelId` (sensor) | `@IsUUID()` | Doit être un UUID valide |

---

## 11. Health checks

### `GET /api/v1/health/live` (Liveness)

```json
{
  "status": "ok",
  "service": "farm-service",
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

- Ne dépend d'aucun service externe.
- Indique simplement que le processus Node.js est en vie.

### `GET /api/v1/health/ready` (Readiness)

```json
// Si PostgreSQL répond :
{
  "status": "ok",
  "service": "farm-service",
  "database": "connected",
  "timestamp": "2026-07-29T12:00:00.000Z"
}

// Si PostgreSQL ne répond pas :
{
  "status": "error",
  "service": "farm-service",
  "database": "disconnected",
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

- Exécute `SELECT 1` sur PostgreSQL via TypeORM.
- Si la requête réussit → `database: "connected"`.
- Si la requête échoue → `database: "disconnected"` (HTTP 200 quand même, car c'est une probe).

---

## 12. Tests

### Tests unitaires

```bash
npm run test          # Lance tous les tests Jest
npm run test:watch    # Mode watch
npm run test:cov      # Avec couverture
```

| Fichier de test | Ce qu'il teste |
|-----------------|----------------|
| `test/farms.controller.spec.ts` | `FarmsController` : création, liste, détail, mise à jour, suppression. Vérifie la délégation à `FarmsService` et la propagation des erreurs (404, 403, 409). |
| `test/parcels.service.spec.ts` | `ParcelsService` : création avec validation de surface, échec si ferme inexistante, échec si surface dépasse, contrainte unique `(farmId, name)`. |
| `test/sensors.service.spec.ts` | `SensorsService` : association nouveau capteur, réassociation, idempotence (déjà sur la même parcelle), refus de vol (ancienne parcelle d'un autre utilisateur), contrainte unique `deviceId`. |

---

## 13. Docker

### Dockerfile (multi-stage)

```dockerfile
# Stage 1 : Builder — compile le TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2 : Development — hot reload local
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3003
CMD ["npm", "run", "start:dev"]

# Stage 3 : Production — image finale légère
FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
USER nodeuser
EXPOSE 3003
CMD ["node", "dist/main"]
```

**Explication des stages :**

| Stage | Utilisation | Rôle |
|-------|-------------|------|
| `builder` | Intermédiaire | Installe toutes les dépendances et compile le TypeScript |
| `development` | `docker compose` (cible par défaut) | Installe les dépendances, copie le code source, lance `nest start --watch` (hot reload) |
| `production` | Déploiement réel | Installe uniquement les dépendances de production, copie le `dist/` compilé, exécute avec un utilisateur non-root |

### Service dans docker-compose.yml

```yaml
farm-service:
  build:
    context: ./../../apps/farm-service
    dockerfile: Dockerfile
    target: development
  container_name: alkatra-farm
  restart: unless-stopped
  profiles: ["phase1"]
  ports:
    - "3003:3003"
  environment:
    NODE_ENV: development
    PORT: 3003
    POSTGRES_HOST: postgres
    POSTGRES_PORT: 5432
    FARM_DB_USER: farm_user
    FARM_DB_PASSWORD: ${FARM_DB_PASSWORD:-farm_dev_pass}
    FARM_DB_NAME: farm_db
    AUTH_SERVICE_URL: http://auth-service:3001
    JWT_SECRET: ${JWT_SECRET:-alkatra_jwt_dev_secret}
    CORS_ORIGINS: http://localhost:3000
  depends_on:
    postgres:
      condition: service_healthy
    auth-service:
      condition: service_healthy
  volumes:
    - ./../../apps/farm-service/src:/app/src
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3003/api/v1/health/live"]
    interval: 15s
    timeout: 10s
    retries: 5
    start_period: 40s
  networks:
    - alkatra-net
```

---

## 14. Dépendances et ordre de démarrage

### Chaîne de dépendances complète

```
postgres ──▶ keycloak ──▶ auth-service ──▶ farm-service
   │                        │
   └──▶ redis ──────────────┘
```

### Détail

| Service | Dépend de | Condition |
|---------|-----------|-----------|
| `farm-service` | `postgres` | `service_healthy` (PostgreSQL doit accepter les connexions) |
| `farm-service` | `auth-service` | `service_healthy` (auth-service doit répondre au healthcheck) |

### Réseau

Tous les services sont sur le réseau Docker `alkatra-net` (bridge).  
La résolution DNS interne permet à `farm-service` d'accéder à `auth-service` via le hostname `auth-service`.

---

## 15. Limites constatées

### Limitations fonctionnelles

1. **Pas de pagination** : Les endpoints `GET /api/v1/farms` et `GET /api/v1/parcels/farm/:farmId` retournent toutes les entrées sans pagination. Pour un grand nombre de fermes/parcelles, cela peut poser des problèmes de performance.

2. **Pas de soft delete** : La suppression d'une ferme ou d'une parcelle est définitive (DELETE physique). Aucun mécanisme de soft delete (champ `deleted_at`) n'est implémenté.

3. **Pas de recherche/filtrage** : Aucun paramètre de recherche (par nom, région, type de culture) n'est disponible sur les endpoints de liste.

4. **Pas de rate limiting** : Aucune protection contre les appels abusifs aux endpoints.

5. **Pas de cache** : Chaque appel à `verifyUserExists()` déclenche un appel HTTP à `auth-service`.

6. **Validation GeoJSON polygon insuffisante** : La validation du polygone se limite à `@ValidateNested()` sans vérification que la structure est un tableau valide d'anneaux linéaires. Une validation personnalisée avec `@ValidatorConstraint()` serait plus robuste.

7. **Pas de validation `ST_IsValid` côté application** : Le CHECK SQL `ST_IsValid(polygon)` existe en base, mais aucune validation équivalente n'est faite côté application avant l'envoi à PostgreSQL.

---

## 16. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Microservice de gestion agricole (farms, parcels, sensors) |
| **Framework** | NestJS 11 |
| **Port** | 3003 |
| **Base de données** | PostgreSQL + PostGIS (TypeORM, base `farm_db`) |
| **Authentification** | JWT (HS256) via Passport |
| **Communication inter-service** | HTTP (axios) vers auth-service:3001 |
| **Health checks** | Liveness (`/live`) et Readiness (`/ready` avec dépendance PostgreSQL) |
| **Profil Docker** | `phase1` (démarrage explicite requis) |
| **Dépendances** | PostgreSQL (healthy), auth-service (healthy) |
| **Tests** | Jest (unitaires : controller farms, service parcels, service sensors) |
| **Langage** | TypeScript |
| **Node.js** | 20 (Alpine) |

### Commandes essentielles

```bash
# Démarrer avec Docker (profil phase1)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Tester le healthcheck
curl http://localhost:3003/api/v1/health/live

# Créer une ferme (avec un token JWT valide)
curl -X POST http://localhost:3003/api/v1/farms \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Ferme Test", "totalAreaHa": 15.5, "region": "Marrakech-Safi"}'

# Lister les fermes
curl -H "Authorization: Bearer <token>" \
  http://localhost:3003/api/v1/farms

# Créer une parcelle
curl -X POST http://localhost:3003/api/v1/parcels \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"farmId": "<farm-uuid>", "name": "Parcelle Nord", "areaHa": 5.5, "cropType": "olive", "soilType": "clay", "irrigationMethod": "drip"}'

# Associer un capteur
curl -X POST http://localhost:3003/api/v1/sensors/associate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "SENSOR-OL-001", "parcelId": "<parcel-uuid>"}'

# Lancer les tests
cd apps/farm-service && npm test

# Voir les logs Docker
docker compose -f infra/docker/docker-compose.yml logs -f farm-service