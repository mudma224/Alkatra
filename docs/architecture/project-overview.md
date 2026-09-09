# Vue d'ensemble du projet

## Objectif produit

Al Katra Bel Qatra (« Goutte à goutte ») est une plateforme d'irrigation intelligente. Elle collecte les données terrain via des capteurs IoT, les traite en flux, alimente un modèle d'apprentissage automatique d'aide à la décision, puis produit des recommandations d'irrigation consultables par l'agriculteur. Chaque recommandation indique s'il faut irriguer, en quelle quantité (mm), pendant combien de temps (minutes), avec une explication en français et en darija.

La plateforme cible prioritairement l'oléiculture au Maroc. Le coefficient cultural Kc et les seuils d'anomalie sont adaptés à ce contexte.

## Ce que contient le dépôt

- **7 services applicatifs** :
  - `auth-service` — Inscription téléphone, OTP SMS, JWT, profil
  - `user-service` — Proxy/BFF public vers auth-service
  - `farm-service` — Fermes, parcelles, capteurs
  - `recommendation-service` — Recommandations d'irrigation
  - `iot-service` — Bridge MQTT → Kafka → Mongo
  - `ml-inference-service` — Inférence XGBoost via MLflow
  - `spark-jobs` — Feature engineering (ETo, Kc) et streaming Kafka
- **Une stack d'infrastructure Docker locale** : PostgreSQL multi-bases, MongoDB, Redis, Kafka (KRaft), Mosquitto, MinIO, MLflow, Prometheus, Grafana, Nginx
- **Un simulateur de capteur** (`scripts/simulate-sensor.js`)
- **Une stack CI/CD** GitHub Actions (6 workflows)
- **Une documentation** complète dans `docs/`

## Organisation du monorepo

Le dépôt est organisé en workspaces npm, orchestrés par Turborepo :

```
apps/         Services applicatifs (NestJS, FastAPI, PySpark)
packages/     Code partagé (shared-types, shared-utils)
infra/        Infrastructure Docker (compose, nginx, postgres, kafka, etc.)
scripts/      Scripts utilitaires
docs/         Documentation
.github/      Workflows CI/CD
```

Turborepo orchestre les commandes `build`, `test`, `test:cov`, `lint` et `dev` à travers tous les workspaces. Le champ `"packageManager": "npm@11.9.0"` est obligatoire pour Turborepo 2.

## Stack technique en bref

- **Backend NestJS** : TypeScript, TypeORM, Passport-JWT
- **ML** : Python 3.11, FastAPI, XGBoost, MLflow, SHAP
- **Spark** : PySpark 3.5.1 (Structurred Streaming)
- **Données** : PostgreSQL 16 + PostGIS, MongoDB 7.0, Redis 7.2
- **Streaming** : Apache Kafka 3.7 (mode KRaft single-node)
- **IoT** : MQTT via Mosquitto
- **Observabilité** : Prometheus, Grafana
- **Gateway** : Nginx avec template dynamique

## Pour aller plus loin

- [Architecture technique détaillée](./architecture.md) — interactions, pipeline, persistance
- [Carte du repository](./repository-map.md) — structure détaillée du dépôt
- [AL-KATRA-SKILL](../AL-KATRA-SKILL.md) — référence complète pour assistance IA
- [Démarrage local](../guides/local-development.md) — lancer la plateforme en local
