# ============================================
# STAGE 1 : development
# Utilisé par docker-compose.yml (target: development)
# ============================================
FROM node:20-alpine AS development

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer TOUTES les dépendances (dev + prod)
RUN npm install

# Copier le code source
COPY . .

# Port exposé
EXPOSE 3005

# Démarrer en mode dev (watch = reload automatique si le code change)
CMD ["npm", "run", "start:dev"]


# ============================================
# STAGE 2 : builder
# Compile TypeScript → JavaScript
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build


# ============================================
# STAGE 3 : production
# Image finale légère (sans node_modules de dev)
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Variables d'environnement production
ENV NODE_ENV=production

# Copier uniquement ce qui est nécessaire
COPY package*.json ./
RUN npm install --only=production

# Copier le code compilé depuis le stage builder
COPY --from=builder /app/dist ./dist

EXPOSE 3005
CMD ["node", "dist/main"]