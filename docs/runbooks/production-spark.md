# Runbook — Spark Structured Streaming (sensor → features)

Job : `apps/spark-jobs/jobs/sensor_stream_processor.py`
Pipeline : `raw-sensor-data` (Kafka) → features ML (Redis state) → `processed-sensor-data` (Kafka).
Image : `apache/spark:3.5.1` (Scala **2.12**). Connecteurs Kafka vendorisés dans `/opt/spark/jars`.
Projet Docker Compose : **al-katra-bel-qatra** (déclaré via `name:` dans `infra/docker/docker-compose.yml`).

## 1. Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `KAFKA_BROKERS` | `kafka:9092` | Brokers (driver + executors, réseau `alkatra-net`) |
| `KAFKA_INPUT_TOPIC` | `raw-sensor-data` | Topic source |
| `KAFKA_OUTPUT_TOPIC` | `processed-sensor-data` | Topic destination |
| `KAFKA_STARTING_OFFSETS` | `latest` | `earliest` pour rejouer tout le topic en test |
| `KAFKA_FAIL_ON_DATA_LOSS` | `false` | `true` en prod stricte |
| `DRY_RUN` | `0` | `1` = enrichit et logge sans publier (debug) |
| `SPARK_CHECKPOINT_DIR` | `/tmp/spark-checkpoint` | Checkpoint (volume nommé `spark-job`) |
| `REDIS_HOST/PORT/PASSWORD` | `redis`/`6379`/`.env` | État journalier par parcelle |

Surcharges au lancement (via `.env` ou inline) : `KAFKA_STARTING_OFFSETS`, `KAFKA_FAIL_ON_DATA_LOSS`, `SPARK_DRY_RUN`.

## 2. Build & Run

```bash
# Depuis la racine du repo
cd infra/docker

# Build + démarrage de toute la stack (projet al-katra-bel-qatra)
docker compose up -d --build

# Démarrer / rebuild uniquement le job Spark
docker compose up -d --build spark-job

# Logs
docker compose logs -f spark-job
```

> Le projet étant nommé `al-katra-bel-qatra`, le conteneur Spark (`alkatra-spark`)
> apparaît dans le même projet que les autres conteneurs. Vérifier :
> `docker compose -p al-katra-bel-qatra ps`

## 3. Smoke test end-to-end

```bash
# Depuis la racine du repo (Git Bash / WSL sur Windows)
bash scripts/smoke_test.sh
```

Le script produit un message `sensor-ai-v2` dans `raw-sensor-data` et vérifie
qu'un message enrichi `parcel-smoke` arrive dans `processed-sensor-data`.

Manuel (équivalent) :

```bash
# Producer
echo '{"schema_version":"sensor-ai-v2","ts":1710000000,"device_id":"d1","farm_id":"f1","parcel_id":"p1","temperature_min_c":15.2,"temperature_max_c":23.5,"wind_speed_ms":3.2,"solar_radiation_mj_m2_day":18.5,"soil_humidity_pct":33.0,"air_humidity_pct":60.0,"rain_mm_day":0.0,"received_at":"2026-06-10T09:08:30Z","is_anomaly":false}' \
  | docker exec -i alkatra-kafka /opt/kafka/bin/kafka-console-producer.sh --broker-list localhost:9092 --topic raw-sensor-data

# Consumer
docker exec -i alkatra-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic processed-sensor-data --from-beginning --timeout-ms 30000
```

## 4. Reset checkpoint / rejouer le topic

Si aucun message n'est traité après un re-run, le checkpoint mémorise les offsets.
Pour rejouer tout le topic en lecture complète :

```bash
cd infra/docker
docker compose stop spark-job
# Supprime le volume de checkpoint (projet al-katra-bel-qatra)
docker volume rm al-katra-bel-qatra_spark-job
# Relancer en lecture depuis le début
KAFKA_STARTING_OFFSETS=earliest docker compose up -d spark-job
```

## 5. Tests unitaires

```bash
cd apps/spark-jobs
pip install -r requirements.txt
python -m pytest tests/ -v
```

## 6. Schéma & alias

Le job parse `value` brut en JSON Python (et non via `from_json(schema)` figé)
pour tolérer :
- `ts` en **Unix secondes** OU ISO8601 (`_ts_to_iso`),
- les **alias** de champs (`rain_mm`→`rain_mm_day`, `air_humidity`→`air_humidity_pct`, …)
  définis dans `FIELD_ALIASES` (cf. `docs/reference/iot-sensor-payload.md`).

Les messages invalides (JSON cassé ou `parcel_id` absent) sont **comptés et loggués**
(`Batch N — X message(s) rejeté(s)`) sans interrompre le stream.

## 7. Version Spark — recommandation

**Rester sur Spark 3.5.1** : les jars vendorisés (`spark-sql-kafka-0-10_2.12-3.5.1`,
`spark-token-provider-kafka-0-10_2.12-3.5.1`, `kafka-clients-3.4.1`, `commons-pool2-2.11.1`)
correspondent au binaire **Scala 2.12** de l'image. Aucun mismatch.
Vendoriser les jars au build (déjà fait dans le `Dockerfile`) évite toute résolution
Ivy/réseau au démarrage → builds reproductibles en CI.

## 8. Dépannage rapide

| Symptôme | Cause probable | Action |
| --- | --- | --- |
| Batch reçus mais 0 enrichi | parsing JSON / parcel_id | voir logs « message(s) rejeté(s) » |
| Aucun batch | checkpoint + `latest` | reset volume + `earliest` (§4) |
| `ClassNotFound kafka` | jars manquants | rebuild image (jars vendorisés §7) |
| Redis errors | mauvais `REDIS_PASSWORD` | aligner `.env` et compose |
| Spark hors projet | `name:` manquant | déjà corrigé (`al-katra-bel-qatra`) |
