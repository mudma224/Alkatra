# 📋 LISTE EXHAUSTIVE DES MODIFICATIONS — Al Katra Bel Qatra
## LIVRABLE 2 — Modifications à apporter à la documentation

> **Version cible** : 2.0.0  
> **Fichier concerné** : `docs/AL-KATRA-SKILL-v1.0.md`

---

## 1. AJOUTS

### 1.1 Nouveaux services/composants
| # | Élément | Justification | Preuve |
|---|---------|--------------|--------|
| A1 | **spark-jobs jobs/** (3 fichiers Python) | Code fonctionnel existant non documenté | `sensor_stream_processor.py`, `feature_engineering.py`, `state_manager.py` |
| A2 | **spark-jobs tests/** (2 fichiers) | Tests existants non documentés | `test_feature_engineering.py`, `test_state_manager.py` |
| A3 | **spark-jobs entrypoint.sh** | Script d'entrée Docker Spark | `entrypoint.sh` |
| A4 | **MongoDB collection et0** | Schéma Mongoose ET0 existant | `et0.schema.ts` |
| A5 | **Workflow CI spark** | 4e workflow CI non documenté | `.github/workflows/ci-spark.yml` |
| A6 | **Kubernetes manifests** (4 fichiers) | Manifests K8s non listés | `namespace.yaml`, `configmap.yaml`, `secrets-template.yaml`, `deployment.yaml` |
| A7 | **Scripts supplémentaires** (4 scripts) | Scripts existants non documentés | `final_test.py`, `smoke_ml_integration.py`, `smoke_test.sh`, `test_load_models.py` |
| A8 | **Grafana provisioning** (datasources.yml, dashboards.yml) | Configuration provisioning non documentée | `infra/grafana/provisioning/` |
| A9 | **Dashboard Grafana iot-pipeline.json** | Dashboard IoT non mentionné | `infra/grafana/dashboards/iot-pipeline.json` |

### 1.2 Nouvelles variables d'environnement (18 variables)
| # | Variable | Service | Valeur par défaut |
|---|----------|---------|-------------------|
| A10 | `ENABLE_KAFKA_CONSUMER` | ml-inference-service | "true" |
| A11 | `KAFKA_INPUT_TOPIC` | ml-inference-service, spark-jobs | "processed-sensor-data" |
| A12 | `KAFKA_OUTPUT_TOPIC` | spark-jobs | "processed-sensor-data" |
| A13 | `KAFKA_GROUP_ID` | ml-inference-service | "ml-inference-group" |
| A14 | `KAFKA_AUTO_OFFSET_RESET` | ml-inference-service | "latest" |
| A15 | `ENVIRONMENT` | ml-inference-service | "development" |
| A16 | `LOG_LEVEL` | ml-inference-service | "INFO" |
| A17 | `CLASSIFICATION_THRESHOLD` | ml-inference-service | "0.35" |
| A18 | `MONGO_DB` | ml-inference-service | "alkatra_iot" |
| A19 | `MONGO_RECO_COLLECTION` | ml-inference-service | "irrigation_recommendations" |
| A20 | `SPARK_DRY_RUN` | spark-jobs | "0" |
| A21 | `MQTT_HOST` | simulate-sensor.js | "localhost" |
| A22 | `MQTT_PORT` | simulate-sensor.js | "1883" |
| A23 | `FARM_ID` | simulate-sensor.js | "farm_test_001" |
| A24 | `PARCEL_ID` | simulate-sensor.js | "parcel_test_001" |
| A25 | `DEVICE_ID` | simulate-sensor.js | "esp32-sim-001" |
| A26 | `KAFKA_STARTING_OFFSETS` | spark-jobs | "latest" |
| A27 | `KAFKA_FAIL_ON_DATA_LOSS` | spark-jobs | "false" |

---

## 2. SUPPRESSIONS

| # | Élément | Raison |
|---|---------|--------|
| D1 | **Section "Notebook Jupyter"** (`docs/model IA.ipynb`) | Le fichier n'existe pas dans le dépôt |
| D2 | **Section "Dataset d'entraînement"** (`dataset_irrigation_FINAL.csv`) | Le fichier n'existe pas dans le dépôt |
| D3 | **Référence à CODEOWNERS** | Le fichier n'existe pas dans `.github/` |
| D4 | **Référence à PULL_REQUEST_TEMPLATE.md** | Le fichier n'existe pas dans `.github/` |
| D5 | **Affirmation "14 services Docker"** | Corrigé en 15 services |
| D6 | **Affirmation "spark-jobs squelette vide"** | Remplacé par description du code existant |
| D7 | **Affirmation "Mosquitto port 9001"** | Remplacé par 9010 |
| D8 | **Référence à farm.types.ts** | Le fichier n'existe pas dans shared-types |

---

## 3. CORRECTIONS

| # | Ancienne valeur | Nouvelle valeur | Preuve |
|---|----------------|-----------------|--------|
| C1 | "14 services Docker" | "15 services Docker" | docker-compose.yml |
| C2 | "spark-jobs squelette vide" | "spark-jobs avec 3 jobs Python fonctionnels" | Fichiers dans apps/spark-jobs/jobs/ |
| C3 | "Mosquitto port 9001" | "Mosquitto port 9010" | docker-compose.yml ligne 204 |
| C4 | "3 workflows GitHub Actions" | "4 workflows GitHub Actions" | 4 fichiers dans .github/workflows/ |
| C5 | "Dockerfile 3 stages" | "Dockerfile target development unique" | Dockerfile iot-service |
| C6 | "Documentation mentionne 2 test files pour iot" | "3 test files (incluant sensor-data.consumer.spec.ts)" | kafka-consumer/ |

---

## 4. RÉORGANISATIONS

| # | Section actuelle | Nouvelle organisation | Raison |
|---|-----------------|----------------------|--------|
| R1 | Section 5.1 "Origine du modèle" | Supprimer la mention du notebook manquant, garder uniquement le descriptif ML | Le fichier n'existe pas |
| R2 | Section 6.4 "spark-jobs" | Remplacer entièrement avec le contenu réel des 3 jobs | Code fonctionnel existant |
| R3 | Section 7.1 "Services Docker" | Ajouter spark-job et mettre à jour le compte à 15 | Exactitude |
| R4 | Section 9 "MongoDB" | Ajouter collection `et0` | Schéma existant |
| R5 | Section 13 "CI/CD" | Ajouter ci-spark.yml, retirer CODEOWNERS/PR_TEMPLATE | Correspondre à la réalité |
| R6 | Section 14 "Scripts" | Ajouter les 4 scripts manquants | Scripts existants |
| R7 | Section 16.4 "Variables d'environnement" | Ajouter les 18 variables oubliées | Utilisation réelle |
| R8 | Section 18 "Références techniques" | Mettre à jour ports et fichiers de référence | Exactitude |

---

## 5. IMPACT SUR LA STRUCTURE DU DOCUMENT

### Nouvelle table des matières proposée
1. Vue d'ensemble du projet
2. Structure du monorepo
3. Architecture technique
4. Pipeline IoT complet
5. Pipeline ML / IA
6. Services détaillés
   - 6.1 iot-service
   - 6.2 ml-inference-service
   - 6.3 auth-service
   - 6.4 **spark-jobs (MISE À JOUR MAJEURE)**
7. Infrastructure Docker **(15 services)**
8. Base de données PostgreSQL
9. **MongoDB (2 collections)**
10. Modèle de données partagées
11. Monitoring et Observabilité
12. Tests
13. **CI/CD (4 workflows)**
14. Scripts utiles **(11 commandes)**
15. **Variables d'environnement (liste exhaustive)**
16. Règles de développement
17. Guide de démarrage rapide
18. Références techniques
19. Annexes

---

## 6. STATISTIQUES DE MODIFICATION

| Type | Nombre |
|------|--------|
| Ajouts | 27 |
| Suppressions | 8 |
| Corrections | 6 |
| Réorganisations | 8 |
| **Total** | **49 modifications** |

---

## 7. FICHIERS CONCERNÉS

| Fichier | Type de modification |
|---------|---------------------|
| `docs/AL-KATRA-SKILL-v1.0.md` | RÉÉCRITURE COMPLÈTE → v2.0.0 |
| `apps/spark-jobs/requirements.txt` | 🔴 CORRECTION MERGE CONFLICT (hors doc) |