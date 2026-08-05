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
COPY apps/recommendation-service/tsconfig.json ./apps/recommendation-service/
COPY apps/recommendation-service/tsconfig.build.json ./apps/recommendation-service/

# Filtrer le package.json racine pour ne garder que le workspace recommendation-service
# et supprimer les dépendances racine non nécessaires au service
# (ioredis, prom-client, mongodb, mqtt, turbo, eslint, prettier, etc. sont pour d'autres services)
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('./package.json','utf8'));p.workspaces=['apps/recommendation-service'];p.dependencies={};delete p.devDependencies;fs.writeFileSync('./package.json',JSON.stringify(p,null,2));"

# Installer uniquement les dépendances nécessaires au recommendation-service
# (deps + devDeps du service, sans les deps racine inutiles)
RUN npm install --workspace @alkatra/recommendation-service

# ============================================================
# Stage 2 : builder — Compile le code TypeScript
# ============================================================
FROM deps AS builder
WORKDIR /workspace

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

COPY apps/recommendation-service ./apps/recommendation-service

EXPOSE 3004

CMD ["npm", "run", "start:dev", "-w", "apps/recommendation-service"]

# ============================================================
# Stage 4 : runner — Exécute le code compilé (production)
# ============================================================
FROM node:20-alpine AS runner

# Utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /workspace
ENV NODE_ENV=production

# Copier les node_modules (ne contient que les deps du recommendation-service)
COPY --from=builder /workspace/node_modules ./node_modules

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