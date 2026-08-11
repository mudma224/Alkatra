# `apps/spark-jobs` — Documentation technique

---

## Table des matières

1. [Rôle du composant](#1-rôle-du-composant)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Arborescence complète](#3-arborescence-complète)
4. [Démarrage](#4-démarrage)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Points d'entrée](#6-points-dentrée)
7. [Fonctionnement interne par fichier](#7-fonctionnement-interne-par-fichier)
8. [Feature engineering (détail)](#8-feature-engineering-détail)
9. [Gestion d'état (Redis)](#9-gestion-détat-redis)
10. [Structured Streaming](#10-structured-streaming)
11. [Gestion des erreurs](#11-gestion-des-erreurs)
12. [Tests](#12-tests)
13. [Docker](#13-docker)
14. [Ce que le composant NE fait PAS](#14-ce-que-le-composant-ne-fait-pas)
15. [Comportements notables](#15-comportements-notables)
16. [Résumé opérationnel](#16-résumé-opérationnel)

---

## 1. Rôle du composant

`spark-jobs` est un **job Spark Structured Streaming** qui assure l'enrichissement des données capteur entre la collecte brute et l'inférence ML. À la différence des microservices HTTP de la plateforme, il n'expose aucun port : il consomme un topic Kafka en continu, calcule les features agronomiques, maintient un état journalier par parcelle dans Redis, puis republie un message enrichi vers un autre topic Kafka.

**Ce qu'il fait :**

- Il consomme le topic Kafka `raw-sensor-data` (messages conformes au contrat `sensor-ai-v2`, voir `docs/reference/iot-sensor-payload.md`).
- Il normalise les messages entrants (champs canoniques ou alias, horodatage epoch ou ISO 8601).
- Il calcule l'évapotranspiration de référence **ETo** (Penman-Monteith FAO-56 simplifié).
- Il applique le **coefficient cultural Kc** de l'olivier (table phénologique par mois) pour produire **ETc**.
- Il enrichit chaque message avec **22 features** (météo, agronomie, temporel, mémoire, features dérivées).
- Il maintient dans Redis un **état journalier sur 4 jours** (`day0` à `day3`) par `parcel_id`, avec rotation et TTL.
- Il publie le message enrichi sur le topic Kafka `processed-sensor-data`, consommé en aval par `ml-inference-service`.
- Il tolère un mode `DRY_RUN` (journalisation sans écriture Kafka) pour les tests locaux.

**Ce qu'il ne fait PAS :**

- Il ne fait pas d'inférence ML (rôle de `ml-inference-service`, qui consomme `processed-sensor-data`).
- Il n'expose aucune API HTTP ni aucun port réseau.
- Il ne persiste pas dans PostgreSQL ni dans MongoDB.
- Il ne consomme pas directement MQTT (rôle de l'`iot-service`, qui publie vers `raw-sensor-data`).

---

## 2. Architecture et flux

### Flux principal (Kafka → Spark → Kafka)

```
iot-service (MQTT)
  └→ publie sur Kafka "raw-sensor-data"
              │
              ▼
spark-jobs (Structured Streaming)
  ├── readStream.format("kafka") — subscribe raw-sensor-data
  ├── foreachBatch(process_batch) toutes les 30 s
  │     ├── json.loads + normalisation (alias de champs, ts epoch/ISO)
  │     ├── state_manager.get_parcel_state(parcel_id)   ← Redis (day1..day3)
  │     ├── feature_engineering.compute_derived_features(...)
  │     │     ├── calculate_eto()        (Penman-Monteith FAO-56)
  │     │     ├── get_kc_olivier(month)  (table phénologique)
  │     │     └── 22 features
  │     ├── state_manager.update_parcel_state(...)      → Redis (rotation day0..day3)
  │     └── enrichissement du message (schema_version "processed-v1")
  └── writeStream → Kafka "processed-sensor-data" (clé = parcel_id)
              │
              ▼
ml-inference-service (consommateur aval)
```

### Architecture des dépendances

```
spark-job (conteneur alkatra-spark, aucun port exposé)
│
├── Kafka
│   ├── Consumer : topic "raw-sensor-data"
│   └── Producer : topic "processed-sensor-data"
│
└── Redis
    └── Clés alkatra:state:<parcel_id>:day0..day3
        (TTL 5 jours, rotation journalière)
```

Le job dépend de `kafka` et `redis` dans le `docker-compose` (condition `service_healthy`). Aucune dépendance à PostgreSQL, MongoDB, MLflow ou MinIO.

---

## 3. Arborescence complète

```
apps/spark-jobs/
├── Dockerfile                            # Image apache/spark:3.5.1 + jars Kafka vendorisés
├── entrypoint.sh                         # Gestion des permissions du checkpoint
├── requirements.txt                      # Dépendances Python (conflit Git non résolu — voir §15)
│
├── jobs/
│   ├── feature_engineering.py            # ETo, Kc olivier, compute_derived_features (22 features)
│   ├── state_manager.py                  # État journalier Redis (day0..day3, TTL, rotation)
│   └── sensor_stream_processor.py        # Point d'entrée Spark Structured Streaming
│
└── tests/
    ├── conftest.py                       # Ajoute apps/spark-jobs au sys.path
    ├── test_feature_engineering.py       # Tests ETo, Kc, 22 features (sans Spark, sans Redis)
    └── test_state_manager.py             # Tests Redis via fakeredis (sans Spark)
```

> **Note :** Aucun fichier `__init__.py` n'existe dans `jobs/` ni dans `tests/`. Les tests importent les modules via `jobs.feature_engineering`, `jobs.state_manager` (rendu possible par le `conftest.py` qui place la racine `apps/spark-jobs` sur `sys.path`). Le job en production importe directement `feature_engineering` et `state_manager` (sans le préfixe `jobs.`) car le `spark-submit` s'exécute depuis `/app` avec `jobs/sensor_stream_processor.py` en point d'entrée.

---

## 4. Démarrage

### En local (développement, tests sans Spark)

Les fonctions pures (`feature_engineering`, `state_manager`) ne nécessitent ni Spark ni Redis réel. Les tests s'exécutent avec `fakeredis`.

```bash
cd apps/spark-jobs

# Installer les dépendances de test
# ⚠️ requirements.txt contient des marqueurs de conflit Git non résolus
# (voir section 15) — pip install -r requirements.txt ÉCHOUE.
# Contournement : installer manuellement les paquets nécessaires
pip install pyspark==3.5.1 redis==5.3.1 pytest==8.2.0 fakeredis==2.36.1

# Lancer les tests
pytest tests/ -v
```

Pour exécuter le job en streaming local, il faut une session Spark et un Redis accessibles :

```bash
# Variables minimales pour un DRY_RUN (pas d'écriture Kafka)
export DRY_RUN=1
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export KAFKA_BROKERS=127.0.0.1:9092

spark-submit jobs/sensor_stream_processor.py
```

### Dans Docker

```bash
# Depuis la racine du monorepo — démarre toute la stack
npm run docker:up

# Ou, pour ne démarrer que le job Spark (et ses dépendances)
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build spark-job
```

### Prérequis

- **Kafka** accessible avec le topic `raw-sensor-data` créé.
- **Redis** accessible (état journalier par parcelle).
- **Image Spark** `apache/spark:3.5.1` (Scala 2.12) — les jars Kafka sont vendorisés dans le Dockerfile.
- Aucun port ne doit être exposé : le job n'écoute pas sur le réseau.

---

## 5. Variables d'environnement

### Configuration (dans `sensor_stream_processor.py` et `docker-compose`)

La configuration est lue par `os.getenv` au démarrage du job. Les valeurs par défaut correspondent à un environnement de développement type `kafka:9092` / `redis:6379` (noms de service Docker).

Le `docker-compose` (section `spark-job`) injecte explicitement les variables suivantes :

```yaml
environment:
  KAFKA_BROKERS: kafka:9092
  KAFKA_INPUT_TOPIC: raw-sensor-data
  KAFKA_OUTPUT_TOPIC: processed-sensor-data
  KAFKA_STARTING_OFFSETS: ${KAFKA_STARTING_OFFSETS:-latest}
  KAFKA_FAIL_ON_DATA_LOSS: ${KAFKA_FAIL_ON_DATA_LOSS:-false}
  DRY_RUN: ${SPARK_DRY_RUN:-0}
  SPARK_CHECKPOINT_DIR: /tmp/spark-checkpoint
  REDIS_HOST: redis
  REDIS_PORT: "6379"
  REDIS_PASSWORD: ${REDIS_PASSWORD:-alkatra_redis_pass}
```

### Tableau récapitulatif

| Variable | Défaut (code) | Valeur docker-compose | Utilisation |
|----------|---------------|----------------------|-------------|
| `KAFKA_BROKERS` | `kafka:9092` | `kafka:9092` | Brokers Kafka (consumer + producer) |
| `KAFKA_INPUT_TOPIC` | `raw-sensor-data` | `raw-sensor-data` | Topic source consommé par `readStream` |
| `KAFKA_OUTPUT_TOPIC` | `processed-sensor-data` | `processed-sensor-data` | Topic destination du `writeStream` / `foreachBatch` |
| `KAFKA_STARTING_OFFSETS` | `latest` | `latest` | Offset de départ du consumer (`latest` ou `earliest`) |
| `KAFKA_FAIL_ON_DATA_LOSS` | `false` | `false` | `failOnDataLoss` Kafka ; `true` recommandé en production stricte |
| `DRY_RUN` | `0` | `0` | `1`/`true` → journalise les payloads sans écrire dans Kafka |
| `SPARK_CHECKPOINT_DIR` | `/tmp/spark-checkpoint` | `/tmp/spark-checkpoint` | Emplacement du checkpoint Spark (volume nommé `spark-job`) |
| `REDIS_HOST` | `redis` | `redis` | Hôte Redis (état journalier) |
| `REDIS_PORT` | `6379` | `6379` | Port Redis |
| `REDIS_PASSWORD` | `alkatra_redis_pass` | `alkatra_redis_pass` | Mot de passe Redis |

> **Variables du `entrypoint.sh` (permissions checkpoint) :** `CHECKPOINT_OWNER_UID` (défaut `1001`), `CHECKPOINT_OWNER_GID` (défaut `0`), `CHECKPOINT_PERMISSIONS` (défaut `775`). Elles ajustent l'ownership et les droits du répertoire de checkpoint au démarrage du conteneur.

---

## 6. Points d'entrée

### `sensor_stream_processor.py` (Structured Streaming)

Le job possède un unique point d'entrée : la fonction `main()` du module `jobs/sensor_stream_processor.py`, invoquée via `spark-submit` par le `CMD` du Dockerfile.

Commande effective dans le conteneur :

```
/opt/spark/bin/spark-submit \
    --master local[2] \
    --conf spark.driver.memory=1g \
    --conf spark.executor.memory=1g \
    --conf spark.sql.streaming.checkpointLocation=/tmp/spark-checkpoint \
    --conf spark.hadoop.hadoop.security.authentication=simple \
    --conf spark.driver.extraJavaOptions=-Duser.name=spark -Duser.home=/tmp \
    --conf spark.executor.extraJavaOptions=-Duser.name=spark -Duser.home=/tmp \
    jobs/sensor_stream_processor.py
```

Le mode `--master local[2]` exécute Spark en local avec 2 threads. Aucun cluster Spark externe n'est requis. L'option `--packages` est absente : les jars Kafka sont vendorisés dans `/opt/spark/jars` par le Dockerfile.

---

## 7. Fonctionnement interne par fichier

### Détail par fichier source

| Fichier | Rôle |
|---------|------|
| `jobs/feature_engineering.py` | Fonctions pures : `calculate_eto()` (Penman-Monteith FAO-56 simplifié), `get_kc_olivier(month)` (table phénologique), `compute_derived_features(...)` (produit les 22 features). Aucune dépendance Spark ni Redis. |
| `jobs/state_manager.py` | Gestion de l'état journalier par `parcel_id` dans Redis : `get_parcel_state()` (lecture day1..day3), `update_parcel_state()` (rotation day0..day3 + TTL 5 jours). Client Redis singleton. |
| `jobs/sensor_stream_processor.py` | Point d'entrée Spark Structured Streaming. Définit le schéma de référence `RAW_SCHEMA`, les alias de champs `FIELD_ALIASES`, les fonctions de parsing tolérant (`_to_float`, `_ts_to_iso`, `_parse_datetime`, `_resolve_field`), la fonction `process_batch()` (exécutée par `foreachBatch`) et la fonction `main()` (session Spark + stream). |

### `feature_engineering.py`

Trois fonctions exposées :

- `calculate_eto(temp_max_c, temp_min_c, air_humidity_pct, wind_speed_ms, solar_radiation_mj_m2_day) -> float` — retourne ETo en mm/jour (voir section 8).
- `get_kc_olivier(month) -> float` — coefficient cultural (table par mois).
- `compute_derived_features(...) -> dict` — produit un dictionnaire de 22 clés (voir section 8).

Le module ne dépend que de `math` et de `typing.Optional`. Il est testable isolément, sans Spark.

### `state_manager.py`

- `get_redis() -> redis.Redis` — singleton du client Redis (`decode_responses=True`).
- `_key(parcel_id, day_offset) -> str` — construit la clé `alkatra:state:<parcel_id>:day<offset>`.
- `get_parcel_state(parcel_id) -> dict` — retourne un dict à 6 clés (`soil_humidity_j1`, `rain_j1`, `etc_j1`, `rain_j2`, `rain_j3`, `soil_humidity_rolling3`).
- `update_parcel_state(parcel_id, soil_humidity_pct, rain_mm, etc) -> None` — rotation journalière puis écriture du nouveau `day0`.

Le TTL constant est `STATE_TTL_SECONDS = 5 * 24 * 3600` (5 jours). Voir section 9 pour le détail de la rotation.

### `sensor_stream_processor.py`

- `RAW_SCHEMA` — `StructType` de référence documentant le contrat `sensor-ai-v2` (15 champs). N'est **pas** appliqué via `from_json` : le `value` Kafka est conservé comme string et parsé en Python dans `process_batch` pour tolérer `ts` numérique et les alias.
- `FIELD_ALIASES` — dictionnaire des noms alternatifs acceptés pour 7 champs canoniques.
- `_resolve_field(raw, canonical)` — retourne la valeur canonique ou le premier alias présent.
- `_to_float(value)` — conversion robuste (None → 0.0, virgule décimale gérée).
- `_ts_to_iso(ts_value)` — normalise `ts` (epoch int/float ou ISO 8601 string) vers ISO 8601.
- `_parse_datetime(received_at)` — extrait `(month, day_of_year, day_of_week)` depuis une chaîne ISO 8601.
- `process_batch(df, epoch_id)` — cœur du traitement micro-batch (voir section 10).
- `main()` — crée la `SparkSession`, configure et démarre le stream, puis `awaitTermination()`.

---

## 8. Feature engineering (détail)

### Calcul ETo (Penman-Monteith FAO-56)

La fonction `calculate_eto()` implémente la formule FAO-56 simplifiée. Les étapes sont :

1. **Température moyenne** : `temp_moy = (temp_max + temp_min) / 2`
2. **Pression de vapeur saturante** (kPa) : `es = 0.6108 * exp(17.27 * temp_moy / (temp_moy + 237.3))`
3. **Pression de vapeur réelle** (kPa) : `ea = es * (humidite_air / 100)`
4. **Pente de la courbe de pression vapeur** (kPa/°C) : `delta = 4098 * es / (temp_moy + 237.3)²`
5. **Constante psychrométrique** : `gamma = 0.066`
6. **Rayonnement net approximatif** (MJ/m²/jour) : `rn = solar_radiation * 0.77`
7. **Penman-Monteith** :

```
numérateur   = 0.408 * delta * rn + gamma * (900 / (temp_moy + 273)) * vent * (es - ea)
dénominateur = delta + gamma * (1 + 0.34 * vent)
ETo          = max(0.0, round(numérateur / dénominateur, 6))
```

Le résultat est arrondi à 6 décimales et borné à 0. Si le dénominateur est nul, la fonction retourne `0.0`. Les paramètres sont identiques au contrat capteur `sensor-ai-v2`.

### Coefficient cultural Kc olivier (phénologique par mois)

La fonction `get_kc_olivier(month)` retourne le coefficient cultural moyen pour l'olivier, par trimestre, calibré pour les conditions marocaines :

| Mois | Kc olivier |
|------|-----------|
| Décembre, Janvier, Février (12, 1, 2) | 0.55 |
| Mars, Avril, Mai (3, 4, 5) | 0.65 |
| Juin, Juillet, Août (6, 7, 8) | 0.70 |
| Septembre, Octobre, Novembre (9, 10, 11) | 0.60 |

`ETc` est calculé comme `round(ETo * Kc, 6)`.

### Les 22 features dérivées (ordre canonique)

`compute_derived_features(...)` retourne un dictionnaire ordonné de 22 clés. L'ordre correspond au feature set attendu par `ml-inference-service` et par les notebooks d'entraînement (`model_IA.ipynb`).

| # | Clé | Catégorie | Origine |
|---|-----|-----------|---------|
| 1 | `temp_max` | Météo brute | Entrée capteur |
| 2 | `temp_min` | Météo brute | Entrée capteur |
| 3 | `temp_moy` | Météo brute | `(temp_max + temp_min) / 2` |
| 4 | `delta_temp` | Météo brute | `temp_max - temp_min` |
| 5 | `humidite_air` | Météo brute | Entrée capteur |
| 6 | `vent` | Météo brute | Entrée capteur |
| 7 | `rayonnement` | Météo brute | Entrée capteur |
| 8 | `pluie` | Météo brute | Entrée capteur |
| 9 | `ET0_mm` | Agronomie | `calculate_eto(...)` |
| 10 | `ETc` | Agronomie | `ETo * get_kc_olivier(month)` |
| 11 | `humidite_sol_avant_%` | Agronomie | Entrée capteur |
| 12 | `humidite_sol_rolling3` | Agronomie | Moyenne 3 jours (Redis) |
| 13 | `jour_annee` | Temporel | Depuis `received_at` |
| 14 | `mois` | Temporel | Depuis `received_at` |
| 15 | `jour_semaine` | Temporel | Depuis `received_at` (0 = lundi) |
| 16 | `humidite_sol_j-1` | Mémoire (Redis) | day1.soil_humidity_pct |
| 17 | `pluie_j-1` | Mémoire (Redis) | day1.rain_mm |
| 18 | `ETc_j-1` | Mémoire (Redis) | day1.etc |
| 19 | `pluie_3j` | Mémoire (Redis) | `rain_j1 + rain_j2 + rain_j3` |
| 20 | `eto_hum_ratio` | Dérivée | `ETo / (humidite_air + 1)` |
| 21 | `deficit_hydrique` | Dérivée | `ETc - pluie_3j` |
| 22 | `regime_sol` | Dérivée | 0 (sec < 30 %), 1 (normal 30–60 %), 2 (humide > 60 %) |

La feature `regime_sol` est un entier issu d'un seuillage sur `soil_humidity_pct` :

- `< 30` → `0` (sec)
- `30 ≤ x < 60` → `1` (normal)
- `≥ 60` → `2` (humide)

---

## 9. Gestion d'état (Redis)

### Clés `day0..day3`

Chaque parcelle possède 4 clés Redis au plus :

```
alkatra:state:<parcel_id>:day0   # jour courant (en cours d'accumulation)
alkatra:state:<parcel_id>:day1   # J-1
alkatra:state:<parcel_id>:day2   # J-2
alkatra:state:<parcel_id>:day3   # J-3
```

Chaque clé stocke un objet JSON à 3 champs :

```json
{
  "soil_humidity_pct": 55.0,
  "rain_mm": 2.5,
  "etc": 4.2
}
```

### Rotation journalière

`update_parcel_state()` réalise une rotation avant d'écrire le nouveau `day0` :

1. Lecture du `day0` courant.
2. Si `day0` existe → rotation (décalage d'un jour) :
   - `day3 ← day2` (si `day2` présent)
   - `day2 ← day1` (si `day1` présent)
   - `day1 ← day0`
3. Écriture du nouveau `day0` avec les valeurs du message courant.

Le contenu de `day3` est écrasé (supprimé logiquement) à chaque rotation. Au sein d'une même journée, `day0` est écrasé à chaque message traité — seul le dernier message du jour est conservé comme référence pour le lendemain.

### TTL

Chaque clé est écrite avec `setex(..., STATE_TTL_SECONDS, ...)`, où `STATE_TTL_SECONDS = 5 * 24 * 3600` (5 jours). La marge de 2 jours au-delà de la fenêtre utile (3 jours) protège contre les interruptions ponctuelles du job.

### Lecture (`get_parcel_state`)

La lecture interroge `day1`, `day2`, `day3` (le jour courant n'est pas consommé comme feature, puisqu'il correspond au message en cours de traitement). Si une clé est absente (premier jour d'utilisation d'une parcelle), un défaut `{0.0, 0.0, 0.0}` est utilisé. La feature `soil_humidity_rolling3` est calculée comme la moyenne des valeurs `soil_humidity_pct` non nulles de `day1`, `day2`, `day3`.

En cas d'erreur Redis (indisponibilité, parse error), la fonction logge un warning et retourne un dict à zéros — le traitement du message se poursuit avec des valeurs par défaut.

---

## 10. Structured Streaming

### Trigger (30 s)

Le stream est configuré avec un trigger de 30 secondes :

```python
.trigger(processingTime="30 seconds")
```

Spark déclenche donc un micro-batch toutes les 30 secondes, indépendamment du volume de messages disponibles.

### `foreachBatch`

Le traitement est réalisé via `foreachBatch(process_batch)` plutôt qu'un `writeStream.format("kafka")` direct. Cette approche permet le parsing tolérant (alias, `ts` polymorphe) et l'appel à Redis côté Python, ce que ne permettrait pas un simple `select(from_json(...))`.

Le pipeline de `process_batch(df, epoch_id)` :

1. `df.count()` puis `df.collect()` (avec gestion d'erreur).
2. Pour chaque row :
   - `json.loads(row["value"])` — les messages JSON invalides sont rejetés et comptabilisés.
   - Extraction de `parcel_id` (message rejeté si absent).
   - Résolution des champs via `_resolve_field` (canonique puis alias).
   - Conversion via `_to_float`.
   - Résolution temporelle : `received_at` prioritaire, sinon `_ts_to_iso(raw["ts"])`.
   - `get_parcel_state(parcel_id)` → état Redis.
   - `compute_derived_features(...)` → 22 features.
   - `update_parcel_state(parcel_id, ...)` → rotation + écriture Redis.
   - Construction du message enrichi (`schema_version: "processed-v1"`).
3. Si `DRY_RUN` : journalisation des payloads, pas d'écriture Kafka.
4. Sinon : `spark.createDataFrame(output_records)` puis `write.format("kafka")` avec `topic = OUTPUT_TOPIC`.

La clé Kafka du message publié est `parcel_id` (partitionnement par parcelle).

### Checkpoint (volume nommé `spark-job`)

Le checkpoint Spark est stocké dans `SPARK_CHECKPOINT_DIR` (défaut `/tmp/spark-checkpoint`), lui-même monté sur le **volume Docker nommé `spark-job`** :

```yaml
volumes:
  - ./../../apps/spark-jobs/jobs:/app/jobs
  - spark-job:/tmp/spark-checkpoint
```

Le volume persiste les offsets Kafka et les métadonnées du stream entre redémarrages du conteneur. La localisation effective du checkpoint est `{SPARK_CHECKPOINT_DIR}/main` (option `checkpointLocation` du `writeStream`).

### Parsing tolérant (ts epoch/ISO + alias)

Deux sources de tolérance :

**Horodatage (`_ts_to_iso`)** — le champ `ts` peut arriver sous trois formes :

- `int` ou `float` (Unix epoch secondes) → conversion via `datetime.fromtimestamp(..., tz=utc)`.
- Chaîne numérique (`"1700000000"`) → conversion epoch.
- Chaîne ISO 8601 → renvoyée telle quelle.

Les erreurs de conversion (`OverflowError`, `OSError`, `ValueError`) renvoient une chaîne vide.

**Alias de champs (`FIELD_ALIASES`)** — pour 7 champs canoniques, des noms alternatifs sont acceptés :

| Champ canonique | Alias acceptés |
|----------------|----------------|
| `temperature_min_c` | `temp_min_c`, `min_temperature_c` |
| `temperature_max_c` | `temp_max_c`, `max_temperature_c` |
| `wind_speed_ms` | `wind_speed_mps`, `wind_m_s` |
| `solar_radiation_mj_m2_day` | `solar_radiation`, `solar_mj_m2_day` |
| `soil_humidity_pct` | `soil_moisture_pct`, `soil_moisture_1` |
| `air_humidity_pct` | `air_humidity` |
| `rain_mm_day` | `rainfall_mm_day`, `rain_mm` |

`_resolve_field` retourne la valeur canonique si présente, sinon la première valeur d'alias trouvée, sinon `None` (converti en `0.0` par `_to_float`).

---

## 11. Gestion des erreurs

La philosophie du job est la **tolérance** : un message invalide ne fait pas tomber le stream.

| Étape | Comportement en cas d'erreur |
|-------|------------------------------|
| `df.count()` / `df.collect()` | `try/except` autour de l'appel ; logge l'exception et retourne (batch abandonné sans crash) |
| `json.loads(row["value"])` | `JSONDecodeError` capturé ; message rejeté, compteur `rejected` incrémenté, warning loggé |
| `parcel_id` absent | Message rejeté, `rejected` incrémenté, warning loggé |
| `_resolve_field` / `_to_float` | Valeurs absentes → `0.0` (pas d'exception) |
| `get_parcel_state` (Redis) | Exception capturée ; retourne un dict à zéros ; le message est traité avec des valeurs par défaut |
| `compute_derived_features` | Exception capturée dans la boucle ; logge l'erreur parcel/batch et passe au message suivant |
| `update_parcel_state` (Redis) | Exception capturée ; logge l'erreur mais ne lève pas (le message est quand même publié avec les features calculées) |
| Écriture Kafka | Si `SparkSession.getActiveSession()` est `None` → logge une erreur et retourne (pas d'écriture) |
| `DRY_RUN` | Aucune écriture Kafka ; les payloads sont journalisés |

À la fin du batch, un warning récapitulatif est émis si des messages ont été rejetés.

---

## 12. Tests

### Fichiers de test

| Fichier | Ce qu'il teste |
|---------|----------------|
| `tests/conftest.py` | Ajoute la racine `apps/spark-jobs` à `sys.path` pour permettre `from jobs.feature_engineering import ...` |
| `tests/test_feature_engineering.py` | `calculate_eto` (valeurs plausibles été/hiver, non-négativité, exemple du contrat capteur), `get_kc_olivier` (un test par trimestre + décembre), `compute_derived_features` (présence des 22 clés, calcul `temp_moy`, cumul `pluie_3j`, seuils `regime_sol`, `deficit_hydrique`, premier jour à zéros) |
| `tests/test_state_manager.py` | `get_parcel_state` (parcelle inconnue → zéros, après 1 update → J-1 correct, `soil_humidity_rolling3` = moyenne 3 jours), `update_parcel_state` (clé Redis créée avec les bons champs, TTL > 0) |

### Caractéristiques (fakeredis, pas de Spark requis)

- Les tests portent sur les **fonctions pures** (`feature_engineering`) et sur l'état Redis **mocké via `fakeredis`**.
- Aucune session Spark n'est instanciée. Aucun Kafka réel n'est requis.
- Le fixture `fake_redis_client` (autouse) remplace `_redis_client` du module `state_manager` par un `fakeredis.FakeRedis(decode_responses=True)`.
- Aucun test ne couvre `sensor_stream_processor.py` (parsing, `process_batch`, intégration Spark/Kafka).

### Commandes

```bash
cd apps/spark-jobs

# Prérequis : fakeredis doit être installé
# (voir la note sur requirements.txt en section 15)
pip install pytest==8.2.0 fakeredis==2.36.1 redis==5.3.1

# Lancer les tests
pytest tests/ -v

# Couverture (optionnelle)
pytest tests/ -v --cov=jobs
```

---

## 13. Docker

### Dockerfile (image `apache/spark:3.5.1`)

```dockerfile
FROM apache/spark:3.5.1

USER root
WORKDIR /app

# Dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip wget && rm -rf /var/lib/apt/lists/*

# Runtime Python minimal — PySpark est fourni par l'image de base
RUN pip install --no-cache-dir redis==5.3.1

# Code des jobs + tests
COPY jobs/ ./jobs/
COPY tests/ ./tests/

# Jars Kafka vendorisés (Scala 2.12)
RUN mkdir -p /opt/spark/jars && \
    for url in <voir liste ci-dessous> ; do \
        wget -q --tries=3 --retry-connrefused --timeout=30 "$url" -P /opt/spark/jars/ ; \
    done && \
    chown -R 1001:0 /opt/spark/jars && chmod -R g+rw /opt/spark/jars

# Variables d'environnement utilisateur non-root
ENV HOME=/tmp
ENV _JAVA_OPTIONS="-Duser.home=/tmp -Duser.name=spark"
ENV HADOOP_USER_NAME=spark USER=spark LOGNAME=spark

# Cache Ivy + checkpoint pré-créés
RUN mkdir -p /tmp/.ivy2/cache /tmp/.ivy2/jars /tmp/spark-checkpoint && \
    chown -R 1001:0 /tmp/.ivy2 /tmp /tmp/spark-checkpoint && \
    chmod -R g+rw /tmp/.ivy2 /tmp

# Entrée passwd pour UID 1001 (UnixPrincipal)
RUN echo 'spark:x:1001:0:spark user:/tmp:/bin/sh' >> /etc/passwd || true

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER 1001
WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/opt/spark/bin/spark-submit", "--master", "local[2]", ..., "jobs/sensor_stream_processor.py"]
```

| Élément | Valeur |
|---------|--------|
| Image de base | `apache/spark:3.5.1` (Scala 2.12) |
| Utilisateur d'exécution | **UID 1001 non-root** (`spark`), groupe 0 |
| Dépendance Python installée | `redis==5.3.1` uniquement (PySpark fourni par l'image) |
| Port exposé | **Aucun** |
| Healthcheck | Aucun (job long-running, pas d'endpoint HTTP) |
| Point d'entrée | `/app/entrypoint.sh` puis `spark-submit` via `CMD` |

### Jars Kafka vendorisés (Scala 2.12)

Le Dockerfile télécharge 4 jars vers `/opt/spark/jars` pour éviter toute résolution Ivy au démarrage :

| Artifact | Version |
|----------|---------|
| `spark-sql-kafka-0-10_2.12` | 3.5.1 |
| `spark-token-provider-kafka-0-10_2.12` | 3.5.1 |
| `kafka-clients` | 3.4.1 |
| `commons-pool2` | 2.11.1 |

Le téléchargement utilise `wget --tries=3 --retry-connrefused --timeout=30` pour fiabiliser les builds en environnement réseau instable.

### `entrypoint.sh` (gestion permissions checkpoint)

Le script shell exécuté avant `spark-submit` :

1. Lit `CHECKPOINT_DIR`, `CHECKPOINT_OWNER_UID` (1001), `CHECKPOINT_OWNER_GID` (0), `CHECKPOINT_PERMISSIONS` (775).
2. Détecte si le répertoire de checkpoint existe (première exécution vs reprise).
3. Crée le répertoire (`mkdir -p`), avec repli en permissions relaxées en cas d'échec.
4. Applique `chmod` puis `chown` (échecs non fatals — warnings seulement).
5. Vérifie que le répertoire est writable par l'utilisateur courant.
6. Exporte `SPARK_FIRST_RUN` (0 ou 1) pour un éventuel traitement conditionnel.
7. `exec "$@"` lance la commande passée (le `spark-submit` du `CMD`).

Toutes les étapes sont tolérantes : un échec de `chmod`/`chown` ne stoppe pas le démarrage.

### docker-compose (section `spark-job`)

```yaml
spark-job:
  build:
    context: ./../../apps/spark-jobs
    dockerfile: Dockerfile
  container_name: alkatra-spark
  restart: unless-stopped
  depends_on:
    kafka:
      condition: service_healthy
    redis:
      condition: service_healthy
  environment:
    KAFKA_BROKERS: kafka:9092
    KAFKA_INPUT_TOPIC: raw-sensor-data
    KAFKA_OUTPUT_TOPIC: processed-sensor-data
    KAFKA_STARTING_OFFSETS: ${KAFKA_STARTING_OFFSETS:-latest}
    KAFKA_FAIL_ON_DATA_LOSS: ${KAFKA_FAIL_ON_DATA_LOSS:-false}
    DRY_RUN: ${SPARK_DRY_RUN:-0}
    SPARK_CHECKPOINT_DIR: /tmp/spark-checkpoint
    REDIS_HOST: redis
    REDIS_PORT: "6379"
    REDIS_PASSWORD: ${REDIS_PASSWORD:-alkatra_redis_pass}
  volumes:
    - ./../../apps/spark-jobs/jobs:/app/jobs
    - spark-job:/tmp/spark-checkpoint
  networks:
    - alkatra-net
```

| Élément | Valeur |
|---------|--------|
| `container_name` | `alkatra-spark` |
| `restart` | `unless-stopped` |
| `depends_on` | `kafka`, `redis` (chacun `condition: service_healthy`) |
| Ports | **Aucun** (pas de mappage de port) |
| Volumes | bind mount `jobs/` + volume nommé `spark-job` sur `/tmp/spark-checkpoint` |
| Réseau | `alkatra-net` |

---

## 14. Ce que le composant NE fait PAS

- Il ne fait pas d'inférence ML (rôle de `ml-inference-service`, qui consomme `processed-sensor-data`).
- Il n'expose aucun port ni endpoint HTTP.
- Il ne persiste pas dans PostgreSQL ni MongoDB.
- Il ne consomme pas MQTT directement (rôle de l'`iot-service`).
- Il n'utilise pas `--packages` Spark : les jars Kafka sont vendorisés.
- Il n'applique pas de déduplication explicite des messages (pas de gestion d'idempotence côté business — seule la rotation `day0` est idempotente dans la journée).
- Il ne valide pas strictement la présence des 7 variables capteur : les champs absents sont convertis en `0.0` par `_to_float`.
- Il n'émet pas de métriques Prometheus (pas d'endpoint `/metrics`).
- Il ne publie pas vers un topic d'erreurs/dead-letter queue (les messages invalides sont seulement rejetés et loggés).

---

## 15. Comportements notables

### `requirements.txt` — conflit Git non résolu

Le fichier `apps/spark-jobs/requirements.txt` contient des **marqueurs de conflit Git non résolus** qui empêchent `pip install -r requirements.txt` de aboutir. Le contenu effectif du fichier est :

```
<<<<<<<<< Temporary merge branch 1
# Dépendances pour le DÉVELOPPEMENT / TESTS locaux (hors conteneur Spark).
# Dans le conteneur, PySpark provient de l'image apache/spark:3.5.1 et seul
# redis est installé via le Dockerfile (redis==5.3.1).
pyspark==3.5.1
redis==5.3.1
pytest==8.2.0
fakeredis==2.36.1
=========
httpx==0.27.0
kafka-python==2.0.2
pytest-asyncio==0.23.6
>>>>>>>>> Temporary merge branch 2
```

Conséquences :

- `pip install -r requirements.txt` **échoue** (pip refuse la syntaxe avec `<<<<<<<` / `=========` / `>>>>>>>>>`).
- La **branche 1** contient les dépendances réellement utilisées : `pyspark==3.5.1`, `redis==5.3.1`, `pytest==8.2.0`, `fakeredis==2.36.1`.
- La **branche 2** contient un ensemble alternatif (`httpx`, `kafka-python`, `pytest-asyncio`) sans rapport direct avec le code des jobs.
- Les tests importent `fakeredis`, qui ne se trouve que dans la **branche 1**. L'exécution des tests exige donc d'installer `fakeredis` (et `redis`, `pytest`) manuellement en contournant le fichier.

Contournement pour exécuter les tests :

```bash
pip install pyspark==3.5.1 redis==5.3.1 pytest==8.2.0 fakeredis==2.36.1
pytest apps/spark-jobs/tests/ -v
```

Ce conflit n'affecte pas le conteneur Docker : le Dockerfile ignore `requirements.txt` et installe uniquement `redis==5.3.1` (PySpark est fourni par l'image de base).

### Parsing permissif des valeurs capteur

Les champs absents ou non convertibles deviennent silencieusement `0.0`. Un message incomplet n'est donc pas rejeté : il est enrichi avec des features calculées à partir de zéros. Seuls un JSON invalide ou une absence de `parcel_id` provoquent le rejet.

### Schéma de référence non appliqué

`RAW_SCHEMA` (`StructType`) documente le contrat `sensor-ai-v2` mais n'est **pas** utilisé par `from_json`. Le parsing est fait en Python pour tolérer `ts` polymorphe et les alias. Le schéma sert donc de documentation, pas de validateur.

### `get_parcel_state` tolérant aux erreurs Redis

En cas d'indisponibilité de Redis, `get_parcel_state` retourne un dict à zéros et logge un warning. Le job continue à produire des messages enrichis, mais avec des features stateful (`humidite_sol_j-1`, `pluie_j-1`, etc.) à zéro — les prédictions aval peuvent en être dégradées sans signal d'alerte explicite.

### `day0` écrasé dans la journée

`update_parcel_state` est appelée à chaque message traité. Au sein d'une même journée, `day0` est systématiquement écrasé : seul le dernier message du jour est conservé comme `day0`, puis promu `day1` lors de la première rotation du lendemain. Si plusieurs messages arrivent pour la même parcelle le même jour, ils ne s'accumulent pas.

### Volume nommé et reprise de stream

Le volume Docker nommé `spark-job`, monté sur `/tmp/spark-checkpoint`, persiste les offsets Kafka. Au redémarrage du conteneur, le stream reprend là où il s'était arrêté (sauf si le répertoire est supprimé). L'`entrypoint.sh` détecte la présence du répertoire pour logger s'il s'agit d'une première exécution ou d'une reprise.

---

## 16. Résumé opérationnel

| Caractéristique | Valeur |
|----------------|--------|
| **Type** | Job Spark Structured Streaming (feature engineering temps réel) |
| **Framework** | PySpark 3.5.1 (image `apache/spark:3.5.1`, Scala 2.12) |
| **Langage** | Python 3 (runtime de l'image Spark) |
| **Port exposé** | **Aucun** (pas un service HTTP) |
| **Mode Spark** | `local[2]` (2 threads, pas de cluster externe) |
| **Trigger** | 30 secondes (`processingTime="30 seconds"`) |
| **Modèle de traitement** | `foreachBatch` |
| **Topic entrée** | `raw-sensor-data` (Kafka) |
| **Topic sortie** | `processed-sensor-data` (Kafka, clé = `parcel_id`) |
| **Feature engineering** | ETo Penman-Monteith FAO-56, Kc olivier phénologique, 22 features |
| **État** | Redis, clés `alkatra:state:<parcel_id>:day0..day3`, TTL 5 jours |
| **Checkpoint** | `/tmp/spark-checkpoint` (volume nommé `spark-job`) |
| **Utilisateur** | UID 1001 non-root |
| **Jars Kafka** | Vendorisés (4 jars, Scala 2.12) |
| **Mode test local** | `DRY_RUN=1` (journalisation sans écriture Kafka) |
| **Dépendances conteneur** | `kafka`, `redis` (`service_healthy`) |
| **Tests** | pytest + fakeredis (2 fichiers, fonctions pures) |

### Commandes essentielles

```bash
# Démarrer uniquement le job Spark (depuis la racine du monorepo)
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build spark-job

# Construire l'image isolément
docker build -t alk-spark-local apps/spark-jobs

# Suivre les logs du conteneur
docker logs -f alkatra-spark

# Smoke test : publier un message sur raw-sensor-data
echo '{"schema_version":"v2","ts":"2026-06-09T12:00:00Z","device_id":"dev-1","farm_id":"farm-1","parcel_id":"parcel-42","temperature_min_c":15.2,"temperature_max_c":23.5,"wind_speed_ms":3.2,"solar_radiation_mj_m2_day":18.5,"soil_humidity_pct":33.0,"air_humidity_pct":60.0,"rain_mm_day":0.0,"received_at":"2026-06-09T12:00:00Z","is_anomaly":false}' \
  | docker exec -i alkatra-kafka /opt/kafka/bin/kafka-console-producer.sh \
      --broker-list localhost:9092 --topic raw-sensor-data

# Lire le topic de sortie
docker exec -i alkatra-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic processed-sensor-data \
  --from-beginning --timeout-ms 10000

# Lancer les tests en local (contourner le requirements.txt corrompu)
pip install pyspark==3.5.1 redis==5.3.1 pytest==8.2.0 fakeredis==2.36.1
cd apps/spark-jobs && pytest tests/ -v
```
