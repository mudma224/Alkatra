# ADR-003 — Stratégie de synchronisation double-write MongoDB → PostgreSQL (recommendation_db)

## Statut
Accepté — Sprint 3, Phase 1 (révisé août 2026 pour tenir compte de l'architecture multi-bases PostgreSQL)

## Contexte

Le pipeline ML (`ml-inference-service`, Phase 0, inchangé) écrit ses recommandations
d'irrigation dans MongoDB, collection `irrigation_recommendations`. C'est la source de
vérité historique du Machine Learning.

Le produit (frontend, API) a besoin d'une source relationnelle, requêtable efficacement
par parcelle et par date, avec des garanties de cohérence transactionnelle simples.
PostgreSQL est retenu comme source principale côté produit.

Depuis la migration vers une architecture PostgreSQL multi-bases (une base + un
utilisateur dédié par microservice), `recommendation-service` possède sa propre base
`recommendation_db`, isolée de `farm_db` (parcelles/fermes) et de `auth_db`
(utilisateurs). Cette isolation a une conséquence directe sur ce Sprint 3 :
**aucune foreign key n'est possible entre bases PostgreSQL distinctes.**

## Décision

### 1. Bus de synchronisation : Kafka

Le topic Kafka `recommendations-generated` (créé en Phase 0, réservé) est utilisé comme
bus de synchronisation :

### 2. Cohérence via `mongo_id` + `synced` + scheduler de retry

- Chaque enregistrement PostgreSQL conserve `mongo_id` (traçabilité vers le document
  MongoDB d'origine).
- Un flag booléen `synced` marque la synchronisation complète.
- Un scheduler tourne toutes les 5 minutes et retente les enregistrements
  `synced = false`.
- En cas de divergence, MongoDB reste la source de vérité historique ML ;
  `recommendation_db` (PostgreSQL) est la source de vérité produit.

### 3. Absence de foreign key — conséquence de l'architecture multi-bases

`recommendation_db.recommendations.parcel_id` **ne référence pas** `farm_db.parcels.id`
par contrainte SQL : les deux tables vivent dans des bases PostgreSQL physiquement
différentes, avec des utilisateurs distincts (`recommendation_user` n'a aucun droit sur
`farm_db`). L'intégrité référentielle est donc gérée applicativement, pas par le SGBD.

### 4. Vérification d'ownership : appel HTTP, pas de jointure SQL

Le plan initial de Sprint 3 prévoyait une vérification d'ownership « via
parcel → farm → user_id ». Avec l'architecture multi-bases, cette chaîne ne peut plus
être résolue par une requête SQL unique. `recommendation-service` doit donc appeler
`farm-service` en HTTP pour vérifier qu'une parcelle donnée appartient bien à
l'utilisateur du JWT, avant de retourner une recommandation:

GET http://farm-service:3003/api/v1/parcels/:parcelId Authorization: Bearer <JWT transmis ou re-signé service-à-service>


Ce schéma est cohérent avec le précédent déjà en place : `farm-service` vérifie de la
même façon l'existence d'un utilisateur auprès de `auth-service`
(`GET /internal/user/:userId`, cf. doc factuelle farm-service §8).

## Conséquences

**Positives :**
- Isolation forte entre bases : une panne ou une erreur de migration sur
  `recommendation_db` ne peut pas corrompre `farm_db` ou `auth_db`.
- Chaque service ne peut agir que sur ses propres données (moindre privilège au niveau
  PostgreSQL, via les utilisateurs dédiés).
- MongoDB reste la source de vérité ML, non impactée par cette synchronisation.

**Négatives / compromis assumés :**
- Latence additionnelle : chaque lecture de recommandation implique un appel HTTP
  supplémentaire vers `farm-service` pour l'ownership check (pas de round-trip unique
  en base).
- Cohérence éventuelle (« eventual consistency ») entre MongoDB et PostgreSQL — le flag
  `synced` peut rester `false` jusqu'à 5 minutes en cas d'échec transitoire.
- Pas de contrainte d'intégrité déclarative (FK) sur `parcel_id` : un bug applicatif
  peut introduire des `parcel_id` orphelins, non détectés par PostgreSQL. Une tâche de
  nettoyage périodique (hors périmètre Sprint 3) devra être envisagée en Phase 2.
- Observabilité additionnelle nécessaire : Dev2 doit exposer `/metrics` sur
  `recommendation-service` pour que le scrape Prometheus ajouté en Sprint 3 remonte des
  données exploitables (cf. section 7 de ce guide).

## Alternatives envisagées

| Alternative | Raison du rejet |
|---|---|
| Foreign key cross-base | Non supporté par PostgreSQL (bases physiquement distinctes) |
| Base unique partagée (`alkatra_db`) pour tous les services | Rejetée par la migration multi-bases (isolation, moindre privilège, blast radius réduit) |
| Lecture directe de MongoDB par le frontend | Rejetée dès la Décision #4 de la Phase 1 (double-write validé par l'équipe) |
| `recommendation-service` interroge directement `farm_db` en lecture seule (cross-db read) | Rejetée : viole le principe « un microservice = une base », recrée un couplage fort que la migration cherchait justement à supprimer |

Ce schéma est cohérent avec le précédent déjà en place : `farm-service` vérifie de la
même façon l'existence d'un utilisateur auprès de `auth-service`
(`GET /internal/user/:userId`, cf. doc factuelle farm-service §8).

## Conséquences

**Positives :**
- Isolation forte entre bases : une panne ou une erreur de migration sur
  `recommendation_db` ne peut pas corrompre `farm_db` ou `auth_db`.
- Chaque service ne peut agir que sur ses propres données (moindre privilège au niveau
  PostgreSQL, via les utilisateurs dédiés).
- MongoDB reste la source de vérité ML, non impactée par cette synchronisation.

**Négatives / compromis assumés :**
- Latence additionnelle : chaque lecture de recommandation implique un appel HTTP
  supplémentaire vers `farm-service` pour l'ownership check (pas de round-trip unique
  en base).
- Cohérence éventuelle (« eventual consistency ») entre MongoDB et PostgreSQL — le flag
  `synced` peut rester `false` jusqu'à 5 minutes en cas d'échec transitoire.
- Pas de contrainte d'intégrité déclarative (FK) sur `parcel_id` : un bug applicatif
  peut introduire des `parcel_id` orphelins, non détectés par PostgreSQL. Une tâche de
  nettoyage périodique (hors périmètre Sprint 3) devra être envisagée en Phase 2.
- Observabilité additionnelle nécessaire : Dev2 doit exposer `/metrics` sur
  `recommendation-service` pour que le scrape Prometheus ajouté en Sprint 3 remonte des
  données exploitables (cf. section 7 de ce guide).

## Alternatives envisagées

| Alternative | Raison du rejet |
|---|---|
| Foreign key cross-base | Non supporté par PostgreSQL (bases physiquement distinctes) |
| Base unique partagée (`alkatra_db`) pour tous les services | Rejetée par la migration multi-bases (isolation, moindre privilège, blast radius réduit) |
| Lecture directe de MongoDB par le frontend | Rejetée dès la Décision #4 de la Phase 1 (double-write validé par l'équipe) |
| `recommendation-service` interroge directement `farm_db` en lecture seule (cross-db read) | Rejetée : viole le principe « un microservice = une base », recrée un couplage fort que la migration cherchait justement à supprimer |