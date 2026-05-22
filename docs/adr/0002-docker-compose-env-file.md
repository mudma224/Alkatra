# ADR 0002 - Utilisation explicite du fichier .env avec Docker Compose

## Statut

Accepte.

## Contexte

Docker Compose peut charger un fichier `.env`, mais son comportement depend du dossier courant et de la commande utilisee.

Dans ce projet, la commande:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

peut ne pas utiliser le `.env` racine attendu. Compose retombe alors sur les valeurs par defaut du `docker-compose.yml`, par exemple:

```text
POSTGRES_USER=alkatra_user
POSTGRES_PASSWORD=alkatra_password
```

Cela a provoque une incoherence avec un volume Postgres deja initialise avec un autre utilisateur.

## Decision

Tous les scripts Docker racine utilisent explicitement:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ...
```

Scripts concernes:

- `docker:up`
- `docker:down`
- `docker:logs`
- `docker:reset`

## Consequences

Avantages:

- variables runtime previsibles;
- moins de surprises entre PowerShell, Git Bash et CI;
- MLflow, Postgres, Grafana et Keycloak utilisent les memes valeurs.

Point d'attention:

- `.env` doit exister avant de lancer la stack;
- `.env` ne doit pas etre committe.

## References

- `package.json`
- `infra/docker/docker-compose.yml`
- `.env.example`
