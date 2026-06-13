#!/bin/sh
set -e
# Ensure checkpoint dir is writable by the spark user if possible
chown -R 1001:0 /tmp/spark-checkpoint || true
# Execute passed command
exec "$@"
