# Vue d'ensemble du projet

## Objectif produit

Al Katra Bel Qatra est une plateforme d'irrigation intelligente. L'objectif est de collecter des donnees terrain via capteurs IoT, les traiter en flux, alimenter un futur modele IA, puis produire des recommandations d'irrigation.

## Ce qui existe actuellement

Le projet contient actuellement:

- une stack d'infrastructure locale Docker;
- un service IoT NestJS dans `apps/iot-service`;
- un broker MQTT Mosquitto;
- Kafka en mode KRaft avec Kafka UI;
- Postgres/PostGIS pour les donnees metier;
- MongoDB et Redis prepares pour les prochaines phases;
- MLflow pour le tracking et le registry des modeles IA;
- Prometheus et Grafana pour l'observabilite;
- un simulateur de capteur MQTT dans `scripts/simulate-sensor.js`;
- des tests unitaires Jest sur les services MQTT/Kafka.

## Ce qui n'est pas encore complet

Les briques suivantes sont preparees ou reservees, mais pas encore implementees completement:

- service ML inference;
- jobs Spark ou consumers Kafka aval;
- persistance time-series des mesures capteurs;
- API metier agriculteur/parcelle/recommandations;
- authentification Keycloak;
- pipelines de deploiement Kubernetes.

## Priorite actuelle

La priorite actuelle est la coherence du pipeline IoT avec le futur modele IA.

Le pipeline brut doit garantir que les messages envoyes a Kafka contiennent exactement les variables attendues par le modele:

```text
temperature_min_c
temperature_max_c
wind_speed_ms
solar_radiation_mj_m2_day
soil_humidity_pct
air_humidity_pct
rain_mm_day
```

Ces champs sont documentes dans [le contrat payload capteur](../reference/iot-sensor-payload.md).

## Monorepo

Le repo est organise en workspaces npm:

```text
apps/
  iot-service/
packages/
infra/
scripts/
docs/
```

Turborepo orchestre les commandes `build`, `test`, `test:cov`, `lint` et `dev`.

Le champ racine suivant est obligatoire pour Turbo 2:

```json
"packageManager": "npm@11.9.0"
```
