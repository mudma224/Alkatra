# `apps/user-service` — Documentation factuelle

Ce document décrit uniquement ce qui est présent dans `apps/user-service` et dans son entrée `user-service` du `docker-compose.yml` au moment de la lecture. Rien n'est supposé au-delà du code et de la configuration visibles.

## Rôle du service

`user-service` est un microservice NestJS dédié au profil utilisateur. Dans l'état actuel du code, il fait trois choses concrètes :

1. il démarre une API NestJS avec un préfixe global `api/v1`;
2. il se connecte à PostgreSQL via TypeORM;
3. il expose des routes protégées par JWT pour lire et modifier un profil utilisateur.

Il expose aussi un endpoint de santé et une route `farms` qui n'est pas implémentée.

## Vue d'ensemble du comportement réel

- L'application démarre avec `NestFactory.create(AppModule)` dans `src/main.ts`.
- Toutes les routes HTTP passent sous le préfixe global `api/v1`.
- Une `ValidationPipe` globale est active avec `whitelist`, `forbidNonWhitelisted` et `transform`.
- La configuration obligatoire est validée au démarrage.
- TypeORM est configuré pour PostgreSQL avec une seule entité déclarée: `User`.
- L'authentification repose sur un bearer token JWT signé en `HS256` avec `JWT_SECRET`.
- Les routes `user` sont protégées par `JwtAuthGuard`.
- La route `farms` est protégée mais renvoie une erreur `NotImplementedException`.

## Démarrage

### Depuis le package du service

Dans `apps/user-service/package.json` :

- `npm run build` -> `nest build`
- `npm run start` -> `nest start`
- `npm run start:dev` -> `nest start --watch`
- `npm run start:prod` -> `node dist/main.js`
- `npm run lint` -> `eslint "{src,test}/**/*.ts" --fix`
- `npm run test` -> `jest`
- `npm run test:watch` -> `jest --watch`
- `npm run test:cov` -> `jest --coverage`

### Depuis la racine du monorepo

Le `package.json` racine fournit aussi :

- `npm run dev` -> lance tous les workspaces en parallèle via Turbo;
- `npm run docker:up` -> démarre la stack Docker définie dans `infra/docker/docker-compose.yml`;
- `npm run docker:logs`, `npm run docker:down`, `npm run docker:reset`.

### Point important sur Docker Compose

Dans `infra/docker/docker-compose.yml`, `user-service` est déclaré avec `profiles: ["phase1"]`. Cela signifie que le service ne démarre pas automatiquement si le profil `phase1` n'est pas activé.

Le healthcheck actuellement déclaré dans Compose vise `http://localhost:3002/health/ready`, alors que l'application ajoute un préfixe global `api/v1`. Les routes exposées par le code sont donc sous `http://localhost:3002/api/v1/health/...`.

## Variables d'environnement

Le service valide explicitement les variables suivantes dans `src/app.module.ts` :

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`

Le fichier `apps/user-service/.env.example` ajoute aussi `PORT=3002` pour l'exécution locale.

### Configuration effective

- `PORT` -> port d'écoute de l'API, par défaut `3002` si la variable est absente.
- `DB_*` -> paramètres de connexion PostgreSQL.
- `JWT_SECRET` -> secret utilisé par la stratégie JWT.

Le `docker-compose.yml` injecte ces valeurs avec des défauts de développement et mappe `3002:3002`.

## Routes HTTP

### Santé

- `GET /api/v1/health` -> appelle la vérification de readiness.
- `GET /api/v1/health/live` -> renvoie un statut `alive`.
- `GET /api/v1/health/ready` -> exécute `SELECT 1` sur la base de données et renvoie `ready` si PostgreSQL répond.

### Utilisateur

Toutes les routes ci-dessous sont protégées par `JwtAuthGuard`.

- `GET /api/v1/user/profile` -> retourne le profil utilisateur courant.
- `PATCH /api/v1/user/profile` -> met à jour `name` et/ou `preferredLanguage`.

### Farms

- `GET /api/v1/farms` -> route présente, mais elle renvoie `NotImplementedException` avec le message `Farms listing is not implemented yet`.

## Fonctionnement interne par fichier

| Fichier | Rôle réel |
| --- | --- |
| `package.json` | Déclare le nom du package, les scripts NestJS/Jest/ESLint et les dépendances runtime et dev. |
| `tsconfig.json` | Configure la compilation TypeScript du service vers `dist/`, en ciblant `src/` uniquement. |
| `.env.example` | Donne un exemple minimal des variables nécessaires pour lancer le service localement. |
| `Dockerfile` | Construit une image multi-stage: installation workspace, build du service, puis exécution du binaire compilé. |
| `src/main.ts` | Point d'entrée NestJS, définit le préfixe global `api/v1`, active la validation globale et démarre le serveur. |
| `src/app.module.ts` | Assemble la configuration globale, la connexion PostgreSQL, les modules métier et le contrôleur de santé. |
| `src/health/health.controller.ts` | Implémente les endpoints de liveness et readiness. |
| `src/auth/auth.module.ts` | Enregistre Passport avec la stratégie par défaut `jwt`. |
| `src/auth/jwt.strategy.ts` | Lit le JWT dans le header Bearer, vérifie `JWT_SECRET`, impose `HS256` et expose `userId` et `phone` dans `req.user`. |
| `src/auth/jwt-auth.guard.ts` | Garde NestJS qui applique `AuthGuard('jwt')`. |
| `src/user/user.module.ts` | Monte la couche user avec le repository TypeORM, le contrôleur et le service. |
| `src/user/user.controller.ts` | Expose les routes `GET/PATCH /user/profile` et délègue au service. |
| `src/user/user.service.ts` | Lit et met à jour un profil utilisateur à partir du repository TypeORM, avec conversion de sortie en objet JSON stable. |
| `src/user/dto/update-profile.dto.ts` | Valide les champs autorisés pour la mise à jour du profil. |
| `src/user/entities/user.entity.ts` | Déclare l'entité PostgreSQL `users` et ses colonnes réelles. |
| `src/farms/farms.module.ts` | Déclare le module `farms` et son contrôleur. |
| `src/farms/farms.controller.ts` | Expose la route `GET /farms` mais ne fournit pas encore l'implémentation. |
| `dist/` | Artefacts générés par la compilation. Ce dossier n'est pas la source de vérité. |

## Modèle de données observé

L'entité `User` stocke les colonnes suivantes dans la table `users` :

- `id` : UUID généré automatiquement.
- `phone` : chaîne unique, indexée par `idx_users_phone`.
- `name` : texte nullable.
- `preferred_language` : chaîne, valeur par défaut `fr`.
- `otp_attempts` : entier, valeur par défaut `0`.
- `otp_blocked_until` : timestamp nullable.
- `last_login_at` : timestamp nullable.
- `keycloak_id` : texte nullable.
- `created_at` : date de création gérée par TypeORM.
- `updated_at` : date de mise à jour gérée par TypeORM.

## Sortie des endpoints profil

Le service ne renvoie pas l'entité brute. Il transforme le user en objet profil avec :

- `id`
- `phone`
- `name`
- `preferredLanguage`
- `createdAt` en chaîne ISO

La mise à jour du profil ne touche que :

- `name`
- `preferredLanguage`

## Limites constatées dans le code actuel

- Aucune route de création utilisateur n'existe dans ce service.
- Aucune route de liste de profils n'existe.
- Aucune route `farms` fonctionnelle n'est disponible pour l'instant.
- Aucun fichier de test n'est présent dans `apps/user-service/src/` au moment de la lecture.
- `TypeOrmModule.forRootAsync()` est configuré avec `synchronize: false`, donc le schéma dépend d'une migration ou d'une base déjà préparée.

## Résumé opérationnel

Si on résume l'état réel du service :

- c'est un backend NestJS de profil utilisateur;
- il dépend de PostgreSQL et d'un secret JWT partagé avec `auth-service`;
- il sait lire et mettre à jour un profil existant;
- il sait répondre à des probes de santé;
- il possède une route `farms` en placeholder;
- son packaging Docker est déjà prêt pour la compilation multi-stage.