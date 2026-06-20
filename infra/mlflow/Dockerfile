FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir \
    mlflow==2.13.0 \
    psycopg2-binary==2.9.9 \
    boto3==1.26.137 \
    s3fs==2023.6.0
COPY start.sh /start.sh
RUN chmod +x /start.sh
EXPOSE 5001
ENTRYPOINT ["/start.sh"]
