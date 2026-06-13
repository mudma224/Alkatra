# CI/CD — Intégration et livraison continues

Ce document décrit les pipelines GitHub Actions mis en place au Sprint S2 par Dev1.

## Vue d'ensemble

Trois workflows GitHub Actions automatisent la vérification du code à chaque push ou Pull Request.

| Workflow | Fichier | Se déclenche quand |
|----------|---------|-------------------|
| Common | `.github/workflows/ci-common.yml` | Push ou PR sur `main` / `develop` |
| IoT | `.github/workflows/ci-iot.yml` | Modifications dans `apps/iot-service/` ou `packages/shared-types/` |
| ML | `.github/workflows/ci-ml.yml` | Modifications dans `apps/ml-inference-service/` ou `apps/spark-jobs/` |

---

## ci-common.yml — Lint, build, validation K8s

Déclenché sur tout push ou PR vers `main` ou `develop`.

**Jobs exécutés dans l'ordre :**

1. `lint-and-typecheck` — installe les dépendances racine, lance `npm run lint` et vérifie le formatage Prettier.
2. `build-docker-images` — démarre uniquement si le lint passe. Build `iot-service` (requis), `spark-jobs` et `ml-inference-service` (optionnels via `continue-on-error: true`).
3. `validate-k8s-manifests` — applique les manifests Kubernetes en mode dry-run pour valider leur syntaxe.

**Pourquoi `continue-on-error` sur spark et ML ?**

Ces images sont volumineuses et dépendent de modèles non disponibles en CI. Un échec de build ne bloque pas la PR tant que le code TypeScript est propre.

---

## ci-iot.yml — Tests du service IoT

Déclenché uniquement si des fichiers dans `apps/iot-service/**` ou `packages/shared-types/**` ont changé.

**Ce qu'il vérifie :**
- lint TypeScript du service IoT
- tests Jest avec mocks MQTT et Kafka (`npm run test:cov`)
- upload du rapport de couverture vers Codecov (optionnel)

**Variables d'environnement en CI :**

```
NODE_ENV=test
MQTT_BROKER_URL=mqtt://localhost:1883
KAFKA_BROKERS=localhost:9092
MONGODB_URI=mongodb://localhost:27017/test
```

Ces services ne tournent pas dans GitHub Actions. Les tests utilisent des mocks — c'est intentionnel.

---

## ci-ml.yml — Tests ML et Spark

Déclenché uniquement si des fichiers dans `apps/ml-inference-service/**` ou `apps/spark-jobs/**` ont changé.

**Ce qu'il vérifie :**
- tests pytest du service FastAPI en mode DEMO (sans modèles réels)
- tests unitaires feature engineering Spark (sans cluster Spark, marqués `-k "not spark"`)
- lint Python via `ruff`

---

## Lancer les vérifications en local avant de pousser

```bash
# Vérifier le lint TypeScript
npm run lint

# Vérifier le formatage Prettier
npx prettier --check "**/*.{ts,js,json}"

# Corriger le formatage automatiquement
npx prettier --write "**/*.{ts,js,json}"

# Builder une image Docker localement
docker build apps/iot-service --target development -t alkatra-iot:local

# Valider les manifests Kubernetes en dry-run
kubectl apply --dry-run=client -f infra/kubernetes/namespace.yaml
kubectl apply --dry-run=client -f infra/kubernetes/configmap.yaml
```

---

## Lire une erreur CI

Quand un workflow échoue, GitHub envoie un email. Pour lire les détails :

1. **GitHub → onglet Actions** → cliquer sur le run en rouge
2. Cliquer sur le job en échec
3. Développer l'étape en rouge pour voir le message exact

**Erreurs fréquentes et solutions :**

| Message CI | Cause | Solution |
|-----------|-------|---------|
| `Missing script: "test:cov"` | Script absent du `package.json` | Ajouter `"test:cov": "jest --coverage"` dans le bon `package.json` |
| `Cannot find module` | `npm ci` a échoué | Vérifier que `package-lock.json` est commité |
| `Parsing error: Cannot read tsconfig.json` | `tsconfig.json` manquant | Créer `tsconfig.json` à la racine (voir `apps/auth-service/tsconfig.json`) |
| `COPY failed: file not found` | Fichier manquant dans le Dockerfile | Créer le fichier ou corriger le chemin dans le Dockerfile |
| `LF will be replaced by CRLF` | Fins de ligne Windows | Configurer `.gitattributes` avec `*.sh text eol=lf` |

---

## Ajouter un nouveau workflow

Pour un nouveau service (ex: `farm-service` en Phase 1) :

1. Créer `.github/workflows/ci-farm.yml` en suivant le modèle `ci-iot.yml`
2. Adapter `paths:` pour cibler `apps/farm-service/**`
3. Adapter `working-directory:` et les scripts

---

## État actuel des badges CI

Les badges dans `README.md` reflètent le statut des deux workflows principaux :

```markdown
[![CI Common](https://github.com/.../.../actions/workflows/ci-common.yml/badge.svg)](...)
[![CI IoT](https://github.com/.../.../actions/workflows/ci-iot.yml/badge.svg)](...)
```

Un badge vert = le dernier push sur la branche par défaut passe tous les checks.

