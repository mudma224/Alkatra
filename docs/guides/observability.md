# Observabilité

Ce document décrit la chaîne d'observation de la plateforme Al Katra Bel Qatra :
métriques applicatives et d'infrastructure (Prometheus + exporters), dashboards
(Grafana), alerting d'infrastructure (règles Prometheus → Alertmanager → email
MailHog), logs centralisés (Loki + Promtail) et suivi ML (MLflow).

Le design de référence complet est [`design_prometheus.md`](../../design_prometheus.md)
(racine du dépôt). Les décisions d'alerting et de standardisation des métriques
sont documentées dans [ADR-0005](../adr/0005-alerting-prometheus-alertmanager.md).

## Vue d'ensemble

```
Services (/metrics, package @alkatra/observability)  ─┐
Exporters (postgres, mongodb, redis, kafka)          ─┼─▶ Prometheus ─▶ règles ─▶ Alertmanager ─▶ email (MailHog)
Blackbox probes + PushGateway (spark-jobs)           ─┘        │
                                                              ▼
                                          Grafana (14 dashboards) ◀── Loki ◀── Promtail (logs conteneurs)
```

- **Prometheus** scrape les endpoints `/metrics` des 7 services applicatifs et
  des exporters d'infrastructure ; évalue les règles (`infra/prometheus/rules/`)
  toutes les 15 s ; envoie les alertes à Alertmanager.
- **Grafana** affiche les dashboards provisionnés depuis le dépôt, organisés en
  dossiers par domaine. Identifiants : `GRAFANA_USER` / `GRAFANA_PASSWORD`
  (obligatoire — le compose refuse de démarrer sans valeur).
- **Alertmanager** route les alertes vers l'email ; en dev, le SMTP est MailHog
  (vérification sur http://localhost:8025).
- **Loki + Promtail** centralisent les logs de tous les conteneurs (exploration
  dans Grafana → Explore, datasource `Loki`).
- **MLflow** suit les expériences et le registre de modèles (backend Postgres,
  artifacts MinIO).

## URLs et accès

| Outil | URL | Accès |
| --- | --- | --- |
| Grafana | http://localhost:3000 | `GRAFANA_USER` / `GRAFANA_PASSWORD` (.env) |
| Prometheus | http://localhost:9090 | sans auth (réseau local) |
| Alertmanager | http://localhost:9093 | sans auth — UI statut alertes/silences |
| PushGateway | http://localhost:9091 | sans auth — métriques Spark |
| Loki | http://localhost:3100 | API interne (via Grafana) |
| MailHog (emails d'alertes) | http://localhost:8025 | sans auth |

## Prometheus

Configuration : `infra/prometheus/prometheus.yml`.

- `scrape_interval` global **15 s**, `evaluation_interval` **15 s** ;
  override **5 s** pour les jobs pipeline (`iot-service`, `ml-inference-service`).
- Règles : `rule_files: /etc/prometheus/rules/*.yml` (montage read-only).
- Alertmanager : `alerting.alertmanagers → alertmanager:9093`.

### Jobs scrapés

| Job | Cible | Notes |
| --- | --- | --- |
| `prometheus` | `localhost:9090` | auto-supervision |
| `alertmanager` / `pushgateway` | `:9093` / `:9091` | chaîne d'alerting |
| `iot-service` | `iot-service:3005` | **5 s** |
| `ml-inference-service` | `ml-inference-service:8000` | **5 s** |
| `auth-service` … `recommendation-service` | ports 3001–3006 | 15 s |
| `postgres-exporter` | `postgres-exporter:9187` | rôle `pg_monitor` dédié |
| `mongodb-exporter` | `mongodb-exporter:9216` | |
| `redis-exporter` | `redis-exporter:9121` | |
| `kafka-exporter` | `kafka-exporter:9308` | **lag par consumer group**, 30 s |
| `blackbox-core` | via `blackbox-exporter:9115` | probes stack de base — **alertées** |
| `blackbox-phase1` | via `blackbox-exporter:9115` | probes services métier — dashboard uniquement |

Page **Status → Targets** : état up/down de chaque job.

### Règles (`infra/prometheus/rules/`)

| Fichier | Contenu |
| --- | --- |
| `recording.yml` | agrégats standardisés (`job:http_requests:rate5m`, ratios d'erreurs, p95, débits pipeline) — interrogés par les dashboards |
| `alerts-services.yml` | `ServiceDown`, `HighHttpErrorRate`, `HttpLatencyHigh`, `KafkaConsumerDisconnected`, `PersistenceErrorsIncreasing`, `MqttDisconnected`, `AlertmanagerDown`, `Watchdog` |
| `alerts-infra.yml` | `PostgresDown`, `PostgresConnectionsHigh`, `MongodbDown`, `RedisDown`, `RedisMemoryHigh`, `KafkaBrokerDown`, `KafkaConsumerLagHigh` (warning/critical), `BlackboxProbeFailed` |
| `alerts-pipeline.yml` | `NoSensorData`, `InvalidSensorMessagesIncreasing`, `PredictionsStalled`, `ModelsNotLoaded`, `SparkStreamStalled`, `DlqMessages`, `FcmFailuresIncreasing`, `HeartbeatErrorsIncreasing`… |

L'alerte **`Watchdog`** est toujours firing : elle vérifie en continu la chaîne
Prometheus → Alertmanager → SMTP. Si ses emails (répétition 4 h) n'arrivent
plus dans MailHog, la chaîne de notification est cassée.

### Ajouter une alerte

1. Ajouter la règle dans le fichier thématique de `infra/prometheus/rules/`
   (severities `warning` / `critical`, `summary` + `description` en français).
2. Valider : `promtool check rules infra/prometheus/rules/<fichier>.yml`.
3. Recharger sans redémarrer : `curl -X POST http://localhost:9090/-/reload`
   (flag `--web.enable-lifecycle` actif).

## Métriques des services — package `@alkatra/observability`

Tous les services NestJS utilisent le package partagé
`packages/observability` (`@alkatra/observability`) :

- `GET /metrics` à la racine, registre prom-client dédié ;
- métriques par défaut Node (`process_*`, `nodejs_*`) partout ;
- intercepteur HTTP global :
  `<prefix>_http_requests_total{method, route, status}` et
  `<prefix>_http_request_duration_seconds` (histogramme) — `route` = pattern
  Express (`/api/v1/farms/:id`), cardinalité bornée ;
- helpers Kafka : `<prefix>_kafka_messages_consumed_total{topic, status}`,
  `<prefix>_kafka_consumer_connected`.

**Convention de nommage** : `<service>_<objet>_<unité>[_<type>]`. Exceptions
historiques conservées : `alkatra_iot_*` (iot-service), `ml_*` (ml-inference,
Python `prometheus_client`).

**Le lag Kafka n'est pas instrumenté côté applicatif** : kafka-exporter le
supervise au niveau des offsets broker (source de vérité unique).

### Ajouter une métrique à un service

1. Dans `<service>/src/metrics/`, déclarer la métrique sur le registre partagé
   (cf. `README.md` du package) en suivant la convention de nommage.
2. Incrémenter au point réel du flux (service, consumer, interceptor).
3. Les recording rules et le dashboard « Services HTTP » couvrent
   automatiquement toute métrique conforme à la convention — aucun changement
   Prometheus/Grafana nécessaire pour les métriques HTTP standard.

### Métriques spécifiques par service (extrait)

| Service | Métriques métier |
| --- | --- |
| auth | `auth_otp_requests_total`, `auth_otp_verified_total`, `auth_otp_failed_total`, `auth_login_total`, `auth_users_total` |
| user | `user_profile_requests_total`, `user_profile_updates_total`, `user_auth_calls_total{operation,status}` |
| farm | `farm_entities{type}`, `farm_heartbeats_processed_total{result}`, `farm_sensor_health{status}` |
| iot | `alkatra_iot_*` (reçus, transférés, invalides, anomalies, MQTT, Kafka, valeurs par capteur, capteurs actifs) |
| recommendation | `recommendations_persisted_total`, `recommendation_feedback_total{decision}`, erreurs de persistance |
| alert | `alerts_created_total{type}`, `alerts_dedup_skipped_total{type}`, `fcm_*`, `alert_kafka_dlq_total`, outbound |
| ml-inference | `ml_predictions_total{source,result}`, latences HTTP **et** Kafka, `ml_missing_features_total`, `ml_models_loaded`, `ml_demo_mode` |
| spark-jobs | `spark_stream_*` (durée batch, batch_id, lignes, rejets) → PushGateway |

## Alertmanager

- Configuration : `infra/alertmanager/alertmanager.yml.template`, rendu par
  `entrypoint.sh` (envsubst — même convention que la gateway Nginx, ADR-0002).
- Variables : `ALERT_SMTP_HOST`, `ALERT_SMTP_PORT`, `ALERT_EMAIL_FROM`,
  `ALERT_EMAIL_TO` (dans `.env`).
- Routage : groupement par `alertname`/`job`, `critical` re-notifiée toutes
  les heures, `warning` toutes les 4 h ; inhibition warning ↔ critical.
- **Passer en prod** : pointer `ALERT_SMTP_HOST/PORT` vers le SMTP réel et
  activer `smtp_require_tls: true` dans le template.

Test de bout en bout : `docker stop alkatra-iot` → email `ServiceDown` dans
MailHog ≤ 2 min → `docker start alkatra-iot` → email de résolution.

## Grafana

### Provisioning

- Datasources (`infra/grafana/provisioning/datasources/datasources.yml`) :
  `Prometheus` (défaut, `timeInterval: 15s`) et `Loki` — **référencées par
  nom** dans les dashboards (ADR-0003, pas d'UID forcé).
- Provider (`provisioning/dashboards/dashboards.yml`) :
  `foldersFromFilesStructure: true` — l'arborescence du dépôt devient la
  structure de dossiers Grafana.

### Dashboards (14)

| Dossier | Dashboards |
| --- | --- |
| `00-overview` | Vue d'ensemble (golden signals, pipeline, alertes, infra) |
| `10-infrastructure` | PostgreSQL, MongoDB, Redis, Kafka (lag/DLQ), Probes |
| `20-pipeline` | Pipeline IoT, Spark Streaming |
| `30-services` | Services HTTP (générique, variable `$service`), Auth, Alertes & FCM |
| `40-ml` | ML Inference, Recommandations |
| `50-alerting` | Alertes métier (funnel) |

Conventions : uid `alkatra-*`, `description` en tête, refresh 15–30 s,
datasource par nom, seuils cohérents. Validées par
`node scripts/validate-dashboards.mjs` (exécuté dans la CI).

### Ajouter un dashboard

1. Créer `infra/grafana/dashboards/<domaine>/<nom>.json` (uid `alkatra-*`,
   description, refresh ≥ 15 s, datasource `"Prometheus"`/`"Loki"` par nom).
2. `node scripts/validate-dashboards.mjs` pour vérifier les conventions.
3. Recréer le conteneur Grafana si le provisioning ne se recharge pas :
   `docker compose --env-file .env -f infra/docker/docker-compose.yml up -d grafana`
   (le provider rescanne toutes les 30 s).

## Loki + Promtail

- Configurations : `infra/loki/loki-config.yml` (rétention 7 j) et
  `infra/loki/promtail-config.yml` (découverte Docker, label `container`,
  drop des logs loki/promtail).
- Exploration : Grafana → Explore → datasource `Loki` →
  `{container="alkatra-iot"}`. Les logs JSON de la gateway Nginx sont
  directement structurés.

## Exporters et probes

| Composant | Image | Rôle |
| --- | --- | --- |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.16.0` | stats cluster (rôle `pg_monitor`, créé par `00-create-databases.sh`) |
| `mongodb-exporter` | `percona/mongodb_exporter:0.43.1` | stats MongoDB |
| `redis-exporter` | `oliver006/redis_exporter:v1.66.0` | mémoire, clés, évictions |
| `kafka-exporter` | `danielqsj/kafka-exporter:v1.8.0` | **lag par consumer group × topic**, offsets |
| `blackbox-exporter` | `prom/blackbox-exporter:v0.25.0` | probes HTTP (`http_2xx`) |
| `pushgateway` | `prom/pushgateway:v1.8.0` | métriques spark-jobs (job non scrapable) |

### Ajouter un exporter

1. Déclarer le service dans `infra/docker/docker-compose.yml` (image épinglée,
   healthcheck, réseau `alkatra-net`, sans port host sauf UI).
2. Ajouter le job de scrape dans `prometheus.yml`.
3. Documenter dans ce guide et dans `docs/reference/ports-and-services.md`.

## MLflow

Inchangé : tracking + registry sur http://localhost:5001, backend Postgres
(`mlflow_db`), artifacts MinIO. L'état du chargement des modèles est exposé par
ml-inference-service via `ml_models_loaded` / `ml_demo_mode` (dashboard
« ML Inference »).

## CI

`.github/workflows/ci-observability.yml` valide à chaque modification des
chemins concernés :

1. `promtool check config` + règles ;
2. rendu du template Alertmanager + `amtool check-config` ;
3. conventions des dashboards (`scripts/validate-dashboards.mjs`) + YAML du
   provisioning ;
4. build + tests du package `@alkatra/observability`.
