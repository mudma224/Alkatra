import { registerAs } from '@nestjs/config';

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
    jwtSecret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  };
});