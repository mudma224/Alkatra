export default () => ({
  port: parseInt(process.env.AUTH_SERVICE_PORT ?? '3001', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiration: parseInt(process.env.JWT_ACCESS_EXPIRATION ?? '3600', 10),
    refreshExpiration: parseInt(process.env.JWT_REFRESH_EXPIRATION ?? '2592000', 10),
  },
  infobip: {
    apiKey: process.env.INFOBIP_API_KEY,
    baseUrl: process.env.INFOBIP_BASE_URL ?? 'https://api.infobip.com',
    sender: process.env.INFOBIP_SENDER ?? 'AlKatra',
  },
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM ?? 'alkatra',
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'alkatra-web',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '3', 10),
    blockDurationSeconds: parseInt(process.env.OTP_BLOCK_DURATION_SECONDS ?? '1800', 10),
  },
});