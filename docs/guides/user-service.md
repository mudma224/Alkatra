# `apps/user-service` — Documentation factuelle

> Cette documentation décrit le code source et la configuration Docker de `user-service`.  
> Le service ne contient pas TypeORM, ni d'entité `User`, ni de connexion directe à PostgreSQL.  
> Il agit comme un **proxy HTTP** vers `auth-service`.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Démarrage](#3-démarrage)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Routes HTTP](#5-routes-http)
6. [Fonctionnement interne par fichier](#6-fonctionnement-interne-par-fichier)
7. [Sécurité : authentification JWT](#7-sécurité--authentification-jwt)
8. [Health checks](#8-health-checks)
9. [Métriques Prometheus](#9-métriques-prometheus)
10. [Tests](#10-tests)
11. [Docker](#11-docker)
12. [Dépendances et ordre de démarrage](#12-dépendances-et-ordre-de-démarrage)
13. [Comportements notables](#13-comportements-notables)
14. [Résumé opérationnel](#14-résumé-opérationnel)

---

## 1. Rôle du service

`user-service` est un microservice NestJS qui agit comme une **façade/API proxy** pour la gestion des profils utilisateur.

**Ce qu'il fait :**
- Il expose une API REST publique et sécurisée (JWT) pour lire et modifier le profil de l'utilisateur connecté.
- Il **délègue toutes les opérations** à `auth-service` via des appels HTTP internes.
- Il valide les données entrantes (DTO).
- Il expose des health checks (liveness / readiness) et des métriques Prometheus.

**Ce qu'il ne fait PAS :**
- ❌ Il **ne stocke aucune donnée** (pas de base de données, pas de TypeORM, pas de Prisma).
- ❌ Il **n'a pas d'entité `User`** — le profil est stocké et géré par `auth-service`.
- ❌ Il **ne gère pas l'authentification** (login, OTP, inscription) — c'est le rôle de `auth-service`.
- ❌ Il **n'envoie pas de SMS/email** — c'est le rôle de `auth-service`.

### Chevauchement avec `auth-service`

`user-service` agit comme un proxy / BFF public vers `auth-service`. Il ne possède aucune donnée : toutes les lectures et écritures transitent par les endpoints internes de `auth-service`.

- `GET /api/v1/user/profile` est exposé à la fois par `auth-service` (qui détient la base de données) et par `user-service` (qui proxifie). `user-service` est l'entrée publique empruntée par les clients via la gateway ; `auth-service` expose l'endpoint interne `/internal/user/:userId` que `user-service` appelle.
- `PATCH /api/v1/user/profile` n'est exposé publiquement **que** par `user-service`. Côté `auth-service`, l'opération n'est disponible que via l'endpoint interne, sans guard.

La justification architecturale repose sur le principe « un service = une base de données ». `user-service` n'a pas de base de données et délègue l'intégralité de la persistance à `auth-service`.

---

## 2. Architecture et flux

### Diagramme de séquence

```
Client (mobile/web)
      │
      │ Requête HTTP avec Authorization: Bearer <JWT>
      ▼
┌──────────────────────────────────────────────────────┐
│                  user-service (port 3002)              │
│                                                        │
│  ┌──────────────────┐    ┌────────────────────────┐   │
│  │  JwtAuthGuard     │───▶│  JwtStrategy           │   │
│  │  (garde NestJS)   │    │  (valide le token JWT, │   │
│  │                   │    │   extrait userId+phone)│   │
│  └──────────────────┘    └────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │            UserController                       │   │
│  │  GET  /api/v1/user/profile                      │   │
│  │  PATCH /api/v1/user/profile                     │   │
│  └──────────────┬─────────────────────────────────┘   │
│                 │                                      │
│  ┌──────────────▼─────────────────────────────────┐   │
│  │            UserService                          │   │
│  │  Appels HTTP vers auth-service                  │   │
│  │  GET    http://auth-service:3001/               │   │
│  │         internal/user/:userId                   │   │
│  │  PATCH  http://auth-service:3001/               │   │
│  │         internal/user/:userId                   │   │
│  └────────────────────────────────────────────────┘   │
└──────────────────────┬───────────────────────────────┘
                       │
                       │ HTTP (réseau Docker interne)
                       ▼
┌──────────────────────────────────────────────────────┐
│               auth-service (port 3001)                │
│                                                        │
│  Endpoint INTERNE : /internal/user/:userId             │
│  (gère la vraie logique métier + accès BDD)            │
└──────────────────────────────────────────────────────┘
```

### Principe

`user-service` est un **BFF (Backend For Frontend)** typique :
- Il reçoit les requêtes du client (mobile/web).
- Il **authentifie** via JWT.
- Il **proxifie** les appels vers `auth-service` via son endpoint interne `/internal/user/:userId`.
- Il **transforme** les erreurs (ex: 404 → `NotFoundException`).

---

## 3. Démarrage

### Depuis le package du service

```bash
cd apps/user-service

npm run build          # nest build
npm run start          # nest start
npm run start:dev      # nest start --watch
npm run start:prod     # node dist/main.js
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
# Démarrer la stack complète avec le profil phase1 (inclut user-service)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Voir les logs
docker compose -f infra/docker/docker-compose.yml logs -f user-service
```

> ⚠️ **Important** : `user-service` est déclaré avec `profiles: ["phase1"]` dans le docker-compose.  
> Il ne démarre **pas** avec un simple `docker compose up` — il faut activer le profil `phase1`.

---

## 4. Variables d'environnement

### Fichier `.env.example`

```env
# apps/user-service/.env.example

PORT=3002

# Auth-service — adresse du service d'authentification (utilisé en interne)
AUTH_SERVICE_HOST=localhost
AUTH_SERVICE_PORT=3001

# JWT — DOIT être identique à auth-service
JWT_SECRET=change_me_same_as_auth_service
```

### Variables utilisées par le code

| Variable | Défaut | Utilisation |
|----------|--------|-------------|
| `PORT` | `3002` | Port d'écoute du serveur HTTP |
| `AUTH_SERVICE_HOST` | `localhost` | Hostname du auth-service (résolu en `auth-service` dans Docker) |
| `AUTH_SERVICE_PORT` | `3001` | Port du auth-service |
| `JWT_SECRET` | (obligatoire) | Secret HMAC pour valider les tokens JWT (algorithme HS256) |

### Configuration injectée par Docker Compose

```yaml
environment:
  NODE_ENV: development
  PORT: 3002
  AUTH_SERVICE_HOST: auth-service    # Nom du container Docker
  AUTH_SERVICE_PORT: 3001
  JWT_SECRET: ${JWT_SECRET:-alkatra_jwt_dev_secret}
```

> ⚠️ `JWT_SECRET` doit être **strictement identique** à celui configuré dans `auth-service`, sinon la validation des tokens JWT échouera.

---

## 5. Routes HTTP

Toutes les routes sont préfixées par `/api/v1` (défini dans `src/main.ts`).

### Santé (publiques, sans authentification)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/api/v1/health` | Redirige vers `/api/v1/health/ready` |
| `GET` | `/api/v1/health/live` | Liveness probe — retourne `{ status: "alive", service: "user-service", timestamp }` |
| `GET` | `/api/v1/health/ready` | Readiness probe — appelle `auth-service/health` via HTTP. Retourne `ready` si auth-service répond, sinon `503 Service Unavailable` |

### Profil utilisateur (protégées par JWT)

Toutes les routes ci-dessous nécessitent un header `Authorization: Bearer <token>`.

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/api/v1/user/profile` | Retourne le profil de l'utilisateur connecté. Proxifie vers `GET /internal/user/:userId` sur auth-service |
| `PATCH` | `/api/v1/user/profile` | Met à jour le profil (name, preferredLanguage). Proxifie vers `PATCH /internal/user/:userId` sur auth-service |

**Corps accepté par `PATCH /api/v1/user/profile` :**

```json
{
  "name": "string (optionnel, max 100 caractères)",
  "preferredLanguage": "string (optionnel, valeurs: 'french' | 'arabic' | 'darija')"
}
```

### Farms (protégée par JWT)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/api/v1/farms` | **Non implémentée** — retourne `501 NotImplementedException` avec le message `"Farms listing is not implemented yet"` |

### Métriques (publiques)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/api/v1/metrics` | Retourne les métriques Prometheus au format texte (`Content-Type: text/plain; version=0.0.4`) |

---

## 6. Fonctionnement interne par fichier

### Structure complète du projet

```
apps/user-service/
├── .env.example              # Variables d'environnement minimales
├── Dockerfile                # Build multi-stage (deps → builder → runtime)
├── package.json              # Dépendances et scripts NestJS
├── tsconfig.json             # Configuration TypeScript
│
├── src/
│   ├── main.ts               # Point d'entrée NestJS
│   ├── app.module.ts         # Module racine
│   │
│   ├── user/
│   │   ├── user.module.ts    # Module user (controller + service)
│   │   ├── user.controller.ts # Routes GET/PATCH /user/profile
│   │   ├── user.service.ts   # Proxy HTTP vers auth-service
│   │   └── dto/
│   │       └── update-profile.dto.ts  # Validation des champs
│   │
│   ├── auth/
│   │   ├── auth.module.ts    # Module Passport (stratégie JWT)
│   │   ├── jwt.strategy.ts   # Validation du token JWT (HS256)
│   │   └── jwt-auth.guard.ts # Guard NestJS pour protéger les routes
│   │
│   ├── farms/
│   │   ├── farms.module.ts   # Module farms
│   │   └── farms.controller.ts # Route GET /farms (NotImplemented)
│   │
│   ├── health/
│   │   └── health.controller.ts # Liveness + Readiness probes
│   │
│   └── metrics/
│       ├── metrics.module.ts # Module Prometheus
│       ├── metrics.controller.ts # Endpoint GET /metrics
│       └── metrics.service.ts # Service de collecte de métriques
│
└── test/
    ├── user.service.spec.ts      # Tests du UserService
    ├── user.controller.spec.ts   # Tests du UserController
    ├── jwt.strategy.spec.ts      # Tests de la stratégie JWT
    └── health.controller.spec.ts # Tests du HealthController
```

### Détail par fichier

| Fichier | Rôle réel |
|---------|-----------|
| `src/main.ts` | Point d'entrée NestJS. Définit le préfixe global `api/v1`, active `ValidationPipe` global (whitelist, forbidNonWhitelisted, transform). Démarre le serveur sur le port `PORT` (défaut 3002). |
| `src/app.module.ts` | Module racine. Importe `ConfigModule` (global), `UserModule`, `AuthModule`, `FarmsModule`, `MetricsModule`. Déclare `HealthController`. |
| `src/user/user.module.ts` | Module NestJS standard. Déclare `UserController` et `UserService`. |
| `src/user/user.controller.ts` | Controller protégé par `JwtAuthGuard`. Expose `GET /user/profile` et `PATCH /user/profile`. Extrait `userId` de `req.user` (injecté par Passport après validation JWT). |
| `src/user/user.service.ts` | **Cœur du proxy**. Construit l'URL `http://{AUTH_SERVICE_HOST}:{AUTH_SERVICE_PORT}/internal/user/{userId}`. Appelle `axios.get()` ou `axios.patch()`. Gère les erreurs : 404 → `NotFoundException`, autres → log + rethrow. |
| `src/user/dto/update-profile.dto.ts` | DTO avec `class-validator`. Champs optionnels : `name` (string, max 100), `preferredLanguage` (enum: 'french', 'arabic', 'darija'). |
| `src/auth/auth.module.ts` | Importe `PassportModule` avec `defaultStrategy: 'jwt'`. Déclare `JwtStrategy`. Exporte `PassportModule`. |
| `src/auth/jwt.strategy.ts` | Stratégie Passport JWT. Extrait le token du header `Authorization: Bearer`. Utilise `JWT_SECRET` comme clé HMAC. Algorithme imposé : `HS256`. La méthode `validate()` retourne `{ userId: payload.sub, phone: payload.phone }` qui est injecté dans `req.user`. |
| `src/auth/jwt-auth.guard.ts` | Simple extension de `AuthGuard('jwt')` de `@nestjs/passport`. |
| `src/farms/farms.module.ts` | Module déclarant `FarmsController`. |
| `src/farms/farms.controller.ts` | Controller protégé par JWT. Route `GET /farms` lance `NotImplementedException('Farms listing is not implemented yet')`. |
| `src/health/health.controller.ts` | Controller sans guard. `GET /health` → redirige vers `readiness()`. `GET /health/live` → réponse statique `{ status: 'alive' }`. `GET /health/ready` → appelle `auth-service/health` via HTTP ; si OK → `{ status: 'ready', checks: { authService: 'up' } }`, sinon → `503 ServiceUnavailableException`. |
| `src/metrics/metrics.controller.ts` | Controller exposant `GET /metrics` avec `Content-Type: text/plain; version=0.0.4`. Délègue à `MetricsService`. |
| `src/metrics/metrics.service.ts` | Service utilisant `prom-client` pour collecter et exposer les métriques Prometheus. |
| `test/user.service.spec.ts` | Tests unitaires du `UserService`. Mocke `axios` et `ConfigService`. Vérifie : appel correct à auth-service, retour du profil, levée de `NotFoundException` sur 404. |
| `test/user.controller.spec.ts` | Tests unitaires du `UserController`. Mocke `UserService`. Vérifie : délégation au service avec le bon `userId`, propagation des erreurs. |
| `test/jwt.strategy.spec.ts` | Tests unitaires de `JwtStrategy`. Vérifie que `validate()` retourne `{ userId, phone }` à partir du payload JWT. |

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
5. Le controller utilise `req.user.userId` pour identifier l'utilisateur.

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

> ⚠️ `JWT_SECRET` doit être **strictement identique** entre `user-service` et `auth-service`, car c'est `auth-service` qui signe les tokens et `user-service` qui les valide.

---

## 8. Health checks

Conçus pour les **liveness/readiness probes Kubernetes** et Docker Compose.

### `GET /api/v1/health/live` (Liveness)

```json
{
  "status": "alive",
  "service": "user-service",
  "timestamp": "2026-07-12T12:00:00.000Z"
}
```

- Ne dépend d'aucun service externe.
- Indique simplement que le processus Node.js est en vie.

### `GET /api/v1/health/ready` (Readiness)

```json
// Si auth-service répond :
{
  "status": "ready",
  "checks": { "authService": "up" },
  "timestamp": "2026-07-12T12:00:00.000Z"
}

// Si auth-service ne répond pas :
503 Service Unavailable
{
  "status": "not_ready",
  "checks": { "authService": "down" }
}
```

- Appelle `http://auth-service:3001/health` via HTTP.
- Si auth-service répond → `ready`.
- Si auth-service ne répond pas → `503 ServiceUnavailableException`.

### Healthcheck Docker

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:3002/health/ready"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

> Le healthcheck Docker appelle `http://localhost:3002/health/ready`, sans le préfixe global `api/v1` (la route complète exposée par NestJS est `/api/v1/health/ready`). Le chemin sans préfixe ne correspond à aucune route déclarée : le healthcheck ne renvoie donc pas un succès.

---

## 9. Métriques Prometheus

Le module `metrics` expose des métriques au format Prometheus via `prom-client`.

| Route | Format | Content-Type |
|-------|--------|-------------|
| `GET /api/v1/metrics` | Texte Prometheus | `text/plain; version=0.0.4` |

Ces métriques sont scrapées par Prometheus (configuré dans `infra/prometheus/prometheus.yml`).

---

## 10. Tests

### Tests unitaires

```bash
npm run test          # Lance tous les tests Jest
npm run test:watch    # Mode watch
npm run test:cov      # Avec couverture
```

| Fichier de test | Ce qu'il teste |
|-----------------|----------------|
| `test/user.service.spec.ts` | `UserService.getProfile()` → appel correct à auth-service, retour du profil, levée de `NotFoundException` sur 404. `UserService.updateProfile()` → appel PATCH correct, mise à jour du profil. |
| `test/user.controller.spec.ts` | `UserController.getProfile()` → délègue à `UserService` avec le bon `userId`. `UserController.updateProfile()` → délègue avec le bon DTO. Propagation des `NotFoundException`. |
| `test/jwt.strategy.spec.ts` | `JwtStrategy.validate()` → retourne `{ userId, phone }` à partir du payload JWT. |
| `test/health.controller.spec.ts` | Endpoints de santé. |

---

## 11. Docker

### Dockerfile (multi-stage)

```dockerfile
# Stage 1 : deps — Installation des dépendances
FROM node:20-alpine AS deps
WORKDIR /workspace
COPY package*.json ./
COPY apps/user-service/package*.json ./apps/user-service/
COPY packages/shared-types/package*.json ./packages/shared-types/
RUN npm ci --workspace @alkatra/shared-types --workspace @alkatra/user-service

# Stage 2 : builder — Compilation TypeScript
FROM deps AS builder
WORKDIR /workspace
COPY apps/user-service ./apps/user-service
COPY packages/shared-types ./packages/shared-types
RUN npm run build --workspace @alkatra/shared-types \
    && npm run build --workspace @alkatra/user-service \
    && npm prune --omit=dev

# Stage 3 : runtime — Image finale légère
FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/user-service/dist ./apps/user-service/dist
COPY --from=builder /workspace/apps/user-service/package*.json ./apps/user-service/
COPY --from=builder /workspace/apps/user-service/node_modules ./apps/user-service/node_modules
COPY --from=builder /workspace/packages/shared-types ./packages/shared-types
COPY --from=builder /workspace/packages/shared-types/node_modules ./packages/shared-types/node_modules
WORKDIR /workspace/apps/user-service
EXPOSE 3002
CMD ["node", "dist/main.js"]
```

**Explication des stages :**

| Stage | Base | Rôle |
|-------|------|------|
| `deps` | `node:20-alpine` | Copie les `package.json` (workspace racine, user-service, shared-types) et installe les dépendances avec `npm ci` (installation déterministe). |
| `builder` | `deps` | Copie le code source complet, compile le TypeScript, puis supprime les dépendances de dev. |
| `runtime` | `node:20-alpine` | Image finale. Copie uniquement les artefacts nécessaires : `node_modules`, `dist/`, `package.json`, `shared-types`. Exécute `node dist/main.js`. |

**Points clés :**
- Le contexte de build est la **racine du monorepo** (`../..` dans docker-compose), car le Dockerfile a besoin des `package.json` racine et de `packages/shared-types`.
- L'image finale pèse ~150-200 MB (Alpine + Node.js + dépendances runtime uniquement).
- Le port exposé est `3002`.

### Service dans docker-compose.yml

```yaml
user-service:
  build:
    context: ../..                    # Racine du monorepo
    dockerfile: ./apps/user-service/Dockerfile
  container_name: alkatra-user
  restart: unless-stopped
  profiles: ["phase1"]                # ⚠️ Profil phase1 requis
  ports:
    - "3002:3002"
  environment:
    NODE_ENV: development
    PORT: 3002
    AUTH_SERVICE_HOST: auth-service
    AUTH_SERVICE_PORT: 3001
    JWT_SECRET: ${JWT_SECRET:-alkatra_jwt_dev_secret}
  depends_on:
    auth-service:
      condition: service_healthy      # Attend que auth-service soit healthy
  networks:
    - alkatra-net
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3002/health/ready"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

---

## 12. Dépendances et ordre de démarrage

### Chaîne de dépendances complète

```
postgres ──▶ keycloak ──▶ auth-service ──▶ user-service
   │                        │
   └──▶ redis ──────────────┘
```

### Détail

| Service | Dépend de | Condition |
|---------|-----------|-----------|
| `user-service` | `auth-service` | `service_healthy` (auth-service doit répondre à son healthcheck) |
| `auth-service` | `postgres`, `redis`, `keycloak` | `postgres` et `redis` : `service_healthy` ; `keycloak` : `service_started` |

### Réseau

Tous les services sont sur le réseau Docker `alkatra-net` (bridge).  
La résolution DNS interne permet à `user-service` d'accéder à `auth-service` via le hostname `auth-service`.

---

## 13. Comportements notables

### Appels HTTP et orchestration

1. **Healthcheck Docker** : Le healthcheck déclaré dans `docker-compose.yml` appelle `http://localhost:3002/health/ready`, c'est-à-dire sans le préfixe global `api/v1`. La route exposée par NestJS est `/api/v1/health/ready` ; le chemin sans préfixe ne correspond à aucune route, le healthcheck ne renvoie donc pas un succès.

2. **Absence de timeout / retry sur les appels HTTP** : `UserService` appelle `auth-service` via `axios` sans configuration de timeout ni de mécanisme de retry ou de circuit breaker. Une lenteur ou une indisponibilité de `auth-service` se propage directement aux requêtes de `user-service`, sans coupure ni nouvelle tentative.

3. **Compteurs Prometheus non incrémentés** : Les compteurs Prometheus sont déclarés dans le module `metrics` mais ne sont pas incrémentés par le code applicatif. L'endpoint `/api/v1/metrics` expose les métriques par défaut de `prom-client` (processus, Node.js) sans données métier.

4. **Route `farms` non implémentée** : `GET /api/v1/farms` lève une `NotImplementedException` et renvoie une réponse `501` avec le message `"Farms listing is not implemented yet"`.

---

## 14. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Microservice proxy/façade (BFF) |
| **Framework** | NestJS 11 |
| **Port** | 3002 |
| **Préfixe API** | `/api/v1` |
| **Base de données** | Aucune (délègue à auth-service) |
| **Authentification** | JWT (HS256) via Passport |
| **Communication inter-service** | HTTP (axios) vers auth-service:3001 |
| **Health checks** | Liveness (`/live`) et Readiness (`/ready` avec dépendance auth-service) |
| **Métriques** | Prometheus (`/metrics`) |
| **Profil Docker** | `phase1` (démarrage explicite requis) |
| **Dépendance principale** | `auth-service` (doit être healthy avant de démarrer) |
| **Tests** | Jest (unitaires : service, controller, stratégie JWT, health) |
| **Langage** | TypeScript |
| **Node.js** | 20 (Alpine en production) |

### Commandes essentielles

```bash
# Démarrer avec Docker (profil phase1)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Tester le healthcheck
curl http://localhost:3002/api/v1/health/live

# Tester le profil (avec un token JWT valide)
curl -H "Authorization: Bearer <token>" http://localhost:3002/api/v1/user/profile

# Lancer les tests
cd apps/user-service && npm test

# Voir les logs Docker
docker compose -f infra/docker/docker-compose.yml logs -f user-service