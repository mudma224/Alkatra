# ============================================================
# Stage 1 : deps — Installer les dépendances
# ============================================================
FROM node:20-alpine AS deps

# Outils de compilation natifs (pg, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /workspace

# Copier uniquement le package.json racine (sans package-lock.json)
COPY package.json ./
COPY tsconfig.json ./

# Copier les package.json et tsconfig de l'alert-service
COPY apps/alert-service/package.json ./apps/alert-service/
COPY apps/alert-service/tsconfig.json ./apps/alert-service/tsconfig.json
COPY apps/alert-service/tsconfig.build.json ./apps/alert-service/tsconfig.build.json

# Copier le package.json + tsconfig de @alkatra/shared-types (dépendance workspace)
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/shared-types/tsconfig.json ./packages/shared-types/tsconfig.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/observability/tsconfig.json ./packages/observability/tsconfig.json

# Filtrer le package.json racine pour ne garder que les workspaces nécessaires
# à l'alert-service (le service + @alkatra/shared-types qu'il consomme)
# et supprimer les dépendances racine non nécessaires au service
# (ioredis, prom-client, mongodb, mqtt, turbo, eslint, prettier, etc. sont pour d'autres services)
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('./package.json','utf8'));p.workspaces=['apps/alert-service','packages/shared-types','packages/observability'];p.dependencies={};delete p.devDependencies;fs.writeFileSync('./package.json',JSON.stringify(p,null,2));"

# Installer uniquement les dépendances nécessaires à l'alert-service
# (deps + devDeps du service, sans les deps racine inutiles)
RUN npm install --workspace @alkatra/alert-service

# ============================================================
# Stage 2 : builder — Compile le code TypeScript
# ============================================================
FROM deps AS builder
WORKDIR /workspace

# Copier le code source de @alkatra/shared-types et le compiler en premier
# (l'alert-service importe ses types ; main = dist/index.js)
COPY packages/shared-types ./packages/shared-types
COPY packages/observability ./packages/observability
RUN npm run build --workspace @alkatra/shared-types && npm run build --workspace @alkatra/observability

# Copier le code source de l'alert-service uniquement
COPY apps/alert-service ./apps/alert-service

# Build alert-service (nest build → dist/)
# Puis prune les devDependencies pour ne garder que les deps de production
RUN npm run build --workspace @alkatra/alert-service \
    && npm prune --omit=dev

# ============================================================
# Stage 3 : development — Hot reload local
# ============================================================
FROM deps AS development
WORKDIR /workspace

# shared-types doit être compilé pour que nest start --watch résolve les imports
COPY packages/shared-types ./packages/shared-types
COPY packages/observability ./packages/observability
RUN npm run build --workspace @alkatra/shared-types && npm run build --workspace @alkatra/observability

COPY apps/alert-service ./apps/alert-service

EXPOSE 3006

CMD ["npm", "run", "start:dev", "-w", "apps/alert-service"]

# ============================================================
# Stage 4 : runner — Exécute le code compilé (production)
# ============================================================
FROM node:20-alpine AS runner

# Fuseau horaire Maroc
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Africa/Casablanca /etc/localtime && \
    echo "Africa/Casablanca" > /etc/timezone

# Utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /workspace
ENV NODE_ENV=production
ENV TZ=Africa/Casablanca

# Copier les node_modules (ne contient que les deps de l'alert-service)
COPY --from=builder /workspace/node_modules ./node_modules

# Copier @alkatra/shared-types compilé (résolu via symlink workspace dans node_modules)
COPY --from=builder /workspace/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /workspace/packages/shared-types/dist ./packages/shared-types/dist

# @alkatra/observability compilé (socle métriques Prometheus)
COPY --from=builder /workspace/packages/observability/package.json ./packages/observability/package.json
COPY --from=builder /workspace/packages/observability/dist ./packages/observability/dist

# Copier le code compilé de l'alert-service
COPY --from=builder /workspace/apps/alert-service/dist ./apps/alert-service/dist
COPY --from=builder /workspace/apps/alert-service/package.json ./apps/alert-service/
COPY --from=builder /workspace/apps/alert-service/node_modules ./apps/alert-service/node_modules

# Changer le propriétaire des fichiers
RUN chown -R nestjs:nodejs /workspace

# Passer à l'utilisateur non-root
USER nestjs

WORKDIR /workspace/apps/alert-service

# Exposer le port
EXPOSE 3006

# Healthcheck (wget est inclus dans node:20-alpine via busybox)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3006/health/ready || exit 1

# Démarrer l'application
# Note: tsconfig.json a rootDir "./" → la sortie est dist/src/main.js
CMD ["node", "dist/src/main.js"]
