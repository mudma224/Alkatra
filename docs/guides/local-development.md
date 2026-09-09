# Guide de démarrage local

Ce guide décrit l'installation et le lancement de l'ensemble de la plateforme Al Katra Bel Qatra sur un poste de développement. La plateforme est organisée en monorepo npm workspaces orchestré par Turborepo, avec une infrastructure Docker Compose et des services applicatifs Node.js (NestJS) et Python (FastAPI, Spark).

## Prérequis

Les outils suivants doivent être installés et accessibles dans le `PATH` :

| Outil | Version minimale | Rôle |
| --- | --- | --- |
| Node.js | 20.0+ | Services Node.js (NestJS), Turborepo, simulateur de capteur |
| npm | 10.0+ | Gestion des dépendances et des workspaces |
| Python | 3.11+ | Services Python (ml-inference-service, spark-jobs) |
| Docker Desktop | récent | Infrastructure (Postgres, MongoDB, Kafka, etc.) et builds d'images |
| Git | récent | Clonage du dépôt, gestion des versions |

Sous Windows, Git Bash est recommandé pour exécuter les scripts shell du dépôt (`scripts/*.sh`).

Le fichier `.nvmrc` à la racine fixe la version de Node attendue par `nvm`.

## Installation des dépendances

Depuis la racine du dépôt :

```bash
npm install
```

Cette commande installe les dépendances de tous les workspaces déclarés dans le `package.json` racine :

```json
"workspaces": [
  "apps/*",
  "packages/*",
  "frontend/*"
]
```

Les workspaces partagés `packages/shared-types` et `packages/shared-utils` sont construits avant les services qui en dépendent via les dépendances de tâches Turborepo (`dependsOn: ["^build"]`).

## Variables d'environnement

Le fichier `.env.example` contient toutes les variables attendues par la stack. Le copier en `.env` puis adapter les valeurs :

```bash
cp .env.example .env
```

Le fichier `.env` ne doit pas être commité (présent dans `.gitignore`).

Les scripts Docker racine passent explicitement `--env-file .env` à Docker Compose. Ce comportement évite que Compose retombe silencieusement sur les valeurs par défaut définies dans `docker-compose.yml` lorsque `.env` est absent ou incomplet.

Les variables couvrent :

- les identifiants PostgreSQL multi-bases (`AUTH_DB_PASSWORD`, `FARM_DB_PASSWORD`, `RECOMMENDATION_DB_PASSWORD`, `NOTIFY_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `MLFLOW_DB_PASSWORD`) ;
- MongoDB (`MONGO_USER`, `MONGO_PASSWORD`) et Redis (`REDIS_PASSWORD`) ;
- MQTT (`MQTT_USER`, `MQTT_PASSWORD`, vides en développement car `allow_anonymous true`) ;
- Grafana (`GRAFANA_USER`, `GRAFANA_PASSWORD`) ;
- Keycloak (`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`) ;
- les secrets JWT (`JWT_SECRET`, `JWT_REFRESH_SECRET`) partagés entre auth-service, user-service, farm-service et recommendation-service ;
- MLflow (`MLFLOW_TRACKING_URI`) et les chemins de modèles XGBoost.

## Lancer l'infrastructure

L'infrastructure Docker est définie dans `infra/docker/docker-compose.yml`. Deux profils distincts sont proposés.

### Stack de base

```bash
npm run docker:up
```

Démarre l'infrastructure et les services IoT/ML : PostgreSQL (PostGIS), MongoDB, Redis, Kafka (KRaft), Mosquitto, MinIO, MailHog, MLflow, Prometheus, Grafana, ainsi que `iot-service`, `spark-job` et `ml-inference-service`.

### Stack complète (profil `phase1`)

```bash
npm run docker:up-phase1
```

Active en plus les services métier via le profil Docker `phase1` : Keycloak, `auth-service`, `user-service`, `farm-service`, `recommendation-service` et la passerelle Nginx (`gateway`).

### Arrêt et réinitialisation

```bash
npm run docker:down              # arrête la stack de base
npm run docker:down-phase1       # arrête la stack complète (profil phase1)
npm run docker:logs              # suit les logs en temps réel
npm run docker:reset             # down -v puis up (supprime les volumes)
```

`docker:reset` supprime les volumes Docker, donc toutes les données Postgres, MongoDB, Grafana, Kafka, etc. sont effacées.

## Lancer les services en développement

### Tous les services en parallèle

```bash
npm run dev
```

Exécute la tâche `dev` de Turborepo (`turbo run dev --parallel`) sur tous les workspaces qui la définissent. Les services Node démarrent en mode `--watch`.

### Service par service

Pour exécuter un service isolé, utiliser le sélecteur de workspace `-w` :

```bash
npm run dev -w @alkatra/iot-service
npm run dev -w @alkatra/auth-service
npm run dev -w @alkatra/user-service
npm run dev -w @alkatra/farm-service
npm run dev -w @alkatra/recommendation-service
```

Les services Python (`ml-inference-service`, `spark-jobs`) n'exposent pas de tâche `dev` dans Turborepo ; ils tournent dans leur conteneur Docker. Le frontend possède sa propre tâche `dev` dans `frontend/`.

### Construire et tester

```bash
npm run build        # turbo run build (tous les workspaces)
npm run test         # turbo run test
npm run test:cov     # turbo run test:cov (avec couverture)
npm run lint         # turbo run lint
npm run format       # prettier --write sur ts/js/json/md
```

## Simuler un capteur

Le script `scripts/simulate-sensor.js` publie un contrat capteur IA v2 vers MQTT, pour alimenter la chaîne IoT complète (Mosquitto → iot-service → Kafka → spark-job → ml-inference-service).

```bash
npm run simulate
```

Avec un intervalle personnalisé (en millisecondes) :

```bash
node scripts/simulate-sensor.js 5000
```

Le topic de publication suit la convention :

```text
alkatra/farm/{FARM_ID}/parcel/{PARCEL_ID}/sensor/{DEVICE_ID}/data
```

Variables d'environnement optionnelles du simulateur :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `FARM_ID` | `farm_test_001` | Identifiant de ferme |
| `PARCEL_ID` | `parcel_test_001` | Identifiant de parcelle |
| `DEVICE_ID` | `esp32-sim-001` | Identifiant d'équipement |
| `MQTT_HOST` | `localhost` | Hôte du broker MQTT |
| `MQTT_PORT` | `1883` | Port du broker MQTT |

## Interfaces utiles

Une fois la stack démarrée, les interfaces suivantes sont accessibles depuis le navigateur.

| Service | URL | Identifiants par défaut |
| --- | --- | --- |
| API Gateway (Nginx) | http://localhost:8080 | — |
| Grafana | http://localhost:3000 | `admin` / valeur de `GRAFANA_PASSWORD` |
| Prometheus | http://localhost:9090 | — |
| Kafka UI | http://localhost:8090 | — |
| MinIO Console | http://localhost:9001 | valeur de `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |
| MLflow | http://localhost:5001 | — |
| MailHog UI | http://localhost:8025 | — |
| Keycloak | http://localhost:8081 | valeur de `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` |
| Mosquitto WebSocket | ws://localhost:9010 | — |

La passerelle Nginx et Keycloak ne sont exposés que lorsque le profil `phase1` est activé (`npm run docker:up-phase1`).

Les API applicatives directes sont :

| Service | URL de santé |
| --- | --- |
| iot-service | http://localhost:3005/health |
| auth-service | http://localhost:3001/health |
| user-service | http://localhost:3002/health/ready |
| farm-service | http://localhost:3003/api/v1/health/ready |
| recommendation-service | http://localhost:3004/health/ready |
| ml-inference-service | http://localhost:8000/health |

## Commandes essentielles

| Commande | Description |
| --- | --- |
| `npm install` | Installe les dépendances de tous les workspaces |
| `npm run docker:up` | Démarre la stack de base |
| `npm run docker:up-phase1` | Démarre la stack complète (profil phase1) |
| `npm run docker:down` | Arrête la stack de base |
| `npm run docker:down-phase1` | Arrête la stack complète |
| `npm run docker:logs` | Suit les logs Docker en temps réel |
| `npm run docker:reset` | Supprime les volumes et redémarre la stack de base |
| `npm run dev` | Lance tous les services Node en mode watch (Turborepo) |
| `npm run build` | Construit tous les workspaces |
| `npm run test` | Lance les tests de tous les workspaces |
| `npm run test:cov` | Lance les tests avec couverture |
| `npm run lint` | Lance ESLint sur tous les workspaces |
| `npm run format` | Reformate le code avec Prettier |
| `npm run simulate` | Publie des messages capteur vers MQTT |
| `npm run health` | Vérifie l'état des conteneurs et des endpoints HTTP |
| `npm run models:register` | Enregistre les modèles ML dans MLflow |
| `npm run validate:mongodb` | Valide les index MongoDB |
| `npm run validate:pipeline` | Valide la chaîne IoT de bout en bout |

## Vérifier l'état de la plateforme

Le script `scripts/health-check.sh` interroge les conteneurs Docker (via leur healthcheck) et les endpoints HTTP des services web et applicatifs.

```bash
npm run health
```

Il affiche l'état de PostgreSQL, MongoDB, Redis, Kafka, Mosquitto, iot-service et spark-job côté Docker, ainsi que Grafana, Kafka UI, Prometheus, MailHog, MLflow, iot-service et ml-inference-service côté HTTP, et le nombre de documents dans la collection MongoDB `ai_sensor_features`.
