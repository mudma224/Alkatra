import { registerAs } from '@nestjs/config';

export interface SensorActivityConfig {
  /** Silence (heures, décimales acceptées : 0.05 = 3 min) au-delà duquel un capteur actif passe « inactive » (notification légère). */
  inactiveHours: number;
  /** Silence (heures, décimales acceptées) au-delà duquel un capteur inactive est escaladé « failing » (alerte critique). */
  failingHours: number;
  /** Cadence du cycle de santé (minutes, entier ≥ 1). */
  checkIntervalMinutes: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  authServiceUrl: string;
  alertServiceUrl: string;
  internalToken: string;
  lowBatteryThresholdPct: number;
  sensorActivity: SensorActivityConfig;
  jwtSecret: string;
  corsOrigins: string[];
}

export default registerAs('app', (): AppConfig => {
  const dbUrl = process.env.DATABASE_URL || '';

  let dbHost = 'postgres';
  let dbPort = 5432;
  let dbUser = 'farm_user';
  let dbPass = 'farm_dev_pass';
  let dbName = 'farm_db';

  if (dbUrl) {
    try {
      const urlObj = new URL(dbUrl);
      dbHost = urlObj.hostname || dbHost;
      dbPort = parseInt(urlObj.port || '5432', 10);
      dbUser = urlObj.username || dbUser;
      dbPass = urlObj.password || dbPass;
      dbName = urlObj.pathname.replace(/^\//, '') || dbName;
    } catch {
      // Garder les valeurs par défaut
    }
  }

  // parseFloat : autorise les valeurs fractionnaires pour tester vite
  // (ex. 0.05 h = 3 minutes) — l'unité reste l'heure.
  const sensorActivity: SensorActivityConfig = {
    inactiveHours: parseFloat(process.env.SENSOR_INACTIVE_HOURS || '2'),
    failingHours: parseFloat(process.env.SENSOR_FAILING_HOURS || '24'),
    checkIntervalMinutes: parseInt(
      process.env.SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES || '15',
      10,
    ),
  };

  // Fail fast : des seuils incohérents produiraient des transitions absurdes
  // (failing avant inactive) — le service refuse de démarrer.
  if (sensorActivity.inactiveHours >= sensorActivity.failingHours) {
    throw new Error(
      `Configuration capteurs invalide : SENSOR_INACTIVE_HOURS (${sensorActivity.inactiveHours}) doit être strictement inférieur à SENSOR_FAILING_HOURS (${sensorActivity.failingHours}).`,
    );
  }
  if (sensorActivity.checkIntervalMinutes < 1) {
    throw new Error(
      'Configuration capteurs invalide : SENSOR_ACTIVITY_CHECK_INTERVAL_MINUTES doit être ≥ 1.',
    );
  }

  return {
    port: parseInt(process.env.PORT || '3003', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
      host: process.env.POSTGRES_HOST || dbHost,
      port: parseInt(process.env.POSTGRES_PORT || String(dbPort), 10),
      username: process.env.FARM_DB_USER || dbUser,
      password: process.env.FARM_DB_PASSWORD || dbPass,
      name: process.env.FARM_DB_NAME || dbName,
    },
    authServiceUrl:
      process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    alertServiceUrl:
      process.env.ALERT_SERVICE_URL || 'http://alert-service:3006',
    // Partagé avec les autres services internes (header X-Internal-Token).
    // Vide en dev : l'isolation réseau Docker suffit (cf. InternalTokenGuard).
    internalToken: process.env.INTERNAL_TOKEN || '',
    lowBatteryThresholdPct: parseInt(process.env.LOW_BATTERY_THRESHOLD || '20', 10),
    sensorActivity,
    jwtSecret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  };
});