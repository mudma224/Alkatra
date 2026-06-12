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

## CI GitHub Actions : lint échoue sur des dossiers vides

**Symptôme :**

```
Parsing error: Cannot read file 'tsconfig.json'
```

ou

```
No files matching the pattern were found
```

**Cause :**
ESLint cherche un `tsconfig.json` à la racine. Si le fichier manque ou que le projet n'a pas encore de fichiers TypeScript, ESLint échoue.

**Correction :**
Vérifier que `tsconfig.json` existe à la racine du monorepo et que `.eslintrc.js` est commité.

---

## CI GitHub Actions : build Docker iot-service échoue

**Symptôme :**

```
ERROR: failed to solve: failed to read dockerfile: open apps/iot-service/Dockerfile
```

**Cause :**
Le `Dockerfile` de `iot-service` n'existe pas encore (Dev2 doit le créer).

**Impact :**
Le job `build-docker-images` dans `ci-common.yml` échoue. Les autres jobs (`lint-and-typecheck`, `validate-k8s-manifests`) ne sont pas affectés.

**À faire :**
Attendre que Dev2 crée `apps/iot-service/Dockerfile` (Sprint S2). En attendant, le build iot-service peut être passé en `continue-on-error: true` si nécessaire.

---

## CI GitHub Actions : npm ci échoue avec "package-lock.json is missing"

**Symptôme :**

```
npm error The `npm ci` command can only install with an existing package-lock.json
```

**Cause :**
`package-lock.json` n'a pas été commité, ou le fichier local ne correspond pas aux dépendances déclarées.

**Correction :**

```bash
npm install
git add package-lock.json
git commit -m "chore: update package-lock.json"
```

---

## CI GitHub Actions : prettier échoue sur les fins de ligne Windows

**Symptôme :**

```
[warn] apps/iot-service/src/main.ts
```

et la correction Prettier génère des diffs uniquement sur les `\r\n`.

**Cause :**
Git Bash sur Windows peut convertir les fins de ligne en CRLF même avec `.gitattributes`.

**Correction :**

```bash
git config --global core.autocrlf false
npx prettier --write "**/*.{ts,js,json}"
git add -A
git commit -m "chore: normalize line endings"
```

S'assurer que `.gitattributes` contient :

```
* text=auto eol=lf
*.sh text eol=lf
```
