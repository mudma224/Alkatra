# =============================================
# Auth Service — Multi-stage Dockerfile
# Phase 1 placeholder — NestJS minimal
# =============================================

# ---- Stage 1 : base (dépendances communes) ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ---- Stage 2 : development (avec devDeps pour hot-reload) ----
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# ---- Stage 3 : build (compile TypeScript) ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 4 : production (image minimale) ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/main"]