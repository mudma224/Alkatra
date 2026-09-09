# ============================================================
# Stage 1 : deps — Installer les dépendances
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /workspace

# Copier les manifestes (racine + service + package workspace @alkatra/observability)
COPY package.json ./
COPY tsconfig.json ./
COPY apps/auth-service/package.json ./apps/auth-service/
COPY apps/auth-service/tsconfig.json ./apps/auth-service/tsconfig.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/observability/tsconfig.json ./packages/observability/tsconfig.json

# Filtrer le package.json racine pour ne garder que les workspaces nécessaires
# (le service + @alkatra/observability qu'il consomme)
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('./package.json','utf8'));p.workspaces=['apps/auth-service','packages/observability'];p.dependencies={};delete p.devDependencies;fs.writeFileSync('./package.json',JSON.stringify(p,null,2));"

RUN npm install --workspace @alkatra/auth-service

# ============================================================
# Stage 2 : builder — Compile le code TypeScript
# ============================================================
FROM deps AS builder
WORKDIR /workspace

# @alkatra/observability doit être compilé en premier (main = dist/index.js)
COPY packages/observability ./packages/observability
RUN npm run build --workspace @alkatra/observability

COPY apps/auth-service ./apps/auth-service

RUN npm run build --workspace @alkatra/auth-service \
    && npm prune --omit=dev

# ============================================================
# Stage 3 : development — Hot reload local
# ============================================================
FROM deps AS development
WORKDIR /workspace

COPY packages/observability ./packages/observability
RUN npm run build --workspace @alkatra/observability

COPY apps/auth-service ./apps/auth-service

EXPOSE 3001

CMD ["npm", "run", "start:dev", "-w", "apps/auth-service"]

# ============================================================
# Stage 4 : runner — Exécute le code compilé (production)
# ============================================================
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /workspace
ENV NODE_ENV=production

COPY --from=builder /workspace/node_modules ./node_modules

# @alkatra/observability compilé (résolu via symlink workspace dans node_modules)
COPY --from=builder /workspace/packages/observability/package.json ./packages/observability/package.json
COPY --from=builder /workspace/packages/observability/dist ./packages/observability/dist

# Code compilé de auth-service
COPY --from=builder /workspace/apps/auth-service/dist ./apps/auth-service/dist
COPY --from=builder /workspace/apps/auth-service/package.json ./apps/auth-service/
COPY --from=builder /workspace/apps/auth-service/node_modules ./apps/auth-service/node_modules

RUN chown -R nestjs:nodejs /workspace

USER nestjs
WORKDIR /workspace/apps/auth-service

EXPOSE 3001

CMD ["node", "dist/main"]
