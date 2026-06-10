FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir mlflow==2.13.0 psycopg2-binary==2.9.9
COPY start.sh /start.sh
RUN chmod +x /start.sh
EXPOSE 5000
ENTRYPOINT ["/start.sh"]