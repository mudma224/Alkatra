# Contrat OpenAPI : définition, usage et validation

## 1) Définition d'un contrat OpenAPI

Un contrat OpenAPI est une description structurée de l'API au format YAML ou JSON, conforme à la spécification OpenAPI 3.x. Il décrit de manière standardisée :

- les endpoints disponibles
- les méthodes HTTP utilisées (`GET`, `POST`, `PATCH`, `DELETE`)
- les paramètres attendus
- les corps de requêtes (`requestBody`)
- les réponses attendues (`responses`)
- les modèles de données (`schemas`)
- les mécanismes d'authentification
- les codes d'erreur et les règles métier

Dans ce projet, le fichier principal est :

- `docs/api/openapi.yaml`

Il sert de référence commune entre :

- le backend
- le frontend
- les intégrateurs
- les outils de test
- les générateurs de clients

Un contrat OpenAPI ne décrit pas seulement l'API, il permet aussi de la valider, la documenter et la faire évoluer sans ambiguïté.

---

## 2) Pourquoi on en a besoin

Un contrat OpenAPI est essentiel pour plusieurs raisons :

### 2.1. Il évite les incohérences entre backend et frontend

Sans contrat, chaque service peut interpréter les mêmes données différemment. Par exemple :

- nom d'un champ différent (`sensorId` vs `deviceId`)
- structure de réponse différente
- codes HTTP non alignés
- paramètres nommés différemment

Le contrat permet de fixer un standard unique.

### 2.2. Il documente l'API de manière claire

Les développeurs peuvent lire directement la définition pour savoir :

- quelle route appeler
- quels champs sont requis
- quelles réponses sont renvoyées
- quelles erreurs peuvent arriver

### 2.3. Il permet de valider automatiquement

On peut exécuter des outils de validation pour vérifier :

- conformité au standard OpenAPI
- schémas corrects
- champs requis présents
- opérations bien définies

### 2.4. Il aide à la génération de code

Le contrat peut servir à générer automatiquement :

- clients TypeScript
- SDK mobiles
- serveurs mocks
- modèles de données
- documentation Swagger/Redoc

### 2.5. Il améliore la qualité et la maintenance

Un projet plus mature doit avoir une API stable et consultable. Le contrat rend les évolutions plus maîtrisées et réduit les régressions.

---

## 3) Comment l'utiliser

### 3.1. Ouvrir et lire le contrat

Le fichier est situé dans :

- `docs/api/openapi.yaml`

Vous pouvez l'ouvrir dans :

- VS Code
- Swagger Editor
- Redoc
- tout outil compatible OpenAPI

### 3.2. Utiliser la documentation Swagger / Redoc

Le contrat peut être visualisé dans l'interface web générée à partir du fichier YAML.

### 3.3. Générer des clients ou des types

À partir du fichier OpenAPI, vous pouvez générer des clients ou des modèles pour le frontend ou d'autres services.

Exemples de générateurs :

- OpenAPI Generator
- NSwag
- Orval

### 3.4. Utiliser comme référence d'intégration backend/frontend

Avant de développer ou de consommer une route, les équipes doivent vérifier le contrat pour confirmer :

- paramètres attendus
- structure des réponses
- codes d'erreur
- auth

---

## 4) Validation du fichier OpenAPI

### 4.1. Depuis la racine du projet

```bash
cd C:\Users\Mahmoud\Desktop\alkatra-platform-stage
npx @redocly/cli lint docs/api/openapi.yaml
```

### 4.2. Depuis le dossier `docs/api`

```bash
cd C:\Users\Mahmoud\Desktop\alkatra-platform-stage\docs\api
npx @redocly/cli lint openapi.yaml
```

### 4.3. Prévisualiser la documentation

Depuis la racine :

```bash
cd C:\Users\Mahmoud\Desktop\alkatra-platform-stage
npx @redocly/cli build-docs docs/api/openapi.yaml
```

Depuis le dossier `docs/api` :

```bash
cd C:\Users\PC\Documents\alkatra-platform\docs\api
npx @redocly/cli build-docs openapi.yaml
```

### 4.4. Vérifier qu'il est bien parsé en YAML

```bash
python -c "import yaml, pathlib; p=pathlib.Path('docs/api/openapi.yaml'); data=yaml.safe_load(p.read_text(encoding='utf-8')); print(data.get('openapi'))"
```

Exemple attendu :

```text
3.0.3
```

---

## 5) Bonnes pratiques de conception du contrat

Pour que le contrat soit exploitable et propre, il est conseillé de respecter les règles suivantes :

- ajouter un `license` dans `info`
- décrire chaque `tag`
- donner un `operationId` unique à chaque route
- utiliser des noms de paramètres cohérents
- documenter les erreurs HTTP importantes (`400`, `401`, `403`, `404`, `422`)
- garder les schémas alignés avec le code réel
- utiliser une convention de nommage stable
- éviter les valeurs locales comme `localhost` dans les URLs de production

---

## 6) Exemple de commande de validation complète

Voici une commande de référence pour valider le contrat depuis la racine du projet :

```bash
cd C:\Users\PC\Documents\alkatra-platform
npx @redocly/cli lint docs/api/openapi.yaml
```

Et une commande pour prévisualiser la documentation :

```bash
cd C:\Users\PC\Documents\alkatra-platform
npx @redocly/cli preview-docs docs/api/openapi.yaml
```

Le fichier YAML est rédigé manuellement et doit être comparé aux controllers et DTO des services. La commande `build-docs` génère une sortie de prévisualisation ; elle ne modifie pas le contrat source.
---

## 7) En résumé

Le contrat OpenAPI est la source de vérité de l'API. Il permet de :

- documenter clairement les services
- sécuriser l'intégration backend/frontend
- valider automatiquement les routes et structures
- détecter les incohérences avant mise en production
- générer des SDK et des mocks

Dans ce projet, le fichier [docs/api/openapi.yaml](../../docs/api/openapi.yaml) doit donc être considéré comme un élément central du développement et du contrôle qualité de l'API.

---

## 8) Commandes utiles à retenir

```bash
cd C:\Users\Mahmoud\Desktop\alkatra-platform-stage
npx @redocly/cli lint docs/api/openapi.yaml
npx @redocly/cli preview-docs docs/api/openapi.yaml
python -c "import yaml, pathlib; p=pathlib.Path('docs/api/openapi.yaml'); data=yaml.safe_load(p.read_text(encoding='utf-8')); print(data.get('openapi'))"
```

Ces commandes permettent de vérifier que le contrat est valide, lisible et exploitable.
