# ADR-0005 — Alerting d'infrastructure : Prometheus + Alertmanager, notifications email

- **Statut** : Accepté
- **Date** : 2026-08-23
- **Contexte** : Reconstruction de la stack d'observabilité (`design_prometheus.md`)

## Contexte

La plateforme n'avait aucun alerting d'infrastructure : pas de `rule_files`
Prometheus, pas d'Alertmanager, pas de contact points Grafana, aucun canal de
notification. MailHog (SMTP de dev) tournait dans la stack sans être utilisé.
Par ailleurs, les métriques des services reposaient sur trois patterns
hétérogènes (prom-client avec métriques mortes, format texte maison, rien du
tout pour farm-service et spark-jobs), et deux bugs rendaient des cibles
Prometheus muettes (`/metrics` de user-service masqué par le prefix global,
farm-service scrapé sans endpoint).

## Décision

1. **Moteur d'alerting** : règles Prometheus (`infra/prometheus/rules/`,
   versionnées en code) + conteneur **Alertmanager** pour le routage. Grafana
   reste la visualisation, pas le moteur d'alerte.
2. **Notifications** : email via MailHog en dev — configuration SMTP réelle
   (`smtp_config`), transposable en production en changeant
   `ALERT_SMTP_HOST/PORT` et en activant `require_tls`.
3. **Standardisation du socle métriques NestJS** : package partagé
   `@alkatra/observability` (registre prom-client + `/metrics` à la racine +
   intercepteur HTTP global + helpers Kafka + métriques par défaut Node).
   Les noms de métriques historiques (`alkatra_iot_*`, `ml_*`, les 12 métriques
   d'alert-service…) sont conservés à l'identique : la migration change
   l'implémentation, pas le contrat observable.
4. **Lag Kafka** : supervisé uniquement par kafka-exporter (offsets broker =
   source de vérité), pas d'instrumentation applicative.
5. **Composants d'observabilité toujours démarrés** (pas de profil compose) :
   en production, la supervision ne s'arrête pas.
6. **Alerte `Watchdog` toujours firing** : vérifie en permanence la chaîne
   Prometheus → Alertmanager → SMTP.

## Options écartées

- **Grafana Unified Alerting** : pas de conteneur supplémentaire et UI de test
  intégrée, mais couplage au cycle de vie de Grafana (un reset du volume
  `grafana_data` perdrait l'alerting) et règles-as-code plus verbeuses.
- **Instrumenter le lag Kafka dans chaque consumer** : quatre implémentations
  à maintenir pour une donnée déjà disponible côté broker.
- **Email vers un SMTP externe dès le dev** : dépendance réseau inutile ;
  MailHog offre la même sémantique de configuration.

## Conséquences

- Deux conteneurs de plus dans la stack de base (Alertmanager build local avec
  template envsubst — même convention que la gateway Nginx, cf. ADR-0002 — et
  PushGateway pour spark-jobs), plus les exporters et Loki/Promtail.
- `GRAFANA_PASSWORD` devient obligatoire (fail-fast compose) — plus de mot de
  passe par défaut en dur ; l'ancien mot de passe doit être considéré comme
  compromis (présent dans l'historique git) et roté côté exploitant.
- L'ajout d'un service NestJS conforme à la convention de nommage est couvert
  automatiquement par les recording rules (regex `{__name__=~".+_http_*"}`),
  le dashboard générique « Services HTTP » et les alertes de latence/erreurs.
- Les probes blackbox des services métier (`blackbox-phase1`) ne déclenchent
  **pas** d'alerte par défaut : ils dépendent du profil compose `phase1` et
  produiraient des fausses alertes quand la stack de base tourne seule.
- La CI (`ci-observability.yml`) valide promtool, amtool (template rendu) et
  les conventions des dashboards.

## Références

- Design complet : `design_prometheus.md` (racine du dépôt)
- Guide opérationnel : `docs/guides/observability.md`
- ADR-0003 (provisioning Grafana, datasource par nom) — maintenu
