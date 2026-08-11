# Al Katra Bel Qatra — DEV2 Frontend Quick Start

Guide opérationnel uniquement. Pour le détail technique complet, voir [`frontend.md`](./frontend.md).

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
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

Cette variable est **optionnelle** : une valeur de secours identique est déjà codée en dur dans `src/api/client.ts`. Copier le fichier reste recommandé pour la clarté.

## Commande de lancement

```bash
npm run dev
```

## URL

```
http://localhost:5173
```

(Port par défaut de Vite — non redéfini dans `vite.config.ts`.)

## Login Screen

Ouvrir directement `http://localhost:5173/` — il n'y a qu'un seul écran, aucun routing n'est configuré, donc cette URL suffit.

Ce que vous devez voir :
- Titre "Al katra bel qatra"
- Champ "Numéro de téléphone" avec préfixe "+212"
- Bouton "Envoyer OTP" (grisé tant que le champ est vide)


