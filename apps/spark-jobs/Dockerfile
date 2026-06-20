FROM apache/spark:3.5.1

USER root
WORKDIR /app

# Dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Python (runtime minimal — PySpark est fourni par l'image de base)
RUN pip install --no-cache-dir redis==5.3.1

# Code des jobs
COPY jobs/ ./jobs/
COPY tests/ ./tests/

# Vendor Kafka connector jars (scala 2.12 = binaire de l'image Spark 3.5.1)
# pour éviter toute résolution Ivy/runtime au démarrage du conteneur.
# --retry-connrefused / --tries pour fiabiliser le build hors-ligne instable.
RUN mkdir -p /opt/spark/jars && \
    for url in \
      "https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.12/3.5.1/spark-sql-kafka-0-10_2.12-3.5.1.jar" \
      "https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.12/3.5.1/spark-token-provider-kafka-0-10_2.12-3.5.1.jar" \
      "https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/3.4.1/kafka-clients-3.4.1.jar" \
      "https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/2.11.1/commons-pool2-2.11.1.jar" ; do \
        wget -q --tries=3 --retry-connrefused --timeout=30 "$url" -P /opt/spark/jars/ ; \
    done && \
    chown -R 1001:0 /opt/spark/jars && chmod -R g+rw /opt/spark/jars


ENV HOME=/tmp
ENV _JAVA_OPTIONS="-Duser.home=/tmp -Duser.name=spark"
ENV HADOOP_USER_NAME=spark
ENV USER=spark
ENV LOGNAME=spark

# Ensure Ivy cache location exists and is writable by the non-root spark user
RUN mkdir -p /tmp/.ivy2/cache /tmp/.ivy2/jars && \
    chown -R 1001:0 /tmp/.ivy2 /tmp && chmod -R g+rw /tmp/.ivy2 /tmp

# PRE-CREATE checkpoint directory with correct permissions (tolerant aux pannes)
# —— Peut être overridé via CHECKPOINT_OWNER_UID, CHECKPOINT_OWNER_GID, CHECKPOINT_PERMISSIONS
# —— à travers le docker-compose ou docker run -e
RUN mkdir -p /tmp/spark-checkpoint && \
    chown -R 1001:0 /tmp/spark-checkpoint && \
    chmod -R 775 /tmp/spark-checkpoint && \
    echo "✓ Checkpoint directory pre-created: /tmp/spark-checkpoint (UID 1001:0, perms 775)"

# Ensure a passwd entry exists for UID 1001 so UnixPrincipal can resolve a name
RUN echo 'spark:x:1001:0:spark user:/tmp:/bin/sh' >> /etc/passwd || true

# Copy entrypoint that will attempt to fix volume permissions at container start
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER 1001
WORKDIR /app

# Use absolute spark-submit and avoid --packages (we vendor jars above)
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/opt/spark/bin/spark-submit", \
    "--master", "local[2]", \
    "--conf", "spark.driver.memory=1g", \
    "--conf", "spark.executor.memory=1g", \
    "--conf", "spark.sql.streaming.checkpointLocation=/tmp/spark-checkpoint", \
    "--conf", "spark.hadoop.hadoop.security.authentication=simple", \
    "--conf", "spark.driver.extraJavaOptions=-Duser.name=spark -Duser.home=/tmp", \
    "--conf", "spark.executor.extraJavaOptions=-Duser.name=spark -Duser.home=/tmp", \
    "jobs/sensor_stream_processor.py"]
