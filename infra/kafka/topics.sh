#!/bin/bash

KAFKA_CONTAINER="alkatra-kafka"
KAFKA_BOOTSTRAP="kafka:9092"

echo "🚀 Waiting for Kafka..."

# On ajoute MSYS_NO_PATHCONV=1 pour empêcher Git Bash de modifier le chemin
until MSYS_NO_PATHCONV=1 docker exec $KAFKA_CONTAINER /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server $KAFKA_BOOTSTRAP; do
  echo "Kafka not ready yet..."
  sleep 5
done

echo "🚀 Creating Kafka topics..."

create_topic() {
  local TOPIC=$1
  local PARTITIONS=$2
  local RETENTION_MS=$3

  MSYS_NO_PATHCONV=1 docker exec $KAFKA_CONTAINER /opt/kafka/bin/kafka-topics.sh \
    --create --if-not-exists \
    --bootstrap-server $KAFKA_BOOTSTRAP \
    --topic "$TOPIC" \
    --partitions $PARTITIONS \
    --replication-factor 1 \
    --config retention.ms=$RETENTION_MS

  echo "  ✅ $TOPIC"
}


create_topic "raw-sensor-data" 6 604800000
create_topic "processed-sensor-data" 6 604800000
create_topic "ml-inference-requests" 3 3600000
create_topic "recommendations-generated" 3 86400000
create_topic "recommendations-generated-dlq" 3 604800000
create_topic "alerts-outbound" 3 86400000
# DLQ dédiée au consumer Kafka de l'alert-service (distincte de
# recommendations-generated-dlq qui appartient au recommendation-service)
create_topic "alerts-dlq" 3 604800000
create_topic "sensor-anomalies" 2 604800000

docker exec $KAFKA_CONTAINER /opt/kafka/bin/kafka-topics.sh \
  --list --bootstrap-server $KAFKA_BOOTSTRAP