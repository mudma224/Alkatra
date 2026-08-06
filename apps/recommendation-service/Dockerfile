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

# Copier les package.json et tsconfig du recommendation-service
COPY apps/recommendation-service/package.json ./apps/recommendation-service/
COPY apps/recommendation-service/tsconfig.json ./apps/recommendation-service/tsconfig.json
COPY apps/recommendation-service/tsconfig.build.json ./apps/recommendation-service/tsconfig.build.json

# Copier le package.json + tsconfig de @alkatra/shared-types (dépendance workspace)
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/shared-types/tsconfig.json ./packages/shared-types/tsconfig.json

# Filtrer le package.json racine pour ne garder que les workspaces nécessaires
# au recommendation-service (le service + @alkatra/shared-types qu'il consomme)
# et supprimer les dépendances racine non nécessaires au service
# (ioredis, prom-client, mongodb, mqtt, turbo, eslint, prettier, etc. sont pour d'autres services)
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('./package.json','utf8'));p.workspaces=['apps/recommendation-service','packages/shared-types'];p.dependencies={};delete p.devDependencies;fs.writeFileSync('./package.json',JSON.stringify(p,null,2));"

# Installer uniquement les dépendances nécessaires au recommendation-service
# (deps + devDeps du service, sans les deps racine inutiles)
RUN npm install --workspace @alkatra/recommendation-service

# ============================================================
# Stage 2 : builder — Compile le code TypeScript
# ============================================================
FROM deps AS builder
WORKDIR /workspace

# Copier le code source de @alkatra/shared-types et le compiler en premier
# (le recommendation-service importe ses types ; main = dist/index.js)
COPY packages/shared-types ./packages/shared-types
RUN npm run build --workspace @alkatra/shared-types

# Copier le code source de recommendation-service uniquement
COPY apps/recommendation-service ./apps/recommendation-service

# Build recommendation-service (nest build → dist/)
# Puis prune les devDependencies pour ne garder que les deps de production
RUN npm run build --workspace @alkatra/recommendation-service \
    && npm prune --omit=dev

# ============================================================
# Stage 3 : development — Hot reload local
# ============================================================
FROM deps AS development
WORKDIR /workspace

# shared-types doit être compilé pour que nest start --watch résolve les imports
COPY packages/shared-types ./packages/shared-types
RUN npm run build --workspace @alkatra/shared-types

COPY apps/recommendation-service ./apps/recommendation-service

EXPOSE 3004

CMD ["npm", "run", "start:dev", "-w", "apps/recommendation-service"]

# ============================================================
# Stage 4 : runner — Exécute le code compilé (production)
# ============================================================
FROM node:20-alpine AS runner

# Fuseau horaire Maroc — nécessaire pour todayRange() (définition locale de "aujourd'hui")
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Africa/Casablanca /etc/localtime && \
    echo "Africa/Casablanca" > /etc/timezone

# Utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /workspace
ENV NODE_ENV=production
ENV TZ=Africa/Casablanca

# Copier les node_modules (ne contient que les deps du recommendation-service)
COPY --from=builder /workspace/node_modules ./node_modules

# Copier @alkatra/shared-types compilé (résolu via symlink workspace dans node_modules)
COPY --from=builder /workspace/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /workspace/packages/shared-types/dist ./packages/shared-types/dist

# Copier le code compilé de recommendation-service
COPY --from=builder /workspace/apps/recommendation-service/dist ./apps/recommendation-service/dist
COPY --from=builder /workspace/apps/recommendation-service/package.json ./apps/recommendation-service/
COPY --from=builder /workspace/apps/recommendation-service/node_modules ./apps/recommendation-service/node_modules

# Changer le propriétaire des fichiers
RUN chown -R nestjs:nodejs /workspace

# Passer à l'utilisateur non-root
USER nestjs

WORKDIR /workspace/apps/recommendation-service

# Exposer le port
EXPOSE 3004

# Healthcheck (wget est inclus dans node:20-alpine via busybox)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3004/health/ready || exit 1

# Démarrer l'application
# Note: tsconfig.json a rootDir "./" → la sortie est dist/src/main.js
CMD ["node", "dist/src/main.js"]