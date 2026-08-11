# Al Katra Platform — Documentation

Cette documentation décrit la plateforme Al Katra Bel Qatra (irrigation intelligente IoT + IA). Elle permet à un nouvel arrivant de comprendre l'architecture, de lancer le projet localement, de tester et d'étendre le code.

## Lecture recommandée

1. [AL-KATRA-SKILL](./AL-KATRA-SKILL.md) — Référence projet complète pour assistance IA ou nouvel développeur
2. [Vue d'ensemble du projet](./architecture/project-overview.md)
3. [Architecture technique](./architecture/architecture.md)
4. [Carte du repository](./architecture/repository-map.md)
5. [Guide de démarrage local](./guides/local-development.md)

## Organisation de la documentation

```
docs/
├── AL-KATRA-SKILL.md      Référence projet (architecture + conventions + extensions)
├── architecture/          Vues d'ensemble
│   ├── project-overview.md   Objectif produit, monorepo
│   ├── architecture.md       Vue technique, pipeline, persistance, sécurité
│   └── repository-map.md     Carte détaillée du dépôt
├── guides/                Guides pratiques
│   ├── <service>.md          Un guide par service (détail technique complet)
│   ├── local-development.md  Démarrage local
│   ├── local-ml.md           Stack ML locale
│   ├── api-gateway.md        Configuration Nginx
│   ├── ci-cd.md              Pipelines GitHub Actions
│   ├── observability.md      Prometheus, Grafana, MLflow
│   └── testing-and-quality.md Stratégie de test
├── reference/             Contrats et tables de référence
│   ├── iot-sensor-payload.md  Contrat capteur
│   ├── ports-and-services.md  Ports et routage
│   ├── postgres-databases.md  Schémas PostgreSQL
│   └── environment.md         Variables d'environnement
├── runbooks/              Diagnostic et résolution d'incidents
│   ├── troubleshooting.md
│   └── production-spark.md
├── adr/                   Décisions d'architecture
└── lecons/                Notes pédagogiques personnelles (hors périmètre projet)
```

### Conventions

- Chaque sujet a **une seule source de référence**. Le détail technique d'un service est dans son guide ; les contrats figés sont dans `reference/`.
- Les guides par service suivent un squelette commun à 19 sections (rôle, architecture, endpoints, modèle de données, configuration, tests, etc.).
- Les ADR documentent des décisions passées et ne sont pas modifiés rétroactivement.
- Les leçons sont pédagogiques et personnelles : elles ne font pas autorité sur l'état du projet.

## Commandes principales

```bash
npm install                    # Installe les dépendances de tous les workspaces
npm run docker:up              # Démarre la stack infrastructure de base
npm run docker:up-phase1       # Démarre la stack complète (incluant services métier)
npm run dev                    # Démarre tous les services en mode développement
npm run test                   # Tests de tous les workspaces
npm run test:cov               # Tests avec couverture
npm run build                  # Build de tous les workspaces
npm run simulate               # Lance le simulateur de capteur MQTT
npm run health                 # Vérifie l'état de la stack locale
```

Les scripts Docker utilisent `--env-file .env` (voir [ADR-0002](./adr/0002-docker-compose-env-file.md)).

## Variables d'environnement

Le fichier `.env.example` à la racine du dépôt sert de modèle. Le copier en `.env` et adapter les valeurs locales (mots de passe, clés API SMS, etc.).

Voir [reference/environment.md](./reference/environment.md) pour le détail.
