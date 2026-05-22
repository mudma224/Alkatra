# Guide de demarrage local

## Prerequis

- Node.js `>= 20`
- npm `>= 10`
- Docker Desktop
- Git Bash ou PowerShell

Le projet utilise npm workspaces et Turborepo.

## Installation

```bash
npm install
```

## Variables d'environnement

Copier `.env.example` vers `.env`, puis adapter les valeurs si besoin.

```bash
cp .env.example .env
```

Important: `.env` ne doit pas etre committe.

Les scripts Docker racine utilisent explicitement:

```bash
--env-file .env
```

Cela evite que Docker Compose retombe silencieusement sur les valeurs par defaut du `docker-compose.yml`.

## Lancer l'infrastructure

```bash
npm run docker:up
```

Voir les logs:

```bash
npm run docker:logs
```

Arreter:

```bash
npm run docker:down
```

Reset complet avec suppression des volumes:

```bash
npm run docker:reset
```

Attention: `docker:reset` supprime les volumes Docker, donc les donnees Postgres, Grafana, Kafka, etc.

## Lancer le service IoT

Depuis la racine:

```bash
npm run dev -w @alkatra/iot-service
```

Ou depuis `apps/iot-service`:

```bash
npm run start:dev
```

Le service expose:

```text
http://localhost:3005/health
```

## Simuler un capteur

```bash
npm run simulate
```

Avec intervalle personnalise:

```bash
node scripts/simulate-sensor.js 5000
```

Le simulateur publie sur:

```text
alkatra/farm/{FARM_ID}/parcel/{PARCEL_ID}/sensor/{DEVICE_ID}/data
```

Variables optionnelles:

```bash
FARM_ID=farm_test_001
PARCEL_ID=parcel_test_001
DEVICE_ID=esp32-sim-001
MQTT_HOST=localhost
MQTT_PORT=1883
```

## Interfaces utiles

| Outil | URL |
| --- | --- |
| Grafana | `http://localhost:3000` |
| Prometheus | `http://localhost:9090` |
| Kafka UI | `http://localhost:8090` |
| MLflow | `http://localhost:5000` |
| MailHog | `http://localhost:8025` |

## Keycloak

Keycloak est derriere le profile Docker `auth`.

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile auth up -d keycloak
```
