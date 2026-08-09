# Observabilité

Ce document décrit la chaîne d'observation de la plateforme Al Katra Bel Qatra : collecte de métriques applicatives avec Prometheus, visualisation avec Grafana, suivi des expériences et des modèles avec MLflow, et sonde de santé des services.

## Vue d'ensemble

L'observabilité repose sur trois composants complémentaires :

- **Prometheus** scrape les endpoints `/metrics` exposés par les services applicatifs et stocke les séries temporelles.
- **Grafana** lit les données Prometheus et affiche les dashboards provisionnés depuis le dépôt.
- **MLflow** suit les expériences d'entraînement et le registre de modèles, avec un backend Postgres et des artifacts stockés dans MinIO.

Les services d'infrastructure (Postgres, MongoDB, Kafka, Redis, etc.) sont surveillés via les healthchecks Docker et le script `scripts/health-check.sh`, et non par Prometheus.

## Prometheus

URL locale :

```text
http://localhost:9090
```

Configuration : `infra/prometheus/prometheus.yml`. Paramètres globaux :

- `scrape_interval: 5s`
- `evaluation_interval: 5s`
- `external_labels: { environment: development, project: alkatra }`

Jobs scrapés :

| Job | Cible | Chemin des métriques |
| --- | --- | --- |
| `prometheus` | `localhost:9090` | `/metrics` (défaut) |
| `iot-service` | `iot-service:3005` | `/metrics` |
| `ml-inference-service` | `ml-inference-service:8000` | `/metrics` |
| `auth-service` | `auth-service:3001` | `/metrics` |
| `user-service` | `user-service:3002` | `/metrics` |

Les services `farm-service`, `recommendation-service` et `spark-jobs` ne sont pas scrapés par Prometheus. Ils ne figurent donc pas dans `prometheus.yml` et n'exposent pas d'endpoint `/metrics` dans la configuration actuelle.

La page **Status → Targets** de Prometheus indique l'état (up/down) et l'heure du dernier scrape pour chaque job.

## Grafana

URL locale :

```text
http://localhost:3000
```

Identifiants : `GRAFANA_USER` (défaut `admin`) et `GRAFANA_PASSWORD` définis dans `.env`.

### Datasource

La datasource Prometheus est provisionnée par fichier dans `infra/grafana/provisioning/datasources/datasources.yml` :

```yaml
- name: Prometheus
  type: prometheus
  access: proxy
  url: http://prometheus:9090
  isDefault: true
```

Les dashboards référencent la datasource par son **nom** (`"datasource": "Prometheus"`), et non par un UID imposé. Ce choix évite les conflits lorsqu'une datasource existe déjà dans le volume Grafana. Le détail de cette décision figure dans l'ADR-0003.

### Dashboards provisionnés

Le dossier `infra/grafana/dashboards` est monté vers `/var/lib/grafana/dashboards` dans le conteneur. Le provider défini dans `infra/grafana/provisioning/dashboards/dashboards.yml` charge automatiquement les fichiers JSON de ce dossier.

| Fichier | Titre du dashboard | Contenu |
| --- | --- | --- |
| `iot-pipeline.json` | Al Katra - IoT Pipeline | Connexions du pipeline IoT, compteurs MQTT/Kafka, anomalies, dernières valeurs capteur |
| `ml-inference.json` | Al Katra - ML Inference | Prédictions par minute, total des prédictions, latence, état des modèles |

Les dashboards sont versionnés dans Git ; ils sont restaurés automatiquement après un reset du volume Grafana, sans import manuel. Après toute modification du provisioning, il faut recréer le conteneur Grafana pour recharger la configuration.

## MLflow

URL locale :

```text
http://localhost:5001
```

MLflow est construit depuis `infra/mlflow/Dockerfile` (image `python:3.11-slim`). Le script de démarrage `infra/mlflow/start.sh` configure :

- le **backend store** Postgres, base `mlflow_db` (utilisateur `mlflow_user`) ;
- le **artifact store** dans MinIO à l'emplacement `s3://mlflow-artifacts`, via `MLFLOW_S3_ENDPOINT_URL=http://minio:9000` et les identifiants `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`.

Le healthcheck Docker utilise l'interpréteur Python (`urllib.request`) plutôt que `curl`, absent de l'image slim. Le runtime local MLflow et ses contraintes (fichiers `.sh` en LF, partage des variables Postgres via `.env`) sont documentés dans l'ADR-0004.

Le service `ml-inference-service` consomme les modèles depuis MLflow (`MLFLOW_TRACKING_URI`, `MLFLOW_CLASSIFIER_NAME`, `MLFLOW_REGRESSOR_NAME`, `MLFLOW_MODEL_STAGE`). En l'absence de MLflow, il bascule en mode DEMO sans modèles réels.

## Health checks par service

Chaque service applicatif expose un endpoint de santé utilisé par les healthchecks Docker, par le script `npm run health` et par la passerelle Nginx (pour ses dépendances).

| Service | Endpoint | Vérifications |
| --- | --- | --- |
| iot-service | `GET /health` (port 3005) | Connexion MQTT, compteurs messages reçus / transférés / anomalies, état Kafka prêt |
| auth-service | `GET /health` (port 3001) | État du service |
| user-service | `GET /health/live` (port 3002) | Liveness (processus) |
| user-service | `GET /health/ready` (port 3002) | Readiness : appel à `auth-service` `/health` |
| farm-service | `GET /api/v1/health/live` (port 3003) | Liveness |
| farm-service | `GET /api/v1/health/ready` (port 3003) | Readiness : `SELECT 1` sur Postgres |
| recommendation-service | `GET /health` (port 3004) | Liveness |
| recommendation-service | `GET /health/ready` (port 3004) | Readiness : Postgres (`SELECT 1`) + connexion consommateur Kafka |
| ml-inference-service | `GET /health` (port 8000) | Modèles chargés, mode DEMO, URI MLflow |
| API Gateway | `GET /health` (port 8080) | Nginx ready |

Le script global de santé :

```bash
npm run health
```

Il interroge les healthchecks Docker des conteneurs (PostgreSQL, MongoDB, Redis, Kafka, Mosquitto, iot-service, spark-job) et les endpoints HTTP des interfaces web (Grafana, Kafka UI, Prometheus, MailHog, MLflow) et des services applicatifs (iot-service, ml-inference-service). Il affiche également le nombre de documents dans la collection MongoDB `ai_sensor_features`.

## Métriques par service

Le détail des métriques exposées (noms Prometheus, labels, types) se trouve dans le guide de chaque service :

- `docs/guides/iot-service.md` — métriques du pipeline IoT (`alkatra_iot_messages_received_total`, `alkatra_iot_messages_forwarded_total`, `alkatra_iot_anomalies_detected_total`, `alkatra_iot_mqtt_connected`, `alkatra_iot_kafka_ready`, etc.).
- `docs/guides/ml-inference-service.md` — métriques d'inférence (compteurs de prédictions, latence, état des modèles).
- `docs/guides/auth-service.md` et `docs/guides/user-service.md` — métriques d'authentification et de gestion des utilisateurs.

Les guides `farm-service.md` et `recommendation-service.md` décrivent les endpoints de santé de ces services, qui ne sont pas scrapés par Prometheus.
