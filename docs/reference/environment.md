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
| `GRAFANA_PASSWORD` | mot de passe admin Grafana |
| `KEYCLOAK_ADMIN` | admin Keycloak |
| `KEYCLOAK_ADMIN_PASSWORD` | mot de passe Keycloak |
| `MLFLOW_TRACKING_URI` | URI MLflow locale (`http://localhost:5001`) |
| `JWT_SECRET` | secret JWT partagé (auth-service / user-service / farm-service / recommendation-service) |
| `INTERNAL_TOKEN` | (optionnel) token d'authentification mutuelle entre services pour les endpoints `/internal/*` — header `X-Internal-Token`. Utilisé par le heartbeat capteurs iot-service → farm-service. Si absent, l'isolation réseau Docker suffit en développement |

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
