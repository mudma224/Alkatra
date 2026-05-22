# ADR 0003 - Provisioning Grafana par fichiers

## Statut

Accepte.

## Contexte

Grafana doit afficher automatiquement les dashboards du projet sans import manuel dans l'interface.

Le dashboard IoT existe dans:

```text
infra/grafana/dashboards/iot-pipeline.json
```

Un probleme precedent venait du fait que le dossier `infra/grafana/dashboards` n'etait pas monte dans le conteneur Grafana.

## Decision

Deux dossiers sont montes:

```text
infra/grafana/provisioning -> /etc/grafana/provisioning
infra/grafana/dashboards -> /var/lib/grafana/dashboards
```

Le provider dashboard pointe vers:

```yaml
options:
  path: /var/lib/grafana/dashboards
```

Les dashboards reference la datasource par nom:

```json
"datasource": "Prometheus"
```

et non par UID force.

## Consequences

Avantages:

- dashboards versionnes dans Git;
- restauration facile apres reset Grafana;
- pas d'import manuel.

Point d'attention:

- apres modification du provisioning, recreer Grafana;
- si le volume Grafana contient deja une datasource, eviter les UID imposes qui peuvent entrer en conflit.

## References

- `infra/grafana/provisioning/dashboards/dashboards.yml`
- `infra/grafana/provisioning/datasources/datasources.yml`
- `infra/grafana/dashboards/iot-pipeline.json`
- `infra/docker/docker-compose.yml`
