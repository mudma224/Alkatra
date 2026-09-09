# Al Katra Platform

Plateforme d'irrigation intelligente IoT + IA destinée aux petits exploitants agricoles (oléiculture, Maroc). Collecte des données terrain via capteurs, traitement en flux, modèle d'aide à la décision, recommandations d'irrigation consultables par l'agriculteur.

## Documentation

La documentation complète est dans [docs/README.md](docs/README.md). Pour une vue d'ensemble, démarrer par [AL-KATRA-SKILL](docs/AL-KATRA-SKILL.md) — référence projet pour assistance IA ou nouvel développeur.

## Démarrage rapide

```bash
npm install                    # Dépendances de tous les workspaces
cp .env.example .env           # Configurer les variables locales
npm run docker:up              # Stack infrastructure (Postgres, Mongo, Kafka, MLflow...)
npm run docker:up-phase1       # Stack complète incluant les services métier
npm run simulate               # Simuler un capteur MQTT
npm run test                   # Lancer les tests
```

Prérequis : Node.js 20+, npm 10+, Python 3.11+, Docker. Voir [le guide de démarrage local](docs/guides/local-development.md) pour le détail.

## Stack

- **Backend** : NestJS (TypeScript), TypeORM, Passport-JWT
- **ML** : FastAPI (Python 3.11), XGBoost, MLflow, SHAP
- **Streaming** : PySpark 3.5.1, Apache Kafka (KRaft), MQTT (Mosquitto)
- **Données** : PostgreSQL 16 + PostGIS, MongoDB 7.0, Redis 7.2
- **Observabilité** : Prometheus, Grafana
- **Gateway** : Nginx
