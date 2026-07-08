# ============================================
# Stage 1 : Builder — compile le TypeScript
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ============================================
# Stage 2 : Development — hot reload local
# ============================================
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "start:dev"]

# ============================================
# Stage 3 : Production — image finale légère
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

USER nodeuser

EXPOSE 3001

CMD ["node", "dist/main"]