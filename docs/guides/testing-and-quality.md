# Tests et qualité

Ce guide décrit la stratégie de test de la plateforme Al Katra Bel Qatra, les
commandes à utiliser, la configuration des runners et les spécificités par
service. L'exécution des tests en intégration continue est détaillée dans
[`guides/ci-cd.md`](./ci-cd.md).

---

## Vue d'ensemble

La stratégie de test repose sur trois axes complémentaires :

- **Tests unitaires par service** (TypeScript / Jest) : chaque service NestJS
  possède sa propre suite de tests qui couvre les contrôleurs, services et
  utilitaires, en mockant les dépendances externes (base de données, Kafka,
  services HTTP amont).
- **Tests E2E pour les services critiques** : un test bout-en-bout monte
  l'application NestJS réelle (guards, pipes, filtres) en ne remplaçant que les
  dépendances externes, afin de valider la chaîne complète.
- **Tests Python (pytest)** : les composants ML (`ml-inference-service`) et de
  feature engineering (`spark-jobs`) sont testés avec `pytest`, avec un
  fonctionnement en mode DEMO qui ne requiert aucun modèle entraîné ni Spark.

La couverture de code est collectée localement et remontée vers Codecov pour
certains services via les workflows GitHub Actions.

---

## Commandes de test

### TypeScript (monorepo Turborepo)

Depuis la racine du dépôt :

```bash
# Lancer les tests de tous les workspaces (via Turborepo)
npm run test

# Lancer les tests d'un service spécifique
npm run test -w @alkatra/auth-service
npm run test -w @alkatra/user-service
npm run test -w @alkatra/farm-service
npm run test -w @alkatra/recommendation-service
npm run test --workspace=@alkatra/alert-service
npm run test -w @alkatra/iot-service

# Lancer les tests avec collecte de couverture
npm run test:cov
```

L'alias `-w <nom-du-workspace>` cible un workspace précis. Les noms de
workspaces suivent la convention `@alkatra/<service>`.

### Python (pytest)

Pour les composants ML et Spark, se placer dans le répertoire du service et
lancer `pytest` :

```bash
# ml-inference-service (mode DEMO, sans modèles ni MLflow)
cd apps/ml-inference-service
pytest tests/ -v

# spark-jobs (fonctions pures, sans cluster Spark)
cd apps/spark-jobs
pytest tests/ -v
```

En CI, les tests ML sont lancés avec
`pytest tests/ -v --cov=app --cov-report=xml` et les tests Spark avec
`pytest tests/ -v -k "not spark and not kafka"` afin d'écarter les tests qui
nécessiteraient un cluster Spark ou Kafka.

---

## Couverture

La couverture est collectée via Jest (`test:cov`) ou `pytest-cov`. La remontée
vers Codecov est portée par les workflows CI. En particulier,
`.github/workflows/ci-iot.yml` contient une étape d'upload explicite :

```yaml
- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    directory: apps/iot-service/coverage
    flags: iot-service
```

Les autres workflows CI exécutent `test:cov` (ou `pytest --cov`) et produisent
les rapports dans le dossier `coverage/` de chaque service.

---

## Configuration Jest par service

Deux conventions coexistent dans le monorepo :

- **Fichier `jest.config.js` dédié** : utilisé par `farm-service` et
  `recommendation-service`. Ces fichiers centralisent la configuration
  (`testRegex`, `testMatch`, `collectCoverageFrom`, `moduleNameMapper`).
- **Clé `"jest"` dans `package.json`** : utilisée par `auth-service`,
  `user-service` et `iot-service`.

### Patterns de découverte des tests

| Service | Source de config | Pattern |
| --- | --- | --- |
| `auth-service` | `package.json` | `<rootDir>/src/**/*.spec.ts`, `<rootDir>/test/**/*.spec.ts` |
| `user-service` | `package.json` | `<rootDir>/src/**/*.spec.ts`, `<rootDir>/test/**/*.spec.ts` |
| `iot-service` | `package.json` | `.*\.spec\.ts$` (regex) |
| `farm-service` | `jest.config.js` | `.*\.spec\.ts$`, racines `<rootDir>/src/` et `<rootDir>/test/` |
| `recommendation-service` | `jest.config.js` | `<rootDir>/tests/**/*.spec.ts`, `<rootDir>/tests/**/*.e2e-spec.ts` |

Tous les runners utilisent `ts-jest` comme transform TypeScript et
`testEnvironment: "node"`.

---

## TypeScript

Le fichier `tsconfig.json` à la racine définit la configuration de base
partagée par tous les services :

- `module: "commonjs"`, `target: "ES2020"`, `sourceMap: true`.
- Décorateurs expérimentaux activés (`experimentalDecorators`,
  `emitDecoratorMetadata`), requis par NestJS.
- Les fichiers `*.spec.ts` sont exclus de la compilation de production.

Chaque service étend cette base via son propre `tsconfig.json`
(`"extends": "../../tsconfig.json"`) et y ajoute ses spécificités (répertoires
`src/`, `tests/`, alias de chemins comme `@/*`). `farm-service` définit ainsi
l'alias `@/*` vers `src/*`, et `recommendation-service` inclut `tests/**/*`
dans sa portée de compilation.

---

## Lint

Le lint est orchestré par Turborepo :

```bash
# Linter tous les workspaces
npm run lint

# Linter un service spécifique
npm run lint -w @alkatra/farm-service
```

Chaque package NestJS porte sa commande ESLint dans son propre `package.json` ; plusieurs services utilisent une configuration locale. Le formatage est assuré par Prettier, invoqué par `npm run format` à la racine.

Pour les composants Python, `ruff` est utilisé dans les workflows CI
(`ruff check apps/ml-inference-service/app/ apps/spark-jobs/jobs/`).

---

## Turborepo

`turbo.json` orchestre les tâches du monorepo. Les tâches pertinentes pour la
qualité sont :

| Tâche | Dépendance | Sorties |
| --- | --- | --- |
| `build` | `^build` | `dist/**` |
| `test` | `^build` | `coverage/**` |
| `test:cov` | `^build` | `coverage/**` |
| `lint` | — | — |

Les tâches `test` et `test:cov` dépendent de `^build`, ce qui garantit que les
packages internes (par exemple `@alkatra/shared-types`) sont compilés avant que
les tests d'un service ne s'exécutent. Le cache est désactivé pour `test`,
`test:cov`, `dev` (`cache: false`).

---

## Tests par catégorie

### Services NestJS (auth, user, farm, recommendation)

Les services NestJS utilisent `@nestjs/testing` pour instancier les modules de
test. Les dépendances externes (repositories TypeORM, clients HTTP, Kafka) sont
remplacées par des mocks Jest. La couverture est configurée pour exclure les
fichiers structurels (`*.module.ts`, `*.entity.ts`, `main.ts`, `config/**`)
lorsque pertinent.

### recommendation-service (E2E)

`recommendation-service` possède un test E2E :
`apps/recommendation-service/tests/e2e/recommendations.e2e-spec.ts`. Il monte
l'application NestJS réelle (guards JWT, pipes de validation, filtres
d'exceptions, contrôleur) en ne substituant que les dépendances externes (base
de données, Kafka, client HTTP vers farm-service). Le guard JWT reste réel :
un token est signé avec le même secret que la `JwtStrategy` afin de valider la
chaîne d'authentification de bout en bout via `supertest`.

### iot-service (MQTT et Kafka)

Les tests d'`iot-service` couvrent le pont MQTT vers Kafka. Les clients MQTT et
Kafka sont mockés, ce qui permet d'exécuter la suite sans broker réel. En CI,
les variables de connexion pointent vers des adresses factices
(`mqtt://localhost:1883`, `kafka:9092`, `mongodb://localhost:27017/test`) et
n'ont pas besoin d'être joignables.

### ml-inference-service (pytest, mode DEMO)

Les tests Python se trouvent dans `apps/ml-inference-service/tests/` :

- `test_model_service.py`
- `test_predict_endpoint.py`

Ils s'exécutent en mode DEMO : lorsque `MLFLOW_TRACKING_URI` n'est pas
joignable (cas de la CI), le service n'échoue pas mais fonctionne avec des
modèles de substitution. Aucun modèle entraîné ni serveur MLflow n'est requis.

### spark-jobs (pytest, fakeredis)

Les tests de `apps/spark-jobs` couvrent les **fonctions pures** de feature
engineering et de gestion d'état, sans dépendre d'un cluster Spark ou Kafka.

Le test `tests/test_state_manager.py` utilise `fakeredis` ( bibliothèque
fournissant un client Redis en mémoire) pour substituer le client Redis réel.
La fixture `fake_redis_client` remplace `jobs.state_manager._redis_client` par
une instance `fakeredis.FakeRedis(decode_responses=True)`, ce qui permet de
tester la logique d'état des parcelles sans instance Redis.

Le fichier `tests/conftest.py` ajoute le répertoire racine du package à
`sys.path` afin que les tests puissent importer le package `jobs` sous la forme
`jobs.*`.

### farm-service (Postgres PostGIS en CI)

`farm-service` interagit avec une base PostgreSQL/PostGIS. Le workflow
`.github/workflows/ci-farm.yml` provisionne un conteneur de service
`postgis/postgis:16-3.4-alpine` (utilisateur `farm_user`, base `farm_db`) et
initialise le schéma depuis `infra/postgres/schemas/farm-db.sql` avant
d'exécuter `npm run test --workspace=farm-service`. Les tests accèdent ainsi à
une base réelle avec l'extension spatiale PostGIS disponible.

---

## Exécution en intégration continue

L'exécution orchestrée des tests, la matrice de workflows par service et la
remontée de couverture vers Codecov sont documentées dans
[`guides/ci-cd.md`](./ci-cd.md).
