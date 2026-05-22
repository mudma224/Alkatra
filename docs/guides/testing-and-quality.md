# Tests et qualite

## Commandes principales

Depuis la racine:

```bash
npm run test
npm run test:cov
npm run build
```

Pour cibler seulement le service IoT:

```bash
npm test -w @alkatra/iot-service
npm run test:cov -w @alkatra/iot-service
npm run build -w @alkatra/iot-service
```

Sous PowerShell, si `npm.ps1` ou `npx.ps1` est bloque par la policy Windows, utiliser:

```powershell
npm.cmd run test
npx.cmd tsc -p apps/iot-service/tsconfig.json --noEmit
```

## Tests actuels

Les tests sont dans:

```text
apps/iot-service/tests
```

Fichiers principaux:

- `mqtt.service.spec.ts`
- `kafka.service.spec.ts`

Ils valident:

- instanciation des services;
- connexion mockee MQTT/Kafka;
- validation des 6 variables IA;
- detection d'anomalies simples;
- rejet des payloads incomplets;
- publication Kafka vers `raw-sensor-data`.

## Couverture

La commande:

```bash
npm run test:cov
```

lance Jest avec coverage.

La couverture indique quelles lignes/fonctions/branches sont executees par les tests. Elle ne garantit pas que les assertions sont suffisantes, mais elle aide a trouver les zones non testees.

Les zones a ameliorer plus tard:

- `HealthController`;
- cas d'erreur Kafka;
- cas d'erreur MQTT;
- `main.ts`;
- modules Nest;
- futurs consumers Kafka.

## TypeScript et Jest

`apps/iot-service/tsconfig.json` inclut:

```json
"types": ["node", "jest"]
```

C'est necessaire pour que VS Code reconnaisse `describe`, `it`, `expect` et `jest` dans les tests.

`apps/iot-service/tsconfig.build.json` exclut les tests du build:

```json
"exclude": ["node_modules", "test", "tests", "dist", "**/*.spec.ts"]
```

## Turborepo

Turbo exige le champ racine:

```json
"packageManager": "npm@11.9.0"
```

Sans ce champ, `npm run test` echoue avec:

```text
Could not resolve workspaces.
Missing packageManager field in package.json
```
