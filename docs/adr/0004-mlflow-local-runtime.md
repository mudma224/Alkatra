# ADR 0004 - Runtime local MLflow

## Statut

Accepte.

## Contexte

MLflow est necessaire pour les prochaines etapes IA:

- tracking d'experiences;
- registry de modeles;
- stockage des metadonnees de runs.

L'image utilisee est construite depuis:

```text
infra/mlflow/Dockerfile
```

Elle est basee sur `python:3.11-slim`.

Deux problemes ont ete rencontres:

- `start.sh` en fins de ligne Windows `CRLF`, ce qui casse `/bin/sh`;
- healthcheck Docker utilisant `curl`, absent de l'image slim.

## Decision

Le script `infra/mlflow/start.sh` est force en LF via `.gitattributes`:

```text
*.sh text eol=lf
```

Le healthcheck utilise Python:

```yaml
python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=5)"
```

MLflow utilise Postgres comme backend store:

```text
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

## Consequences

Avantages:

- MLflow reste stable sur Windows + Docker Desktop;
- pas besoin d'installer `curl`;
- variables Postgres partagees avec la stack via `.env`.

Point d'attention:

- ne pas convertir les `.sh` en CRLF;
- si le volume Postgres a ete initialise avec d'autres credentials, il faut aligner `.env` ou reset/migrer.

## References

- `infra/mlflow/start.sh`
- `infra/mlflow/Dockerfile`
- `infra/docker/docker-compose.yml`
- `.gitattributes`
