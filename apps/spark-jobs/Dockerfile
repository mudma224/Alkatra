FROM bitnami/spark:3.5

USER root
WORKDIR /app

# Python deps
RUN pip install --no-cache-dir \
    kafka-python==2.0.2 \
    httpx==0.27.0 \
    pyspark==3.5.1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY jobs/ ./jobs/

USER 1001
WORKDIR /app/jobs

CMD ["spark-submit", \
     "--master", "local[2]", \
     "--packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1", \
     "--conf", "spark.driver.memory=1g", \
     "--conf", "spark.executor.memory=1g", \
     "sensor_stream_processor.py"]