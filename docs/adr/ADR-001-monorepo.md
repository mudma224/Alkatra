# ADR-001 — Choix Monorepo avec Turborepo

**Date** : Mai 2025
**Statut** : Accepté
**Décideurs** : Dev1, Dev2

## Contexte

Le projet Al Katra Bel Qatra comprend plusieurs services :
- Backend NestJS (iot-service, auth-service, farm-service, etc.)
- Service ML FastAPI (ml-inference-service)
- Jobs Spark PySpark
- Application Flutter (Phase 2)

La question : un repo par service (polyrepo) ou tous dans un seul repo (monorepo) ?

## Options évaluées

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **Monorepo Turborepo** (retenu) | Types partagés, CI unifié, refactoring global facilité | Plus complexe à configurer initialement |
| Polyrepo (un repo par service) | Indépendance totale de chaque service | Pas de types partagés, CI dupliqué, coordination complexe |

## Décision

**Monorepo avec Turborepo** est retenu car :
1. Les types TypeScript (`@alkatra/shared-types`) sont utilisés par plusieurs services
2. Un seul pipeline CI/CD à maintenir
3. Un seul `docker compose up` pour démarrer tout l'environnement
4. Les deux développeurs travaillent sur les mêmes fichiers infrastructure

## Conséquences

- Tous les services sont dans `apps/`
- Les packages partagés sont dans `packages/`
- Turborepo gère l'ordre de build et le cache
- Un seul `package.json` à la racine + un `package.json` par service