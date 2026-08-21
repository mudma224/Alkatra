# CI/CD — Intégration et livraison continues

Ce document décrit les pipelines GitHub Actions qui vérifient le code du monorepo à chaque `push` et chaque Pull Request.

## Vue d'ensemble

Le monorepo est vérifié par neuf workflows GitHub Actions, définis dans `.github/workflows/`. Chaque workflow se déclenche sur les branches `main` et `develop`. Les workflows spécialisés (`ci-iot`, `ci-ml`, `ci-spark`, `ci-auth`, `ci-farm`, `ci-recommendation`, `ci-alert`, `ci-frontend`) utilisent des filtres de chemins (`paths`) pour ne s'exécuter que lorsqu'un service concerné est modifié. Le workflow `ci-common` s'exécute sur l'ensemble du dépôt, sans filtre de chemins.

Les versions d'exécuteur utilisées en CI :

| Runtime | Version |
| --- | --- |
| Node.js | 20 |
| Python | 3.11 |
| Runner | `ubuntu-latest` |

## Workflows

| Workflow | Fichier | Cible (filtres `paths`) | Jobs |
| --- | --- | --- | --- |
| Common | `ci-common.yml` | Tout le dépôt (aucun filtre) | Lint + Typecheck, Build Docker, Validate Kubernetes |
| IoT | `ci-iot.yml` | `apps/iot-service/**`, `packages/shared-types/**` | Test IoT Service |
| ML | `ci-ml.yml` | `apps/ml-inference-service/**`, `apps/spark-jobs/**` | Test ML + Spark (Feature Engineering) |
| Spark | `ci-spark.yml` | `apps/spark-jobs/**` | Test Feature Engineering, Validate Spark Docker Build |
| Auth | `ci-auth.yml` | `apps/auth-service/**`, `packages/shared-types/**`, `.github/workflows/ci-auth.yml` | Lint, Build & Test |
| Farm | `ci-farm.yml` | `apps/farm-service/**`, `packages/shared-types/**`, `packages/shared-utils/**`, `.github/workflows/ci-farm.yml` | Lint/Build/Test (avec Postgres PostGIS), Build Docker Image |
| Recommendation | `ci-recommendation.yml` | `apps/recommendation-service/**`, `packages/shared-types/**`, `.github/workflows/ci-recommendation.yml` | Lint, Test & Build, Vérification build Docker |
| Alert | `ci-alert.yml` | `apps/alert-service/**`, `packages/shared-types/**`, `.github/workflows/ci-alert.yml` | Lint, Test & Build, Vérification build Docker |
| Frontend | `ci-frontend.yml` | `frontend/**` | Lint, Test & Build du frontend |

## Détail par workflow

### ci-common.yml

S'exécute sur tout `push` ou PR vers `main` et `develop`, sans filtre de chemins. Trois jobs :

1. **Lint + Typecheck** — `npm ci` à la racine, puis `npm run lint` (ESLint sur tout le TypeScript du monorepo via Turborepo) et `npx prettier --check "**/*.{ts,js,json}"` pour vérifier le formatage.
2. **Build Docker Images** — dépend du job de lint. Construit trois images :
   - `iot-service` : `docker build apps/iot-service --target development -t alkatra-iot:ci` (requis) ;
   - `spark-jobs` : build avec `continue-on-error: true` (image lourde) ;
   - `ml-inference-service` : build avec `continue-on-error: true` (modèles non disponibles en CI).
3. **Validate Kubernetes Manifests** — installe `kubeconform` depuis les releases GitHub, puis exécute `kubeconform -strict -summary infra/kubernetes/`. La validation se fait par analyse statique des manifests, sans cluster Kubernetes et sans `kubectl dry-run`.

### ci-iot.yml

Se déclenche sur les modifications de `apps/iot-service/**` et `packages/shared-types/**` (push) ; pour les PR, seul `apps/iot-service/**` est surveillé.

Job **Test IoT Service** :

- `npm ci` dans `apps/iot-service` ;
- `npm run lint` ;
- `npm run test:cov` (Jest avec couverture) avec les variables d'environnement :
  ```
  NODE_ENV=test
  MQTT_BROKER_URL=mqtt://localhost:1883
  KAFKA_BROKERS=localhost:9092
  MONGODB_URI=mongodb://localhost:27017/test
  ```
  Aucun broker réel n'est démarré en CI ; les tests s'appuient sur des mocks MQTT et Kafka.
- Upload du rapport de couverture vers Codecov (`codecov-action@v4`, dossier `apps/iot-service/coverage`, flag `iot-service`).

### ci-ml.yml

Se déclenche sur les modifications de `apps/ml-inference-service/**` et `apps/spark-jobs/**`.

Job **Test ML + Spark (Feature Engineering)** :

- Python 3.11.
- Pour `ml-inference-service` : `pip install -r requirements.txt pytest pytest-asyncio httpx pytest-cov`, puis `pytest tests/ -v --cov=app --cov-report=xml` avec `ENVIRONMENT=test` et `MLFLOW_TRACKING_URI=http://localhost:5001`. MLflow étant indisponible en CI, le service bascule en mode DEMO (sans modèles réels).
- Pour `spark-jobs` : `pip install -r requirements.txt pytest`, puis `pytest tests/ -v -k "not spark"` (tests de feature engineering, fonctions pures sans cluster Spark).
- Lint Python via `ruff check apps/ml-inference-service/app/ apps/spark-jobs/jobs/`.

### ci-spark.yml

Se déclenche sur les modifications de `apps/spark-jobs/**`.

Deux jobs :

1. **Test Feature Engineering (sans Spark)** — Python 3.11. `pip install -r requirements.txt pytest pytest-cov`, puis `pytest tests/ -v --cov=jobs -k "not spark and not kafka"` avec `PYTHONPATH=.`, `KAFKA_BROKERS=localhost:9092` et `OPEN_METEO_BASE_URL=https://api.open-meteo.com/v1`. Les tests Spark et Kafka sont exclus (cluster et broker non disponibles en CI). Lint via `ruff check apps/spark-jobs/jobs/ --ignore E501 || true` (les calculs ETo / Penman-Monteith sont verbeux, E501 « line too long » est ignoré).
2. **Validate Spark Docker Build** — dépend du job précédent. `docker build apps/spark-jobs -t alkatra-spark:ci` (timeout 15 min), puis `docker run` pour vérifier que l'image démarre (continue-on-error, le conteneur pouvant terminer immédiatement si aucun job Python n'est lancé).

### ci-auth.yml

Se déclenche sur les modifications de `apps/auth-service/**`, `packages/shared-types/**` et du fichier workflow lui-même.

Job **Lint, Build & Test** — installe les dépendances du monorepo via `npm ci`, puis exécute au niveau workspace :

- `npm run lint --workspace=auth-service` ;
- `npm run build --workspace=auth-service` ;
- `npm run test --workspace=auth-service`.

### ci-farm.yml

Se déclenche sur les modifications de `apps/farm-service/**`, `packages/shared-types/**`, `packages/shared-utils/**` et du fichier workflow lui-même.

Job **Lint, Build & Test** — utilise un service conteneur Postgres avec l'image `postgis/postgis:16-3.4-alpine` (`POSTGRES_USER=farm_user`, `POSTGRES_DB=farm_db`). Étapes :

- `npm ci` à la racine ;
- `npm run build --workspace=@alkatra/shared-types` (dépendance compilée avant le service) ;
- `npm run lint --workspace=farm-service` ;
- `npm run build --workspace=farm-service` ;
- initialisation du schéma de test : `psql -h localhost -U farm_user -d farm_db -f infra/postgres/schemas/farm-db.sql` (avec `PGPASSWORD=farm_dev_pass`) ;
- `npm run test --workspace=farm-service` avec les variables Postgres et `JWT_SECRET=test_jwt_secret_for_ci`.

Job **Build Docker Image** — dépend du job de test. `docker build apps/farm-service --target development -t alkatra-farm:ci`.

### ci-alert.yml

Se déclenche sur les modifications de `apps/alert-service/**`, `packages/shared-types/**` et du fichier workflow lui-même (push) ; pour les PR, seuls le service et shared-types sont surveillés. Même structure que `ci-recommendation.yml` :

Job **Lint, Test & Build** — `npm ci` à la racine du monorepo, puis au niveau workspace :

- `npm run lint --workspace=@alkatra/alert-service` ;
- `npm run test --workspace=@alkatra/alert-service -- --coverage` (Jest + ts-jest, 10 suites unitaires, aucun broker Kafka ni base réelle — tout est mocké) ;
- `npm run build --workspace=@alkatra/alert-service` ;
- upload du rapport de couverture (`apps/alert-service/coverage`, rétention 7 jours).

Job **Vérification build Docker (sans push)** — dépend du job précédent. `docker/build-push-action@v5` avec `context: .` et `file: apps/alert-service/Dockerfile` (multi-stage, contexte racine pour les workspaces), tag `alkatra/alert-service:ci`.

## Validation Kubernetes

La validation des manifests Kubernetes s'effectue avec `kubeconform`, outil d'analyse statique des ressources Kubernetes. La commande exécutée en CI :

```bash
kubeconform -strict -summary infra/kubernetes/
```

Cette approche ne requiert ni cluster Kubernetes ni `kubectl`. Elle valide la conformité des manifests par rapport aux schémas des versions Kubernetes supportées. Les ressources serveur (CRD, admission webhooks) peuvent nécessiter des configurations supplémentaires documentées dans le dépôt `kubeconform`.

## Commandes locales équivalentes

Pour reproduire localement les vérifications CI avant de pousser :

```bash
# Lint TypeScript sur tout le monorepo
npm run lint

# Vérifier le formatage Prettier
npx prettier --check "**/*.{ts,js,json}"

# Tests de tous les workspaces Node
npm run test
npm run test:cov

# Tests d'un service précis
npm run test --workspace=auth-service
npm run test --workspace=farm-service
npm run test:cov -w @alkatra/iot-service

# Build de tous les workspaces
npm run build

# Tests Python (ml-inference-service)
cd apps/ml-inference-service && pytest tests/ -v

# Tests Python (spark-jobs, sans Spark ni Kafka)
cd apps/spark-jobs && pytest tests/ -v -k "not spark and not kafka"

# Lint Python
ruff check apps/ml-inference-service/app/ apps/spark-jobs/jobs/

# Build d'une image Docker
docker build apps/iot-service --target development -t alkatra-iot:local
docker build apps/farm-service --target development -t alkatra-farm:local

# Valider les manifests Kubernetes localement
kubeconform -strict -summary infra/kubernetes/
```

## Lire un échec CI

Lorsqu'un workflow échoue, GitHub notifie par email et affiche le run en rouge dans l'onglet **Actions**. La procédure de diagnostic :

1. Onglet **Actions** → cliquer sur le run en échec.
2. Sélectionner le job concerné.
3. Déployer l'étape rouge pour lire le message d'erreur exact.

Causes d'échec fréquentes :

| Symptôme | Cause probable | Action |
| --- | --- | --- |
| `Missing script: "test:cov"` | Script absent d'un `package.json` | Ajouter le script dans le `package.json` du workspace |
| `Cannot find module` | `npm ci` a échoué | Vérifier que `package-lock.json` est commité et à jour |
| `Parsing error: Cannot read tsconfig.json` | `tsconfig.json` manquant | Créer le `tsconfig.json` du workspace |
| `COPY failed: file not found` (Docker) | Chemin Dockerfile incorrect | Corriger le `COPY` dans le Dockerfile |
| `LF will be replaced by CRLF` | Fins de ligne Windows | Forcer LF via `.gitattributes` (`*.sh text eol=lf`) |
| `kubeconform` signale une ressource | Manifest invalide ou schéma inconnu | Corriger le manifest ou ajouter un `schemaLocation` |
