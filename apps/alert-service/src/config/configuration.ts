import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3006', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(','),

  database: {
    url: process.env.DATABASE_URL,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'CHANGE_ME_JWT_SECRET_32_CHARS',
  },

  // Token inter-services partagé (header X-Internal-Token). Vide en dev :
  // l'isolation réseau Docker suffit (même contrat que farm-service).
  internalToken: process.env.INTERNAL_TOKEN ?? '',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'alert-service',
    groupId: process.env.KAFKA_GROUP_ID ?? 'alert-service-group',
    topicRecommendations:
      process.env.KAFKA_RECOMMENDATIONS_TOPIC ?? 'recommendations-generated',
    topicDlq: process.env.KAFKA_TOPIC_DLQ ?? 'alerts-dlq',
    topicOutbound: process.env.KAFKA_OUTBOUND_TOPIC ?? 'alerts-outbound',
    consumerEnabled: (process.env.KAFKA_CONSUMER_ENABLED ?? 'true').toLowerCase() === 'true',
  },

  farmService: {
    url: process.env.FARM_SERVICE_URL ?? 'http://localhost:3003',
    timeoutMs: parseInt(process.env.FARM_SERVICE_TIMEOUT_MS ?? '5000', 10),
  },

  // Politique de seuil d'alerte stress hydrique — décision de notification,
  // pas de ML : le modèle produit la probabilité, le service décide d'alerter.
  hydricStress: {
    probabilityThreshold: parseFloat(
      process.env.HYDRIC_STRESS_PROBABILITY_THRESHOLD ?? '0.75',
    ),
    soilHumidityMaxPct: parseFloat(
      process.env.HYDRIC_STRESS_SOIL_HUMIDITY_MAX_PCT ?? '25',
    ),
  },

  // Dédup fenêtre glissante par (user, parcelle, type) en heures.
  dedup: {
    windowHours: parseInt(process.env.DEDUP_WINDOW_HOURS ?? '24', 10),
  },

  // FCM : les trois variables doivent être renseignées pour activer le canal,
  // sinon le service reste en mode in-app uniquement (dégradation gracieuse).
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
}));
