# ADR-003 — Gestion des messages Kafka malformes dans iot-service

**Date** : S3 — Phase 0
**Statut** : Accepte
**Decideurs** : Dev1, Dev2

## Contexte

Le consumer Kafka de l'iot-service peut recevoir des messages malformes (JSON invalide,
champs manquants, valeurs hors plage). Trois options pour gerer ces cas :

## Options evaluees

| Option | Comportement | Implication |
|---|---|---|
| Retry infini | Rejouer le message | Le consumer bloque sur le message — pipeline arrete |
| Dead Letter Queue (DLQ) | Publier dans un topic d'erreur | Necessite un consumer supplementaire, complexite en Phase 0 |
| Log and skip (retenu) | Logger l'erreur et continuer | Perte du message malformes, pipeline non bloque |

## Decision

**Log and skip** est retenu pour la Phase 0 et la Phase 1 (beta).

Raisons :
1. En beta-test, les messages malformes sont rares et indiquent un bug firmware corrigeable
2. Un pipeline bloque est pire qu'un message perdu — l'agriculteur ne recoit plus aucune recommandation
3. Une DLQ sera ajoutee en Phase 5 (Scale) quand le volume de capteurs justifiera la complexite

## Consequences

- Les messages malformes sont loggues dans Grafana/Loki avec le payload complet
- Un compteur Prometheus `iot_malformed_messages_total` sera ajoute en S4
- La DLQ sera reevaluee avant le lancement a 100 fermes (M10)