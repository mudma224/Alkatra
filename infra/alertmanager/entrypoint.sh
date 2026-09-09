#!/bin/sh
# Rend le template alertmanager.yml avec sed (busybox natif de l'image de
# base — pas de dépendance binaire externe), puis exécute la commande.
# Même convention que infra/nginx/entrypoint.sh (ADR-0002).
set -e

TEMPLATE=/etc/alertmanager/alertmanager.yml.template
OUTPUT=/etc/alertmanager/alertmanager.yml

REQUIRED_VARS="ALERT_SMTP_HOST ALERT_SMTP_PORT ALERT_EMAIL_FROM ALERT_EMAIL_TO"

for var in $REQUIRED_VARS; do
  if [ -z "$(eval "echo \$$var")" ]; then
    echo "[ALERTMANAGER] ERREUR : variable $var manquante" >&2
    exit 1
  fi
done

sed -e "s|\${ALERT_SMTP_HOST}|${ALERT_SMTP_HOST}|g" \
    -e "s|\${ALERT_SMTP_PORT}|${ALERT_SMTP_PORT}|g" \
    -e "s|\${ALERT_EMAIL_FROM}|${ALERT_EMAIL_FROM}|g" \
    -e "s|\${ALERT_EMAIL_TO}|${ALERT_EMAIL_TO}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "[ALERTMANAGER] Configuration rendue : SMTP=${ALERT_SMTP_HOST}:${ALERT_SMTP_PORT} → ${ALERT_EMAIL_TO}"

exec "$@"
