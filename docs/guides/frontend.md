# Frontend — Documentation technique

## Table des matières

1. [Rôle du frontend](#1-rôle-du-frontend)
2. [Architecture et flux](#2-architecture-et-flux)
3. [Arborescence complète](#3-arborescence-complète)
4. [Démarrage](#4-démarrage)
5. [Configuration et variables d'environnement](#5-configuration-et-variables-denvironnement)
6. [Stack technique](#6-stack-technique)
7. [Design System](#7-design-system)
8. [Écran Login (détail)](#8-écran-login-détail)
9. [Flux d'authentification (login flow)](#9-flux-dauthentification-login-flow)
10. [Couche API](#10-couche-api)
11. [Tests](#11-tests)
12. [Build et déploiement](#12-build-et-déploiement)
13. [Conventions pour étendre le frontend](#13-conventions-pour-étendre-le-frontend)
14. [Résumé opérationnel](#14-résumé-opérationnel)

---

## 1. Rôle du frontend

Le frontend est l'application web React + Vite + TypeScript de la plateforme Al Katra Bel Qatra. Il s'agit du point d'entrée destiné au fermier final. À ce stade, le frontend expose un seul écran : l'écran de connexion par numéro de téléphone (`LoginScreen`), qui permet la saisie d'un numéro marocain, sa validation et la demande d'un code OTP auprès du service `auth-service`.

Le package se nomme `alkatra-frontend` (`private: true`, `version: 0.1.0`, `type: module`). Il est intégré au monorepo : le `package.json` racine déclare `"workspaces": ["apps/*", "packages/*", "frontend/*"]`.

Le frontend ne possède pas de routing : `App.tsx` rend `<LoginScreen>` de façon inconditionnelle. L'état est local aux composants (pas de store global). Les textes sont codés en dur en français.

---

## 2. Architecture et flux

### Flux principal

```
Utilisateur
   ↓
React (Vite)  →  main.tsx  →  App.tsx
   ↓
<LoginScreen />   (rendu unique, inconditionnel — pas de routing)
   ↓
Composants (Brand, Input, Button, ErrorMessage, LoadingSpinner)
   ↓
Hook local (usePhoneNumber)   (état local au composant)
   ↓
Couche API (src/api/client.ts, src/api/auth.api.ts)
   ↓
auth-service (POST /api/v1/auth/register) — appel direct, sans gateway
```

### Communication frontend / backend

Le frontend appelle **directement** le service `auth-service` (`http://localhost:3001/api/v1`), sans transiter par la gateway Nginx. La base URL est configurable via la variable `VITE_API_BASE_URL`, avec une valeur codée en dur en secours (`http://localhost:3001/api/v1`). Le service `auth-service` autorise les requêtes cross-origin (CORS permissif : `origin: true, credentials: true`), ce qui rend l'appel direct fonctionnel sans configuration CORS supplémentaire côté frontend.

L'écran `LoginScreen` ne déclenche aucun appel API au chargement de la page : il ne contient pas de `useEffect`. L'appel réseau se produit uniquement au clic sur le bouton « Envoyer OTP ». Le frontend est donc entièrement visualisable sans backend démarré.

### Architecture des dépendances

```
LoginScreen (screens/)
   ├─ utilise → usePhoneNumber (hooks/)         → état local du champ téléphone
   ├─ rend    → Brand, Input, Button, ErrorMessage (components/)
   └─ appelle → authApi.requestOtp() (api/)      → httpClient (Axios) → auth-service
```

- **Screens** : `LoginScreen` détient l'état du formulaire (`status`, `error`, `successNotice`) via `useState` local.
- **Components** : purement présentationnels, pilotés par props, aucun ne déclenche d'appel réseau.
- **Hooks** : `usePhoneNumber` centralise le formatage, la normalisation et la validation du numéro.
- **API** : `src/api/client.ts` exporte une instance Axios unique (`httpClient`) ; `src/api/auth.api.ts` expose `authApi.requestOtp()`.
- **Types** : `RequestOtpPayload`, `RequestOtpResponse` (auth.types.ts) et `ApiErrorResponse` (api.types.ts).

---

## 3. Arborescence complète

### `frontend/` (racine)

```
frontend/
├── index.html                        HTML racine (lang="fr", titre, Google Fonts Inter)
├── package.json                      Manifeste du package "alkatra-frontend"
├── package-lock.json                 Lockfile npm
├── tsconfig.json                     Config TypeScript racine (référence tsconfig.app/node)
├── tsconfig.app.json                 Config TypeScript pour src/
├── tsconfig.node.json                Config TypeScript pour la config Vite (non détaillé)
├── tsconfig.tsbuildinfo              Artefact de build local (non suivi git)
├── vite.config.ts                    Config Vite + Vitest
├── eslint.config.js                  Config ESLint flat moderne
├── setupTests.ts                     Setup Vitest (jest-dom)
├── .env.example                      Modèle de variables d'environnement
├── .gitignore                        Ignorés : logs, node_modules, dist, dist-ssr, *.local, .vscode/*, .idea, .DS_Store, etc.
├── README.md                         Template Vite par défaut (non personnalisé pour Al Katra)
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── images/
│       └── login-hero.jpg            Image hero du Login (3.5 Mo), référencée dans LoginScreen.module.css
└── src/
    └── ...                           (voir ci-dessous)
```

### `src/` (tous les fichiers suivis par git)

```
src/
├── main.tsx                          Bootstrap React (StrictMode, createRoot), import tokens.css + global.css
├── App.tsx                           Rend <LoginScreen> inconditionnellement, callback onOtpRequested = console.info
├── App.css                           (résidu template Vite, non importé)
├── index.css                         (résidu template Vite, non importé)
├── styles/
│   ├── tokens.css                    Design tokens (CSS custom properties)
│   └── global.css                    Reset minimal + styles globaux
├── types/
│   ├── auth.types.ts                 RequestOtpPayload, RequestOtpResponse
│   └── api.types.ts                  ApiErrorResponse
├── api/
│   ├── client.ts                     httpClient (instance Axios)
│   └── auth.api.ts                   authApi.requestOtp()
├── hooks/
│   └── usePhoneNumber.ts             Hook de gestion/formatage/validation du téléphone
├── assets/                           (résidus template Vite)
│   ├── hero.png                      (non utilisé — l'image active est dans public/images/)
│   ├── react.svg
│   └── vite.svg
├── components/
│   ├── ui/
│   │   ├── Button/                   Button.tsx, Button.module.css, Button.test.tsx
│   │   ├── Input/                    Input.tsx, Input.module.css
│   │   ├── LoadingSpinner/           LoadingSpinner.tsx, LoadingSpinner.module.css
│   │   └── ErrorMessage/             ErrorMessage.tsx, ErrorMessage.module.css
│   └── auth/
│       └── Brand/                    Brand.tsx, Brand.module.css
└── screens/
    └── auth/
        └── LoginScreen/              LoginScreen.tsx, LoginScreen.module.css, LoginScreen.test.tsx
```

### Rôle de chaque dossier

| Dossier | Rôle |
|---|---|
| `src/styles/` | Design tokens (custom properties CSS) et reset minimal |
| `src/types/` | Contrats TypeScript des payloads/réponses API |
| `src/api/` | Couche HTTP — instance Axios + fonctions d'appel par domaine |
| `src/hooks/` | Logique réutilisable avec état local |
| `src/components/ui/` | Composants génériques réutilisables, sans logique métier |
| `src/components/auth/` | Composants spécifiques au flux d'authentification |
| `src/screens/auth/LoginScreen/` | Écran complet — assemble composants, hook et API |

---

## 4. Démarrage

### Prérequis

- **Node.js** : aucune contrainte déclarée dans `package.json` (pas de champ `engines`), mais Vite 5 requiert Node.js 18+ (Node 20 LTS ou plus récent recommandé).
- **npm** : fourni avec Node.
- **Git** : pour récupérer le code.

### Installation

```bash
cd frontend
npm install
```

La commande crée un dossier `node_modules/` dans `frontend/`. Le package est intégré au monorepo via `"workspaces": ["apps/*", "packages/*", "frontend/*"]` dans le `package.json` racine ; l'installation peut donc être lancée soit dans `frontend/`, soit à la racine via npm workspaces.

### Configuration

```bash
cp .env.example .env
```

Contenu de `.env.example` :

```bash
# auth-service is called directly (see guide §18) instead of through the gateway.
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

Cette variable n'est pas obligatoire pour visualiser le Login Screen : une valeur de secours est codée en dur dans `src/api/client.ts`. La copier rend la configuration explicite.

### Lancer le serveur de développement

```bash
npm run dev
```

Le serveur démarre sur le port par défaut de Vite (`vite.config.ts` ne redéfinit pas `server.port`) :

```
http://localhost:5173
```

### Visualiser sans backend

L'écran `LoginScreen` se rend intégralement sans backend démarré : aucun `useEffect`, aucun appel réseau au chargement. Le backend `auth-service` (port `3001`) n'est nécessaire que pour tester le clic sur « Envoyer OTP » jusqu'au bout ; sans backend, ce clic produit l'écran d'erreur « Impossible d'envoyer le code. Réessayez. », ce qui est le comportement attendu.

---

## 5. Configuration et variables d'environnement

### Variables Vite

| Variable | Obligatoire ? | Exemple (`.env.example`) | Utilisation |
|---|---|---|---|
| `VITE_API_BASE_URL` | Non — valeur de secours codée en dur dans `client.ts` | `VITE_API_BASE_URL=http://localhost:3001/api/v1` | Base URL de tous les appels Axios (`httpClient`) |

Aucun secret n'est stocké côté frontend.

### Configuration TypeScript (tsconfig split)

La configuration TypeScript est répartie en trois fichiers :

**`tsconfig.json`** (racine) — options principales :

| Option | Valeur |
|---|---|
| `target` | `ES2020` |
| `useDefineForClassFields` | `true` |
| `lib` | `["ES2020", "DOM", "DOM.Iterable"]` |
| `module` | `ESNext` |
| `moduleResolution` | `bundler` |
| `resolveJsonModule` | `true` |
| `isolatedModules` | `true` |
| `skipLibCheck` | `true` |
| `noEmit` | `true` |
| `jsx` | `react-jsx` |
| `strict` | `true` |
| `noUnusedLocals` | `true` |
| `noUnusedParameters` | `true` |
| `noFallthroughCasesInSwitch` | `true` |
| `types` | `["vite/client", "vitest/globals", "@testing-library/jest-dom"]` |
| `include` | `["src", "setupTests.ts"]` |

**`tsconfig.app.json`** (pour `src/`) — variantes notables :

| Option | Valeur | Note |
|---|---|---|
| `target` | `es2023` | Cible plus récente |
| `lib` | `["ES2023", "DOM"]` | — |
| `types` | `["vite/client", "vitest/globals", "@testing-library/jest-dom"]` | Inclut `vite/client` → rend `import.meta.env` typé |
| `allowArbitraryExtensions` | `true` | Permet d'importer `*.module.css` |
| `allowImportingTsExtensions` | `true` | — |
| `verbatimModuleSyntax` | `true` | — |
| `moduleDetection` | `force` | — |
| `erasableSyntaxOnly` | `true` | — |
| `include` | `["src"]` | — |

La combinaison de `allowArbitraryExtensions: true` et de `types: ["vite/client"]` permet d'importer les CSS Modules (`*.module.css`) et d'utiliser `import.meta.env` sans qu'un fichier `vite-env.d.ts` séparé soit nécessaire.

**`tsconfig.node.json`** — configuration utilisée pour `vite.config.ts` (non détaillée ici).

### Configuration ESLint

Le fichier `eslint.config.js` définit une configuration ESLint flat moderne :

- Imports : `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `typescript-eslint`, `eslint/config`.
- `globalIgnores(['dist'])`.
- Règles appliquées sur `**/*.{ts,tsx}` : `js.configs.recommended` + `tseslint.configs.recommended` + `reactHooks.configs.flat.recommended` + `reactRefresh.configs.vite`.
- `languageOptions.globals = globals.browser`.

Aucun script `lint` n'est défini dans `package.json` ; la configuration est en place, seul le script npm manque.

### Configuration Vitest

`vite.config.ts` contient le bloc `test` :

```ts
test: {
  environment: 'jsdom',
  setupFiles: './setupTests.ts',
  globals: true,
}
```

Le fichier `setupTests.ts` se limite à :

```ts
import '@testing-library/jest-dom/vitest';
```

L'option `globals: true` expose `describe`, `expect`, `it`, `vi` sans import explicite.

---

## 6. Stack technique

Versions déclarées dans `frontend/package.json` (plages `^`) :

### Dépendances runtime

| Technologie | Version déclarée | Utilisation |
|---|---|---|
| react | `^18.3.1` | Rendu de l'UI |
| react-dom | `^18.3.1` | Rendu dans le DOM |
| axios | `^1.7.7` | Client HTTP (`src/api/client.ts`) |

### Dépendances dev

| Technologie | Version déclarée | Utilisation |
|---|---|---|
| typescript | `^5.6.3` | Typage statique, `tsc -b` avant build |
| vite | `^5.4.9` | Dev server + bundler |
| @vitejs/plugin-react | `^4.3.2` | Support JSX / Fast Refresh pour Vite |
| vitest | `^2.1.3` | Test runner |
| @testing-library/react | `^16.0.1` | Tests de composants |
| @testing-library/jest-dom | `^6.5.0` | Matchers jest-dom pour Vitest |
| @types/react | `^18.3.11` | Types React |
| @types/react-dom | `^18.3.1` | Types React DOM |
| jsdom | `^25.0.1` | Environnement DOM simulé pour les tests |

### Choix d'architecture notables

- Le frontend n'utilise pas de store global ; l'état est local aux composants via `useState`.
- Le frontend ne possède pas de routing ; `App.tsx` rend `LoginScreen` inconditionnellement.
- Les textes sont codés en dur en français (pas de couche i18n).
- Le frontend n'est pas une PWA : pas de manifest, pas de service worker, pas de `vite-plugin-pwa`.
- La couche Axios ne définit pas d'interceptors (pas de gestion de token JWT côté frontend).

---

## 7. Design System

Toutes les valeurs sont extraites de `src/styles/tokens.css`. Aucune valeur n'est inventée.

### Couleurs (tokens)

| Token | Valeur hex | Usage |
|---|---|---|
| `--color-primary-500` | `#1B4332` | Titre, bordure input « filled », fond bouton actif |
| `--color-accent-500` | `#94C857` | Lien « Réessayez. », lien « Sign up » |
| `--color-error-500` | `#D32F2F` | Bordure input erreur, texte d'erreur |
| `--color-neutral-black` | `#000000` | Texte du corps, préfixe « +212 » |
| `--color-neutral-white` | `#FFFFFF` | Fond de la carte, texte du bouton actif |
| `--color-neutral-grey` | `#6B7280` | Bordure input par défaut, placeholder |
| `--color-neutral-grey-light` | `#DDE5E1` | Fond du bouton désactivé |

### Typographie (tokens)

| Token | Valeur | Usage |
|---|---|---|
| `--font-family-base` | `'Inter', system-ui, -apple-system, sans-serif` | Police globale (chargée via Google Fonts dans `index.html`) |
| `--font-size-title` | `24px` / `--font-weight-title: 500` | Titre |
| `--font-size-subtitle` | `12px` / `--font-weight-subtitle: 400` | Sous-titre |
| `--font-size-label` | `16px` / `--font-weight-label: 500` | Label |
| `--font-size-body` | `16px` / `--font-weight-body: 400` | Texte du corps |
| `--font-size-button` | `16px` / `--font-weight-button: 600` | Texte du bouton |
| `--font-size-error` | `13px` | Message d'erreur |
| `--font-size-footer` | `14px` | Texte du pied de page |

> Note : les tailles `body`, `button`, `error` et `footer` sont des choix du développeur, déduits du contexte du design ; elles sont appliquées de façon cohérente dans les composants.

### Spacing et radius (tokens)

| Token | Valeur |
|---|---|
| `--radius-card` | `32px` |
| `--radius-input` | `12px` |
| `--radius-button` | `12px` |
| `--spacing-xs` | `4px` |
| `--spacing-sm` | `8px` |
| `--spacing-md` | `16px` |
| `--spacing-lg` | `24px` |
| `--spacing-xl` | `32px` |

### Composants UI disponibles

| Composant | Fichier | Rôle | Props principales | État interne |
|---|---|---|---|---|
| `Button` | `components/ui/Button/Button.tsx` | Bouton générique avec état chargement | `children`, `loading?`, `disabled?`, + props HTML natives (Omit `children`) | Aucun |
| `Input` | `components/ui/Input/Input.tsx` | Champ contrôlé générique, `forwardRef` | `label?`, `state?` (`'default'\|'filled'\|'error'`), `prefix?`, `errorMessage?`, + `InputHTMLAttributes` (Omit `prefix`) | Aucun |
| `LoadingSpinner` | `components/ui/LoadingSpinner/LoadingSpinner.tsx` | Spinner décoratif (`role="status"`) | `label?` | Aucun |
| `ErrorMessage` | `components/ui/ErrorMessage/ErrorMessage.tsx` | Message d'erreur avec action optionnelle | `id?`, `message`, `actionLabel?`, `onAction?` | Aucun |
| `Brand` | `components/auth/Brand/Brand.tsx` | Titre + sous-titre fixes | *(aucune)* | Aucun |

**Comportements clés :**

- `Button` : `type` par défaut `'button'` ; `disabled || loading` désactive le bouton HTML et pose `aria-busy` ; en `loading`, rend `<LoadingSpinner label="Envoi en cours">` au lieu des children.
- `Input` : `state='error'` pose `aria-invalid` et `aria-describedby` pointant vers `${inputId}-error`. Composant contrôlé (pas d'état interne).

### Conventions pour étendre le design system

1. Ne jamais écrire de couleur, taille ou espacement en dur. Toujours consommer une variable CSS définie dans `src/styles/tokens.css` (ex. `color: var(--color-primary-500);`).
2. Si une nouvelle valeur est nécessaire, l'ajouter dans `tokens.css` avec un nom cohérent (`--color-*`, `--font-size-*`, `--spacing-*`, `--radius-*`).
3. Utiliser des CSS Modules (`NomDuComposant.module.css`), pas de style inline ni de CSS global hors `styles/global.css`.
4. Placer un composant générique sous `components/ui/`, un composant métier sous `components/<domaine>/`.

---

## 8. Écran Login (détail)

### Objectif

Permettre au fermier de saisir un numéro de téléphone marocain et de déclencher l'envoi d'un code OTP via `auth-service`.

### Structure rendue

```
div.page
├── div.hero (role="presentation")
├── main.card
│   ├── Brand
│   └── form.form (noValidate)
│       ├── Input (label "Numéro de téléphone", prefix "+212", placeholder "6XX XX XX XX", type tel, inputMode numeric, autoComplete tel-national)
│       ├── Button ("Envoyer OTP", type submit)
│       ├── ErrorMessage (conditionnel si error)
│       └── p.success (conditionnel si successNotice, role="status")
└── footer.footer
    └── p "Don't have an account ? Sign up" (bouton SignUp statique, onClick TODO)
```

### Composants utilisés

| Composant | Rôle dans l'écran |
|---|---|
| `Brand` | Affiche le titre et le sous-titre |
| `Input` | Champ téléphone avec préfixe `+212` |
| `Button` | Bouton « Envoyer OTP », type `submit` |
| `ErrorMessage` | Affiché conditionnellement quand `error` est défini |
| `LoadingSpinner` | Rendu par `Button` pendant `submitting` |

### Gestion du numéro de téléphone (hook usePhoneNumber)

Le hook `src/hooks/usePhoneNumber.ts` centralise toute la logique :

- Constantes : `COUNTRY_CODE = '+212'`, `LOCAL_DIGITS_LENGTH = 9`.
- Regex : `MOROCCAN_PHONE_REGEX = /^\+212[67]\d{8}$/` (miroir exact du backend `auth-service` dans `LoginDto` / `VerifyOtpDto`).
- `formatLocalDigits(digits)` : regroupement `3-2-2-2`, ex. `617 50 36 77`.
- `setFromInput(raw)` : `raw.replace(/\D/g, '').slice(0, 9)` (extrait les chiffres, tronque à 9).
- Valeurs de retour :
  - `digits` : chiffres locaux bruts (max 9 caractères).
  - `formattedValue` : chiffres formatés pour l'affichage.
  - `fullPhone` : valeur E.164 reconstruite (`+212` + digits), envoyée au backend.
  - `isEmpty` : vrai si `digits.length === 0`.
  - `isValid` : résultat du test de la regex sur `fullPhone`.
  - `countryCode` : `+212`.
  - `setFromInput(raw)` : alimente l'état depuis la saisie utilisateur.

### États UI

Le composant `LoginScreen` gère trois états locaux :

- `status: 'idle' | 'submitting' | 'success'`
- `error: { type: 'validation' | 'api'; message; actionLabel? } | null`
- `successNotice: string | null`

L'`inputState` est dérivé : `'error'` si `error?.type === 'validation'`, sinon `'default'` si vide, sinon `'filled'`.

| État | Composant | Déclencheur | Rendu |
|---|---|---|---|
| `default` | Input | `phone.isEmpty === true` | Bordure grise |
| `filled` | Input | Champ non vide, pas d'erreur | Bordure verte |
| `error` | Input | `error?.type === 'validation'` | Bordure rouge, `aria-invalid` |
| `disabled` (Input) | Input | `status === 'submitting'` | Champ désactivé |
| `disabled` (Button) | Button | `phone.isEmpty === true` | Fond gris |
| `loading` (Button) | Button | `status === 'submitting'` | Spinner blanc, `aria-busy`, clics bloqués |
| `focus` | Input, Button, liens | `:focus-visible` | Contour visible |

Le bouton est désactivé uniquement si le champ est vide (`disabled={phone.isEmpty}`), pas si le numéro est invalide : la validation se déclenche au clic sur « Envoyer OTP », pas pendant la saisie. Il n'y a pas d'état `hover` explicite sur l'Input.

Comportement des handlers :

- `submit()` : reset erreurs → si `!phone.isValid` → erreur validation → return ; sinon `status='submitting'` → `authApi.requestOtp({ phone: phone.fullPhone })` → `status='success'` + successNotice (« Code envoyé. Il expire à HH:mm. ») + callback `onOtpRequested` ; en `catch` → `status='idle'` + `console.error` (erreur brute loguée, pas affichée) + `error.message = "Impossible d'envoyer le code. "` + `actionLabel="Réessayez."`.
- `handleSubmit` : `preventDefault`, bloque si vide ou `submitting`.
- `handlePhoneChange` : `setFromInput` + reset erreur/notice.

### Image hero

La zone hero est stylée par `.hero` dans `LoginScreen.module.css` :

```css
.hero {
  height: 220px;
  background-color: #d9e4d9; /* fallback */
  background-image:
    linear-gradient(180deg, rgba(27, 67, 50, 0.1), rgba(27, 67, 50, 0.55)),
    url('/images/login-hero.jpg');
  background-size: cover;
  background-position: center;
}
```

L'image est câblée sur le fichier `public/images/login-hero.jpg` (3.5 Mo) via `url('/images/login-hero.jpg')`. Un dégradé vertical est superposé pour assurer la lisibilité. La hauteur reste fixée à `220px` à toutes les tailles d'écran ; seule la largeur du conteneur change avec le responsive.

### Responsive

- Stratégie mobile-first.
- Une seule media query de layout : `@media (min-width: 640px)` dans `LoginScreen.module.css` — `.page` centre son contenu, `.hero`/`.card`/`.footer` sont contraints à `max-width: 480px`.
- Une media query d'accessibilité : `@media (prefers-reduced-motion: reduce)` dans `LoadingSpinner.module.css` coupe l'animation.
- Pas de media query dédiée à 375px/390px ; le layout est fluide.
- Pas de position `absolute`/`fixed` pour la mise en page : tout repose sur `flex` + `margin` négatif (chevauchement carte/hero via `margin-top: -32px`).

---

## 9. Flux d'authentification (login flow)

```
Utilisateur saisit le numéro (onChange → usePhoneNumber.setFromInput)
       ↓
Clic "Envoyer OTP" (handleSubmit, si champ non vide et pas en submitting)
       ↓
Validation client (regex /^\+212[67]\d{8}$/)
       ↓ invalide                                ↓ valide
Erreur "Numéro de téléphone invalid."      status = 'submitting' (bouton → spinner, champ désactivé)
(aucune requête envoyée)                          ↓
                                          authApi.requestOtp({ phone })
                                                 ↓
                                    POST /auth/register  (auth-service, port 3001)
                                                 ↓ succès                   ↓ échec
                            status='success' + successNotice     status='idle'
                            onOtpRequested?.(phone, expiresAt)   "Impossible d'envoyer le code. Réessayez."
                            (callback — aucune navigation,       (message fixe, jamais l'erreur brute)
                             App.tsx fait un console.info)
```

### Détails du flux

| Aspect | Valeur |
|---|---|
| Fonction appelée | `authApi.requestOtp()` |
| Méthode HTTP | `POST` |
| Endpoint | `/auth/register` (concaténé à la `baseURL`) |
| Payload | `{ phone: string }` (E.164, ex. `+212617503677`) |
| Réponse attendue | `{ success: true, message: string, expiresAt: string (ISO) }` |
| Gestion d'erreur | Toute exception (réseau, 4xx, 5xx) est interceptée dans `submit()` ; l'erreur brute est loguée en `console.error`, jamais affichée ; le message fixe est affiché à la place |
| Navigation après succès | Aucune navigation réelle — message inline + callback `onOtpRequested(phone, expiresAt)` (par défaut, `App.tsx` fait `console.info`) |
| État de chargement | `status === 'submitting'` — champ désactivé, bouton en spinner, ré-entrance bloquée dans `handleSubmit` |

### Seam de navigation future

La prop `onOtpRequested` de `LoginScreen` constitue le point d'extension pour une future navigation vers un écran OTP. `App.tsx` contient un commentaire TODO indiquant qu'un futur routeur pourrait naviguer vers `/otp` avec `{ phone, expiresAt }` en state.

---

## 10. Couche API

### httpClient (Axios)

Définition dans `src/api/client.ts` :

```ts
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1';
export const httpClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});
```

- Base URL : `import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1'` (la variable n'est pas obligatoire).
- Timeout : `15000` ms.
- Headers par défaut : `Content-Type: application/json`.
- Aucun interceptor (ni requête ni réponse) — cohérent avec l'absence de gestion de token JWT côté frontend.

### authApi

Définition dans `src/api/auth.api.ts` :

```ts
export const authApi = {
  requestOtp: async (payload: RequestOtpPayload): Promise<RequestOtpResponse> => {
    const { data } = await httpClient.post('/auth/register', payload);
    return data;
  },
};
```

`authApi.requestOtp()` est la seule fonction API existante.

### Types associés

`src/types/auth.types.ts` :

- `RequestOtpPayload { phone: string }` — doit matcher `/^\+212[67]\d{8}$/`.
- `RequestOtpResponse { success: true; message: string; expiresAt: string }`.

`src/types/api.types.ts` :

- `ApiErrorResponse { statusCode: number; message: string | string[]; error: string }` — format d'erreur NestJS (ValidationPipe / HttpException), pas affiché à l'utilisateur (réservé au logging futur).

### Gestion des erreurs

La gestion s'effectue au niveau de l'appelant (`LoginScreen.tsx`), pas dans la couche API. La fonction `authApi.requestOtp()` ne transforme pas les erreurs : elle laisse l'exception Axios remonter telle quelle. `LoginScreen` détecte les erreurs Axios via `isAxiosError<ApiErrorResponse>`, logge le contenu en `console.error`, et affiche un message fixe à la place de l'erreur brute.

---

## 11. Tests

### Fichiers de test

**`src/components/ui/Button/Button.test.tsx`** — 3 tests :

1. Rendu et clic quand le bouton est activé.
2. Pas de clic quand le bouton est désactivé.
3. Spinner affiché et clics bloqués en `loading`.

Le fichier importe explicitement `describe`, `expect`, `it`, `vi` depuis `vitest` (redondant avec `globals: true`, mais fonctionnel).

**`src/screens/auth/LoginScreen/LoginScreen.test.tsx`** — 5 tests :

1. Bouton désactivé si le champ est vide.
2. Bouton activé dès le premier chiffre saisi.
3. Erreur de validation sur numéro incomplet, sans appel API.
4. Appel `authApi.requestOtp` avec le numéro au format E.164 sur une entrée valide.
5. Message d'erreur retryable affiché, sans fuite de l'erreur brute.

Le fichier mocke `authApi` via `vi.mock` et utilise `@testing-library/react` (`render`, `fireEvent`, `waitFor`).

### Couverture actuelle

| Fichier | Nombre de tests |
|---|---|
| `Button.test.tsx` | 3 |
| `LoginScreen.test.tsx` | 5 |
| **Total** | **8 tests dans 2 fichiers** |

### Commandes

```bash
npm run test          # vitest run (exécution unique)
npm run test:watch    # vitest (mode watch)
```

---

## 12. Build et déploiement

### Build de production

```bash
npm run build
```

Commande réelle : `tsc -b && vite build`. Le `tsc -b` effectue la vérification de types (projet référencé via les trois `tsconfig*.json`), puis `vite build` produit le bundle dans `dist/`.

Le répertoire `dist/` est ignoré par git (`.gitignore`) et nettoyé à chaque build.

Aperçu du bundle de production :

```bash
npm run preview       # vite preview
```

Le script `preview` sert le contenu de `dist/` via un serveur statique local.

### Fichiers résiduels du template Vite

Plusieurs fichiers hérités du template Vite sont présents dans `src/` mais ne sont pas utilisés :

| Fichier | Statut |
|---|---|
| `src/App.css` | Non importé dans `main.tsx` ni `App.tsx` |
| `src/index.css` | Non importé |
| `src/assets/react.svg` | Icône template |
| `src/assets/vite.svg` | Icône template |
| `src/assets/hero.png` | Non référencé dans le code (l'image active est `public/images/login-hero.jpg`) |
| `README.md` | Template Vite par défaut (non personnalisé pour Al Katra) |

---

## 13. Conventions pour étendre le frontend

### Ajouter un nouvel écran

Suivre le patron de `LoginScreen` :

```
src/screens/<domaine>/<NomEcran>/<NomEcran>.tsx      (+ .module.css, + .test.tsx)
```

L'écran assemble des composants (`components/ui/` et `components/<domaine>/`), un ou plusieurs hooks, et appelle les fonctions API de `src/api/`.

### Ajouter un composant

- Composant générique (sans logique métier) : `src/components/ui/<Nom>/` avec `<Nom>.tsx`, `<Nom>.module.css`, et `<Nom>.test.tsx` si pertinent.
- Composant métier : `src/components/<domaine>/<Nom>/`.
- Toujours consommer les tokens via `var(--token)`, jamais de valeur en dur.
- Préférer les CSS Modules à un style inline.

### Ajouter une fonction API

Suivre le patron de `auth.api.ts` :

```ts
// src/api/<domaine>.api.ts
import { httpClient } from './client';
import type { ... } from '../types/<domaine>.types';

export const domainApi = {
  action: async (payload): Promise<Response> => {
    const { data } = await httpClient.post('/endpoint', payload);
    return data;
  },
};
```

Définir les types associés dans `src/types/<domaine>.types.ts` sur le modèle de `auth.types.ts` et `api.types.ts`.

### Ce qui reste à éviter sans coordination

- Modifier les primitives existantes de `src/components/ui/*` (Button, Input, ErrorMessage, LoadingSpinner) sans vérifier l'impact sur `LoginScreen`.
- Modifier une valeur existante de `src/styles/tokens.css` (cela change l'apparence de tous les consommateurs).
- Modifier `src/hooks/usePhoneNumber.ts` : sa regex doit rester synchronisée avec le backend (`auth-service`).

---

## 14. Résumé opérationnel

### Commandes essentielles

| Action | Commande | Résultat |
|---|---|---|
| Installer les dépendances | `npm install` | Crée `node_modules/` dans `frontend/` |
| Copier l'environnement | `cp .env.example .env` | Variable `VITE_API_BASE_URL` (optionnelle) |
| Lancer le dev | `npm run dev` | Serveur sur `http://localhost:5173` |
| Build de production | `npm run build` | `tsc -b && vite build` → `dist/` |
| Prévisualiser le build | `npm run preview` | Sert `dist/` |
| Lancer les tests | `npm run test` | `vitest run` (8 tests, 2 fichiers) |
| Tests en watch | `npm run test:watch` | `vitest` (mode watch) |

### Démarrage rapide

```bash
git pull
cd frontend
npm install
npm run dev
```

Puis ouvrir `http://localhost:5173`. Le backend n'est pas nécessaire pour visualiser le Login Screen ; il ne devient utile qu'au moment de tester l'envoi effectif d'un OTP.

### Particularités à retenir

- Le frontend n'a pas de routing (`App.tsx` rend `LoginScreen` inconditionnellement).
- Le frontend n'utilise pas de store global (état 100 % local via `useState` dans `LoginScreen`).
- Les textes sont codés en dur en français (pas d'i18n).
- Pas de PWA (pas de manifest, pas de service worker, pas de `vite-plugin-pwa`).
- Pas d'interceptors Axios (pas de gestion de token JWT côté frontend).
- Le frontend appelle `auth-service` directement (pas via la gateway Nginx).
- Aucun appel API au chargement de la page → le frontend est visualisable sans backend.
