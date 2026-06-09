# Etat actuel et changements realises

Ce document resume l'etat du projet au moment de cette documentation.

## Fonctionnel actuellement

### Infrastructure locale

La stack Docker locale demarre avec:

```bash
npm run docker:up
```

Services stabilises:

- Postgres/PostGIS;
- MongoDB;
- Redis;
- Kafka;
- Kafka UI;
- Mosquitto;
- MLflow;
- Prometheus;
- Grafana;
- MailHog.

Keycloak est disponible via le profile Docker `auth`, mais n'est pas encore integre a une API applicative.

### Service IoT

`apps/iot-service` fonctionne et couvre:

- connexion MQTT a Mosquitto;
- abonnement au topic capteur wildcard;
- validation des messages capteurs;
- detection d'anomalies simples;
- publication Kafka dans `raw-sensor-data`;
- endpoint `/health`;
- tests Jest.

### Simulateur capteur

Le simulateur:

```bash
node scripts/simulate-sensor.js 5000
```

publie des messages MQTT conformes au contrat IA v1.

### Observabilite

Grafana charge automatiquement le dashboard:

```text
Al Katra IoT / Al Katra - IoT Pipeline
```

MLflow est stable et expose:

```text
http://localhost:5000
```

## Changements importants realises

### Tests Jest

Probleme corrige:

- les tests ne reconnaissaient pas `describe`, `it`, `expect`, `jest`.

Correction:

- ajout des types Jest dans `apps/iot-service/tsconfig.json`;
- build configure pour exclure les tests;
- scripts racine `test` et `test:cov` via Turbo.

### Turbo

Probleme corrige:

```text
Missing packageManager field in package.json
```

Correction:

```json
"packageManager": "npm@11.9.0"
```

### Contrat capteur IA

Ancien payload prototype remplace par 6 variables IA:

```text
temperature_min_c
temperature_max_c
wind_speed_ms
solar_radiation_mj_m2_day
soil_humidity_pct
air_humidity_pct
```

`iot-service` enrichit ensuite le message avec:

```text
schema_version
received_at
is_anomaly
anomaly_reasons
```

### Grafana

Problemes corriges:

- dashboard JSON non monte dans le conteneur;
- provider pointant vers le mauvais dossier;
- conflit de datasource par UID.

Correction:

- montage de `infra/grafana/dashboards`;
- provider vers `/var/lib/grafana/dashboards`;
- datasource referencee par nom `Prometheus`.

### MLflow

Problemes corriges:

- `start.sh` en CRLF;
- Compose ne lisant pas explicitement `.env`;
- mauvais utilisateur Postgres injecte;
- healthcheck utilisant `curl` absent de l'image.

Corrections:

- `.gitattributes` force les `.sh` en LF;
- scripts Docker racine utilisent `--env-file .env`;
- healthcheck MLflow utilise Python;
- `start.sh` utilise `POSTGRES_DB` depuis l'environnement.

### Postgres

La colonne de recommendation liee a l'humidite du sol a ete renommee dans le schema initial:

```text
soil_humidity_pct_at_gen
```

Attention: `init.sql` ne s'applique automatiquement qu'a la creation initiale du volume Postgres.

## Sprint S2 — Ajouts Dev1

### Scaffolds des services Phase 1 et suivants

Trois services ont été initialisés avec une structure minimale fonctionnelle.
Ils exposent chacun un endpoint `/health` et peuvent être buildés en Docker,
mais leur code métier sera écrit dans les sprints ultérieurs.

**`apps/auth-service/`**

Service NestJS Phase 1 (OTP SMS, JWT, Keycloak). Actuellement : placeholder avec endpoint `/health` sur le port 3001. Activé via le profil Docker `phase1`.

**`apps/spark-jobs/`**

Jobs PySpark Sprint S3 (feature engineering ETo, Kc, cumul pluie). Actuellement : Dockerfile Bitnami Spark prêt, dossiers `jobs/` et `tests/` vides en attente des scripts Dev2.

**`apps/ml-inference-service/`**

Service FastAPI Sprint S4 (XGBoost via MLflow). Actuellement : FastAPI minimal avec endpoint `/health` sur le port 8000. Le code de prédiction (modèles, SHAP, endpoints predict) sera ajouté en S4.

### Pipelines CI/CD GitHub Actions

Trois workflows ont été créés dans `.github/workflows/` :

- `ci-common.yml` : lint TypeScript, vérification Prettier, build Docker des trois services, validation dry-run des manifests Kubernetes. Se déclenche sur tout push ou PR vers `main` / `develop`.
- `ci-iot.yml` : tests Jest du service IoT avec mocks MQTT et Kafka. Se déclenche uniquement si `apps/iot-service/` ou `packages/shared-types/` ont changé.
- `ci-ml.yml` : tests pytest FastAPI (mode DEMO), tests unitaires feature engineering Spark, lint Python ruff. Se déclenche sur changements dans `apps/ml-inference-service/` ou `apps/spark-jobs/`.

### Configuration qualité racine

Trois fichiers de configuration ont été ajoutés à la racine du monorepo :

- `.eslintrc.js` : règles ESLint TypeScript partagées pour tous les services NestJS
- `tsconfig.json` : configuration TypeScript racine (base pour ESLint et Prettier)
- `.prettierrc` : formatage unifié (single quote, trailing comma, tabWidth 2)

Ces fichiers garantissent que tous les services produisent du code formaté de façon identique indépendamment de l'éditeur utilisé.


## Verification rapide

```bash
npm run test
npm run test:cov
npm run build
npm run docker:up
```

Puis verifier:

```text
http://localhost:3000
http://localhost:5000
http://localhost:8090
http://localhost:9090
```

## Prochaines etapes probables

1. Ajouter un service de stockage ou consumer Kafka pour persister `raw-sensor-data`.
2. Ajouter le service ML inference.
3. Definir le format `processed-sensor-data`.
4. Connecter MLflow au cycle entrainement/deploiement.
5. Ajouter des dashboards plus proches des metriques IoT reelles.
6. Integrer Keycloak quand les APIs metier arriveront.
