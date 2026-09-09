import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3004', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(','),

  database: {
    url: process.env.DATABASE_URL,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'CHANGE_ME_JWT_SECRET_32_CHARS',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'recommendation-service',
    groupId: process.env.KAFKA_GROUP_ID ?? 'recommendation-sync-group',
    topicRecommendations:
      process.env.KAFKA_RECOMMENDATIONS_TOPIC ??
      process.env.KAFKA_TOPIC_RECOMMENDATIONS ??
      'recommendations-generated',
    topicDlq: process.env.KAFKA_TOPIC_DLQ ?? 'recommendations-generated-dlq',
    consumerEnabled: (process.env.KAFKA_CONSUMER_ENABLED ?? 'true').toLowerCase() === 'true',
  },

  farmService: {
    url: process.env.FARM_SERVICE_URL ?? 'http://localhost:3002',
    timeoutMs: parseInt(process.env.FARM_SERVICE_TIMEOUT_MS ?? '5000', 10),
  },
}));