#!/bin/sh
# =============================================================================
# Al Katra Bel Qatra — NGINX Gateway Entrypoint
# =============================================================================
# Valide les variables d'environnement requises, génère nginx.conf depuis
# le template via envsubst, puis démarre nginx.
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Validation des variables requises (fail fast)
# -----------------------------------------------------------------------------
REQUIRED_VARS="AUTH_SERVICE_HOST AUTH_SERVICE_PORT USER_SERVICE_HOST USER_SERVICE_PORT FARM_SERVICE_HOST FARM_SERVICE_PORT RECOMMENDATION_SERVICE_HOST RECOMMENDATION_SERVICE_PORT"

for VAR in $REQUIRED_VARS; do
    eval VALUE=\$$VAR
    if [ -z "$VALUE" ]; then
        echo "[ERROR] Variable d'environnement manquante : $VAR"
        echo "[ERROR] Le gateway ne peut pas démarrer sans cette variable."
        exit 1
    fi
done

echo "[INFO] Variables d'environnement validées :"
echo "       AUTH_SERVICE_HOST=${AUTH_SERVICE_HOST}"
echo "       AUTH_SERVICE_PORT=${AUTH_SERVICE_PORT}"
echo "       USER_SERVICE_HOST=${USER_SERVICE_HOST}"
echo "       USER_SERVICE_PORT=${USER_SERVICE_PORT}"
echo "       FARM_SERVICE_HOST=${FARM_SERVICE_HOST}"
echo "       FARM_SERVICE_PORT=${FARM_SERVICE_PORT}"
echo "       RECOMMENDATION_SERVICE_HOST=${RECOMMENDATION_SERVICE_HOST}"
echo "       RECOMMENDATION_SERVICE_PORT=${RECOMMENDATION_SERVICE_PORT}"
# -----------------------------------------------------------------------------
# Génération de nginx.conf depuis le template
# -----------------------------------------------------------------------------
TEMPLATE_PATH="/etc/nginx/nginx.conf.template"
OUTPUT_PATH="/etc/nginx/nginx.conf"

echo "[INFO] Génération de la configuration nginx depuis le template..."

envsubst '${AUTH_SERVICE_HOST} ${AUTH_SERVICE_PORT} ${USER_SERVICE_HOST} ${USER_SERVICE_PORT} ${FARM_SERVICE_HOST} ${FARM_SERVICE_PORT} ${RECOMMENDATION_SERVICE_HOST} ${RECOMMENDATION_SERVICE_PORT}' \
    < "$TEMPLATE_PATH" \
    > "$OUTPUT_PATH"

echo "[INFO] Configuration générée : $OUTPUT_PATH"

# -----------------------------------------------------------------------------
# Validation de la config nginx avant démarrage
# -----------------------------------------------------------------------------
echo "[INFO] Validation de la configuration nginx..."
nginx -t

echo "[INFO] Configuration nginx valide. Démarrage du gateway..."

# -----------------------------------------------------------------------------
# Démarrage de nginx (foreground pour Docker)
# -----------------------------------------------------------------------------
exec nginx -g 'daemon off;'