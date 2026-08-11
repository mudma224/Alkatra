# Runbook de dépannage

Ce fichier liste les problèmes connus et leurs corrections.

## Turbo : Missing packageManager field

Symptôme :

```text
Could not resolve workspaces.
Missing packageManager field in package.json
```

Cause :

Turbo 2 attend le champ `packageManager` dans le `package.json` racine.

Correction :

```json
"packageManager": "npm@11.9.0"
```

## Jest : Cannot find name describe

Symptôme VS Code/TypeScript :

```text
Cannot find name 'describe'
```

Cause :

Les types Jest ne sont pas visibles dans le `tsconfig.json` du service.

Correction dans `apps/iot-service/tsconfig.json` :

```json
"types": ["node", "jest"]
```

Puis redémarrer le serveur TypeScript dans VS Code :

```text
TypeScript: Restart TS Server
```

## `npm run test:cov` absent de la racine

Symptôme :

```text
npm error Missing script: "test:cov"
```

Cause :

Le script est défini dans `apps/iot-service/package.json` mais pas au niveau racine.

Correction :

```json
"test:cov": "turbo run test:cov"
```

Et ajouter la tâche `test:cov` dans `turbo.json`.

## Grafana ne montre pas le dashboard

Symptôme :

Le dossier `Al Katra IoT` est vide ou le dashboard `Al Katra - IoT Pipeline` n'apparaît pas.

Causes possibles :

- le dossier des dashboards JSON n'est pas monté dans le conteneur ;
- `dashboards.yml` pointe vers le mauvais chemin ;
- Grafana n'a pas été recréé après modification du provisioning.

Chemins corrects :

```yaml
./../../infra/grafana/provisioning:/etc/grafana/provisioning:ro
./../../infra/grafana/dashboards:/var/lib/grafana/dashboards:ro
```

Provider correct :

```yaml
options:
  path: /var/lib/grafana/dashboards
```

Commande :

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --force-recreate grafana
```

## Grafana redémarre en boucle

Symptôme :

```text
Datasource provisioning error: data source not found
```

Cause :

Le dashboard référence une datasource par UID forcé alors que Grafana dispose d'une datasource existante dans son volume.

Correction :

- ne pas forcer `uid: prometheus` dans `datasources.yml` ;
- référencer la datasource par nom `"Prometheus"` dans le dashboard JSON.

## MLflow redémarre en boucle : caractères CRLF

Symptôme :

```text
/start.sh: 3: ^M: not found
Error: Got unexpected extra argument (^M)
```

Cause :

`infra/mlflow/start.sh` contient des fins de ligne Windows `CRLF`.

Correction :

- convertir `start.sh` en `LF` ;
- ajouter `.gitattributes` :

```text
*.sh text eol=lf
```

## MLflow ne se connecte pas à Postgres

Symptôme :

```text
FATAL: role "alkatra_user" does not exist
```

Cause :

Docker Compose n'utilise pas le `.env` racine et retombe sur les valeurs par défaut du compose. Le volume Postgres a été initialisé avec un autre utilisateur.

Correction :

Utiliser les scripts racine :

```bash
npm run docker:up
```

Ils exécutent Compose avec :

```bash
--env-file .env
```

Pour vérifier la config résolue :

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml config
```

## MLflow healthcheck : curl not found

Symptôme :

```text
/bin/sh: 1: curl: not found
```

Cause :

L'image `python:3.11-slim` ne contient pas `curl`.

Correction :

Healthcheck Docker avec Python, en interrogeant la racine du serveur MLflow (MLflow ne expose pas d'endpoint `/health` dédié) :

```yaml
test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:5001/', timeout=5)\""]
```

## Les scripts d'initialisation Postgres ne s'appliquent pas après modification

Cause :

Les scripts placés dans `/docker-entrypoint-initdb.d` ne sont exécutés qu'à la création initiale du volume Postgres.

L'initialisation des bases s'effectue via `infra/postgres/00-create-databases.sh` (création des bases, utilisateurs et droits) puis les fichiers SQL du dossier `infra/postgres/schemas/` (`auth-db.sql`, `farm-db.sql`, `recommendation-db.sql`, `notification-db.sql`). Si l'un de ces fichiers change après création du volume, le conteneur ne les rejoue pas automatiquement.

Pour appliquer les modifications :

- soit exécuter une migration SQL manuelle ;
- soit faire un reset du volume en développement.

Reset :

```bash
npm run docker:reset
```

Attention : cela supprime les données locales.

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
