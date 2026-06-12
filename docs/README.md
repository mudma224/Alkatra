# Al Katra Platform — Documentation

Cette documentation décrit l'état actuel du projet Al Katra Bel Qatra. Elle est pensée pour qu'une nouvelle personne puisse comprendre rapidement ce qui existe, comment le lancer, comment tester, et quelles décisions structurantes ont déjà été prises.

## Lecture recommandée

1. [Vue d'ensemble du projet](./architecture/project-overview.md)
2. [État actuel et changements réalisés](./architecture/current-state.md)
3. [Architecture technique actuelle](./architecture/current-architecture.md)
4. [Carte du repository](./architecture/repository-map.md)
5. [Guide de démarrage local](./guides/local-development.md)
6. [Pipeline IoT vers IA](./architecture/iot-ai-pipeline.md)
7. [Contrat payload capteur](./reference/iot-sensor-payload.md)
8. [Tests et qualité](./guides/testing-and-quality.md)
9. [CI/CD — Pipelines GitHub Actions](./guides/ci-cd.md)
10. [Observabilité](./guides/observability.md)
11. [Dépannage](./runbooks/troubleshooting.md)

## État actuel résumé

Le projet est un monorepo npm/Turborepo. Les parties les plus avancées sont :

**Service IoT NestJS (`apps/iot-service`) :**
- réception MQTT des données capteurs
- validation d'un contrat capteur compatible avec le futur modèle IA
- publication Kafka dans `raw-sensor-data`
- tests Jest fonctionnels
- stack Docker locale avec Kafka, Mosquitto, Postgres, MLflow, Prometheus et Grafana

<<<<<<< HEAD
Le contrat capteur actuel est centre sur 7 variables IA:
=======
**Scaffolds actifs (Sprint S2) :**
- `apps/auth-service/` — placeholder NestJS Phase 1 avec `/health`
- `apps/spark-jobs/` — Dockerfile Spark prêt pour les jobs S3
- `apps/ml-inference-service/` — FastAPI minimal avec `/health` pour S4

**CI/CD (Sprint S2) :**
- `ci-common.yml` — lint + build Docker + validation K8s sur chaque PR
- `ci-iot.yml` — tests Jest IoT en isolation
- `ci-ml.yml` — tests pytest ML + Spark

Le contrat capteur actuel est centré sur 7 variables IA :
>>>>>>> sprint2

- `temperature_min_c`
- `temperature_max_c`
- `wind_speed_ms`
- `solar_radiation_mj_m2_day`
- `soil_humidity_pct`
- `air_humidity_pct`
- `rain_mm_day`

## Dossiers de documentation

- `docs/architecture` : vues d'ensemble, diagrammes textuels, flux principaux
- `docs/guides` : guides pratiques pour développer, tester, exploiter et déployer localement
- `docs/reference` : contrats, ports, variables, conventions
- `docs/runbooks` : procédures de diagnostic et résolution d'incidents
- `docs/adr` : décisions d'architecture et leur justification

## Commandes principales

```bash
npm install
npm run docker:up
npm run test
npm run test:cov
npm run build
npm run simulate
npm run health
```

Les scripts Docker racine utilisent explicitement `.env` via `--env-file .env`.
