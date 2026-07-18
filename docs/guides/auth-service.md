# `apps/auth-service` — Documentation factuelle

> **Mise à jour : juillet 2026** — Cette documentation reflète l'état réel du code source, de la configuration Docker et de l'intégration dans le docker-compose.

---

## Table des matières

1. [Rôle du service](#1-rôle-du-service)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Démarrage](#3-démarrage)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Routes HTTP](#5-routes-http)
6. [Fonctionnement interne par fichier](#6-fonctionnement-interne-par-fichier)
7. [Sécurité : authentification OTP + JWT](#7-sécurité--authentification-otp--jwt)
8. [Gestion des OTP (Redis)](#8-gestion-des-otp-redis)
9. [Envoi SMS (Infobip)](#9-envoi-sms-infobip)
10. [Module Keycloak (Phase 2)](#10-module-keycloak-phase-2)
11. [Profil utilisateur (interne et public)](#11-profil-utilisateur-interne-et-public)
12. [Health checks](#12-health-checks)
13. [Métriques Prometheus](#13-métriques-prometheus)
14. [Modèle de données (PostgreSQL)](#14-modèle-de-données-postgresql)
15. [Tests](#15-tests)
16. [Docker](#16-docker)
17. [Dépendances et ordre de démarrage](#17-dépendances-et-ordre-de-démarrage)
18. [Limites constatées](#18-limites-constatées)
19. [Résumé opérationnel](#19-résumé-opérationnel)

---

## 1. Rôle du service

`auth-service` est le microservice NestJS central d'authentification et de gestion des utilisateurs de la plateforme Al Katra Bel Qatra.

**Ce qu'il fait :**
- Il gère l'inscription et la connexion des utilisateurs via OTP par SMS
- Il génère et valide des tokens JWT (access token + refresh token)
- Il stocke les profils utilisateur dans PostgreSQL
- Il gère les codes OTP dans Redis (génération, vérification, blocage anti-bruteforce)
- Il envoie les SMS via l'API Infobip (ou log en développement)
- Il expose un endpoint **interne** (`/internal/user`) utilisé par `user-service` pour lire/mettre à jour les profils
- Il expose un endpoint **public** (`/api/v1/user/profile`) pour le profil de l'utilisateur connecté
- Il prépare la migration future vers Keycloak (OIDC) en Phase 2

**Ce qu'il ne fait PAS :**
- ❌ Il ne gère pas l'authentification via Keycloak (phase 2 uniquement, non activée)
- ❌ Il n'a pas d'interface utilisateur (c'est une API REST pure)
- ❌ Il ne stocke pas de mots de passe (authentification sans mot de passe via OTP SMS)

---

## 2. Architecture et flux

### Flux complet d'authentification

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐     ┌───────────┐
│  Client  │     │ auth-service │     │  Redis   │     │    SMS   │     │PostgreSQL │
│ (mobile/ │     │   (NestJS)   │     │          │     │ (Infobip)│     │           │
│   web)   │     │              │     │          │     │          │     │           │
└────┬─────┘     └──────┬───────┘     └────┬─────┘     └────┬─────┘     └─────┬─────┘
     │                  │                  │               │                │
     │ 1. POST /register │                  │               │                │
     │    { phone }      │                  │               │                │
     │─────────────────▶│                  │               │                │
     │                  │ 2. generateAndStore()             │                │
     │                  │────────────────▶│                │                │
     │                  │ 3. SET otp:phone                 │                │
     │                  │    = "483729" EX 300              │                │
     │                  │◀────────────────│                │                │
     │                  │ 4. sendOtp(phone, code)           │                │
     │                  │─────────────────────────────────▶│                │
     │                  │    (SMS "Votre code : 483729")   │                │
     │ 5. { success,    │                  │               │                │
     │     expiresAt }  │                  │               │                │
     │◀─────────────────│                  │               │                │
     │                  │                  │               │                │
     │ 6. POST /verify-otp                 │               │                │
     │    { phone, otp }│                  │               │                │
     │─────────────────▶│                  │               │                │
     │                  │ 7. GET otp:phone                  │                │
     │                  │────────────────▶│                │                │
     │                  │◀──── "483729" ──│                │                │
     │                  │ 8. Vérification OK                │                │
     │                  │ 9. FIND/Save User                 │                │
     │                  │──────────────────────────────────────────────────▶│
     │                  │ 10. generateTokenPair()           │                │
     │                  │ 11. { accessToken,                │                │
     │                  │        refreshToken,              │                │
     │                  │        user }                     │                │
     │◀─────────────────│                  │               │                │
```

### Architecture des dépendances

```
auth-service
│
├── PostgreSQL (via TypeORM)
│   └── Table: users (id UUID, phone, name, preferredLanguage,
│       otpAttempts, otpBlockedUntil, lastLoginAt, keycloakId,
│       createdAt, updatedAt)
│
├── Redis (via ioredis)
│   ├── otp:+212600000001           → code OTP (expire 5 min)
│   ├── otp:attempts:+212600000001  → compteur tentatives (expire 5 min)
│   └── otp:blocked:+212600000001   → flag blocage (expire 30 min)
│
├── Infobip (API SMS externe, via @nestjs/axios)
│   └── POST /sms/2/text/advanced → envoi du code OTP
│
├── Keycloak (diagnostic uniquement, Phase 2)
│   └── GET /admin/realms/{realm} → vérification existence realm
│   └── GET /admin/realms/{realm}/clients → vérification existence client
│
└── user-service (via HTTP)
    └── GET/PATCH /internal/user/:userId → lecture/mise à jour profil
```

---

## 3. Démarrage

### Depuis le package du service

```bash
cd apps/auth-service

npm run build          # nest build
npm run start          # nest start
npm run start:dev     # nest start --watch
npm run start:prod    # node dist/main
npm run lint          # eslint "{src,test}/**/*.ts" --fix
npm run test          # jest
npm run test:watch    # jest --watch
npm run test:cov      # jest --coverage
```

### Depuis la racine du monorepo

```bash
npm run dev            # Lance tous les workspaces en parallèle via Turbo
```

### Avec Docker Compose

```bash
# Démarrer la stack complète avec le profil phase1 (inclut auth-service)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Voir les logs
docker compose -f infra/docker/docker-compose.yml logs -f auth-service
```

> ⚠️ `auth-service` est déclaré avec `profiles: ["phase1"]` dans le docker-compose.  
> Il ne démarre pas avec un simple `docker compose up` — il faut activer le profil `phase1`.

---

## 4. Variables d'environnement

### Configuration centralisée (`src/config/configuration.ts`)

```typescript
export default () => ({
  port: parseInt(process.env.AUTH_SERVICE_PORT ?? '3001', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiration: parseInt(process.env.JWT_ACCESS_EXPIRATION ?? '3600', 10),  // 1h
    refreshExpiration: parseInt(process.env.JWT_REFRESH_EXPIRATION ?? '2592000', 10), // 30 jours
  },
  infobip: {
    apiKey: process.env.INFOBIP_API_KEY,
    baseUrl: process.env.INFOBIP_BASE_URL ?? 'https://api.infobip.com',
    sender: process.env.INFOBIP_SENDER ?? 'AlKatra',
  },
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM ?? 'alkatra',
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'alkatra-web',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),       // 5 min
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '3', 10),        // 3 tentatives
    blockDurationSeconds: parseInt(process.env.OTP_BLOCK_DURATION_SECONDS ?? '1800', 10), // 30 min
  },
});
```

### Tableau récapitulatif

| Variable | Défaut | Utilisation | Source |
|----------|--------|-------------|--------|
| `AUTH_SERVICE_PORT` | `3001` | Port d'écoute | `configuration.ts` |
| `DATABASE_URL` | (obligatoire) | URL de connexion PostgreSQL | `configuration.ts` |
| `REDIS_HOST` | `localhost` | Hôte Redis | `configuration.ts` |
| `REDIS_PORT` | `6379` | Port Redis | `configuration.ts` |
| `REDIS_PASSWORD` | (optionnel) | Mot de passe Redis | `configuration.ts` |
| `JWT_SECRET` | (obligatoire) | Secret HMAC pour access token (HS256) | `configuration.ts` |
| `JWT_REFRESH_SECRET` | (obligatoire) | Secret HMAC pour refresh token (HS256) | `configuration.ts` |
| `JWT_ACCESS_EXPIRATION` | `3600` | Durée de validité access token (secondes) | `configuration.ts` |
| `JWT_REFRESH_EXPIRATION` | `2592000` | Durée de validité refresh token (secondes) | `configuration.ts` |
| `INFOBIP_API_KEY` | (optionnel, dev) | Clé API Infobip | `configuration.ts` |
| `INFOBIP_BASE_URL` | `https://api.infobip.com` | URL de base API Infobip | `configuration.ts` |
| `INFOBIP_SENDER` | `AlKatra` | Expéditeur SMS | `configuration.ts` |
| `KEYCLOAK_URL` | (optionnel) | URL du serveur Keycloak | `configuration.ts` |
| `KEYCLOAK_REALM` | `alkatra` | Realm Keycloak | `configuration.ts` |
| `KEYCLOAK_CLIENT_ID` | `alkatra-web` | Client ID Keycloak | `configuration.ts` |
| `KEYCLOAK_CLIENT_SECRET` | (optionnel) | Secret client Keycloak | `configuration.ts` |
| `KEYCLOAK_ADMIN` | `admin` | Admin username Keycloak | `keycloak.config.ts` |
| `KEYCLOAK_ADMIN_PASSWORD` | (vide) | Admin password Keycloak | `keycloak.config.ts` |
| `OTP_TTL_SECONDS` | `300` | Durée de validité OTP (secondes) | `configuration.ts` |
| `OTP_MAX_ATTEMPTS` | `3` | Nombre max de tentatives OTP | `configuration.ts` |
| `OTP_BLOCK_DURATION_SECONDS` | `1800` | Durée de blocage après échecs (secondes) | `configuration.ts` |

### Configuration injectée par Docker Compose

```yaml
environment:
  NODE_ENV: development
  AUTH_SERVICE_PORT: 3001
  DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-alkatra_db}
  REDIS_HOST: redis
  REDIS_PORT: 6379
  REDIS_PASSWORD: ${REDIS_PASSWORD:-alkatra_redis_pass}
  JWT_SECRET: ${JWT_SECRET:-CHANGE_ME_JWT_SECRET_32_CHARS}
  JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-CHANGE_ME_REFRESH_SECRET_32_CHARS}
  JWT_ACCESS_EXPIRATION: 3600
  JWT_REFRESH_EXPIRATION: 2592000
  OTP_TTL_SECONDS: 3600
  OTP_MAX_ATTEMPTS: 3
  OTP_BLOCK_DURATION_SECONDS: 3600
  INFOBIP_API_KEY: ${INFOBIP_API_KEY:-}
  INFOBIP_BASE_URL: ${INFOBIP_BASE_URL:-https://api.infobip.com}
  INFOBIP_SENDER: ${INFOBIP_SENDER:-AlKatra}
  KEYCLOAK_URL: http://keycloak:8080
  KEYCLOAK_REALM: alkatra
  KEYCLOAK_CLIENT_ID: alkatra-web
  KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-}
```

> ⚠️ `JWT_SECRET` et `JWT_REFRESH_SECRET` doivent être **identiques** entre `auth-service` et tout service qui doit valider les tokens (comme `user-service`). `user-service` utilise uniquement `JWT_SECRET` pour valider les access tokens.

---

## 5. Routes HTTP

### Authentification (publiques, sans authentification)

| Méthode | Route | DTO | Comportement |
|---------|-------|-----|-------------|
| `POST` | `/api/v1/auth/register` | `RegisterDto` | Demande d'inscription : génère un code OTP à 6 chiffres, le stocke dans Redis, l'envoie par SMS (ou log en dev). Retourne `{ success, message, expiresAt }` |
| `POST` | `/api/v1/auth/verify-otp` | `VerifyOtpDto` | Vérifie le code OTP. Si valide : crée ou récupère l'utilisateur en base, génère un token pair (access + refresh), retourne `AuthResult` |
| `POST` | `/api/v1/auth/login` | `LoginDto` | Connexion via refresh token. Vérifie le refresh token, génère un nouveau token pair |
| `POST` | `/api/v1/auth/refresh` | `LoginDto` | Alias de `/login` pour compatibilité frontend (Sprint 4). Même contrat |

### Profil utilisateur (protégée par JWT)

| Méthode | Route | Guard | Comportement |
|---------|-------|-------|-------------|
| `GET` | `/api/v1/user/profile` | `JwtAuthGuard` | Retourne le profil de l'utilisateur connecté (`id`, `phone`, `name`, `preferredLanguage`, `createdAt`) |

### Endpoint interne (service-à-service, pas de guard)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/internal/user/:userId` | Retourne le profil d'un utilisateur par son ID. Appelé par `user-service` |
| `PATCH` | `/internal/user/:userId` | Met à jour `name` et/ou `preferredLanguage` d'un utilisateur. Appelé par `user-service` |

### Santé (publique)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/health` | Retourne `{ status: "ok", service: "auth-service", phase: "placeholder — Phase 1 not implemented", timestamp }` |

### Métriques (publique)

| Méthode | Route | Comportement |
|---------|-------|-------------|
| `GET` | `/metrics` | Retourne les métriques Prometheus au format texte |

### Validation des entrées

Tous les DTOs utilisent `class-validator` avec une `ValidationPipe` globale configurée avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

#### `RegisterDto`

```typescript
class RegisterDto {
  @Matches(/^\+212[67]\d{8}$/)  // +2126XXXXXXXX ou +2127XXXXXXXX
  phone: string;
}
```

#### `VerifyOtpDto`

```typescript
class VerifyOtpDto {
  @Matches(/^\+212[67]\d{8}$/)
  phone: string;

  @Matches(/^\d{6}$/)  // Exactement 6 chiffres
  otp: string;
}
```

#### `LoginDto`

```typescript
class LoginDto {
  @Matches(/^\+212[67]\d{8}$/)
  phone: string;

  @IsNotEmpty()
  refreshToken: string;
}
```

> ⚠️ Le format du numéro de téléphone marocain est validé côté service : `+212` suivi de `6` ou `7` puis de 8 chiffres.

---

## 6. Fonctionnement interne par fichier

### Structure complète du projet

```
apps/auth-service/
├── Dockerfile               # Build multi-stage (development → builder → production)
├── package.json             # Dépendances et scripts NestJS
├── nest-cli.json            # Configuration NestJS CLI
├── tsconfig.json            # Configuration TypeScript
│
├── src/
│   ├── main.ts              # Point d'entrée NestJS
│   ├── app.module.ts        # Module racine
│   ├── app.controller.ts    # Contrôleur racine (/health)
│   │
│   ├── config/
│   │   └── configuration.ts # Configuration centralisée
│   │
│   ├── auth/                # Module AUTH principal
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts   # POST /api/v1/auth/{register,verify-otp,login,refresh}
│   │   ├── auth.service.ts      # Logique métier : OTP, JWT, création utilisateur
│   │   ├── dto/
│   │   │   ├── register.dto.ts  # Validation numéro téléphone
│   │   │   ├── login.dto.ts     # Validation téléphone + refresh token
│   │   │   └── index.ts         # Barrel export
│   │   ├── entities/
│   │   │   └── user.entity.ts   # Entité TypeORM (table users)
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts      # Stratégie Passport JWT
│   │   │   └── jwt-auth.guard.ts    # Guard NestJS
│   │   └── decorators/
│   │       └── current-user.decorator.ts # @CurrentUser() param decorator
│   │
│   ├── otp/                 # Module OTP
│   │   ├── otp.module.ts
│   │   ├── otp.service.ts       # Génération, vérification, blocage OTP
│   │   ├── redis.provider.ts    # Provider Redis (ioredis)
│   │   ├── sms-provider.service.ts  # Envoi SMS via Infobip
│   │   └── dto/
│   │       └── verify-otp.dto.ts    # Validation téléphone + code OTP
│   │
│   ├── keycloak/            # Module Keycloak (Phase 2)
│   │   ├── keycloak.module.ts
│   │   ├── keycloak.config.ts     # Configuration Keycloak
│   │   └── keycloak.service.ts    # Vérification realm/client (diagnostic)
│   │
│   ├── user/                # Module utilisateur
│   │   ├── user.module.ts
│   │   ├── user.service.ts           # CRUD utilisateur (PostgreSQL)
│   │   ├── user.controller.ts        # GET /api/v1/user/profile (public, protégé JWT)
│   │   ├── internal-user.controller.ts   # GET/PATCH /internal/user/:userId (interne)
│   │   └── internal-user.service.ts      # CRUD interne (mise à jour profil)
│   │
│   └── metrics/             # Module Prometheus
│       ├── metrics.module.ts
│       ├── metrics.controller.ts  # GET /metrics
│       └── metrics.service.ts     # Collecte métriques
│
└── test/
    ├── auth.service.spec.ts    # Tests du AuthService
    ├── auth.service.spec.js    # Ancien test JS (probablement obsolète)
    ├── otp.service.spec.ts     # Tests du OtpService
    └── otp.service.spec.js     # Ancien test JS (probablement obsolète)
```

### Détail par fichier

| Fichier | Rôle réel |
|---------|-----------|
| `src/main.ts` | Point d'entrée NestJS. Active `ValidationPipe` global (whitelist, forbidNonWhitelisted, transform). Active CORS (toutes origines, credentials). Démarre sur le port configuré (défaut 3001). |
| `src/app.module.ts` | Module racine. Importe `ConfigModule` (global, avec `configuration.ts`), `TypeOrmModule` (PostgreSQL, `synchronize: false`), `AuthModule`, `MetricsModule`, `OtpModule`, `KeycloakModule`, `UserModule`. Déclare `AppController`. |
| `src/app.controller.ts` | Contrôleur racine. Expose `GET /health` — retourne un statut simple "placeholder" pour Docker healthcheck. |
| `src/config/configuration.ts` | Fonction de configuration NestJS. Centralise toutes les variables d'environnement avec valeurs par défaut. Utilise `dotenv` via `ConfigModule.forRoot()`. |
| `src/auth/auth.module.ts` | Module auth. Importe `TypeOrmModule.forFeature([UserEntity])`, `OtpModule`, `PassportModule`, `JwtModule.registerAsync()` (configuré avec `jwt.secret` et `jwt.accessExpiration`). Déclare `AuthController`, `AuthService`, `JwtStrategy`. Exporte `AuthService`. |
| `src/auth/auth.controller.ts` | Controller auth. Préfixe `api/v1/auth`. 4 endpoints POST : `register`, `verify-otp`, `login`, `refresh`. Tous retournent `200 OK` (`@HttpCode(HttpStatus.OK)`). |
| `src/auth/auth.service.ts` | **Cœur métier de l'authentification**. 3 méthodes principales : `requestOtp(phone)` → génère OTP + envoi SMS ; `verifyOtpAndAuthenticate(phone, otp)` → vérifie OTP → crée/récupère user → génère token pair ; `refreshSession(phone, refreshToken)` → vérifie refresh token → regénère token pair. `generateTokenPair(user)` signe un access token (HS256, `jwt.secret`) et un refresh token (HS256, `jwt.refreshSecret`). `verifyRefreshToken(token)` vérifie et décode le refresh token. |
| `src/auth/strategies/jwt.strategy.ts` | Stratégie Passport JWT. Extrait du header `Authorization: Bearer`. Vérifie avec `jwt.secret`. Algorithme imposé : `HS256`. `validate()` retourne `{ userId: payload.sub, phone: payload.phone }`. |
| `src/auth/strategies/jwt-auth.guard.ts` | Guard NestJS. `extends AuthGuard('jwt')`. |
| `src/auth/decorators/current-user.decorator.ts` | Décorateur de paramètre `@CurrentUser()`. Extrait `request.user` du contexte HTTP. Utilisé dans `UserController` pour récupérer l'utilisateur authentifié. |
| `src/auth/entities/user.entity.ts` | Entité TypeORM `UserEntity` mappée à la table `users`. Champs : `id` (UUID), `phone` (unique), `name` (nullable), `preferredLanguage` ('fr'/'ar'/'darija' par défaut 'fr'), `otpAttempts` (int, défaut 0), `otpBlockedUntil` (nullable), `lastLoginAt` (nullable), `keycloakId` (nullable), `createdAt`, `updatedAt`. |
| `src/auth/dto/register.dto.ts` | DTO `RegisterDto`. Valide que `phone` est un string non vide correspondant au format `+2126XXXXXXXX` ou `+2127XXXXXXXX`. |
| `src/auth/dto/login.dto.ts` | DTO `LoginDto`. Valide `phone` (même format que register) et `refreshToken` (string non vide). |
| `src/otp/otp.module.ts` | Module OTP. Importe `HttpModule` (pour axios). Déclare `OtpService`, `redisProvider`, `SmsProviderService`. Exporte `OtpService` et `SmsProviderService`. |
| `src/otp/otp.service.ts` | **Cœur de la sécurité OTP**. Génère un code à 6 chiffres, le stocke dans Redis (clé `otp:{phone}` avec TTL), gère le compteur de tentatives (`otp:attempts:{phone}`), le blocage (`otp:blocked:{phone}`) après `maxAttempts` échecs. `isBlocked()` vérifie si le numéro est bloqué. `verify()` compare le code, incrémente les tentatives en cas d'échec, bloque si seuil atteint. `clear()` supprime les clés Redis en cas de succès. |
| `src/otp/redis.provider.ts` | Provider NestJS pour Redis. Crée une instance `ioredis.Redis` avec `host`, `port`, `password` (optionnel) depuis la config. `maxRetriesPerRequest: 3`. Token d'injection : `REDIS_CLIENT`. |
| `src/otp/sms-provider.service.ts` | Service d'envoi SMS. En développement (`NODE_ENV !== 'production'`), log simplement le code dans la console (`[DEV-OTP] Code pour +2126XXXXXXXX : 483729`). En production, appelle l'API REST Infobip (`POST /sms/2/text/advanced`) avec `Authorization: App {apiKey}`. Timeout 10s. En cas d'échec, log l'erreur et lance `InternalServerErrorException`. |
| `src/otp/dto/verify-otp.dto.ts` | DTO `VerifyOtpDto`. Valide `phone` (format marocain) et `otp` (exactement 6 chiffres). |
| `src/keycloak/keycloak.module.ts` | Module Keycloak. Importe `HttpModule`. Déclare `KeycloakConfig` et `KeycloakService`. Exporte `KeycloakService`. |
| `src/keycloak/keycloak.config.ts` | Configuration Keycloak. Getters pour `baseUrl`, `realm`, `clientId`, `adminUsername`, `adminPassword`. |
| `src/keycloak/keycloak.service.ts` | **Service de diagnostic uniquement** (Phase 2). `getAdminToken()` obtient un token admin Keycloak via OIDC. `realmExists(realmName)` vérifie si un realm existe. `clientExists(realmName, clientId)` vérifie si un client existe. Non utilisé pour l'authentification réelle en Phase 1. |
| `src/user/user.module.ts` | Module utilisateur. Importe `TypeOrmModule.forFeature([UserEntity])`. Déclare `UserController`, `UserService`, `InternalUserController`, `InternalUserService`. Exporte les services. |
| `src/user/user.service.ts` | Service utilisateur public. `getProfile(userId)` : lit l'utilisateur en base, retourne `{ id, phone, name, preferredLanguage, createdAt }`. Lance `NotFoundException` si introuvable. |
| `src/user/user.controller.ts` | Controller utilisateur public. Préfixe `api/v1/user`. `GET /profile` protégé par `JwtAuthGuard`. Utilise `@CurrentUser()` pour obtenir l'utilisateur connecté. |
| `src/user/internal-user.service.ts` | **Service INTERNE** pour `user-service`. `getProfile(userId)` : identique à `UserService.getProfile()`. `updateProfile(userId, data)` : met à jour `name` et/ou `preferredLanguage` et sauvegarde en base. |
| `src/user/internal-user.controller.ts` | Controller **INTERNE** (sans préfixe `api/v1`). Préfixe `internal/user`. `GET /:userId` → `getProfile()`. `PATCH /:userId` → `updateProfile()`. **Aucun guard JWT** — accessible uniquement depuis le réseau Docker interne. C'est cet endpoint que `user-service` appelle. |
| `src/metrics/metrics.controller.ts` | Controller metrics. `GET /metrics` avec `Content-Type: text/plain`. |
| `src/metrics/metrics.service.ts` | Service Prometheus. Compteurs : `auth_otp_requests_total`, `auth_otp_verified_total`, `auth_otp_failed_total`, `auth_login_total`. Histogramme : `auth_request_duration_seconds` (labels : method, route, status_code). Gauge : `auth_users_total`. |

---

## 7. Sécurité : authentification OTP + JWT

### Principe général

L'authentification repose sur un **système sans mot de passe** en 2 étapes :
1. **Étape 1** : L'utilisateur envoie son numéro de téléphone → reçoit un code OTP par SMS
2. **Étape 2** : L'utilisateur envoie le code OTP → reçoit un JWT (access token + refresh token)

### Cycle de vie des tokens

```
┌──────────────────────────────────────────────────────────┐
│                    Token Pair                             │
│                                                          │
│  ┌──────────────────┐    ┌────────────────────────┐     │
│  │   Access Token    │    │    Refresh Token       │     │
│  │                   │    │                        │     │
│  │ Durée : 1h       │    │ Durée : 30 jours       │     │
│  │ Signé: JWT_SECRET│    │ Signé: JWT_REFRESH_SECRET│    │
│  │ Algo: HS256      │    │ Algo: HS256             │     │
│  │ Stockage: Client  │    │ Stockage: Client (sûr) │     │
│  └──────────────────┘    └────────────────────────┘     │
│                                                          │
│  Utilisation :                                    │
│  - Header: Authorization: Bearer <access_token>         │
│  - Quand l'access token expire :                        │
│    → POST /api/v1/auth/login avec refresh token         │
│    → Obtention d'un nouveau token pair                  │
└──────────────────────────────────────────────────────────┘
```

### Contenu du token JWT

```json
{
  "sub": "uuid-de-l-utilisateur",
  "phone": "+212612345678",
  "iat": 1720800000,
  "exp": 1720803600
}
```

### Sécurité de l'OTP

| Paramètre | Valeur défaut | Description |
|-----------|---------------|-------------|
| Longueur du code | 6 chiffres | Code numérique à usage unique |
| Durée de validité (TTL) | 300 secondes (5 min) | Auto-suppression dans Redis |
| Nombre max de tentatives | 3 | Au-delà, blocage |
| Durée de blocage | 1800 secondes (30 min) | Aucune vérification OTP possible |

> ⚠️ `JWT_SECRET` et `JWT_REFRESH_SECRET` doivent être des secrets forts (32+ caractères aléatoires) en production. Les valeurs par défaut dans docker-compose sont des valeurs de développement à changer impérativement.

---

## 8. Gestion des OTP (Redis)

### Structure des clés Redis

```
Clé                              Valeur          TTL
─────────────────────────────────────────────────────────────────
otp:+212612345678               "483729"        300s (5 min)
otp:attempts:+212612345678      "2"             300s (5 min)
otp:blocked:+212612345678       "1"             1800s (30 min)
```

### Cycle de vie

```
1. generateAndStore(phone)
   → Génère code à 6 chiffres
   → SET otp:phone = code EX 300
   → DEL otp:attempts:phone
   → Retourne le code (sera envoyé par SMS)

2. verify(phone, submittedCode)
   → GET otp:phone → storedCode
   → Si storedCode === null OU storedCode !== submittedCode :
       → INCR otp:attempts:phone
       → Si attempts >= maxAttempts (3) :
           → SET otp:blocked:phone = "1" EX 1800
       → Retourne false
   → Si code valide :
       → DEL otp:phone, otp:attempts:phone
       → Retourne true

3. isBlocked(phone)
   → GET otp:blocked:phone
   → Retourne true si clé existe
```

---

## 9. Envoi SMS (Infobip)

### Mode développement

Quand `NODE_ENV !== 'production'` (cas du docker-compose en `development`) :

```
[DEV-OTP] Code pour +2126XXXXXXXX : 483729
```

Le code est simplement loggé dans la console du container. Aucun SMS réel n'est envoyé.

### Mode production

Quand `NODE_ENV === 'production'` :

```
POST https://api.infobip.com/sms/2/text/advanced
Authorization: App {INFOBIP_API_KEY}
Content-Type: application/json

{
  "messages": [{
    "destinations": [{ "to": "2126XXXXXXXX" }],
    "from": "AlKatra",
    "text": "Al Katra Bel Qatra : votre code de vérification est 483729. Valable 5 minutes."
  }]
}
```

- Timeout : 10 secondes
- En cas d'échec : `InternalServerErrorException` avec message "Impossible d'envoyer le code de vérification"

---

## 10. Module Keycloak (Phase 2)

### État actuel

Le module Keycloak est présent mais **n'est pas utilisé pour l'authentification réelle**. Comme indiqué dans le commentaire du service :

```
/**
 * Préparation Phase 2 : ce service NE gère PAS l'authentification produit en Phase 1
 * (celle-ci repose sur le JWT natif NestJS, cf. auth.service.ts / jwt.strategy.ts).
 * Il permet uniquement de vérifier que le realm/client Keycloak sont bien configurés,
 * en amont de la bascule OIDC prévue en Phase 2.
 */
```

### Fonctions disponibles

| Fonction | Description | Utilisation actuelle |
|----------|-------------|---------------------|
| `getAdminToken()` | Obtient un token admin Keycloak via OIDC (grant_type=password) | Diagnostic uniquement |
| `realmExists(realmName)` | Vérifie si un realm existe dans Keycloak | Diagnostic uniquement |
| `clientExists(realmName, clientId)` | Vérifie si un client OIDC existe | Diagnostic uniquement |

### Stratégie

- **Phase 1** (actuelle) : authentification via JWT natif NestJS + OTP SMS
- **Phase 2** (future) : migration vers Keycloak (OIDC) avec SSO

---

## 11. Profil utilisateur (interne et public)

### Deux contrôleurs distincts

#### Contrôleur public (`/api/v1/user/profile`)

- `UserController` avec préfixe `api/v1/user`
- Protégé par `JwtAuthGuard`
- Endpoint : `GET /profile`
- Utilise `@CurrentUser()` pour obtenir l'utilisateur connecté
- Appelle `UserService.getProfile(userId)`

#### Contrôleur interne (`/internal/user/:userId`)

- `InternalUserController` avec préfixe `internal/user`
- **Aucun guard JWT** — accessible uniquement depuis le réseau Docker interne
- Endpoints :
  - `GET /:userId` → `InternalUserService.getProfile(userId)` (lecture)
  - `PATCH /:userId` → `InternalUserService.updateProfile(userId, data)` (mise à jour name/preferredLanguage)
- C'est ce contrôleur que `user-service` appelle en HTTP

### Ce que retourne le profil

```json
{
  "id": "uuid-v4",
  "phone": "+212612345678",
  "name": "Ahmed",
  "preferredLanguage": "fr",
  "createdAt": "2026-06-28T11:18:00.000Z"
}
```

---

## 12. Health checks

### `GET /health`

```json
{
  "status": "ok",
  "service": "auth-service",
  "phase": "placeholder — Phase 1 not implemented",
  "timestamp": "2026-07-13T10:00:00.000Z"
}
```

- Ne dépend d'aucun service externe
- Simple indicateur que le processus Node.js tourne
- Utilisé par Docker healthcheck

### Healthcheck Docker

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/health"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 40s
```

---

## 13. Métriques Prometheus

Le module `metrics` expose des métriques Prometheus via `prom-client`.

### Métriques définies

| Nom | Type | Description |
|-----|------|-------------|
| `auth_otp_requests_total` | Counter | Nombre total de demandes OTP |
| `auth_otp_verified_total` | Counter | Nombre total d'OTP vérifiés avec succès |
| `auth_otp_failed_total` | Counter | Nombre total d'échecs de vérification OTP |
| `auth_login_total` | Counter | Nombre total de connexions (via refresh token) |
| `auth_request_duration_seconds` | Histogram | Durée des requêtes HTTP (labels : method, route, status_code) |
| `auth_users_total` | Gauge | Nombre total d'utilisateurs en base (non implémenté, toujours 0) |

### Endpoint

```
GET /metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

> ⚠️ Les compteurs sont déclarés mais **ne sont pas incrémentés** dans le code actuel (pas d'appel à `.inc()` dans `auth.service.ts`). Les métriques resteront à 0 tant que ce n'est pas implémenté.

---

## 14. Modèle de données (PostgreSQL)

### Table `users`

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             VARCHAR(255) UNIQUE NOT NULL,
  name              VARCHAR(100) NULL,
  preferred_language VARCHAR(10) DEFAULT 'fr',  -- 'fr', 'ar', 'darija'
  otp_attempts      INTEGER DEFAULT 0,
  otp_blocked_until TIMESTAMP NULL,
  last_login_at     TIMESTAMP NULL,
  keycloak_id       VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now()
);
```

### Entité TypeORM

```typescript
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')  id: string;
  @Column({ unique: true })        phone: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) name: string | null;
  @Column({ type: 'varchar', length: 10, default: 'fr', name: 'preferred_language' })
    preferredLanguage: 'fr' | 'ar' | 'darija';
  @Column({ type: 'int', default: 0, name: 'otp_attempts' }) otpAttempts: number;
  @Column({ type: 'timestamp', nullable: true, name: 'otp_blocked_until' })
    otpBlockedUntil: Date | null;
  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
    lastLoginAt: Date | null;
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'keycloak_id' })
    keycloakId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

> ⚠️ `synchronize: false` dans `app.module.ts` → TypeORM ne crée ni ne modifie automatiquement la table. Le schéma doit être appliqué manuellement (via `infra/postgres/init.sql` ou migration).

---

## 15. Tests

### Tests unitaires

```bash
npm run test          # Lance tous les tests Jest
npm run test:watch    # Mode watch
npm run test:cov      # Avec couverture
```

| Fichier de test | Ce qu'il teste |
|-----------------|----------------|
| `test/auth.service.spec.ts` | Tests du `AuthService` |
| `test/otp.service.spec.ts` | Tests du `OtpService` |
| `test/auth.service.spec.js` | Ancien test JS (probablement obsolète) |
| `test/otp.service.spec.js` | Ancien test JS (probablement obsolète) |

---

## 16. Docker

### Dockerfile (multi-stage, 3 cibles)

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
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# Stage 3 : Production — image finale légère
FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
USER nodeuser
EXPOSE 3001
CMD ["node", "dist/main"]
```

**Explication des stages / cibles :**

| Stage | Utilisation | Rôle |
|-------|-------------|------|
| `builder` | Intermédiaire | Installe toutes les dépendances et compile le TypeScript (`npm run build`) |
| `development` | `docker compose` (cible par défaut dans docker-compose) | Installe les dépendances, copie le code source, lance `nest start --watch` (hot reload) |
| `production` | Déploiement réel | Installe uniquement les dépendances de production, copie le `dist/` compilé, exécute avec un utilisateur non-root (`nodeuser`) |

**Points clés :**
- Le contexte de build est `apps/auth-service/` (pas la racine du monorepo, contrairement à `user-service`)
- Le volume monté dans docker-compose (`- ./../../apps/auth-service/src:/app/src`) permet le hot-reload en développement
- L'image de production utilise un utilisateur non-root pour la sécurité
- Le port exposé est `3001`

### Service dans docker-compose.yml

```yaml
auth-service:
  build:
    context: ./../../apps/auth-service
    dockerfile: Dockerfile
    target: development           # Cible "development" pour le hot-reload
  container_name: alkatra-auth
  restart: unless-stopped
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    keycloak:
      condition: service_started
  environment:
    NODE_ENV: development
    AUTH_SERVICE_PORT: 3001
    DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-alkatra_db}
    REDIS_HOST: redis
    REDIS_PORT: 6379
    REDIS_PASSWORD: ${REDIS_PASSWORD:-alkatra_redis_pass}
    JWT_SECRET: ${JWT_SECRET:-CHANGE_ME_JWT_SECRET_32_CHARS}
    JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-CHANGE_ME_REFRESH_SECRET_32_CHARS}
    JWT_ACCESS_EXPIRATION: 3600
    JWT_REFRESH_EXPIRATION: 2592000
    OTP_TTL_SECONDS: 3600
    OTP_MAX_ATTEMPTS: 3
    OTP_BLOCK_DURATION_SECONDS: 3600
    INFOBIP_API_KEY: ${INFOBIP_API_KEY:-}
    INFOBIP_BASE_URL: ${INFOBIP_BASE_URL:-https://api.infobip.com}
    INFOBIP_SENDER: ${INFOBIP_SENDER:-AlKatra}
    KEYCLOAK_URL: http://keycloak:8080
    KEYCLOAK_REALM: alkatra
    KEYCLOAK_CLIENT_ID: alkatra-web
    KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-}
  ports:
    - "3001:3001"
  volumes:
    - ./../../apps/auth-service/src:/app/src   # Hot-reload
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/health"]
    interval: 15s
    timeout: 10s
    retries: 5
    start_period: 40s
  networks:
    - alkatra-net
  profiles:
    - phase1
```

---

## 17. Dépendances et ordre de démarrage

### Chaîne de dépendances complète

```
postgres ──▶ keycloak ──▶ auth-service ──▶ user-service
   │                        │
   └──▶ redis ──────────────┘
```

### Détail

| Service | Dépend de | Condition |
|---------|-----------|-----------|
| `auth-service` | `postgres` | `service_healthy` (PostgreSQL doit accepter les connexions) |
| `auth-service` | `redis` | `service_healthy` (Redis doit répondre au ping) |
| `auth-service` | `keycloak` | `service_started` (Keycloak doit être lancé, pas nécessairement healthy) |
| `user-service` | `auth-service` | `service_healthy` |

### Réseau

Tous les services sont sur le réseau Docker `alkatra-net` (bridge).

---

## 18. Limites constatées

### Bugs / Problèmes identifiés

1. **Métriques Prometheus non incrémentées** : Les compteurs (`auth_otp_requests_total`, `auth_otp_verified_total`, `auth_otp_failed_total`, `auth_login_total`, `auth_users_total`) sont déclarés mais **jamais incrémentés** dans le code. Toutes les métriques resteront à 0.

2. **`auth_request_duration_seconds` non implémenté** : L'histogramme est déclaré mais aucun middleware/interceptor NestJS ne mesure la durée des requêtes. Aucune donnée ne sera collectée.

3. **`auth_users_total` toujours à 0** : La gauge est déclarée mais aucune requête de comptage n'est faite vers PostgreSQL pour la mettre à jour.

4. **Endpoint `/internal/user/:userId` sans authentification** : Comme indiqué dans le commentaire, cet endpoint est "accessible uniquement depuis le réseau Docker interne". En l'état, il n'a aucun guard — n'importe quel service sur le réseau Docker peut appeler cet endpoint.

5. **OTP_TTL_SECONDS incohérent** : Dans `docker-compose.yml`, la valeur est `3600` (1h) alors que la valeur par défaut dans le code est `300` (5 min). Le docker-compose force donc un TTL d'1 heure, ce qui est long pour un code OTP.

6. **OTP_BLOCK_DURATION_SECONDS incohérent** : Dans `docker-compose.yml`, la valeur est `3600` (1h) alors que la valeur par défaut dans le code est `1800` (30 min).

### Limitations fonctionnelles

7. **Pas de rate limiting** : Aucune protection contre les appels abusifs aux endpoints `/register` ou `/verify-otp`.
8. **Pas de logout** : Aucun endpoint pour révoquer les tokens (le refresh token est utilisable jusqu'à expiration).
9. **Keycloak non fonctionnel** : Le module Keycloak est présent mais n'est pas intégré à l'authentification réelle.
10. **Tests JS obsolètes** : Les fichiers `test/auth.service.spec.js` et `test/otp.service.spec.js` sont probablement des vestiges d'une version précédente.

---

## 19. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Microservice d'authentification (OTP SMS + JWT) |
| **Framework** | NestJS 10 |
| **Port** | 3001 |
| **Base de données** | PostgreSQL (TypeORM, table `users`) |
| **Cache** | Redis (ioredis, OTP, tentatives, blocage) |
| **SMS Provider** | Infobip (API REST) |
| **Authentification** | OTP SMS → JWT (HS256, access 1h, refresh 30 jours) |
| **Communication inter-service** | Endpoint interne `/internal/user/:userId` (GET/PATCH) |
| **Health check** | `GET /health` (statique) |
| **Métriques** | Prometheus (`/metrics`) |
| **Profil Docker** | `phase1` (démarrage explicite requis) |
| **Dépendances** | PostgreSQL (healthy), Redis (healthy), Keycloak (started) |
| **Tests** | Jest (auth.service, otp.service) |
| **Langage** | TypeScript |
| **Node.js** | 20 (Alpine) |

### Commandes essentielles

```bash
# Démarrer avec Docker (profil phase1)
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d

# Tester le healthcheck
curl http://localhost:3001/health

# Demander un code OTP (développement)
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "+212612345678"}'
# Réponse : {"success":true,"message":"OTP envoyé","expiresAt":"..."}
# Le code est loggé dans les logs du container : [DEV-OTP] Code pour +2126XXXX...

# Vérifier le code OTP (remplacer CODE par le code vu dans les logs)
curl -X POST http://localhost:3001/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+212612345678", "otp": "483729"}'
# Réponse : {"accessToken":"...","refreshToken":"...","expiresIn":3600,"tokenType":"Bearer","user":{...}}

# Récupérer le profil
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:3001/api/v1/user/profile

# Tester l'endpoint interne (depuis un autre container Docker)
curl http://auth-service:3001/internal/user/uuid-user-1

# Lancer les tests
cd apps/auth-service && npm test

# Voir les logs Docker
docker compose -f infra/docker/docker-compose.yml logs -f auth-service