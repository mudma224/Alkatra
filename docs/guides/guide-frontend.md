# Al Katra Bel Qatra — Frontend Quick Start

Guide opérationnel uniquement. Pour le détail technique complet, voir [`current-frontend.md`](./current-frontend.md).

## Prérequis

- Node.js 18+ (recommandé : 20 LTS ou plus récent — non imposé par `package.json`, mais requis par Vite 5)
- npm (fourni avec Node)
- Git

## Installation

```bash
git pull
cd frontend
npm install
```

⚠️ `npm install` doit être exécuté **dans `frontend/`**, pas à la racine du repo — c'est un package npm autonome à ce stade.

## Configuration

```bash
cp .env.example .env
```

`.env.example` contient une seule variable :

```bash
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

Cette variable est **optionnelle** : une valeur de secours identique est déjà codée en dur dans `src/api/client.ts`.

> ⚠️ **Toujours pointer vers la gateway (port 8080)**, jamais directement vers un service (ex. `http://localhost:3001` = auth-service seul : le Login/OTP fonctionnerait, mais toutes les autres routes — fermes, parcelles… — renverraient 404). Attention : une variable d'environnement exportée dans le shell **écrase** la valeur du fichier `.env`.

## Commande de lancement

```bash
npm run dev
```

## URL

```
http://localhost:5173
```

(Port par défaut de Vite — non redéfini dans `vite.config.ts`.)

## Routes actuellement disponibles

Ouvrir `http://localhost:5173/login`. La route racine redirige vers `/farms` si une session existe, sinon vers `/login`.

Routes publiques : `/login`, `/otp`.

Routes authentifiées : `/farms`, `/farms/new`, `/farms/:farmId`, `/farms/:farmId/edit`, `/farms/:farmId/parcels/new`, `/farms/:farmId/parcels/:parcelId`, `/farms/:farmId/parcels/:parcelId/edit`, `/farms/:farmId/parcels/:parcelId/sensors`, `/farms/:farmId/parcels/:parcelId/recommendation`, `/farms/:farmId/parcels/:parcelId/recommendation/:recommendationId/feedback`, `/recommendations`, `/profile` et `/profile/edit`.

Le parcours de connexion demande un numéro via `POST /api/v1/auth/register`, vérifie l'OTP via `POST /api/v1/auth/verify-otp`, puis persiste la session Zustand sous la clé `alkatra-auth`. Les requêtes authentifiées utilisent le bearer token courant et renouvellent la session via `POST /api/v1/auth/refresh` après un `401`.


