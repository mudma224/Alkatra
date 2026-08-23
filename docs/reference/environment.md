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

## Attention aux volumes

Pour Postgres, les variables `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_DB` ne sont appliquees qu'a la creation initiale du volume.

Si le volume existe deja, changer `.env` ne renomme pas automatiquement les roles ou bases.

Pour repartir de zero en developpement:

```bash
npm run docker:reset
```

Attention: cette commande supprime les volumes.
