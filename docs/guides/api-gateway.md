# API Gateway (Nginx)

Ce guide documente la configuration et le fonctionnement de la passerelle HTTP
de la plateforme Al Katra Bel Qatra. La passerelle est implémentée par un
conteneur Nginx qui expose un point d'entrée unique sur le port `8080` et route
les requêtes vers les services NestJS sous-jacents.

Sources de configuration :

- `infra/nginx/nginx.conf.template`
- `infra/nginx/entrypoint.sh`
- `infra/nginx/Dockerfile`
- Section `gateway` de `infra/docker/docker-compose.yml`

---

## Rôle du gateway

Le gateway est l'unique point d'entrée HTTP exposé vers l'extérieur pour les
API REST de la plateforme. Il est porté par un conteneur Nginx écoutant sur le
port **8080**.

Responsabilités :

- Réception des requêtes HTTP entrantes sur le port `8080`.
- Routage vers les services amont (auth, user, farm) selon le préfixe de chemin.
- Application d'un rate limiting différencié par type de route.
- Ajout systématique d'en-têtes de sécurité (recommandations OWASP).
- Journalisation structurée au format JSON.
- Exposition d'un endpoint de santé interne (`/health`).

La configuration Nginx n'est pas écrite en dur : elle est produite au démarrage
du conteneur par substitution de variables (`envsubst`) à partir d'un template.
Cela permet de résoudre les hôtes et ports des services amont à l'exécution,
via le resolver DNS interne de Docker.

---

## Architecture

Le gateway repose sur trois fichiers dans `infra/nginx/` :

| Fichier | Rôle |
| --- | --- |
| `nginx.conf.template` | Template de configuration Nginx, contenant des variables `${VAR}` substituées au démarrage. |
| `entrypoint.sh` | Script de démarrage : valide les variables requises, génère `nginx.conf` via `envsubst`, valide la configuration, puis lance Nginx au premier plan. |
| `Dockerfile` | Image Nginx Alpine avec `gettext` (qui fournit `envsubst`). |

Flux de démarrage du conteneur :

1. `entrypoint.sh` s'exécute avec `set -e` (échec immédiat en cas d'erreur).
2. Pour chaque variable listée dans `REQUIRED_VARS`, le script vérifie sa
   présence ; si l'une est vide, le conteneur s'arrête avec un message
   d'erreur explicite.
3. `envsubst` lit `nginx.conf.template`, substitue les variables d'environnement
   et écrit le résultat dans `/etc/nginx/nginx.conf`.
4. `nginx -t` valide la syntaxe de la configuration générée.
5. `exec nginx -g 'daemon off;'` démarre Nginx au premier plan (requis pour
   Docker).

Ce mécanisme garantit qu'aucune configuration invalide ne peut démarrer :
toute variable manquante ou toute erreur de syntaxe provoque l'arrêt du
conteneur avant l'ouverture du port.

---

## Dockerfile

```dockerfile
FROM nginx:alpine
RUN apk add --no-cache gettext
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
```

Points notables :

- Image de base `nginx:alpine`, légère.
- `gettext` apporte la commande `envsubst`, sans dépendance externe.
- La configuration Nginx par défaut est supprimée pour éviter tout conflit.
- Le port exposé est `8080`, conformément à la directive `listen 8080` du
  template.

---

## Routes HTTP

La table suivante reflète exactement le contenu de `nginx.conf.template`.
Toutes les routes sont définies dans un unique bloc `server` écoutant sur
`8080`. Les routes regex acceptent un slash final optionnel.

| Route | Cible | Rate limiting |
| --- | --- | --- |
| `GET /health` | Interne, JSON `200` | — |
| `/api/v1/auth/` | `${AUTH_SERVICE_HOST}:${AUTH_SERVICE_PORT}` | `auth_limit` (10 r/s, burst 20) |
| `/api/v1/user/` | `${USER_SERVICE_HOST}:${USER_SERVICE_PORT}` | — |
| `~ ^/api/v1/farms(?:/.*)?$` (regex) | `${FARM_SERVICE_HOST}:${FARM_SERVICE_PORT}` | `api_limit` (30 r/s, burst 20) |
| `~ ^/api/v1/parcels(?:/.*)?$` (regex) | `${FARM_SERVICE_HOST}:${FARM_SERVICE_PORT}` (farm-service) | `api_limit` |
| `~ ^/api/v1/sensors(?:/.*)?$` (regex) | `${FARM_SERVICE_HOST}:${FARM_SERVICE_PORT}` (farm-service) | `api_limit` |
| `/` (fallback) | JSON `404` | — |

Précisions :

- Les routes `/api/v1/farms`, `/api/v1/parcels` et `/api/v1/sensors` sont toutes
  trois routées vers le **farm-service** ; ce service gère conjointement les
  fermes, les parcelles et les capteurs.
- Les expressions rationnelles utilisent la forme `(?:/.*)?` afin d'accepter
  aussi bien `/api/v1/farms` que `/api/v1/farms/`, `/api/v1/farms/:id`, etc.
- Le fallback `/` renvoie un objet JSON structuré
  `{"error":"Not Found","message":"Route introuvable sur le gateway","path":"$uri"}`
  avec un code `404`.

### Services non routés

Les services suivants ne sont **pas** exposés via le gateway :

- `iot-service`
- `ml-inference-service`
- `recommendation-service`

Ces services communiquent principalement via Kafka et MongoDB, ou exposent des
endpoints consommés en interne ; ils ne disposent donc pas de route publique
sur la passerelle.

---

## Variables d'environnement

Le script `entrypoint.sh` définit la liste stricte suivante de variables
requises :

```
REQUIRED_VARS="AUTH_SERVICE_HOST AUTH_SERVICE_PORT \
               USER_SERVICE_HOST USER_SERVICE_PORT \
               FARM_SERVICE_HOST FARM_SERVICE_PORT"
```

Soit **6 variables** obligatoires (hôte + port pour chacun des trois services
routés). Le conteneur refuse de démarrer si l'une d'elles est vide.

La substitution opérée par `envsubst` porte explicitement sur ces 6 variables :

```sh
envsubst '${AUTH_SERVICE_HOST} ${AUTH_SERVICE_PORT} \
          ${USER_SERVICE_HOST} ${USER_SERVICE_PORT} \
          ${FARM_SERVICE_HOST} ${FARM_SERVICE_PORT}' \
    < "$TEMPLATE_PATH" > "$OUTPUT_PATH"
```

### Variables injectées mais non substituées

La section `gateway` de `infra/docker/docker-compose.yml` injecte également :

- `RECOMMENDATION_SERVICE_HOST` (défaut `recommendation-service`)
- `RECOMMENDATION_SERVICE_PORT` (défaut `3004`)

Ces deux variables **ne sont pas** reprises dans `REQUIRED_VARS` ni dans la
liste de substitution de `envsubst`, et le template ne les référence pas.
Elles sont réservées à une route future vers le recommendation-service. Elles
n'ont aucun effet sur la configuration Nginx générée.

### Valeurs par défaut dans le compose

| Variable | Défaut (`docker-compose.yml`) |
| --- | --- |
| `AUTH_SERVICE_HOST` | `auth-service` |
| `AUTH_SERVICE_PORT` | `3001` |
| `USER_SERVICE_HOST` | `user-service` |
| `USER_SERVICE_PORT` | `3002` |
| `FARM_SERVICE_HOST` | `farm-service` |
| `FARM_SERVICE_PORT` | `3003` |

---

## Rate limiting

Deux zones de limitation de débit sont définies au niveau du bloc `http` :

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/s;
```

| Zone | Taux | Burst | Routes concernées |
| --- | --- | --- | --- |
| `api_limit` | 30 requêtes/s | 20 (`nodelay`) | `/api/v1/farms`, `/api/v1/parcels`, `/api/v1/sensors` |
| `auth_limit` | 10 requêtes/s | 20 (`nodelay`) | `/api/v1/auth/` |

Les deux zones sont effectivement appliquées sur leurs routes respectives via la
directive `limit_req zone=... burst=20 nodelay;`. La clé de limitation est
`$binary_remote_addr` (l'adresse IP du client), ce qui rend le plafond
indépendant pour chaque client.

`auth_limit` est plus stricte que `api_limit` : les endpoints d'authentification
(login, OTP, refresh) sont sensibles et exposés au brute-force ; un plafond de
10 requêtes/s par client réduit la surface d'attaque. La limite `api_limit` des
routes métier (farm/parcels/sensors) est plus permissive pour ne pas pénaliser
les usages légitimes.

---

## Sécurité

### En-têtes OWASP

Les en-têtes suivants sont ajoutés au niveau du `server`, avec le suffixe
`always` pour garantir leur présence y compris sur les réponses d'erreur :

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

Signification :

- `X-Frame-Options: SAMEORIGIN` empêche l'intégration de la page dans un
  `iframe` tiers (protection clickjacking).
- `X-Content-Type-Options: nosniff` interdit au navigateur de deviner le type
  MIME.
- `X-XSS-Protection` active le filtre XSS hérité des navigateurs legacy.
- `Referrer-Policy` limite la fuite d'URL via l'en-tête `Referer`.
- `Permissions-Policy` désactive les API sensibles du navigateur
  (géolocalisation, micro, caméra).

### Journalisation JSON

Un format de log structuré `gateway_json` est défini et appliqué aux access
logs :

```nginx
log_format gateway_json escape=json '{ ... }';
access_log /var/log/nginx/access.log gateway_json;
error_log /var/log/nginx/error.log warn;
```

Les champs journalisés incluent l'horodatage ISO 8601, l'adresse distante, la
requête, le code HTTP, la taille du corps, les temps de réponse amont et
global, etc. Ce format est directement ingéré par les pipelines
d'observabilité.

### Resolver DNS

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
resolver_timeout 5s;
```

`127.0.0.11` est l'adresse du resolver DNS interne fixe de Docker, présente
dans tout conteneur. Elle permet à Nginx de résoudre dynamiquement les noms de
services (`auth-service`, `farm-service`…) au moment du `proxy_pass`, ce qui
garantit le fonctionnement en cas de mise à l'échelle ou de redémarrage des
services amont. Le TTL est forcé à 10 secondes (`valid=10s`).

### Taille du corps

```nginx
client_max_body_size 10M;
```

Les requêtes entrantes sont limitées à 10 Mo. Les uploads dépassant cette
taille reçoivent une erreur `413 Request Entity Too Large`.

### Timeouts proxy

```nginx
proxy_connect_timeout 30s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
```

Ces valeurs protègent le gateway contre les services amont lents ou
indisponibles.

---

## Healthchecks internes

Le template définit deux locations marquées `internal`, donc inaccessibles
depuis l'extérieur mais utilisables depuis la configuration Nginx elle-même
(healthchecks composés, checks amont) :

```nginx
location /_internal/check_auth {
    internal;
    set $auth_upstream http://${AUTH_SERVICE_HOST}:${AUTH_SERVICE_PORT};
    proxy_pass $auth_upstream/health;
    proxy_method HEAD;
}

location /_internal/check_user {
    internal;
    set $user_upstream http://${USER_SERVICE_HOST}:${USER_SERVICE_PORT};
    proxy_pass $user_upstream/api/v1/health/live;
    proxy_method HEAD;
}
```

Ces locations sondent respectivement le `auth-service` (`/health`) et le
`user-service` (`/api/v1/health/live`) en méthode `HEAD`.

L'endpoint public `/health` est servi directement par le gateway et renvoie un
JSON sans déléguer vers un service amont :

```nginx
location /health {
    default_type application/json;
    return 200 '{"status":"ok","service":"alkatra-gateway","timestamp":"$time_iso8601"}';
}
```

Dans le compose, le healthcheck Docker du conteneur `gateway` interroge cet
endpoint :

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
```

---

## Ajouter une route

Pour exposer un nouveau service via le gateway, suivre les étapes suivantes.

### 1. Éditer le template `nginx.conf.template`

Ajouter un nouveau bloc `location` dans le `server`. Pour un service
`reco-service` exposé sur `/api/v1/recommendations/` :

```nginx
location ~ ^/api/v1/recommendations(?:/.*)?$ {
    set $reco_upstream http://${RECO_SERVICE_HOST}:${RECO_SERVICE_PORT};
    proxy_pass $reco_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    limit_req zone=api_limit burst=20 nodelay;
}
```

Pour un préfixe simple (sans regex), préférer une location littérale
(`location /api/v1/reco/ { ... }`).

### 2. Mettre à jour `entrypoint.sh`

Ajouter les nouvelles variables dans les deux endroits :

- La liste `REQUIRED_VARS` (si la variable est obligatoire).
- La liste des variables passées à `envsubst`.

```sh
REQUIRED_VARS="... RECO_SERVICE_HOST RECO_SERVICE_PORT"

envsubst '${...} ${RECO_SERVICE_HOST} ${RECO_SERVICE_PORT}' \
    < "$TEMPLATE_PATH" > "$OUTPUT_PATH"
```

Si une variable doit rester optionnelle (valeur par défaut côté compose),
ne pas l'ajouter à `REQUIRED_VARS` mais bien à la commande `envsubst`.

### 3. Mettre à jour `infra/docker/docker-compose.yml`

Dans la section `environment` du service `gateway`, exposer les variables :

```yaml
environment:
  RECO_SERVICE_HOST: ${RECO_SERVICE_HOST:-reco-service}
  RECO_SERVICE_PORT: ${RECO_SERVICE_PORT:-3004}
```

### 4. Tester

Reconstruire l'image du gateway et vérifier :

```bash
docker compose -f infra/docker/docker-compose.yml --profile phase1 build gateway
docker compose -f infra/docker/docker-compose.yml --profile phase1 up -d gateway
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/recommendations/
```

La validation `nginx -t` exécutée par l'entrypoint échoue bruyamment en cas de
syntaxe incorrecte, ce qui évite un démarrage silencieux d'une configuration
cassée.

---

## Configuration Docker Compose

La section `gateway` de `infra/docker/docker-compose.yml` :

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
    FARM_SERVICE_HOST: ${FARM_SERVICE_HOST:-farm-service}
    FARM_SERVICE_PORT: ${FARM_SERVICE_PORT:-3003}
    RECOMMENDATION_SERVICE_HOST: ${RECOMMENDATION_SERVICE_HOST:-recommendation-service}
    RECOMMENDATION_SERVICE_PORT: ${RECOMMENDATION_SERVICE_PORT:-3004}
  depends_on:
    auth-service:
      condition: service_healthy
    user-service:
      condition: service_healthy
    farm-service:
      condition: service_healthy
    recommendation-service:
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

Points clés :

- Le gateway appartient au profil `phase1` ; il démarre avec
  `npm run docker:up-phase1` (ou `docker compose --profile phase1 up`).
- Le port `8080` est mappé sur l'hôte.
- Les services amont (`auth-service`, `user-service`, `farm-service`,
  `recommendation-service`) doivent être sains avant le démarrage du gateway
  (`depends_on` avec `condition: service_healthy`).
- Le réseau partagé est `alkatra-net`, indispensable pour la résolution DNS
  des noms de services.
- Le healthcheck Docker interroge `/health` toutes les 30 secondes.
