# Reference - Variables d'environnement

Le fichier `.env.example` documente les variables attendues.
Le fichier `.env` local ne doit pas etre committe.

## Variables principales

| Variable | Usage |
| --- | --- |
| `POSTGRES_USER` | utilisateur Postgres (super-admin, création initiale) |
| `POSTGRES_PASSWORD` | mot de passe Postgres |
| `POSTGRES_DB` | base principale |
| `MONGO_USER` | utilisateur MongoDB |
| `MONGO_PASSWORD` | mot de passe MongoDB |
| `REDIS_PASSWORD` | mot de passe Redis |
| `MQTT_USER` | utilisateur MQTT (broker Mosquitto, port 1883 + WS 9010) |
| `MQTT_PASSWORD` | mot de passe MQTT |
| `GRAFANA_USER` | utilisateur admin Grafana |
| `GRAFANA_PASSWORD` | mot de passe admin Grafana — **obligatoire** (le compose refuse de démarrer sans valeur) |
| `POSTGRES_EXPORTER_PASSWORD` | mot de passe du rôle `postgres_exporter` (lecture seule `pg_monitor`, créé par `00-create-databases.sh`) |
| `ALERT_SMTP_HOST` / `ALERT_SMTP_PORT` | SMTP d'Alertmanager — dev : `mailhog` / `1025` ; prod : SMTP réel (+ `require_tls` dans le template) |
| `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | expéditeur / destinataire des emails d'alertes infra |
| `KEYCLOAK_ADMIN` | admin Keycloak |
| `KEYCLOAK_ADMIN_PASSWORD` | mot de passe Keycloak |
| `MLFLOW_TRACKING_URI` | URI MLflow locale (`http://localhost:5001`) |
| `JWT_SECRET` | secret JWT partagé (auth-service / user-service / farm-service / recommendation-service / alert-service) |
| `INTERNAL_TOKEN` | (optionnel) token d'authentification mutuelle entre services pour les endpoints `/internal/*` — header `X-Internal-Token`. Utilisé par le heartbeat capteurs iot-service → farm-service, les notifications farm-service → alert-service et la résolution owner alert-service → farm-service. Si absent, l'isolation réseau Docker suffit en développement |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | credentials FCM (les trois requis ensemble) — vides = canal push désactivé, alert-service fonctionne in-app uniquement |

## Santé capteurs (farm-service)

Seuils de la machine à états `pending → active → inactive → failing`, modifiables à tout moment dans `.env` (puis recréer le conteneur farm-service). Les heures acceptent les décimales pour tester vite (`0.05` h = 3 min) :

| Variable | Défaut | Usage |
| --- | --- | --- |
| `SENSOR_INACTIVE_HOURS` | `2` | silence au-delà duquel un capteur `active` passe `inactive` (« Désactivé ») + notification légère (`sensor_offline` sévérité `info`) |
| `SENSOR_FAILING_HOURS` | `24` | silence au-delà duquel un capteur `inactive` est escaladé `failing` (« Défaillant ») + alerte rouge (`sensor_offline` sévérité `critical`). Doit rester strictement supérieur à `SENSOR_INACTIVE_HOURS` (validé au démarrage) |
| `SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES` | `15` | cadence du cycle de santé (≥ 1 minute) |
| `LOW_BATTERY_THRESHOLD` | `20` | seuil (%) de batterie faible — alerte `low_battery` (sévérité `warning`) |

## alert-service

| Variable | Défaut | Usage |
| --- | --- | --- |
| `ALERT_SERVICE_PORT` | `3006` | port d'écoute |
| `HYDRIC_STRESS_PROBABILITY_THRESHOLD` | `0.75` | probabilité d'irrigation au-delà de laquelle une recommandation est critique (politique de notification, pas du ML) |
| `HYDRIC_STRESS_SOIL_HUMIDITY_MAX_PCT` | `25` | humidité du sol en dessous de laquelle une recommandation est critique |
| `DEDUP_WINDOW_HOURS` | `24` | fenêtre de déduplication des alertes par (user, parcelle, type, sévérité) |

## Mots de passe multi-bases PostgreSQL

L'architecture suit le principe « un microservice = une base ». Chaque service possède sa propre base PostgreSQL avec un utilisateur dédié dont les droits sont strictement limités à cette base. Le mot de passe de chaque utilisateur est porté par une variable dédiée dans `.env` :

| Variable | Utilisateur | Base propriétaire |
| --- | --- | --- |
| `AUTH_DB_PASSWORD` | `auth_user` | `auth_db` |
| `FARM_DB_PASSWORD` | `farm_user` | `farm_db` |
| `RECOMMENDATION_DB_PASSWORD` | `recommendation_user` | `recommendation_db` |
| `NOTIFY_DB_PASSWORD` | `notify_user` | `notification_db` |
| `KEYCLOAK_DB_PASSWORD` | `keycloak_user` | `keycloak_db` |
| `MLFLOW_DB_PASSWORD` | `mlflow_user` | `mlflow_db` |

Les chaînes de connexion (`DATABASE_URL`) sont construites dans `docker-compose.yml` à partir de ces variables, par exemple :

```
postgresql://farm_user:${FARM_DB_PASSWORD}@postgres:5432/farm_db
```

Les variables `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_DB` servent à la création initiale du cluster (super-utilisateur `admin`), tandis que les variables `*_DB_PASSWORD` ci-dessus correspondent aux utilisateurs applicatifs créés par `infra/postgres/00-create-databases.sh`.

## Compose

Les scripts racine utilisent:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml
```

Cela garantit que Compose lit le `.env` de la racine.

## Variables des services applicatifs

Les variables ci-dessous sont injectées par `infra/docker/docker-compose.yml` et correspondent aux clés
lues par les configurations des services. Les valeurs entre parenthèses sont les valeurs de développement
du compose lorsqu'elles existent.

| Service | Variables spécifiques |
| --- | --- |
| `auth-service` | `AUTH_SERVICE_PORT`, `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_BLOCK_DURATION_SECONDS`, `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_SENDER`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` |
| `user-service` | `PORT` (3002), `AUTH_SERVICE_HOST`, `AUTH_SERVICE_PORT`, `JWT_SECRET`, `CORS_ORIGINS` |
| `farm-service` | `PORT` (3003), `DATABASE_URL`, `JWT_SECRET`, `AUTH_SERVICE_URL`, `ALERT_SERVICE_URL`, `INTERNAL_TOKEN`, `LOW_BATTERY_THRESHOLD`, `SENSOR_INACTIVE_HOURS`, `SENSOR_FAILING_HOURS`, `SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES`, `CORS_ORIGINS` |
| `recommendation-service` | `PORT` (3004), `DATABASE_URL`, `JWT_SECRET`, `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_GROUP_ID`, `KAFKA_RECOMMENDATIONS_TOPIC`, `KAFKA_TOPIC_DLQ`, `KAFKA_CONSUMER_ENABLED`, `FARM_SERVICE_URL`, `FARM_SERVICE_TIMEOUT_MS`, `CORS_ORIGINS` |
| `alert-service` | `PORT` (3006), `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_TOKEN`, `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_GROUP_ID`, `KAFKA_RECOMMENDATIONS_TOPIC`, `KAFKA_TOPIC_DLQ`, `KAFKA_OUTBOUND_TOPIC`, `KAFKA_CONSUMER_ENABLED`, `FARM_SERVICE_URL`, `FARM_SERVICE_TIMEOUT_MS`, `HYDRIC_STRESS_PROBABILITY_THRESHOLD`, `HYDRIC_STRESS_SOIL_HUMIDITY_MAX_PCT`, `DEDUP_WINDOW_HOURS`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CORS_ORIGINS` |
| `iot-service` | `PORT` (3005), `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `KAFKA_BROKERS`, `MONGODB_URI`, `ML_INFERENCE_URL`, `FARM_SERVICE_URL`, `INTERNAL_TOKEN` |
| `spark-job` | `KAFKA_BROKERS`, `KAFKA_INPUT_TOPIC`, `KAFKA_OUTPUT_TOPIC`, `KAFKA_STARTING_OFFSETS`, `KAFKA_FAIL_ON_DATA_LOSS`, `SPARK_DRY_RUN`, `SPARK_CHECKPOINT_DIR`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `PUSHGATEWAY_URL` |
| `ml-inference-service` | `ENVIRONMENT`, `LOG_LEVEL`, `MLFLOW_TRACKING_URI`, `MLFLOW_CLASSIFIER_NAME`, `MLFLOW_REGRESSOR_NAME`, `MLFLOW_MODEL_STAGE`, `KAFKA_BROKERS`, `KAFKA_INPUT_TOPIC`, `KAFKA_OUTPUT_TOPIC`, `KAFKA_GROUP_ID`, `MONGODB_URI`, `MONGO_DB`, `MONGO_RECO_COLLECTION`, `CLASSIFICATION_THRESHOLD`, `ENABLE_KAFKA_CONSUMER`, `ENABLE_KAFKA_PRODUCER`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `MLFLOW_S3_ENDPOINT_URL` |

`PORT` est utilisé par les services NestJS qui le déclarent ; `AUTH_SERVICE_PORT` est spécifique à la
configuration de `auth-service`. Les variables de connexion PostgreSQL sont construites dans le compose
à partir des mots de passe `*_DB_PASSWORD`, et non fournies sous forme de mot de passe en clair aux guides.

## Attention aux volumes

Pour Postgres, les variables `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_DB` ne sont appliquees qu'a la creation initiale du volume.

Si le volume existe deja, changer `.env` ne renomme pas automatiquement les roles ou bases.

Pour repartir de zero en developpement:

```bash
npm run docker:reset
```

Attention: cette commande supprime les volumes.
