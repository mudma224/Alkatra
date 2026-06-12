But: Instructions pour builder et démarrer le conteneur Spark production-ready

But: Résumé
- Image basée sur `apache/spark:3.5.1` avec les jars Kafka vendorisés dans `/opt/spark/jars`.
- Checkpoint Spark persistant sur volume `spark-job`.

But: Builder l'image localement
```bash
# Depuis la racine du repo
docker build -t alk-spark-local apps/spark-jobs
```

But: Démarrer le service via Docker Compose (infra)
```bash
# Depuis la racine du repo
# Utilise le compose de infra/docker/docker-compose.yml
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build spark-job
```

But: Smoke test rapide
1) Publier un message raw-sensor-data (adapté au contrat de messages du projet):
```bash
echo '{"schema_version":"v2","ts":"2026-06-09T12:00:00Z","device_id":"dev-1","farm_id":"farm-1","parcel_id":"parcel-42","temperature_min_c":15.2,"temperature_max_c":23.5,"wind_speed_ms":3.2,"solar_radiation_mj_m2_day":18.5,"soil_humidity_pct":33.0,"air_humidity_pct":60.0,"rain_mm_day":0.0,"received_at":"2026-06-09T12:00:00Z","is_anomaly":false}' | docker exec -i alkatra-kafka /opt/kafka/bin/kafka-console-producer.sh --broker-list localhost:9092 --topic raw-sensor-data
```

2) Lire le topic `processed-sensor-data` (attendre quelques secondes)
```bash
docker exec -i alkatra-kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic processed-sensor-data --from-beginning --timeout-ms 10000
```

But: Points d'attention / production
- Les jars Kafka sont vendorisés pour éviter le téléchargement Maven au démarrage.
- Utiliser un volume persistant pour `spark.sql.streaming.checkpointLocation`.
- Monitorer `/opt/spark/logs` et les métriques Spark UI (port 8080 si exposé).
- Pour CI/CD, publier l'image dans un registry privé et remplacer `build` par `image` dans le compose.

But: Si vous êtes sur Windows et que vous testez localement, assurez-vous que Docker Desktop a accès au réseau `alkatra-net` et que `kafka`/`redis` démarrent (utiliser `docker compose ps`).
