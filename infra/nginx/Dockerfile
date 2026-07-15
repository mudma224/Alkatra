# =============================================================================
# Al Katra Bel Qatra — NGINX API Gateway
# =============================================================================
# Build  : docker build -t alkatra-gateway ./infra/nginx
# Run    : via docker-compose (voir infra/docker/docker-compose.yml)
# =============================================================================

FROM nginx:alpine

# gettext fournit envsubst — standard Alpine, aucune dépendance externe
RUN apk add --no-cache gettext

# Supprimer la config nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier le template de configuration
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copier et rendre exécutable le script d'entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Port d'écoute du gateway
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
