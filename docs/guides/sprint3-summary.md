# Sprint 3 — Résumé des livrables et procédures (réel)

Date: 2026-06-13

But
---
Documenter ce qui a été effectivement livré pendant le Sprint 3 et fournir les commandes/actions reproductibles pour les développeurs.

Livrables clés (réels)
---
- Kafka topics créés: `raw-sensor-data`, `processed-sensor-data`, `ml-inference-requests`, `recommendations-generated`, `alerts-outbound`, `sensor-anomalies` (via `infra/kafka/topics.sh`).
- `apps/iot-service` produit vers Kafka et les messages sont persistés dans MongoDB collection `ai_sensor_features`.
- Indexes MongoDB créés et validés: `farm_id_1_parcel_id_1_ts_-1`, `device_id_1_ts_-1`, TTL index sur `received_at` = 7776000s (90 jours).
- Scripts de validation et health-check mis à jour:
  - [scripts/validate-pipeline.sh](scripts/validate-pipeline.sh) — validation end-to-end (simulateur → Kafka → Mongo).
  - [scripts/validate-mongodb-indexes.js](scripts/validate-mongodb-indexes.js) — vérifie la présence des index attendus.
  - [scripts/health-check.sh](scripts/health-check.sh) — checks Docker health + endpoints.

Points opérationnels
---
- Pour simuler un message capteur et vérifier la persistance:

```bash
node scripts/simulate-sensor.js 1
bash scripts/validate-pipeline.sh
```

- Pour (re)créer les topics Kafka:

```bash
bash infra/kafka/topics.sh
```

- Pour vérifier/afficher les index MongoDB:

```bash
docker exec alkatra-mongodb mongosh alkatra_iot -u alkatra -p 123 --authenticationDatabase admin --quiet \
  --eval "db.ai_sensor_features.getIndexes()"
```

Notes techniques et recommandations post‑Sprint 3
---
- Schema / noms: le projet utilise `ai_sensor_features` et le champ temporel `ts`. Ne pas confondre `timestamp` vs `ts` — normaliser dans `packages/shared-types` et les scripts.
- Indexes: déplacer la création d'indexes dans un script `infra/mongodb/init-indexes.js` ou migration exécutée au démarrage pour éviter d'avoir à les créer manuellement.
- Traitement Spark: le topic `processed-sensor-data` existe mais est vide — le job Spark/processor n'est pas activé. Pour un demo Sprint 4, fournir un processor minimal (NodeJS ou PySpark) qui consomme `raw-sensor-data` et publie un message enrichi dans `processed-sensor-data`.
- CI / builds: éviter les réparations manuelles dans containers (ex: `npm install` runtime). Forcer un `docker compose build` et ajouter vérification build dans CI.
- Observabilité: vérifier que `iot-service` expose `/metrics` et que `infra/prometheus/prometheus.yml` scrape correctement; ajouter panels Grafana pour ingestion, lag, and Mongo docs count.

Liens utiles
---
- Validation pipeline: [scripts/validate-pipeline.sh](scripts/validate-pipeline.sh)
- Health check: [scripts/health-check.sh](scripts/health-check.sh)
- Topics creation: [infra/kafka/topics.sh](infra/kafka/topics.sh)
- Audit Sprint 4 (détails & recommandations): [docs/guides/sprint4-audit.md](docs/guides/sprint4-audit.md)

Prochaine étape proposée
---
Si vous confirmez, j'implémente un *processor* minimal (NodeJS) qui produit un message dans `processed-sensor-data` et je crée une PR avec:
- le processor sous `apps/spark-jobs/jobs/processor_demo.js`
- un README de test et la mise à jour de `scripts/validate-pipeline.sh` pour attendre le message processed
