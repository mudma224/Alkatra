# Runbook de depannage

Ce fichier liste les problemes deja rencontres et les corrections connues.

## Turbo: Missing packageManager field

Symptome:

```text
Could not resolve workspaces.
Missing packageManager field in package.json
```

Cause:

Turbo 2 attend le champ `packageManager` dans le `package.json` racine.

Correction:

```json
"packageManager": "npm@11.9.0"
```

## Jest: Cannot find name describe

Symptome VS Code/TypeScript:

```text
Cannot find name 'describe'
```

Cause:

Les types Jest ne sont pas visibles dans le `tsconfig.json` du service.

Correction dans `apps/iot-service/tsconfig.json`:

```json
"types": ["node", "jest"]
```

Puis redemarrer le serveur TypeScript dans VS Code:

```text
TypeScript: Restart TS Server
```

## npm run test:cov manque a la racine

Symptome:

```text
npm error Missing script: "test:cov"
```

Cause:

Le script existait dans `apps/iot-service/package.json`, mais pas au niveau racine.

Correction:

```json
"test:cov": "turbo run test:cov"
```

Et ajouter la tache `test:cov` dans `turbo.json`.

## Grafana ne montre pas le dashboard

Symptome:

Le dossier `Al Katra IoT` est vide ou le dashboard `Al Katra - IoT Pipeline` n'apparait pas.

Causes possibles:

- le dossier des dashboards JSON n'est pas monte dans le conteneur;
- `dashboards.yml` pointe vers le mauvais chemin;
- Grafana n'a pas ete recree apres modification du provisioning.

Chemins corrects:

```yaml
./../../infra/grafana/provisioning:/etc/grafana/provisioning:ro
./../../infra/grafana/dashboards:/var/lib/grafana/dashboards:ro
```

Provider correct:

```yaml
options:
  path: /var/lib/grafana/dashboards
```

Commande:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --force-recreate grafana
```

## Grafana redemarre en boucle

Symptome:

```text
Datasource provisioning error: data source not found
```

Cause rencontree:

Le dashboard reference une datasource par UID force alors que Grafana a deja une datasource existante dans son volume.

Correction appliquee:

- ne pas forcer `uid: prometheus` dans `datasources.yml`;
- referencer la datasource par nom `"Prometheus"` dans le dashboard JSON.

## MLflow redemarre en boucle: caracteres CRLF

Symptome:

```text
/start.sh: 3: ^M: not found
Error: Got unexpected extra argument (^M)
```

Cause:

`infra/mlflow/start.sh` avait des fins de ligne Windows `CRLF`.

Correction:

- convertir `start.sh` en `LF`;
- ajouter `.gitattributes`:

```text
*.sh text eol=lf
```

## MLflow ne se connecte pas a Postgres

Symptome:

```text
FATAL: role "alkatra_user" does not exist
```

Cause:

Docker Compose n'utilisait pas le `.env` racine et retombait sur les valeurs par defaut du compose. Le volume Postgres avait ete initialise avec un autre utilisateur.

Correction:

Utiliser toujours les scripts racine:

```bash
npm run docker:up
```

Ils executent Compose avec:

```bash
--env-file .env
```

Pour verifier la config resolue:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml config
```

## MLflow healthcheck: curl not found

Symptome:

```text
/bin/sh: 1: curl: not found
```

Cause:

L'image `python:3.11-slim` ne contient pas `curl`.

Correction:

Healthcheck Docker avec Python:

```yaml
test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=5)\""]
```

## Postgres init.sql ne s'applique pas apres modification

Cause:

Les scripts dans `/docker-entrypoint-initdb.d` ne sont executes qu'a la creation initiale du volume Postgres.

Si `infra/postgres/init.sql` change apres creation du volume, il faut:

- soit appliquer une migration SQL manuelle;
- soit faire un reset de volume en developpement.

Reset:

```bash
npm run docker:reset
```

Attention: cela supprime les donnees locales.
