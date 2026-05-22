# Observabilite

## Grafana

URL locale:

```text
http://localhost:3000
```

Le dashboard provisionne actuellement:

```text
Dashboards -> Al Katra IoT -> Al Katra - IoT Pipeline
```

Fichiers:

```text
infra/grafana/provisioning/dashboards/dashboards.yml
infra/grafana/provisioning/datasources/datasources.yml
infra/grafana/dashboards/iot-pipeline.json
```

Le dossier `infra/grafana/dashboards` est monte dans le conteneur vers:

```text
/var/lib/grafana/dashboards
```

Le provider Grafana pointe vers ce dossier.

## Prometheus

URL locale:

```text
http://localhost:9090
```

Configuration:

```text
infra/prometheus/prometheus.yml
```

Jobs declares:

- `prometheus`
- `iot-service`
- `ml-inference-service`
- `kafka`
- `mlflow`

Certains jobs peuvent etre down tant que les services applicatifs futurs ne sont pas lances.

## MLflow

URL locale:

```text
http://localhost:5000
```

MLflow utilise:

- Postgres comme backend store;
- `/mlruns` comme artifact root local dans le volume Docker `mlflow_data`;
- `infra/mlflow/start.sh` comme script de demarrage.

Le healthcheck Docker MLflow utilise Python, pas `curl`, car l'image `python:3.11-slim` ne fournit pas `curl` par defaut.

## Health check IoT

URL:

```text
http://localhost:3005/health
```

La reponse contient:

- statut service;
- compteur MQTT messages recus;
- compteur messages envoyes Kafka;
- compteur anomalies;
- statut Kafka.

## Script health global

```bash
npm run health
```

Le script se trouve ici:

```text
scripts/health-check.sh
```

Il verifie plusieurs services Docker et endpoints HTTP.
