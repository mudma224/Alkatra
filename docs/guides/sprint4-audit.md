# Audit technique — Sprint 4 readiness

Date: 2026-06-13

Contexte
---
- Projet: Al Katra Bel Qatra — IoT agriculture streaming pipeline
- Objectif: préparer le Sprint 4 “Premier message capteur dans Kafka + Dashboard Grafana IoT”
- Source: dépôt du projet, scripts `scripts/validate-pipeline.sh`, `scripts/health-check.sh`, `infra/`, `apps/`, et fichiers fournis

Méthodologie
---
- Analyse basée uniquement sur le code et scripts présents dans le repository et les fichiers fournis.
- Si une information est absente du repo, elle est explicitement marquée `NOT FOUND IN REPO`.

1) État actuel du projet (AS‑IS)
---
- Architecture: monorepo Node/NestJS, services Docker Compose (Postgres, MongoDB, Kafka, Kafka UI, Mosquitto, Spark scaffold), pipeline event-driven MQTT → Kafka → persistence MongoDB → (optionnel) Spark → processed topic.
- Services observés:
  - `apps/iot-service` (NestJS) — health endpoint exposé, producteur Kafka et persistance MongoDB observée.
  - Kafka broker container `alkatra-kafka` et utilitaires `/opt/kafka/bin`.
  - MongoDB `alkatra-mongodb`, DB `alkatra_iot`, collection `ai_sensor_features`.
  - Spark scaffold sous `apps/spark-jobs` (Dockerfile + CI workflow).
  - Grafana / Prometheus provisioning présents sous `infra/grafana/` et `infra/prometheus/`.
- Observabilité: health scripts (`scripts/health-check.sh`, `scripts/validate-pipeline.sh`) et Kafka UI existent; métriques Prometheus et dashboards Grafana présents mais non entièrement validés.
- Maturité: prototype / early‑MVP — ingestion raw & persistence validées; traitement Spark non opérationnel pour l'instant.

2) Ce qui a été réellement construit (FACTS vs PLANS)
---
- Implémenté
  - Topics Kafka créés (`raw-sensor-data`, `processed-sensor-data`, `ml-inference-requests`, ...).
  - Simulateur `scripts/simulate-sensor.js` et validation `scripts/validate-pipeline.sh` (consommation console consumer) fonctionnels.
  - Persistance dans MongoDB `ai_sensor_features` avec TTL index (90 jours) et index composites présents (validés par `validate-mongodb-indexes.js`).
  - Grafana/Prometheus provisioning et infra présents dans repo.

- Partiel
  - `apps/spark-jobs`: Dockerfile et CI scaffolding présents, job streaming réel absent / non activé.
  - `processed-sensor-data`: topic créé mais sans messages (WARN dans validation).
  - Observability panels (Grafana) présents mais pas tous validés pour IoT metrics.

- Non implémenté / NOT FOUND IN REPO
  - Job Spark de streaming effectif consommant `raw-sensor-data` et produisant `processed-sensor-data`.
  - Documentation structurée du partitioning Kafka, consumer groups et stratégie d'idempotence.

3) Pipeline réel (END‑TO‑END FLOW)
---
- Flow observé: MQTT (Mosquitto) ← simulateur → `iot-service` → Kafka `raw-sensor-data` → consumer(s) → MongoDB `ai_sensor_features` → (optionnel) Spark → `processed-sensor-data`.
- Détails:
  - Source: `scripts/simulate-sensor.js` (topic MQTT utilisé par simulation not explicitly documented in repo; `NOT FOUND IN REPO` for exact MQTT topic string).
  - Kafka: topics listés; consumer group names not documented (`NOT FOUND IN REPO`).
  - Processing: `iot-service` acts as producer; persistence into Mongo observed (85 documents at time of run).
  - Storage: `ai_sensor_features` collection with composite and TTL indexes.
  - Exposure: health endpoints and Kafka UI available; Prometheus scrape config present.

4) Comparaison Guides vs Réalité
---
- Sprint 1
  - Guide: infra complète et healthy.
  - Réalité: infra en place; health endpoints fixés; tiny endpoint path diffs corrected in scripts.
  - Écart: naming endpoints changed historically; scripts patched accordingly.

- Sprint 2
  - Guide: scaffolds + simulate ingestion.
  - Réalité: scaffolds and simulate exist; `iot-service` issues fixed and rebuilt; validated raw ingestion.
  - Écart: minor dependency/build reproducibility issues (fixed ad‑hoc previously).

- Sprint 3
  - Guide: consumer → MongoDB; schema and indexes; Spark integration.
  - Réalité: consumer persistence present (Mongo docs exist) and indexes applied; Spark processing not active — processed topic empty.
  - Risque: downstream ML/inference blocked until processed topic is populated.

5) Problèmes techniques détectés
---
- Naming/schema inconsistencies: `ts` vs `timestamp`; collection name divergence (`ai_sensor_features` vs guide `sensor_readings`). Enforcer un schéma unique.
- Index management: initial mismatch fixed manually; index creation must être migré en script/migration.
- Kafka: no documented partition key/consumer group → risk for scaling and ordering.
- Docker/dev: instances corrigées par `npm install` en container (non-reproducible). CI must build images deterministically.
- Event-driven gaps: no DLQ, no idempotency strategy documented.

6) État des données
---
- Collections: `ai_sensor_features` used for IoT persistence.
- Indexes: composite index `farm_id_1_parcel_id_1_ts_-1`, `device_id_1_ts_-1`, TTL on `received_at` (7776000s) present and validated.
- TTL: configured 90 days — matches retention requirement per scripts.
- Data quality: sample messages well-formed; recommend schema validation early (JSON Schema / Mongoose validation).

7) Observabilité
---
- Prometheus: config present (`infra/prometheus/prometheus.yml`) — verify app metrics endpoints exist and are scraped.
- Grafana: dashboards and provisioning exist under `infra/grafana/` — validate panels reference correct metrics for IoT.
- Health checks: `scripts/health-check.sh` and `validate-pipeline.sh` provide good smoke checks.
- Logging: structured logging status `NOT FOUND IN REPO` — recommend JSON logs and centralization.

8) Conclusion stratégique
---
- Maturité: Prototype / early-MVP. Core ingestion + persistence validated. Processing and full analytics pipeline incomplete.
- Dettes techniques prioritaires:
  1. Spark streaming job missing.
  2. Schema drift & missing migrations for indexes.
  3. Missing docs for Kafka partitioning and consumer groups.
  4. Lack of DLQ and idempotency patterns.
- Priorités Sprint 4: produce the first processed message and a Grafana dashboard showing ingestion + lag + Mongo docs.

9) Sprint 4 readiness — checklist & recommandations actionnables
---
- Prêt: infra, topics, simulateur, persistence Mongo, health check scripts, Grafana provisioning files exist.
- Manque absolument: minimal processor (Spark job or lightweight consumer) that writes to `processed-sensor-data`.
- Reco techniques (priorités):
  1. Provide a minimal streaming processor (NodeJS or PySpark) to consume from `raw-sensor-data` and publish one enriched message to `processed-sensor-data`. Use consumer group `spark-processor-s4` and implement offset commit + DLQ.
  2. Add `infra/mongodb/init-indexes.js` and ensure indexes are created automatically (idempotent) on environment bootstrap.
  3. Define partitioning strategy (recommend `farm_id` or `device_id`) and set partitions/replication in `infra/kafka/topics.sh`.
  4. Ensure NestJS exposes `/metrics` and add Prometheus scrape; add 4 Grafana panels: ingestion rate, topic lag, Mongo docs count, health.
  5. Add CI smoke job that runs `scripts/validate-pipeline.sh` after a controlled simulate → expect 0 FAIL, 0 WARN for demo branch.

Annexes & fichiers utiles
---
- Validation scripts: `scripts/validate-pipeline.sh`, `scripts/validate-mongodb-indexes.js`, `scripts/health-check.sh`.
- Spark CI workflow: `.github/workflows/ci-spark.yml`.

---
Documentation: les guides `docs/guides/*` ont été mis à jour pour prendre en compte les livrables de Sprint 3 (topics Kafka, persistance Mongo `ai_sensor_features`, indexes et scripts de validation). Voir les fichiers correspondants dans le dossier `docs/guides`.


