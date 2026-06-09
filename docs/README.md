# Al Katra Platform - Documentation

Cette documentation decrit l'etat actuel du projet Al Katra Bel Qatra.
Elle est pensee pour qu'une nouvelle personne puisse comprendre rapidement ce qui existe, comment le lancer, comment tester, et quelles decisions structurantes ont deja ete prises.

## Lecture recommandee

1. [Vue d'ensemble du projet](architecture/project-overview.md)
2. [Etat actuel et changements realises](architecture/current-state.md)
3. [Architecture technique actuelle](architecture/current-architecture.md)
4. [Carte du repository](architecture/repository-map.md)
5. [Guide de demarrage local](guides/local-development.md)
6. [Pipeline IoT vers IA](architecture/iot-ai-pipeline.md)
7. [Contrat payload capteur](reference/iot-sensor-payload.md)
8. [Tests et qualite](guides/testing-and-quality.md)
9. [Observabilite](guides/observability.md)
10. [Depannage](runbooks/troubleshooting.md)

## Etat actuel resume

Le projet est un monorepo npm/Turborepo. A ce stade, la partie la plus avancee est le service IoT NestJS:

- reception MQTT des donnees capteurs;
- validation d'un contrat capteur compatible avec le futur modele IA;
- publication Kafka dans `raw-sensor-data`;
- tests Jest fonctionnels;
- stack Docker locale avec Kafka, Mosquitto, Postgres, MLflow, Prometheus et Grafana.

Le contrat capteur actuel est centre sur 7 variables IA:

- `temperature_min_c`
- `temperature_max_c`
- `wind_speed_ms`
- `solar_radiation_mj_m2_day`
- `soil_humidity_pct`
- `air_humidity_pct`
- `rain_mm_day`

## Dossiers de documentation

- `docs/architecture`: vues d'ensemble, diagrammes textuels, flux principaux.
- `docs/guides`: guides pratiques pour developper, tester et exploiter localement.
- `docs/reference`: contrats, ports, variables, conventions.
- `docs/runbooks`: procedures de diagnostic et resolution d'incidents.
- `docs/adr`: decisions d'architecture et leur justification.

## Commandes principales

```bash
npm install
npm run docker:up
npm run test
npm run test:cov
npm run build
npm run simulate
```

Les scripts Docker racine utilisent explicitement `.env` via `--env-file .env`.
