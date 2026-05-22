# Reference - Variables d'environnement

Le fichier `.env.example` documente les variables attendues.
Le fichier `.env` local ne doit pas etre committe.

## Variables principales

| Variable | Usage |
| --- | --- |
| `POSTGRES_USER` | utilisateur Postgres |
| `POSTGRES_PASSWORD` | mot de passe Postgres |
| `POSTGRES_DB` | base principale |
| `MONGO_USER` | utilisateur MongoDB |
| `MONGO_PASSWORD` | mot de passe MongoDB |
| `REDIS_PASSWORD` | mot de passe Redis |
| `MQTT_USER` | utilisateur MQTT futur |
| `MQTT_PASSWORD` | mot de passe MQTT futur |
| `GRAFANA_USER` | utilisateur admin Grafana |
| `GRAFANA_PASSWORD` | mot de passe admin Grafana |
| `KEYCLOAK_ADMIN` | admin Keycloak |
| `KEYCLOAK_ADMIN_PASSWORD` | mot de passe Keycloak |
| `MLFLOW_TRACKING_URI` | URI MLflow locale |

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
