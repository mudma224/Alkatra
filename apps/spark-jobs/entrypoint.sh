#!/bin/sh
# Entrypoint robuste pour Spark job — gère les permissions et l'init du checkpoint
# Tolère les pannes et persiste les checkpoints entre redémarrages

set -e

CHECKPOINT_DIR="${SPARK_CHECKPOINT_DIR:-/tmp/spark-checkpoint}"
CHECKPOINT_OWNER_UID="${CHECKPOINT_OWNER_UID:-1001}"
CHECKPOINT_OWNER_GID="${CHECKPOINT_OWNER_GID:-0}"
CHECKPOINT_PERMISSIONS="${CHECKPOINT_PERMISSIONS:-775}"

echo "[ENTRYPOINT] Initialisation Spark job"
echo "[ENTRYPOINT] Checkpoint directory: $CHECKPOINT_DIR"
echo "[ENTRYPOINT] Owner: UID=$CHECKPOINT_OWNER_UID GID=$CHECKPOINT_OWNER_GID"
echo "[ENTRYPOINT] Permissions: $CHECKPOINT_PERMISSIONS"

# Vérifier si le répertoire existe
if [ -d "$CHECKPOINT_DIR" ]; then
    echo "[ENTRYPOINT] ✓ Checkpoint directory exists — reprendre stream (redémarrage)"
    IS_FIRST_RUN=0
else
    echo "[ENTRYPOINT] ✗ Checkpoint directory NOT found — initialiser (première exécution)"
    IS_FIRST_RUN=1
fi

# Créer le répertoire s'il n'existe pas
if ! mkdir -p "$CHECKPOINT_DIR" 2>/dev/null; then
    echo "[ENTRYPOINT] ⚠ WARNING: mkdir -p $CHECKPOINT_DIR failed"
    echo "[ENTRYPOINT] Tentative avec permissions relaxées..."
    mkdir -p "$CHECKPOINT_DIR" || {
        echo "[ENTRYPOINT] ✗ FATAL: Cannot create $CHECKPOINT_DIR"
        exit 1
    }
fi

# Fixer les permissions (mode fichier + groupe)
if ! chmod "$CHECKPOINT_PERMISSIONS" "$CHECKPOINT_DIR" 2>/dev/null; then
    echo "[ENTRYPOINT] ⚠ WARNING: chmod $CHECKPOINT_PERMISSIONS $CHECKPOINT_DIR failed (non-fatal)"
else
    echo "[ENTRYPOINT] ✓ chmod $CHECKPOINT_PERMISSIONS $CHECKPOINT_DIR OK"
fi

# Fixer l'ownership (peut échouer si root n'est pas disponible)
if ! chown "$CHECKPOINT_OWNER_UID:$CHECKPOINT_OWNER_GID" "$CHECKPOINT_DIR" 2>/dev/null; then
    echo "[ENTRYPOINT] ⚠ WARNING: chown $CHECKPOINT_OWNER_UID:$CHECKPOINT_OWNER_GID $CHECKPOINT_DIR failed (non-fatal)"
else
    echo "[ENTRYPOINT] ✓ chown $CHECKPOINT_OWNER_UID:$CHECKPOINT_OWNER_GID $CHECKPOINT_DIR OK"
fi

# Vérifier que le répertoire est writable
if [ -w "$CHECKPOINT_DIR" ]; then
    echo "[ENTRYPOINT] ✓ $CHECKPOINT_DIR is writable by current user"
else
    echo "[ENTRYPOINT] ⚠ WARNING: $CHECKPOINT_DIR is NOT writable"
    echo "[ENTRYPOINT] LS $CHECKPOINT_DIR:"
    ls -la "$CHECKPOINT_DIR" || true
fi

# Logger l'état du checkpoint
echo "[ENTRYPOINT] Checkpoint status:"
ls -la "$CHECKPOINT_DIR" 2>/dev/null || echo "  (empty or not readable)"

# Passer IS_FIRST_RUN au processus Spark (optionnel — pour des traitements conditionnels futurs)
export SPARK_FIRST_RUN=$IS_FIRST_RUN

echo "[ENTRYPOINT] ✓ Initialization complete — launching Spark job..."
echo "[ENTRYPOINT] Command: $@"

# Exécuter la commande passée (spark-submit)
exec "$@"
