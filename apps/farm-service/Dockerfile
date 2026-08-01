# ============================================================
# Stage 1 : deps — Installer les dépendances
# ============================================================
FROM node:20-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /workspace

# Copier les package.json et tsconfig nécessaires
COPY package*.json ./
COPY tsconfig.json ./
COPY apps/farm-service/package*.json ./apps/farm-service/
COPY apps/farm-service/tsconfig.json ./apps/farm-service/

# Installer uniquement les dépendances de farm-service
RUN npm ci --workspace @alkatra/farm-service

# ============================================================
# Stage 2 : builder — Compile le code TypeScript
# ============================================================
FROM deps AS builder
WORKDIR /workspace

# Copier le code source de farm-service uniquement
COPY apps/farm-service ./apps/farm-service

# Build farm-service
RUN npm run build --workspace @alkatra/farm-service \
    && npm prune --omit=dev --workspace @alkatra/farm-service

# ============================================================
# Stage 3 : runner — Exécute le code compilé
# ============================================================
FROM node:20-alpine AS runner

# Utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /workspace
ENV NODE_ENV=production

# Copier les node_modules partagés (racine)
COPY --from=builder /workspace/node_modules ./node_modules

# Copier le code compilé de farm-service
COPY --from=builder /workspace/apps/farm-service/dist ./apps/farm-service/dist
COPY --from=builder /workspace/apps/farm-service/package*.json ./apps/farm-service/
COPY --from=builder /workspace/apps/farm-service/node_modules ./apps/farm-service/node_modules

# Changer le propriétaire des fichiers
RUN chown -R nestjs:nodejs /workspace

# Passer à l'utilisateur non-root
USER nestjs

WORKDIR /workspace/apps/farm-service

# Exposer le port
EXPOSE 3003

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3003/api/v1/health/ready || exit 1

# Démarrer l'application
CMD ["node", "dist/main.js"]