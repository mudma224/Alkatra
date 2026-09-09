# --- Stage 1 : workspace deps ---
FROM node:20-alpine AS deps
WORKDIR /workspace

COPY package*.json ./
COPY apps/user-service/package*.json ./apps/user-service/
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY packages/observability/package*.json ./packages/observability/

RUN npm ci --workspace @alkatra/shared-types --workspace @alkatra/observability --workspace @alkatra/user-service

# --- Stage 2 : build ---
FROM deps AS builder
WORKDIR /workspace

COPY apps/user-service ./apps/user-service
COPY packages/shared-types ./packages/shared-types
COPY packages/observability ./packages/observability

RUN npm run build --workspace @alkatra/shared-types \
	&& npm run build --workspace @alkatra/observability \
	&& npm run build --workspace @alkatra/user-service \
	&& npm prune --omit=dev --workspace @alkatra/shared-types --workspace @alkatra/observability --workspace @alkatra/user-service

# --- Stage 3 : runtime ---
FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/user-service/dist ./apps/user-service/dist
COPY --from=builder /workspace/apps/user-service/package*.json ./apps/user-service/
COPY --from=builder /workspace/apps/user-service/node_modules ./apps/user-service/node_modules
COPY --from=builder /workspace/packages/shared-types ./packages/shared-types
COPY --from=builder /workspace/packages/observability/package.json ./packages/observability/package.json
COPY --from=builder /workspace/packages/observability/dist ./packages/observability/dist

WORKDIR /workspace/apps/user-service
EXPOSE 3002
CMD ["node", "dist/main.js"]
