# `infra/nginx/` — API Gateway (NGINX)

> **Date** : juillet 2026  
> **Port** : 8080  
> **Image** : `nginx:alpine` avec `gettext` pour `envsubst`  
> **Routage** : `auth-service` (port 3001), `user-service` (port 3002)

---

## Table des matières

1. [Rôle du gateway](#1-rôle-du-gateway)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Fichiers du gateway](#3-fichiers-du-gateway)
4. [Dockerfile](#4-dockerfile)
5. [Entrypoint (entrypoint.sh)](#5-entrypoint-entrypointsh)
6. [Template Nginx (nginx.conf.template)](#6-template-nginx-nginxconftemplate)
7. [Service Docker Compose](#7-service-docker-compose)
8. [Variables d'environnement](#8-variables-denvironnement)
9. [Routes exposées](#9-routes-exposées)
10. [Sécurité](#10-sécurité)
11. [Démarrage et tests](#11-démarrage-et-tests)
12. [Ajouter un nouveau service](#12-ajouter-un-nouveau-service)
13. [Limites constatées](#13-limites-constatées)

---

## 1. Rôle du gateway

Le gateway est un **reverse proxy** basé sur NGINX qui sert de **point d'entrée unique** pour les clients de la plateforme (applications mobiles, web frontend, etc.).

**Ce qu'il fait :**
- Il reçoit toutes les requêtes HTTP des clients sur le port **8080**
- Il **route** chaque requête vers le service approprié selon le chemin (`/api/v1/auth/*` → `auth-service`, `/api/v1/user/*` → `user-service`)
- Il **maintient un point d'accès unique** : le client n'a besoin de connaître que l'adresse du gateway, pas celle de chaque service individuel
- Il reste **transparent** : les services continuent de fonctionner exactement comme avant, que la gateway soit présente ou non

**Ce qu'il ne fait PAS :**
- ❌ Il **ne gère pas l'authentification** (chaque service conserve sa propre validation JWT)
- ❌ Il **ne modifie pas** le corps des requêtes ou des réponses
- ❌ Il **n'implémente pas** de logique métier

---

## 2. Architecture et flux

### Schéma général

```
                    ┌──────────────────────────┐
                    │      Client (mobile/web)  │
                    └────────────┬─────────────┘
                                 │
                                 │ HTTP sur port 8080
                                 ▼
                    ┌──────────────────────────┐
                    │   NGINX API GATEWAY      │
                    │   (alkatra-gateway)      │
                    │   Port : 8080            │
                    │                          │
                    │   Routage basé sur       │
                    │   le chemin de l'URL     │
                    └──┬───────────┬───────────┘
                       │           │
                       │           │
              ┌────────▼────┐  ┌───▼──────────┐
              │ auth-service│  │ user-service  │
              │ Port : 3001 │  │ Port : 3002   │
              │             │  │               │
              │ JWT, OTP    │  │ Profil user   │
              │ PostgreSQL  │  │ (proxy vers   │
              │ Redis       │  │  auth-service)│
              └─────────────┘  └───────────────┘
```

### Flux des requêtes

```
1. Client envoie : POST http://localhost:8080/api/v1/auth/register
   ──────────────────────────────────────────────────────────────
   Gateway reçoit sur port 8080
   → Vérifie la correspondance : /api/v1/auth/ → auth-service
   → Transfère vers http://auth-service:3001/api/v1/auth/register
   → Retourne la réponse au client

2. Client envoie : GET http://localhost:8080/api/v1/user/profile
                                                  (avec Bearer JWT)
   ──────────────────────────────────────────────────────────────
   Gateway reçoit sur port 8080
   → Vérifie la correspondance : /api/v1/user/ → user-service
   → Transfère vers http://user-service:3002/api/v1/user/profile
   → user-service valide le JWT, appelle auth-service pour le profil
   → Retourne la réponse au client

3. Client envoie : GET http://localhost:8080/api/v1/farms
   ──────────────────────────────────────────────────────────────
   Gateway reçoit sur port 8080
   → Vérifie la correspondance : /api/v1/farms/ → user-service
   → Transfère vers http://user-service:3002/api/v1/farms/
   → user-service retourne NotImplementedException
   → Retourne l'erreur au client
```

---

## 3. Fichiers du gateway

```
infra/nginx/
├── Dockerfile                    # Construction de l'image Docker
├── entrypoint.sh                 # Script de démarrage du conteneur
└── nginx.conf.template           # Template de configuration Nginx (avec variables)
```

### Comment ces fichiers interagissent au démarrage

```
1. DOCKER BUILD
   Infra/nginx/Dockerfile
   ├── FROM nginx:alpine
   ├── apk add gettext             ← Installe envsubst
   ├── COPY entrypoint.sh          ← Copie le script de démarrage
   ├── COPY nginx.conf.template    ← Copie le template
   └── ENTRYPOINT ["/entrypoint.sh"]

2. DOCKER RUN (démarrage du conteneur)
   /entrypoint.sh
   ├── Vérifie que les 4 variables d'env sont présentes
   │   (AUTH_SERVICE_HOST, AUTH_SERVICE_PORT,
   │    USER_SERVICE_HOST, USER_SERVICE_PORT)
   │
   ├── Exécute envsubst :
   │   nginx.conf.template + variables d'env → /etc/nginx/nginx.conf
   │   (remplace ${AUTH_SERVICE_HOST} par "auth-service", etc.)
   │
   ├── Valide la syntaxe : nginx -t
   │
   └── Démarre Nginx : nginx -g 'daemon off;'
       (mode foreground pour Docker)

3. REQUÊTE CLIENT
   NGINX utilise nginx.conf généré
   ├── location /api/v1/auth/ → proxy_pass http://auth-service:3001
   ├── location /api/v1/user/ → proxy_pass http://user-service:3002
   └── location /              → 404 JSON
```

---

## 4. Dockerfile

```dockerfile
# Fichier : infra/nginx/Dockerfile

FROM nginx:alpine

# gettext fournit envsubst — standard Alpine, aucune dépendance externe
RUN apk add --no-cache gettext

# Supprimer la config nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier le template de configuration
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copier et rendre exécutable le script d'entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Port d'écoute du gateway
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
```

### Explication

| Instruction | Rôle |
|-------------|------|
| `FROM nginx:alpine` | Image de base : NGINX sur Alpine Linux (~23MB) |
| `apk add --no-cache gettext` | Installe `envsubst` (utilitaire de substitution de variables dans les templates) |
| `rm /etc/nginx/conf.d/default.conf` | Supprime la configuration par défaut de NGINX pour la remplacer par la nôtre |
| `COPY nginx.conf.template ...` | Copie le template dans le conteneur |
| `COPY entrypoint.sh /entrypoint.sh` | Copie le script de démarrage |
| `RUN chmod +x /entrypoint.sh` | Rend le script exécutable |
| `EXPOSE 8080` | Déclare que le conteneur écoute sur le port 8080 |
| `ENTRYPOINT ["/entrypoint.sh"]` | Commande exécutée au démarrage du conteneur |

---

## 5. Entrypoint (entrypoint.sh)

```bash
#!/bin/sh
# Fichier : infra/nginx/entrypoint.sh

set -e

# -----------------------------------------------------------------------------
# 1. Validation des variables requises (fail fast)
# -----------------------------------------------------------------------------
REQUIRED_VARS="AUTH_SERVICE_HOST AUTH_SERVICE_PORT USER_SERVICE_HOST USER_SERVICE_PORT"

for VAR in $REQUIRED_VARS; do
    eval VALUE=\$$VAR
    if [ -z "$VALUE" ]; then
        echo "[ERROR] Variable d'environnement manquante : $VAR"
        echo "[ERROR] Le gateway ne peut pas démarrer sans cette variable."
        exit 1
    fi
done

echo "[INFO] Variables d'environnement validées :"
echo "       AUTH_SERVICE_HOST=${AUTH_SERVICE_HOST}"
echo "       AUTH_SERVICE_PORT=${AUTH_SERVICE_PORT}"
echo "       USER_SERVICE_HOST=${USER_SERVICE_HOST}"
echo "       USER_SERVICE_PORT=${USER_SERVICE_PORT}"

# -----------------------------------------------------------------------------
# 2. Génération de nginx.conf depuis le template
# -----------------------------------------------------------------------------
TEMPLATE_PATH="/etc/nginx/nginx.conf.template"
OUTPUT_PATH="/etc/nginx/nginx.conf"

echo "[INFO] Génération de la configuration nginx depuis le template..."

envsubst '${AUTH_SERVICE_HOST} ${AUTH_SERVICE_PORT} ${USER_SERVICE_HOST} ${USER_SERVICE_PORT}' \
    < "$TEMPLATE_PATH" \
    > "$OUTPUT_PATH"

echo "[INFO] Configuration générée : $OUTPUT_PATH"

# -----------------------------------------------------------------------------
# 3. Validation de la config nginx avant démarrage
# -----------------------------------------------------------------------------
echo "[INFO] Validation de la configuration nginx..."
nginx -t

echo "[INFO] Configuration nginx valide. Démarrage du gateway..."

# -----------------------------------------------------------------------------
# 4. Démarrage de nginx (foreground pour Docker)
# -----------------------------------------------------------------------------
exec nginx -g 'daemon off;'
```

### Explication étape par étape

#### Étape 1 : Validation (fail fast)

```bash
REQUIRED_VARS="AUTH_SERVICE_HOST AUTH_SERVICE_PORT USER_SERVICE_HOST USER_SERVICE_PORT"

for VAR in $REQUIRED_VARS; do
    eval VALUE=\$$VAR       # Récupère la valeur de la variable dont le nom est dans $VAR
    if [ -z "$VALUE" ]; then # Si la variable est vide
        echo "[ERROR] Variable d'environnement manquante : $VAR"
        exit 1               # Arrête immédiatement le conteneur
    fi
done
```

- Vérifie que les 4 variables sont définies avant de continuer.
- Si une variable manque, le conteneur s'arrête immédiatement (`exit 1`).
- `set -e` en ligne 9 : le script s'arrête dès qu'une commande échoue.

#### Étape 2 : Génération de la configuration

```bash
envsubst '${AUTH_SERVICE_HOST} ${AUTH_SERVICE_PORT} ${USER_SERVICE_HOST} ${USER_SERVICE_PORT}' \
    < "$TEMPLATE_PATH" \
    > "$OUTPUT_PATH"
```

- `envsubst` lit le template (`nginx.conf.template`)
- Remplace `${AUTH_SERVICE_HOST}` par sa valeur (`auth-service`), etc.
- Écrit le résultat dans `/etc/nginx/nginx.conf`
- Seules les variables listées entre guillemets simples sont substituées (les autres variables Nginx comme `$host`, `$remote_addr` ne sont pas touchées)

#### Étape 3 : Validation de la syntaxe

```bash
nginx -t
```

- Commande NGINX qui **teste** la syntaxe du fichier de configuration sans démarrer le serveur.
- Si la syntaxe est invalide, `nginx -t` retourne une erreur → `set -e` arrête le script → le conteneur ne démarre pas.

#### Étape 4 : Démarrage

```bash
exec nginx -g 'daemon off;'
```

- `nginx -g 'daemon off;'` : démarre NGINX en **mode foreground** (obligatoire pour Docker, sinon le conteneur s'arrête immédiatement)
- `exec` : remplace le processus shell par le processus Nginx (les signaux Docker sont transmis directement à Nginx)

---

## 6. Template Nginx (nginx.conf.template)

### Structure générale

```
events {
    worker_connections 1024;
    multi_accept on;
    use epoll;
}

http {
    [paramètres généraux]
    [resolver DNS]
    [format de log]
    [rate limiting]

    server {
        listen 8080;
        [headers de sécurité]

        location /health                  → Réponse JSON directe
        location /_internal/check_auth    → Vérification auth-service (interne)
        location /_internal/check_user    → Vérification user-service (interne)

        location /api/v1/auth/            → proxy_pass auth-service
        location /api/v1/user/            → proxy_pass user-service
        location /api/v1/farms/           → proxy_pass user-service

        location /                        → 404 JSON
    }
}
```

### Détail des sections

#### Section `events`

```nginx
events {
    worker_connections 1024;   # Nombre max de connexions simultanées par worker
    multi_accept on;            # Accepte plusieurs connexions à la fois
    use epoll;                  # Mécanisme d'I/O (Linux, performant)
}
```

#### Paramètres généraux HTTP

```nginx
http {
    sendfile on;                # Optimise l'envoi de fichiers statiques
    tcp_nopush on;              # Optimise l'envoi des paquets TCP
    tcp_nodelay on;             # Désactive l'algorithme Nagle (faible latence)
    keepalive_timeout 65;       # Durée max d'une connexion keep-alive
    types_hash_max_size 2048;   # Taille de la table des types MIME

    include /etc/nginx/mime.types;    # Types MIME standards
    default_type application/octet-stream;

    client_max_body_size 10M;   # Taille max du corps des requêtes (10MB)

    proxy_connect_timeout 30s;  # Timeout de connexion aux services
    proxy_send_timeout 60s;     # Timeout d'envoi aux services
    proxy_read_timeout 60s;     # Timeout de lecture depuis les services
}
```

#### Résolveur DNS interne Docker

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
resolver_timeout 5s;
```

- **127.0.0.11** : adresse IP fixe du serveur DNS interne de Docker, présente dans tous les conteneurs.
- **valid=10s** : les résolutions DNS sont mises en cache 10 secondes maximum. Passé ce délai, Nginx re-résout le nom.
- **ipv6=off** : désactive la résolution IPv6 (les services Docker sont sur un réseau bridge IPv4).
- Utile car les `proxy_pass` utilisent des variables Nginx (`$auth_upstream`, `$user_upstream`), ce qui force la résolution DNS à chaque requête (contrairement à un proxy_pass statique qui résout une seule fois au démarrage).

#### Format de log structuré (JSON)

```nginx
log_format gateway_json escape=json '{'
    '"timestamp":"$time_iso8601",'
    '"remote_addr":"$remote_addr",'
    '"request":"$request",'
    '"status":$status,'
    '"body_bytes_sent":$body_bytes_sent,'
    '"http_referer":"$http_referer",'
    '"http_user_agent":"$http_user_agent",'
    '"upstream_addr":"$upstream_addr",'
    '"upstream_status":"$upstream_status",'
    '"request_time":$request_time,'
    '"upstream_response_time":"$upstream_response_time"'
'}';

access_log /var/log/nginx/access.log gateway_json;
error_log /var/log/nginx/error.log warn;
```

- Les logs sont formatés en JSON structuré (interopérable avec des outils de logging comme Elasticsearch, Loki, etc.).
- `escape=json` : les caractères spéciaux dans les valeurs sont échappés selon les règles JSON.
- Champs inclus :
  - `timestamp` : date/heure de la requête (format ISO 8601)
  - `remote_addr` : adresse IP du client
  - `request` : méthode HTTP + chemin + protocole (ex: `POST /api/v1/auth/register HTTP/1.1`)
  - `status` : code HTTP retourné au client
  - `body_bytes_sent` : taille de la réponse en octets
  - `http_referer` : en-tête Referer (provenance du client)
  - `http_user_agent` : user-agent du client
  - `upstream_addr` : adresse du service qui a traité la requête
  - `upstream_status` : code HTTP retourné par le service en amont
  - `request_time` : temps total de traitement de la requête (secondes)
  - `upstream_response_time` : temps de réponse du service en amont (secondes)

#### Rate limiting

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/s;
```

- Définit deux zones de limitation de débit :
  - `api_limit` : 30 requêtes par seconde pour l'API générale
  - `auth_limit` : 10 requêtes par seconde pour l'authentification
- Clé de limitation : `$binary_remote_addr` (adresse IP du client, format binaire pour économiser la mémoire)
- Taille de la zone : 10MB (peut stocker environ 160 000 adresses IP uniques)

#### Headers de sécurité (OWASP)

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

| Header | Valeur | Protection |
|--------|--------|------------|
| `X-Frame-Options` | `SAMEORIGIN` | Empêche le clickjacking (site affiché dans une iframe d'un autre domaine) |
| `X-Content-Type-Options` | `nosniff` | Empêche le MIME-type sniffing (le navigateur ne devine pas le type du contenu) |
| `X-XSS-Protection` | `1; mode=block` | Active le filtre XSS du navigateur |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Contrôle les informations envoyées dans l'en-tête Referer |
| `Permissions-Policy` | `geolocation=(), ...` | Désactive les API sensibles du navigateur (géolocalisation, microphone, caméra) |

---

## 7. Service Docker Compose

```yaml
gateway:
  build:
    context: ./../../infra/nginx
    dockerfile: Dockerfile
  image: alkatra-gateway:latest
  container_name: alkatra-gateway
  restart: unless-stopped
  profiles: ["phase1"]
  ports:
    - "8080:8080"
  environment:
    AUTH_SERVICE_HOST: ${AUTH_SERVICE_HOST:-auth-service}
    AUTH_SERVICE_PORT: ${AUTH_SERVICE_PORT:-3001}
    USER_SERVICE_HOST: ${USER_SERVICE_HOST:-user-service}
    USER_SERVICE_PORT: ${USER_SERVICE_PORT:-3002}
  depends_on:
    auth-service:
      condition: service_healthy
    user-service:
      condition: service_healthy
  networks:
    - alkatra-net
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 10s
```

### Détail des options

| Option | Valeur | Explication |
|--------|--------|-------------|
| `build.context` | `./../../infra/nginx` | Chemin vers le dossier contenant le Dockerfile |
| `image` | `alkatra-gateway:latest` | Nom de l'image construite (utile pour le partage ou le cache) |
| `profiles` | `["phase1"]` | Le gateway n'est démarré que si le profil `phase1` est activé |
| `ports` | `"8080:8080"` | Le port 8080 du host est mappé au port 8080 du conteneur |
| `environment` | 4 variables | Les adresses des services sont injectées au démarrage |
| `depends_on` | `auth-service`, `user-service` | Attend que ces services soient "healthy" avant de démarrer |
| `healthcheck` | `wget http://localhost:8080/health` | Vérifie que le gateway répond sur `/health` |
| `start_period` | `10s` | Délai de grâce au démarrage (le temps que Nginx s'initialise) |

### Variables d'environnement avec valeurs par défaut

```yaml
AUTH_SERVICE_HOST: ${AUTH_SERVICE_HOST:-auth-service}  # défaut : "auth-service"
AUTH_SERVICE_PORT: ${AUTH_SERVICE_PORT:-3001}          # défaut : "3001"
USER_SERVICE_HOST: ${USER_SERVICE_HOST:-user-service}  # défaut : "user-service"
USER_SERVICE_PORT: ${USER_SERVICE_PORT:-3002}          # défaut : "3002"
```

Syntaxe `${VAR:-default}` : si la variable `${VAR}` n'est pas définie dans le fichier `.env`, la valeur `default` est utilisée.

---

## 8. Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `AUTH_SERVICE_HOST` | `auth-service` | Nom d'hôte du service d'authentification (résolu via DNS Docker) |
| `AUTH_SERVICE_PORT` | `3001` | Port du service d'authentification |
| `USER_SERVICE_HOST` | `user-service` | Nom d'hôte du service utilisateur |
| `USER_SERVICE_PORT` | `3002` | Port du service utilisateur |

Ces variables sont utilisées par `envsubst` dans l'entrypoint pour générer le fichier `nginx.conf` final.

---

## 9. Routes exposées

### Routes publiques

| Méthode | Chemin via gateway | Cible | Comportement |
|---------|--------------------|-------|-------------|
| `GET` | `/api/v1/auth/register` | auth-service:3001 | Inscription (envoi OTP) |
| `POST` | `/api/v1/auth/verify-otp` | auth-service:3001 | Vérification OTP |
| `POST` | `/api/v1/auth/login` | auth-service:3001 | Connexion avec refresh token |
| `POST` | `/api/v1/auth/refresh` | auth-service:3001 | Rafraîchissement de session |
| `GET` | `/api/v1/user/profile` | user-service:3002 | Profil utilisateur (JWT requis) |
| `PATCH` | `/api/v1/user/profile` | user-service:3002 | Mise à jour profil (JWT requis) |
| `GET` | `/api/v1/farms` | user-service:3002 | Liste des fermes (non implémenté) |

### Health checks

| Méthode | Chemin | Comportement |
|---------|--------|-------------|
| `GET` | `/health` | Retourne `{"status":"ok","service":"alkatra-gateway","timestamp":"..."}` |
| `GET` | `/health/upstream` | **Endpoints internes** : `/api/v1/health/upstream` n'est pas défini dans le template actuel |

### Endpoints internes (ne pas exposer au public)

| Méthode | Chemin | Comportement |
|---------|--------|-------------|
| `HEAD` | `/_internal/check_auth` | Vérifie via HEAD que `auth-service/health` répond |
| `HEAD` | `/_internal/check_user` | Vérifie via HEAD que `user-service/api/v1/health/live` répond |

Ces endpoints sont marqués `internal;` dans Nginx, ce qui signifie qu'ils ne sont accessibles que par des sous-requêtes internes (pas directement depuis l'extérieur).

### Fallback

| Chemin | Réponse |
|--------|---------|
| `/*` (tout autre chemin) | `404 {"error":"Not Found","message":"Route introuvable sur le gateway","path":"..."}` |

---

## 10. Sécurité

### Headers HTTP de sécurité

5 headers de sécurité OWASP sont ajoutés à chaque réponse (voir section 6).

### Rate limiting

Deux zones de limitation :
- **30 req/s** pour l'API générale (toutes les routes sauf auth)
- **10 req/s** pour l'authentification (route `/api/v1/auth/`)

La zone `auth_limit` est explicitement appliquée à la route `/api/v1/auth/` avec `burst=20 nodelay` : jusqu'à 20 requêtes en rafale sont autorisées au-delà de la limite, mais elles sont traitées immédiatement.

### Taille maximale des requêtes

`client_max_body_size 10M` : les requêtes avec un corps plus grand que 10MB sont rejetées.

### Timeouts

Les connexions entre le gateway et les services en amont ont des timeouts :
- Connexion : 30s
- Envoi : 60s
- Lecture : 60s

---

## 11. Démarrage et tests

### Prérequis

- Docker Desktop installé et en cours d'exécution
- Le profil `phase1` doit être activé (contient `auth-service`, `user-service` et `gateway`)

### Démarrer la stack

```bash
docker compose --profile phase1 -f infra/docker/docker-compose.yml up -d
```

### Vérifier que le gateway est bien démarré

```bash
# Via le healthcheck
docker compose -f infra/docker/docker-compose.yml ps gateway
# Statut : Up (healthy)

# Via HTTP
curl http://localhost:8080/health
# Réponse attendue : {"status":"ok","service":"alkatra-gateway","timestamp":"..."}
```

### Tester les routes via le gateway

```bash
# 1. Demander un code OTP (développement)
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "+212612345678"}'
# Réponse : {"success":true,"message":"OTP envoyé","expiresAt":"..."}

# 2. Vérifier le profil utilisateur (nécessite un JWT valide)
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/v1/user/profile

# 3. Vérifier qu'une route inexistante retourne 404
curl http://localhost:8080/api/v1/unknown
# Réponse : 404 {"error":"Not Found","message":"Route introuvable sur le gateway","path":"..."}
```

### Voir les logs

```bash
docker compose -f infra/docker/docker-compose.yml logs -f gateway
# Exemple de log :
# {"timestamp":"2026-07-15T12:00:00+00:00","remote_addr":"172.20.0.1","request":"GET /health HTTP/1.1","status":200,...}
```

### Arrêter la stack

```bash
docker compose --profile phase1 -f infra/docker/docker-compose.yml down
```

---

## 12. Ajouter un nouveau service

Pour ajouter un nouveau service au routage du gateway (par exemple `farm-service` sur le port 3003), les modifications à effectuer sont :

### 1. Dans `nginx.conf.template`

Ajouter en haut du template (dans les `# ROUTES API`) :

```nginx
# ---- Farm Service ----
location /api/v1/farms/ {
    set $farm_upstream http://${FARM_SERVICE_HOST}:${FARM_SERVICE_PORT};
    proxy_pass $farm_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 2. Dans `entrypoint.sh`

Ajouter les nouvelles variables à la liste des variables requises :

```bash
REQUIRED_VARS="AUTH_SERVICE_HOST AUTH_SERVICE_PORT USER_SERVICE_HOST USER_SERVICE_PORT FARM_SERVICE_HOST FARM_SERVICE_PORT"
```

Et dans la commande `envsubst` :

```bash
envsubst '${AUTH_SERVICE_HOST} ${AUTH_SERVICE_PORT} ${USER_SERVICE_HOST} ${USER_SERVICE_PORT} ${FARM_SERVICE_HOST} ${FARM_SERVICE_PORT}'
```

### 3. Dans `docker-compose.yml`

Ajouter les variables d'environnement au service `gateway` :

```yaml
FARM_SERVICE_HOST: ${FARM_SERVICE_HOST:-farm-service}
FARM_SERVICE_PORT: ${FARM_SERVICE_PORT:-3003}
```

Et ajouter `farm-service` dans `depends_on` :

```yaml
depends_on:
  auth-service:
    condition: service_healthy
  user-service:
    condition: service_healthy
  farm-service:
    condition: service_healthy
```

---

## 13. Limites constatées

### Ce qui n'est pas implémenté dans le template actuel

1. **Pas d'endpoint `/health/upstream` agrégé** : contrairement à la première version du gateway, le template actuel ne propose pas d'endpoint pour vérifier l'état de tous les services en amont en une seule requête.

2. **Pas de cache** : aucune réponse n'est mise en cache par le gateway. Chaque requête est systématiquement transmise au service en amont.

3. **Pas de connexion HTTPS** : le gateway écoute uniquement en HTTP (port 8080). Aucun certificat SSL n'est configuré.

4. **Pas de load balancing** : chaque service est défini avec une seule instance. Si un service est scalable, l'upstream Nginx n'est pas configuré pour répartir la charge.

5. **Le rate limiting n'est appliqué que sur `/api/v1/auth/`** : la zone `api_limit` est déclarée mais n'est pas utilisée dans un bloc `location`. Elle n'a aucun effet.

### Comportements

6. **Le resolver DNS 127.0.0.11 n'est nécessaire qu'avec des variables** : dans ce template, les `proxy_pass` utilisent des variables Nginx (`$auth_upstream`), ce qui force l'utilisation du resolver. Si on utilisait des `proxy_pass` statiques (`proxy_pass http://auth-service:3001;`), le resolver ne serait pas nécessaire.