# Frontend — Documentation de l'état actuel

> Cette documentation reflète **uniquement** l'état réel du code frontend (`frontend/`, branches `dev1-frontend` + `dev2-p1-s4` mergées). Chaque affirmation est vérifiable dans le code source : fichiers, fonctions, endpoints, configuration et scripts. Elle ne décrit aucune fonctionnalité future, prévue ou supposée.

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Structure du projet](#3-structure-du-projet)
4. [Point d'entrée de l'application](#4-point-dentrée-de-lapplication)
5. [Routing](#5-routing)
6. [Écrans](#6-écrans)
7. [Composants](#7-composants)
8. [Hooks](#8-hooks)
9. [État global : auth store](#9-état-global-auth-store)
10. [Authentification et session](#10-authentification-et-session)
11. [Couche API et contrats](#11-couche-api-et-contrats)
12. [Types principaux](#12-types-principaux)
13. [Validations](#13-validations)
14. [Erreurs et états de chargement](#14-erreurs-et-états-de-chargement)
15. [Styles et design tokens](#15-styles-et-design-tokens)
16. [i18n](#16-i18n)
17. [Variables d'environnement](#17-variables-denvironnement)
18. [Tests](#18-tests)
19. [Scripts npm et CI](#19-scripts-npm-et-ci)
20. [Build et déploiement](#20-build-et-déploiement)
21. [Flux utilisateur (chemin complet)](#21-flux-utilisateur-chemin-complet)
22. [Limites et points de vigilance](#22-limites-et-points-de-vigilance)

---

## 1. Vue d'ensemble

Le frontend est une application monopage **React 18 + TypeScript** buildée avec **Vite**. C'est un package npm nommé `alkatra-frontend` (`private: true`, `version 0.1.0`, `type: module`), intégré au monorepo Al Katra Bel Qatra via `"workspaces": ["apps/*", "packages/*", "frontend/*"]` du `package.json` racine.

Périmètre réellement implémenté :

- **Authentification par numéro de téléphone + OTP** : `/login` demande un code (`POST /api/v1/auth/register`), `/otp` le vérifie (`POST /api/v1/auth/verify-otp`), avec renvoi de code (cooldown 30 s) et compte à rebours d'expiration.
- **Session persistée** : un store Zustand (`useAuthStore`) persiste tokens et utilisateur dans `localStorage` (clé `alkatra-auth`).
- **Espace authentifié** : routes protégées par `RequireAuth`, rendues dans un layout commun (`AppLayout` : `Header` + contenu + `Navigation`).
- **Fermes (CRUD complet)** : liste avec recherche (`/farms`), création (`/farms/new`), détail (`/farms/:farmId`), édition (`/farms/:farmId/edit`), suppression avec confirmation.
- **Parcelles (CRUD complet)** : liste intégrée au détail de ferme, création (`/farms/:farmId/parcels/new`), détail (`/farms/:farmId/parcels/:parcelId`), édition (`…/edit`), suppression avec confirmation.
- **Capteurs** : association (modale de saisie de `deviceId`), liste inline (≤ 3) ou page dédiée avec recherche + filtres (`/farms/:farmId/parcels/:parcelId/sensors`), dissociation avec confirmation, statut dérivé Actif / En attente / Inactif.
- **Profil** : consultation (`/profile`, re-fetch du profil via `GET /api/v1/user/profile`) et édition (`/profile/edit`, `PATCH /api/v1/user/profile`).
- **Recommandations** : `/recommendations` affiche la liste des parcelles éligibles et `/farms/:farmId/parcels/:parcelId/recommendation` affiche la recommandation du jour ; le feedback est accessible sous `/farms/:farmId/parcels/:parcelId/recommendation/:recommendationId/feedback`.

Toutes les requêtes HTTP sont émises vers l'API Gateway Nginx sur `http://localhost:8080/api/v1` (variable `VITE_API_BASE_URL`), qui route `/api/v1/auth/*` vers l'`auth-service`, `/api/v1/user/*` vers l'`user-service`, et `/api/v1/farms|parcels|sensors` vers le `farm-service` (config Nginx `infra/nginx/nginx.conf.template`).

L'architecture suit une séparation simple des responsabilités :

- **Écrans** (`src/screens/`): orchestrent le flux d'interaction et l'état local du formulaire.
- **Composants** (`src/components/`): présentation pilotée par props, aucun appel réseau.
- **Hooks** (`src/hooks/`): logique réutilisable (téléphone, accès auth).
- **Store** (`src/store/`) : état de session global.
- **API** (`src/api/`) : client Axios et wrappers d'endpoints par domaine.
- **Types** (`src/types/`) : contrats typés alignés sur le backend.

## 2. Stack technique

Versions déclarées dans `frontend/package.json`.

| Usage | Bibliothèque | Version |
|---|---|---|
| UI | `react` / `react-dom` | `^18.3.1` |
| Routing | `react-router-dom` | `^7.18.2` |
| État global | `zustand` (+ middleware `persist`) | `^5.0.14` |
| i18n | `i18next` + `react-i18next` | `^23.16.8` / `^15.7.4` |
| HTTP | `axios` | `^1.7.7` |
| Icônes | `lucide-react` | `^1.31.0` |
| Build | `vite` + `@vitejs/plugin-react` | `^5.4.9` / `^4.3.2` |
| Langage | `typescript` | `^5.6.3` |
| Tests | `vitest` + `jsdom` | `^2.1.3` / `^25.0.1` |
| Tests UI | `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | `^16.0.1` / `^14.6.4` / `^6.5.0` |
| Lint | `eslint` + `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | `^9.11.1` / `^8.7.0` / `^5.2.0` / `^0.4.12` |

Pas de `vite-plugin-pwa`, pas de `React.lazy`/`Suspense` (aucun découpage de routes), aucun module CSS global autre que `src/styles/`.

## 3. Structure du projet

Arborescence complète de `frontend/` (hors `node_modules/` et `dist/` qui est le résultat du build) :

```text
frontend/
├── .env / .env.example        VITE_API_BASE_URL=http://localhost:8080/api/v1
├── DockerFile                 Build multi-stage (node:20-alpine → nginx:alpine)
├── eslint.config.js           ESLint 9 flat config (TS, react-hooks, react-refresh)
├── index.html                 Conteneur #root, police Inter (Google Fonts), lang="fr"
├── package.json               Scripts npm et dépendances
├── setupTests.ts              Setup vitest : jest-dom + import de l'i18n
├── tsconfig.json              Config TS commune (strict)
├── tsconfig.app.json          Config TS pour src/ (bundler, es2023)
├── tsconfig.node.json         Config TS pour vite.config.ts
├── vite.config.ts             Plugin React + config Vitest (jsdom, setupTests)
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── images/
│       └── login-hero.jpg     Image du hero du LoginScreen
└── src/
    ├── App.tsx                          <RouterProvider router={router} />
    ├── main.tsx                         createRoot + import i18n, tokens.css, global.css
    ├── api/
    │   ├── client.ts                    httpClient Axios (baseURL, timeout) + interceptors
    │   ├── auth.api.ts                  authApi : register (OTP), verify-otp, refresh
    │   ├── farm.api.ts                  farmApi : list, get, create, update, remove
    │   ├── parcel.api.ts                parcelApi + sensorApi (CRUD parcelles, capteurs)
    │   └── user.api.ts                  userApi : getProfile, updateProfile
    ├── components/
    │   ├── auth/
    │   │   └── Brand/                   Marquage de marque (titre + sous-titre)
    │   ├── farm/
    │   │   ├── FarmCard/                Card résumé ferme (nom, région, badge surface) (+ test)
    │   │   └── FarmForm/                Formulaire ferme partagé création/édition
    │   ├── layout/
    │   │   ├── Header/                  Header (titre + bouton « Déconnexion »)
    │   │   ├── Layout/                  AppLayout (Header + <Outlet/> + Navigation)
    │   │   └── Navigation/              Lien « Fermes » (NavLink)
    │   ├── parcel/
    │   │   ├── AssociateSensorDialog/   Modale d'association capteur (deviceId)
    │   │   ├── ParcelCard/              Card résumé parcelle + pill compteur capteurs (+ test)
    │   │   ├── ParcelForm/              Formulaire parcelle partagé création/édition
    │   │   ├── SensorListItem/          Ligne capteur (deviceId, Dissocier, pill, batterie, vu il y a)
    │   │   ├── SensorSection/           Bloc capteurs du détail parcelle (inline ≤ 3 / compact + lien) (+ test)
    │   │   └── SensorStatusPill/        Pill Actif / En attente / Inactif
    │   ├── profile/
    │   │   ├── Avatar/                  Cercle initiales ou icône utilisateur
    │   │   └── ProfileIdentity/         Avatar + nom + numéro de téléphone
    │   └── ui/
    │       ├── Button/                  Bouton design system (+ test)
    │       ├── Card/                    Carte générique (+ test)
    │       ├── ConfirmDialog/           Modale de confirmation générique (annulation Échap, busy) (+ test)
    │       ├── EmptyState/              État vide de liste (+ test)
    │       ├── ErrorMessage/            Message d'erreur (role="alert", action de réessai)
    │       ├── Input/                   Champ de formulaire (+ test)
    │       ├── LoadingSpinner/          Spinner (role="status")
    │       ├── OTPInput/                Saisie OTP à 6 cases (coller/revenir/clavier)
    │       ├── PlaceholderScreen/       Composant générique encore utilisé uniquement par les vues explicitement temporaires
    │       ├── Select/                  Liste déroulante (native <select>)
    │       └── Skeleton/                Bloc squelette animé (états loading)
    ├── hooks/
    │   ├── useAuth.ts                   Accès pratique au store d'authentification
    │   ├── useFarms.ts                  useFarms, useFarm, useCreateFarm, useUpdateFarm, useDeleteFarm
    │   ├── useParcels.ts                useParcels, useParcel, mutations parcelles + capteurs
    │   └── usePhoneNumber.ts            Saisie, formatage, validation téléphone marocain
    ├── i18n/
    │   ├── index.ts                     Initialisation i18next (fr, ar, darija, défaut fr)
    │   ├── fr.json / ar.json / darija.json
    ├── router/
    │   ├── index.tsx                    createBrowserRouter + OtpRoute + DefaultRoute
    │   └── RequireAuth.tsx              Garde de route authentifiée (+ test)
    ├── screens/
    │   ├── auth/
    │   │   ├── LoginScreen/             Saisie du téléphone + demande d'OTP (+ test)
    │   │   └── OTPScreen/               Saisie et vérification de l'OTP (+ test)
    │   ├── farm/
    │   │   ├── FarmCreateScreen/        Création de ferme (+ test)
    │   │   ├── FarmDetailScreen/        Détail ferme + section Parcelles (+ test)
    │   │   ├── FarmEditScreen/          Édition de ferme (+ test)
    │   │   └── FarmListScreen/          Liste + recherche (+ test)
    │   ├── parcel/
    │   │   ├── ParcelCreateScreen/      Création de parcelle (+ test)
    │   │   ├── ParcelDetailScreen/      Détail parcelle + capteurs + suppression (+ test)
    │   │   ├── ParcelEditScreen/        Édition de parcelle (+ test)
    │   │   └── SensorListScreen/        Liste dédiée capteurs (recherche + filtres) (+ test)
    │   └── profile/
    │       ├── EditProfileScreen/       Édition nom + langue
    │       └── ProfileScreen/           Consulter le profil (+ ProfileMenuItem)
    ├── store/
    │   └── auth.store.ts                Zustand + persist, clé « alkatra-auth » (+ test)
    ├── styles/
    │   ├── global.css                   box-sizing, hauteur #root, police de base
    │   └── tokens.css                   Design tokens (couleurs, typo, radius, spacing…)
    ├── types/
    │   ├── api.types.ts                 ApiErrorResponse (corps d'erreur NestJS)
    │   ├── auth.types.ts                Payloads OTP, AuthUser, AuthResult, refresh
    │   ├── farm.types.ts                Farm, CreateFarmPayload, UpdateFarmPayload, GeoJsonPoint
    │   ├── parcel.types.ts              Parcel, Sensor, enums + labels FR, statut capteur dérivé
    │   ├── ui.types.ts                  Variantes/taille Button, états/variantes Input
    │   └── user.types.ts                UpdateProfilePayload
    └── utils/
        ├── apiError.ts                  getApiErrorMessage (message string | string[] du backend)
        ├── format.ts                    formatAreaHa, formatDateFr, normalizeSearch, formatRegionLabel, formatLastSeen
        └── phone.ts                     Normalisation, formatage, validation téléphone
```

## 4. Point d'entrée de l'application

- `index.html` : conteneur `<div id="root">`, `<html lang="fr">`, titre « Al Katra Bel Qatra », charge la police Inter (Google Fonts).
- `src/main.tsx` : importe `./i18n`, `styles/tokens.css` et `styles/global.css`, puis monte `<App />` dans `<StrictMode>` via `createRoot`.
- `src/App.tsx` : rend `<RouterProvider router={router} />` — le routage est porté par `react-router-dom`.

La configuration Vite (`vite.config.ts`) définit également la config Vitest : environnement `jsdom`, fichier de setup `setupTests.ts` (`@testing-library/jest-dom/vitest` + import de l'i18n), `globals: true`.

## 5. Routing

Fichier `src/router/index.tsx` — `createBrowserRouter`. Toutes les routes :

| Route | Élément rendu | Protection |
| --- | --- | --- |
| `/login` | `LoginScreen` | Publique |
| `/otp` | `OtpRoute` → `OTPScreen` | État de navigation `{ phone, expiresAt }` requis |
| `/farms` | `FarmListScreen` | `RequireAuth` + `AppLayout` |
| `/farms/new` | `FarmCreateScreen` | `RequireAuth` + `AppLayout` |
| `/farms/:farmId` | `FarmDetailScreen` (détail + section Parcelles) | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/edit` | `FarmEditScreen` | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/parcels/new` | `ParcelCreateScreen` | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/parcels/:parcelId` | `ParcelDetailScreen` | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/parcels/:parcelId/edit` | `ParcelEditScreen` | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/parcels/:parcelId/sensors` | `SensorListScreen` (recherche + filtres) | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/parcels/:parcelId/recommendation` | `RecommendationScreen` | `RequireAuth` + `AppLayout` |
| `/farms/:farmId/parcels/:parcelId/recommendation/:recommendationId/feedback` | `FeedbackScreen` | `RequireAuth` + `AppLayout` |
| `/recommendations` | `RecommendationOverviewScreen` | `RequireAuth` + `AppLayout` |
| `/profile` | `ProfileScreen` | `RequireAuth` + `AppLayout` |
| `/profile/edit` | `EditProfileScreen` | `RequireAuth` + `AppLayout` |
| `*` | `DefaultRoute` — redirection | `/farms` si `isAuthenticated()`, sinon `/login` |

> Les segments statiques (`new`, `edit`, `sensors`, `recommendation`) sont déclarés avant les segments dynamiques (`:farmId`, `:parcelId`) pour ne pas être capturés par eux.

Éléments du fichier de routes :

- **`OtpRoute`** (exporté pour les tests de câblage) : lit `location.state` (`phone`, `expiresAt`). Si l'un manque → `<Navigate to="/login" replace />`. Fournit à `OTPScreen` un `onVerified` qui appelle `useAuthStore.getState().setAuth(response)` puis `navigate('/farms', { replace: true })` (le bouton « Retour » du navigateur ne revient alors pas sur `/otp`). `onBack` ramène à `/login` avec `replace`.
- **`DefaultRoute`** : redirige selon `useAuthStore((s) => s.isAuthenticated())`.
- **`RequireAuth`** (`src/router/RequireAuth.tsx`) : si `isAuthenticated()` est faux → `<Navigate to="/login" replace state={{ from: location }} />` (l'URL tentée est mémorisée dans `state.from`, sans exploitation plus loin dans le code) ; sinon rend `<Outlet />`.

## 6. Écrans

### LoginScreen (`src/screens/auth/LoginScreen/`)

Écran de connexion. Responsabilités réelles :

- saisie du numéro via `Input` préfixé par `+212`, formaté `6XX XX XX XX` (`inputMode="numeric"`, `autoComplete="tel-national"`, état visuel `default` / `filled` selon la saisie) ;
- état local du formulaire (`idle` / `submitting` / `success`), message de succès (« Code envoyé. Il expire à HH:mm. ») et erreur typée `validation` ou `api` ;
- le bouton « Envoyer OTP » est désactivé tant que le champ est vide ; pendant l'envoi, spinner affiché et champs désactivés ;
- validation client : `usePhoneNumber().isValid` (regex `^\+212[67]\d{8}$`) ; si invalide → « Numéro de téléphone invalid. » sans appel API ;
- si valide → `authApi.requestOtp({ phone: fullPhone })` puis `navigate('/otp', { state: { phone, expiresAt } })` ;
- erreur API → message générique « Impossible d'envoyer le code. » + action « Réessayez. » (relance la soumission) ; l'erreur brute ne part qu'en `console.error`.

Le hero utilise `public/images/login-hero.jpg` (`LoginScreen.module.css`, `url('/images/login-hero.jpg')`, hauteur 337 px mobile / 260 px ≥ 640 px, carte blanche en chevauchement `margin-top: -170px`).

### OTPScreen (`src/screens/auth/OTPScreen/`, props `phone`, `expiresAt`, `onVerified?`, `onBack?`)

Vérification du code à 6 chiffres :

- compte à rebours calculé depuis `expiresAt` (serveur) en `MM:SS`, mis à jour chaque seconde ; OTP considéré expiré quand le compteur atteint 0 ;
- **renvoi** : cooldown local 30 s (`RESEND_COOLDOWN_SECONDS`), `authApi.requestOtp({ phone })`, nouvelle `expiresAt`, champ OTP vidé, bouton désactivé avec « Renvoyer dans Ns » ;
- **vérification** : `authApi.verifyOtp({ phone, otp })` puis `onVerified(response)` (le routeur parent gère store + navigation) ;
- messages : format invalide → « Veuillez saisir les 6 chiffres du code OTP. » ; expiré → « Code OTP expiré. Veuillez demander un nouveau code. » ; HTTP 401 → « Code OTP invalide ou expiré. » ; autre erreur → « Impossible de vérifier le code. Réessayez. » ; échec de renvoi → « Impossible de renvoyer le code. Réessayez. » ;
- lien « Modifier le numéro de téléphone » (`onBack`) visible uniquement si `onBack` est fourni.

### FarmListScreen (`src/screens/farm/FarmListScreen/`, route `/farms`)

- `useFarms()` (états `loading` / `error` / `success`) + recherche locale `query` sur nom + région via `normalizeSearch` (insensible casse/diacritiques) ;
- `loading` → squelettes `Skeleton` (recherche, bouton, cards) ; `error` → `EmptyState` « Oups ! » + Réessayer (`refetch`) ; vide → `EmptyState` « Aucune ferme » + CTA « Créer ma première ferme » ;
- peuplé : `Input variant="search"` (clear), `Button` « Créer une ferme », liste de `FarmCard` (clic → `/farms/:id`) ; aucun résultat de recherche → `EmptyState` « Aucune ferme trouvée ».

### FarmCreateScreen / FarmEditScreen (`src/screens/farm/`)

- Partagent `FarmForm` (initial values vides ou pré-remplies) ; validation au blur puis en direct, bouton Enregistrer désactivé si invalide, virgule décimale acceptée (`parseDecimal`) ;
- erreurs exactes : « Le nom de la ferme est obligatoire. », « La surface doit être supérieure à 0. » ; erreur serveur (ex. 409) affichée sous Enregistrer ;
- création → `POST /farms` puis `navigate('/farms', { replace: true })` ; édition → `PATCH /farms/:id` puis retour au détail (`replace`).

### FarmDetailScreen (`src/screens/farm/FarmDetailScreen/`, route `/farms/:farmId`)

- `useFarm(farmId)` + `useDeleteFarm()` ; Info Card (Région / Surface totale `formatAreaHa` / Créée le `formatDateFr`), boutons Modifier (→ `/edit`) et Supprimer (→ `ConfirmDialog`) ;
- suppression : `DELETE /farms/:id` ; 409 backend (parcelles restantes) affiché **dans la modale** qui reste ouverte ; succès → `/farms` (`replace`) ;
- **section Parcelles** (Phase 4) via `useParcels(farmId)` : squelettes / erreur + Réessayer / vide + CTA « Ajouter une parcelle » / liste de `ParcelCard` + bouton « Ajouter une parcelle ».

### ParcelCreateScreen / ParcelEditScreen (`src/screens/parcel/`)

- Partagent `ParcelForm` ; création : 5 champs requis (nom, surface, culture, type de sol, méthode d'irrigation — 3 `Select` sur les enums backend) ; édition : + 4 champs optionnels (variété, débit m³/h, âge arbres, densité) ;
- erreurs exactes de la maquette (« Le nom de la parcelle est obligatoire. », « La surface doit être supérieure à 0. », etc.) ; **erreur 422 de dépassement de surface** du backend affichée sous Enregistrer ;
- création → `POST /parcels` (payload CreateParcelDto exact) puis retour au détail de ferme (`replace`) ; édition → `PATCH /parcels/:id` puis retour au détail.

### ParcelDetailScreen (`src/screens/parcel/ParcelDetailScreen/`, route `/farms/:farmId/parcels/:parcelId`)

- `useParcel(parcelId)` (relations `farm` + `sensors` incluses) ; titre + sous-titre nom de ferme, Info Card 5 lignes (Culture / Surface / Type de sol / Irrigation / Créée le — labels FR des enums) ;
- CTA primary « Voir la recommandation du jour » → route de recommandation de la parcelle ;
- `SensorSection` (voir §7) ; boutons Modifier / Supprimer (ConfirmDialog : « Les capteurs associés seront supprimés. » — cascade SQL) ; succès suppression → retour à la ferme (`replace`).

### SensorListScreen (`src/screens/parcel/SensorListScreen/`, route `/farms/:farmId/parcels/:parcelId/sensors`)

- Sous-titre « <parcelle> · N capteurs » ; recherche par deviceId (`normalizeSearch`) + chips de filtre **Tous / Actifs / Non actifs** ; tri : actifs d'abord puis en attente puis inactifs, deviceId alphabétique à statut égal (`sensorFilters.ts`) ;
- cards `SensorListItem` (Dissocier → ConfirmDialog), bouton « Associer un capteur » → `AssociateSensorDialog` ; états : squelettes, erreur + Réessayer, « Aucun capteur », « Aucun capteur trouvé » ;
- chaque mutation réussie déclenche `refetch()` du `useParcel`.

### ProfileScreen (`src/screens/profile/ProfileScreen/`)

- au montage, recharge toujours le profil (`userApi.getProfile()`) puis écrit le résultat dans le store via `updateUser` — aucune copie locale du profil ;
- états : `loading` (spinner « Chargement du profil »), `error` (« Impossible de charger votre profil. » + « Réessayez. » → relance le fetch) ; si `user` reste absent après succès, même rendu que l'erreur ;
- affiche `ProfileIdentity` (avatar, nom ou « Utilisateur », téléphone) et un menu : « Editeur mon profil » → `/profile/edit`, « Consulter mes fermes » → `/farms`, « Notifications » (ligne `disabled`, aucune route n'existe) ; bouton retour `navigate(-1)`.

### EditProfileScreen (`src/screens/profile/EditProfileScreen/`)

- lit `user` depuis le store (pas de GET supplémentaire : la page précédente l'a déjà chargé) ; si `user` est `null` → `<Navigate to="/profile" replace />` ;
- formulaire : `name` (max 100 caractères) + langue parmi Français / Arabe / Darija (valeurs `french` / `arabic` / `darija`, alignées sur `UpdateProfileDto`) ;
- envoi : `userApi.updateProfile({ name: <trim, ou `undefined` si vide>, preferredLanguage })`, puis `updateUser(updated)` et `navigate('/profile', { replace: true })` ;
- erreur : « Impossible d'enregistrer les modifications. Réessayez. » ; le téléphone n'est pas éditable.

### PlaceholderScreen (`src/components/ui/PlaceholderScreen/`)

Rendu temporaire pour les routes métier non implémentées, instancié uniquement par `router/index.tsx` (titre / description / phase → « À implémenter en Phase N »).

## 7. Composants

Tous les composants sont colocalisés avec leur CSS module (`<Nom>.module.css`) ; aucun ne fait d'appel réseau.

### `components/ui/` — design system

- **`Button`** (`types/ui.types.ts`) : variant obligatoire `primary` | `secondary` | `outline` | `ghost` | `destructive` | `link` ; tailles `sm` (36 px) / `md` (48 px) ; props `loading` (spinner + blocage), `block` (pleine largeur, `data-block`), `iconLeft`/`iconRight` (icônes lucide en composition) ; `disabled` neutralise le curseur et passe en gris (`--color-neutral-200`).
- **`Input`** (forwardRef) : variantes `text` (label, `prefix` optionnel — ex. « +212 ») et `search` (loupe + bouton clear via `onClear`) ; états `default` / `filled` / `error` (`aria-invalid`, `aria-describedby` vers le message d'erreur) ; composant contrôlé.
- **`Select`** : `<select>` natif contrôlé, props `label`, `options`, `placeholder` (option cachée désactivée), `state`, `errorMessage`, chevron lucide.
- **`OTPInput`** : 6 cases de 1 caractère (`aria-label` « Chiffre N du code OTP »), focus automatique vers la case suivante, retour arrière, collage (paste) de plusieurs chiffres, filtre des non-chiffres, état `error`/`disabled`.
- **`ErrorMessage`** : `<p role="alert">` avec `message` et action optionnelle (`actionLabel`/`onAction`, ex. « Réessayez. »).
- **`LoadingSpinner`** : `<span role="status">` avec `label` (par défaut « Chargement »).
- **`EmptyState`** : icône lucide optionnelle + titre + description + action (CTA), `role="status"`.
- **`ConfirmDialog`** : modale de confirmation générique (overlay, `role="dialog"`, Échap, focus initial, verrouillage `busy`, `errorMessage` métier `role="alert"`).
- **`Skeleton`** : bloc gris animé (`aria-hidden`), dimensionné par le CSS du consommateur.
- **`PlaceholderScreen`** : titre / description / phase (voir §6).

### `components/farm/`

- **`FarmCard`** : card cliquable (nom 18/600, région avec élision via `formatRegionLabel` ou « Région non renseignée », badge pill surface `formatAreaHa`, chevron).
- **`FarmForm`** : formulaire partagé création/édition — `Input` nom/surface/région, erreurs au blur puis en direct, payload `CreateFarmPayload` (`region: undefined` si vide).

### `components/parcel/`

- **`ParcelCard`** : card cliquable (nom, « Culture · Irrigation » en labels FR, badge surface, pill « ● Capteur » / « ● N capteurs » / « Sans capteur », chevron).
- **`ParcelForm`** : formulaire partagé création (5 champs requis) / édition (+ 4 optionnels) ; selects sur `CROP_TYPE_OPTIONS` / `SOIL_TYPE_OPTIONS` / `IRRIGATION_METHOD_OPTIONS`.
- **`SensorStatusPill`** : pill lisant directement `sensor.healthStatus` renvoyé par farm-service — ● Actif (vert) / ○ En attente (creux, jamais vu) / ● Désactivé (gris plein, silence > `SENSOR_INACTIVE_HOURS`, 2 h par défaut) / ● Défaillant (rouge, silence > `SENSOR_FAILING_HOURS`, 24 h par défaut — seuils configurables côté backend).
- **`SensorListItem`** : ligne complète (deviceId, lien « Dissocier » rouge, `SensorStatusPill`, « Batterie N % », « Vu il y a … » via `formatLastSeen`).
- **`SensorSection`** : bloc capteurs du détail — bouton « + Associer » au-dessus de la card ; ≤ 3 capteurs : liste complète avec Dissocier ; > 3 : card compacte (3 max) + lien « Voir tous les capteurs (N) › » ; modales d'association et de dissociation (messages rassurants : mesures conservées, réassociation possible).
- **`AssociateSensorDialog`** : modale de saisie du `deviceId` (placeholder `ex. ESP32-OL-001`), bouton Associer désactivé si vide, erreur 403 anti-vol affichée dans la modale, Échap/Annuler.

### `components/layout/`

- **`AppLayout`** (`Layout.tsx`) : `<Header />` + `<main><Outlet /></main>` + `<Navigation />`.
- **`Header`** : titre « Al katra bel qatra » et, si un utilisateur est connecté, bouton ghost `sm` « Déconnexion » → `useAuth().logout()` + `navigate('/login', { replace: true })`.
- **`Navigation`** : un seul `NavLink` « Fermes » → `/farms` (classe `active` quand la route est active).

### `components/profile/`

- **`Avatar`** : cercle `size` px (défaut 64) ; initiales extraites du nom (1re lettre + dernière, ex. « Aziz Ben Tazi » → « AT ») ou icône `User` quand `name` est `null`.
- **`ProfileIdentity`** : `Avatar` (100 px par défaut) + nom (`user.name ?? 'Utilisateur'`) + `user.phone`.

### `components/auth/`

- **`Brand`** : titre et sous-titre issus de l'i18n (`t('auth.brandTitle')`, `t('auth.brandSubtitle')`) — **seul** composant du code à consommer `useTranslation()`.

## 8. Hooks

- **`usePhoneNumber`** (`src/hooks/usePhoneNumber.ts`) : état local `digits` (9 chiffres max, non-chiffres filtrés). Expose `digits`, `formattedValue` (groupes `XXX XX XX XX`), `fullPhone` (`+212` + digits), `isEmpty`, `isValid`, `countryCode` (`+212`), `setFromInput`. S'appuie sur `utils/phone.ts`.
- **`useAuth`** (`src/hooks/useAuth.ts`) : surcouche du store, expose `{ accessToken, user, isAuthenticated, completeLogin, logout }`. Utilisé par le `Header` (`user`, `logout`).
- **`useFarms`** (`src/hooks/useFarms.ts`) : hooks maison (pas de react-query), même pattern partout — `LoadStatus` ('loading' | 'success' | 'error'), flag `cancelled` dans l'effet, `refetch` via compteur. `useFarms()` liste + refetch ; `useFarm(id)` détail ; `useCreateFarm` / `useUpdateFarm` → `Promise<boolean>` ; `useDeleteFarm` → expose en plus `error` (message backend via `getApiErrorMessage`, ex. 409 parcelles restantes).
- **`useParcels`** (`src/hooks/useParcels.ts`) : même pattern. `useParcels(farmId)`, `useParcel(parcelId)` ; `useCreateParcel` / `useUpdateParcel` / `useDeleteParcel` (message 422 de dépassement de surface exposé) ; `useAssociateSensor` (retourne le `Sensor` créé ou `null`) ; `useDissociateSensor` (`Promise<boolean>`).

`utils/phone.ts` : `COUNTRY_CODE='+212'`, `LOCAL_DIGITS_LENGTH=9`, `MOROCCAN_PHONE_REGEX=/^\+212[67]\d{8}$/`, `normalizePhoneDigits`, `formatLocalDigits`, `toMoroccanE164`, `isValidMoroccanPhone`, `displayPhoneLabel`.

`utils/format.ts` : `parseDecimal` (tolère la virgule), `formatAreaHa` (« 12.50 » → « 12.5 »), `formatDateFr`, `normalizeSearch` (NFD sans diacritiques), `formatRegionLabel` (élision « de/d' »), `formatLastSeen` (« Vu il y a 2 h », null si jamais vu).

`utils/apiError.ts` : `getApiErrorMessage(error, fallback)` — extrait `message` (string ou string[]) du corps `AllExceptionsFilter` d'une `AxiosError`, sinon fallback français.

## 9. État global : auth store

`src/store/auth.store.ts` — `create<AuthState>()(persist(..., persistOptions))` (Zustand 5, middleware `persist`).

État persisté (localStorage, clé `alkatra-auth`) :

- `phone: string | null`
- `accessToken: string | null`
- `refreshToken: string | null`
- `expiresAt: string | null` (ISO, calcul à partir de `expiresIn` secondes)
- `user: AuthUser | null`

Actions :

- `setAuth(payload: AuthResult)` : calcule `expiresAt = new Date(Date.now() + payload.expiresIn * 1000).toISOString()` et enregistre tokens, `phone` et `user`.
- `updateUser(user)` : remplace `user` et resynchronise `phone`.
- `clearAuth()` : remet tout à `null` (aucun appel backend — déconnexion strictement locale).
- `isAuthenticated()` : `true` seulement si `accessToken` et `expiresAt` existent **et** `expiresAt > now`.

Le `persist` utilise un `merge` personnalisé qui ne restaure que les champs de données et préserve **toujours** les fonctions du store (évite d'écraser les actions par des clés obsolètes de l'état persisté).

## 10. Authentification et session

- **Requête « demande d'OTP »** : `POST /api/v1/auth/register` avec `{ phone }` → `{ success, message, expiresAt }`. L'OTP n'est jamais saisi côté backend ici ; c'est le même endpoint pour la 1re demande et le renvoi.
- **Vérification** : `POST /api/v1/auth/verify-otp` avec `{ phone, otp }` → `VerifyOtpResponse` (tokens + utilisateur).
- **Persistance de session** : le résultat est stocké via `setAuth` dans le store `alkatra-auth` (localStorage). `isAuthenticated()` décide de l'accès aux routes protégées ; `RequireAuth` redirige vers `/login` sinon.
- **Refresh token** : à la réception d'un `401` sur une requête qui **n'est pas** un endpoint de connexion (`/auth/register`, `/auth/verify-otp`, `/auth/refresh`, `/auth/login`), l'intercepteur de réponse appelle `POST /api/v1/auth/refresh` avec `{ phone, refreshToken }`, met à jour le store (`setAuth`) et rejoue la requête originale avec le nouveau token. Le refresh est **single-flight** (les 401 concurrents partagent un même appel) ; en cas d'échec → `clearAuth()` + `router.navigate('/login')`. Le refresh utilise un `axios.post` brut (pas `httpClient`) pour ne pas repasser par l'intercepteur.
- **Déconnexion** : uniquement `clearAuth()` + navigation vers `/login` (le `Header`). Aucun appel réseau.

Tous les endpoints de profil (`/api/v1/user/*`) sont protégés côté backend par un `JwtAuthGuard` ; le frontend n'envoie que le `Authorization: Bearer <accessToken>` via l'intercepteur de requête.

## 11. Couche API et contrats

### `src/api/client.ts` — `httpClient`

Instance Axios partagée :

- `baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1'` ;
- `timeout: 15000` ; en-tête par défaut `Content-Type: application/json` ;
- **intercepteur de requête** : injecte `Authorization: Bearer <accessToken>` si le store en contient un ;
- **intercepteur de réponse** : voir §10 (refresh on 401).

### Wrappers d'API

`src/api/auth.api.ts` (`authApi`), `src/api/user.api.ts` (`userApi`), `src/api/farm.api.ts` (`farmApi`) et `src/api/parcel.api.ts` (`parcelApi` + `sensorApi`). Chaque fonction fait l'appel HTTP et retourne seulement le corps de la réponse ; la gestion d'erreur appartient à l'écran appelant.

| Fonction | Méthode / URL | Body | Réponse typée |
|---|---|---|---|
| `authApi.requestOtp` | `POST /auth/register` | `RequestOtpPayload { phone }` | `RequestOtpResponse { success: true; message; expiresAt }` |
| `authApi.verifyOtp` | `POST /auth/verify-otp` | `VerifyOtpPayload { phone; otp }` | `VerifyOtpResponse` (= `AuthResult`) |
| `authApi.refresh` | `POST /auth/refresh` | `RefreshTokenPayload { phone; refreshToken }` | `AuthResult` |
| `userApi.getProfile` | `GET /user/profile` | — | `AuthUser` |
| `userApi.updateProfile` | `PATCH /user/profile` | `UpdateProfilePayload { name?; preferredLanguage? }` | `AuthUser` |
| `farmApi.list` | `GET /farms` | — | `Farm[]` (relation `parcels`) |
| `farmApi.get` | `GET /farms/:id` | — | `Farm` |
| `farmApi.create` | `POST /farms` | `CreateFarmPayload` | `Farm` |
| `farmApi.update` | `PATCH /farms/:id` | `UpdateFarmPayload` | `Farm` |
| `farmApi.remove` | `DELETE /farms/:id` | — | `void` (409 si parcelles restantes) |
| `parcelApi.listByFarm` | `GET /parcels/farm/:farmId` | — | `Parcel[]` (relation `sensors`) |
| `parcelApi.get` | `GET /parcels/:id` | — | `Parcel` (relations `farm` + `sensors`) |
| `parcelApi.create` | `POST /parcels` | `CreateParcelPayload` | `Parcel` (422 si dépassement surface) |
| `parcelApi.update` | `PATCH /parcels/:id` | `UpdateParcelPayload` | `Parcel` |
| `parcelApi.remove` | `DELETE /parcels/:id` | — | `void` |
| `sensorApi.associate` | `POST /sensors/associate` | `AssociateSensorPayload { deviceId; parcelId }` | `Sensor` (idempotent, 403 anti-vol) |
| `sensorApi.listByParcel` | `GET /sensors/parcel/:parcelId` | — | `Sensor[]` |
| `sensorApi.dissociate` | `DELETE /sensors/:sensorId` | — | `void` (mesures MongoDB conservées) |

Base URL effective : `http://localhost:8080/api/v1` (Gateway Nginx) + préfixe des wrappers (ex. `POST http://localhost:8080/api/v1/auth/register`). Côté backends, les routes proviennent de `apps/auth-service/src/auth/auth.controller.ts` (`@Controller('api/v1/auth')`), `apps/user-service/src/user/user.controller.ts` (`@Controller('user')`) et `apps/farm-service/src/modules/*` (`@Controller('api/v1/farms' | 'api/v1/parcels' | 'api/v1/sensors')`).

Note : `authApi.refresh` est défini dans le wrapper mais **l'intercepteur** effectue lui-même le refresh via un `axios.post` brut (pour ne pas entrer dans son propre intercepteur) — il n'utilise donc pas `authApi.refresh`.

## 12. Types principaux

Définis dans `src/types/` ; ils reflètent les contrats backend (les commentaires des fichiers citent leur origine réside dans `auth-service` / `user-service`).

```ts
// auth.types.ts
interface RequestOtpPayload { phone: string }                       // ^\+212[67]\d{8}$
interface RequestOtpResponse { success: true; message: string; expiresAt: string }
interface VerifyOtpPayload { phone: string; otp: string }
type PreferredLanguage = 'french' | 'arabic' | 'darija';
interface AuthUser {
  id: string;
  phone: string;
  name: string | null;                 // nullable tant que profil incomplet
  preferredLanguage: PreferredLanguage;
  createdAt: string;
}
interface VerifyOtpResponse {           // = AuthResult
  accessToken: string;
  refreshToken: string;
  expiresIn: number;                    // secondes
  tokenType: string;
  user: AuthUser;
}
interface RefreshTokenPayload { phone: string; refreshToken: string }

```ts
// user.types.ts
interface UpdateProfilePayload { name?: string; preferredLanguage?: AuthUser['preferredLanguage'] }

// api.types.ts — corps d'erreur NestJS (ValidationPipe / HttpException)
interface ApiErrorResponse { statusCode: number; message: string | string[]; error: string }

// ui.types.ts
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'sm' | 'md';
type InputState = 'default' | 'filled' | 'error';
type InputVariant = 'text' | 'search';
```

```ts
// farm.types.ts — aligné sur farm.entity.ts + DTOs du farm-service
interface Farm {
  id: string;
  ownerId: string;
  name: string;
  totalAreaHa: number | string;     // DECIMAL(10,2) sérialisé en chaîne par TypeORM
  region: string | null;
  location: GeoJsonPoint | null;
  createdAt: string;
  updatedAt: string;
  parcels?: Parcel[];               // relation chargée par GET /farms(/:id)
}
interface CreateFarmPayload { name: string; totalAreaHa: number; region?: string }
interface UpdateFarmPayload { name?: string; totalAreaHa?: number; region?: string | null }

// parcel.types.ts — enums Postgres exactes + labels FR d'affichage
type CropType = 'olive' | 'citrus' | 'cereal' | 'vegetable' | 'other';
type SoilType = 'clay' | 'silt' | 'sandy' | 'calcareous' | 'mixed';
type IrrigationMethod = 'drip' | 'sprinkler' | 'gravity';
interface Parcel {
  id: string;
  farmId: string;
  name: string;
  areaHa: number | string;          // DECIMAL — toujours via formatAreaHa/parseDecimal
  cropType: CropType; soilType: SoilType; irrigationMethod: IrrigationMethod;
  cropVariety: string | null;
  flowRateM3h: number | string | null;
  treeAgeYears: number | null;
  treeDensityPerHa: number | null;
  polygon: GeoJsonPolygon | null;
  centroid: GeoJsonPoint | null;
  isActive: boolean;
  sensors?: Sensor[];               // incluses par GET /parcels/farm/:id et GET /parcels/:id
  farm?: Farm;                      // incluse par GET /parcels/:id
  createdAt: string; updatedAt: string;
}
interface Sensor {
  id: string; parcelId: string; deviceId: string; deviceType: string;
  isActive: boolean; lastSeenAt: string | null; batteryPct: number | null;
  firmwareVersion: string | null; createdAt: string; updatedAt: string;
}
type SensorStatus = 'active' | 'pending' | 'inactive';
function getSensorStatus(sensor: Sensor): SensorStatus;
// + CROP_TYPE_LABELS / SOIL_TYPE_LABELS / IRRIGATION_METHOD_LABELS et *_OPTIONS (Select)
```

## 13. Validations

Validation **côté client** (UX) — le backend reste la source de vérité (`RegisterDto`, `VerifyOtpDto`, `UpdateProfileDto` côté services) :

- **Téléphone** : regex `^\+212[67]\d{8}$` (`utils/phone.ts` et `register.dto.ts` identiques). La saisie filtre les non-chiffres et plafonne à 9 chiffres ; affichage `6XX XX XX XX`.
- **OTP** : exactement 6 chiffres, regex `^\d{6}$` (constantes `OTP_LENGTH = 6`, `OTP_PATTERN` dans `OTPScreen.tsx`).
- **Profil** : `name` ≤ 100 caractères (`maxLength` UI + `@MaxLength(100)` du DTO) ; `preferredLanguage` ∈ `['french','arabic','darija']` (`@IsIn` du DTO) ; un `name` vidé est envoyé comme `undefined` (champ optionnel, « laisser non défini » plutôt qu'une chaîne vide).

## 14. Erreurs et états de chargement

Écran par écran (messages exacts du code, jamais d'exposition de l'erreur brute à l'utilisateur — elles ne partent qu'en `console.error`) :

| Écran | État de chargement | Erreur affichée |
|---|---|---|
| `LoginScreen` | bouton spinner `loading` + champs `disabled` (`submitting`) | validation : « Numéro de téléphone invalid. » ; API : « Impossible d'envoyer le code. » + « Réessayez. » (réessai = relance de la soumission) |
| `OTPScreen` | bouton spinner (`submitting`), inputs + renvoi désactivés | format : « Veuillez saisir les 6 chiffres du code OTP. » ; expiré : « Code OTP expiré. Veuillez demander un nouveau code. » ; 401 : « Code OTP invalide ou expiré. » ; générique : « Impossible de vérifier le code. Réessayez. » ; renvoi KO : « Impossible de renvoyer le code. Réessayez. » |
| `ProfileScreen` | `LoadingSpinner` « Chargement du profil » | « Impossible de charger votre profil. » + « Réessayez. » (relance du fetch) ; même rendu si aucun `user` dans le store |
| `EditProfileScreen` | bouton « Enregistrer » spinner + champs désactivés | « Impossible d'enregistrer les modifications. Réessayez. » |
| API 401 (hors auth) | — | refresh silencieux ; en échec → `clearAuth()` + redirection `/login` |

## 15. Styles et design tokens

- Les tokens d'accès et de rafraîchissement sont stockés dans `localStorage` avec la clé `alkatra-auth`
- Il s'agit d'un compromis MVP : idéalement, les tokens devraient être stockés dans des cookies `httpOnly` pour les déploiements en production
- Les données sensibles (tokens, numéros de téléphone) ne doivent jamais être écrites dans les logs console

### Validation des données

- La validation du frontend est pour l'UX uniquement ; le backend est toujours l'autorité
- Jamais de confiance aveugle dans les données du client
- Toujours traiter une réponse 400/422 du backend comme authoritative, même si le client-side check est passé

### CORS et en-têtes

- Le client Axios joint automatiquement `Authorization: Bearer <token>` via l'intercepteur de requête
- Assurez-vous que le backend accepte les requêtes CORS depuis l'URL frontend
- Les en-têtes sensibles ne doivent jamais être exposés dans les réponses publiques

### Protection des sessions

- Le logout est actuellement côté client uniquement (le token reste valide côté serveur jusqu'à expiration naturelle)
- Une endpoint de blacklist de token est prévue pour Sprint 5
- Pas de exposé de tokens dans les URLs ou les en-têtes de réponse visibles

## 17. Performance et optimisations

### Lazy loading des routes

- Envisagez de découper les écrans d'authentification et de tableau de bord en chunks séparés pour réduire le bundle initial
- Utilisez `React.lazy()` et `Suspense` pour les routes protégées

### Gestion de l'État

- Zustand's persist middleware survit aux rechargements de page et restaure l'état instantanément
- Les mutations d'état sont immédiatement sauvegardées dans localStorage
- Pas d'appels API redondants au démarrage grâce à la persistance

### CSS modules

- Les modules CSS sont scopés au composant, réduisant les conflits de classe
- Les tokens CSS réduisent la redondance des valeurs
- Pas d'imports de CSS global sauf nécessité

### Timeouts réseau

- Timeout par défaut : 15 secondes sur toutes les requêtes Axios
- Augmentez pour les opérations lentes (upload, ML inference) si nécessaire
- Toujours afficher un état de chargement ou une rétroaction à l'utilisateur

## 18. Dépannage courant

### Les tests ne passent pas

```bash
# Assurez-vous que les dépendances sont installées
cd frontend && npm install

# Réinstallez les modules de test
rm -rf node_modules/@testing-library && npm install

# Exécutez les tests à nouveau
npm run test
```

### Les requêtes API échouent localement

- Vérifiez que le backend s'exécute : `docker ps | grep auth-service`
- Vérifiez le VITE_API_BASE_URL dans .env (par défaut : `http://localhost:8080/api/v1` — la gateway, pas un service individuel)
- Vérifiez les logs du navigateur (F12) pour les erreurs CORS ou de réseau

### Les tokens expirent rapidement

- Vérifiez le TTL du backend (`OTP_EXPIRY_TTL`, `JWT_EXPIRY` dans auth-service)
- Vérifiez que le système heure du client est synchronisé avec le serveur

### Les styles CSS ne s'appliquent pas

- Vérifiez que les modules CSS sont importés : `import styles from './Component.module.css'`
- Vérifiez que les token CSS sont définis : `var(--color-primary-500)` vs valeur hex directe
- Vérifiez la cascade des styles CSS global vs module

## 19. Construction et déploiement

### Build de production

```bash
cd frontend
npm run build
# Produit dist/ avec code minifié et assets optimisés
```

### Prévisualisation locale

```bash
npm run preview
# Sert le build de production localement sur http://localhost:4173
```

### Variables d'environnement en production

- `VITE_API_BASE_URL` doit pointer vers le gateway API ou l'URL du backend en production
- Utiliser les variables d'environnement du conteneur Docker ou du système d'exploitation
- Jamais de secrets dans les fichiers `.env` versionnés

### Dockerfile

Le frontend est construit en multi-stage :
- Stage 1 : Build Node avec npm install et vite build
- Stage 2 : Sert le contenu avec un serveur statique (nginx ou node)
- Assets optimisés avec gzip et cache-busting

### Monitoring en production

- Mettez en place une télémétrie (Sentry, LogRocket) pour les erreurs JavaScript
- Configurez des alertes sur les erreurs 4xx/5xx côté backend
- Monitorez les temps de réponse API et le TTL des sessions

## 20. Compatibilité des navigateurs

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Pas de support IE11 (ES6+ requis).

## 21. Résumé

Le frontend est volontairement direct : il présente le flux d'authentification, valide les entrées pour une rétroaction plus rapide, et délègue les règles métier réelles au backend. Le code est organisé pour rester facile à maintenir tout en préservant une séparation claire entre le comportement de l'UI et l'application du backend.

- **`styles/tokens.css`** : toutes les valeurs de design sont des variables CSS chargées dans `:root` (`main.tsx`) :
  - couleurs : primary (`--color-primary-300/500/700`, vert foncé marque), secondary (`--color-secondary-100/500/600`), accent (`--color-accent-500`), destructive (`#D32F2F`/`#B71C1C`), neutres (`--color-neutral-0/200`, `--color-neutral-grey`, `--color-neutral-black`) + alias de compatibilité (`--color-error-500`, `--color-neutral-white`, `--color-neutral-grey-light`) ;
  - typographie : famille Inter (`--font-family-base`), tailles/poids titres, sous-titres, labels, corps, bouton, erreur, footer ;
  - radius (`--radius-card: 20px`, `--radius-input`, `--radius-button`), spacing (`--spacing-xs`→`xl`), shadow (`--shadow-card`), transitions (`--transition-fast`/`base`).
- **`styles/global.css`** : `box-sizing`, hauteur `html/body/#root`, police Inter appliquée à `body`.
- **CSS modules** partout (`*.module.css` colocalisés), sauf `tokens.css`/`global.css` importés globalement dans `main.tsx`.

## 16. i18n

- `i18next` + `react-i18next`, initialisés dans `src/i18n/index.ts` (importés par `main.tsx` **et** `setupTests.ts`) : langues `fr`, `ar`, `darija` (JSON dans `src/i18n/`), langue par défaut `fr`, `fallbackLng: 'fr'`, échappement d'interpolation désactivé.
- **Usage réel** : seul le composant `Brand` consomme `useTranslation()` (`auth.brandTitle`, `auth.brandSubtitle`). Tout le reste des textes (LoginScreen, OTPScreen, Header, Navigation, écrans profil) est **codé en dur en français**. Aucun composant ne bascule encore la langue (le champ `preferredLanguage` est envoyé au backend mais n'actionne pas i18n).

## 17. Variables d'environnement

Variable unique utilisée par le frontend :

- **`VITE_API_BASE_URL`** — base URL de toutes les requêtes API. Valeur par défaut dans le code : `http://localhost:8080/api/v1` (API Gateway Nginx). `frontend/.env` et `frontend/.env.example` la définissent tous deux à `http://localhost:8080/api/v1`.

Rien d'autre n'est lu via `import.meta.env`. Pas de secret côté frontend dans `.env` / `.env.example`.

## 18. Tests

Stack : **Vitest** (`vite.config.ts` : `environment: 'jsdom'`, `globals: true`, `setupFiles: './setupTests.ts'` avec `@testing-library/jest-dom/vitest` + import i18n) + **Testing Library** (react/user-event/jest-dom) + **Axios** mocks (`vi.mock`). **157 tests, 20 fichiers, tous verts.**

| Fichier | Sujets couverts |
|---|---|
| `components/ui/Button/Button.test.tsx` | clic, état désactivé, spinner/loading, 6 variantes, tailles sm/md, icônes, `block`/`data-block` |
| `components/ui/Card/Card.test.tsx` | rendu enfant, `block`, `elevated`, props HTML natives |
| `components/ui/ConfirmDialog/ConfirmDialog.test.tsx` | rendu conditionnel, callbacks, Échap, verrouillage `busy`, message d'erreur |
| `components/ui/EmptyState/EmptyState.test.tsx` | titre, description, icône, action, `role="status"` |
| `components/ui/Input/Input.test.tsx` | label, prefix, `aria-invalid`, `aria-describedby`, variante search (clear), états default/filled/error |
| `components/farm/FarmCard/FarmCard.test.tsx` | nom, région avec élision, fallback, surface formatée, clic |
| `components/parcel/ParcelCard/ParcelCard.test.tsx` | nom, sous-titre FR, surface formatée, pills Capteur/N capteurs/Sans capteur, clic |
| `components/parcel/SensorSection/SensorSection.test.tsx` | état vide, liste ≤ 3 avec Dissocier, mode compact + lien > 3, dissociation confirmée + refetch, association via modale, 403 anti-vol |
| `screens/auth/LoginScreen/LoginScreen.test.tsx` | bouton désactivé si vide, erreur de validation sans appel API, appel `requestOtp`, navigation `/otp` |
| `screens/auth/OTPScreen/OTPScreen.test.tsx` | format/expiration, vérification → `onVerified`, 401, cooldown renvoi (fake timers), accessibilité |
| `screens/farm/FarmListScreen` (+Create +Edit +Detail) `.test.tsx` | squelettes, vide + CTA, recherche diacritiques, payload exact, 409 dans la modale, navigation |
| `screens/parcel/ParcelCreateScreen.test.tsx` | disabled + erreurs blur (textes maquette), champs optionnels absents, payload CreateParcelDto (virgule), 422 affiché, Annuler |
| `screens/parcel/ParcelEditScreen.test.tsx` | squelettes, erreur + Réessayer, pré-remplissage (décimaux re-formatés), payload Update, Annuler |
| `screens/parcel/ParcelDetailScreen.test.tsx` | squelettes, Info Card labels FR, capteur + pill Actif, CTA recommandation, suppression + navigation, Réessayer |
| `screens/parcel/SensorListScreen.test.tsx` | squelettes, erreur + Réessayer, tri actifs d'abord, recherche deviceId, chips de filtre, dissociation + refetch, Retour |
| `router/RequireAuth.test.tsx` | redirection `/login` si non authentifié, rendu si authentifié, token expiré |
| `store/auth.store.test.ts` | `setAuth` (+ `expiresAt`), `clearAuth`, `isAuthenticated`, persistance localStorage |

## 19. Scripts npm et CI

Scripts du `frontend/package.json` :

| Script | Commande | Effet |
|---|---|---|
| `dev` | `vite` | serveur de dev Vite (défaut `http://localhost:5173`) |
| `build` | `tsc -b && vite build` | check de types + build de production dans `dist/` |
| `preview` | `vite preview` | serve le build (défaut `http://localhost:4173`) |
| `lint` | `eslint .` | ESLint 9 (flat config) |
| `test` | `vitest run` | exécution une fois de la suite |
| `test:watch` | `vitest` | mode watch |

Depuis la racine du monorepo, ces scripts passent par Turborepo (`npm run dev` / `test` / `build` / `lint` automatisent `turbo run …`, qui couvrent aussi `frontend/*`).

**CI** : workflow GitHub Actions `.github/workflows/ci-frontend.yml` (racine du dépôt), déclenché sur `push` (branches `develop`, `main`) et `pull_request` avec chemins `frontend/**`. Étapes : Node 20 (`npm ci` avec cache sur `frontend/package-lock.json`), `npm run lint`, `npm run test`, `npm run build` (working-directory `frontend`).

## 20. Build et déploiement

- **Build local** : `npm run build` (`tsc -b && vite build`) → `frontend/dist/` (HTML + JS/CSS hashed + `public/` copié). Pas de PWA ni de manifeste.
- **`frontend/DockerFile`** (multi-stage) :
  1. `node:20-alpine` : copie `package*.json`, `npm ci`, copie du code, `npm run build` ;
  2. `nginx:alpine` : copie de `dist/` vers `/usr/share/nginx/html`, `EXPOSE 80`. Aucune configuration nginx personnalisée (pas de gzip ni de cache-busting configurés dans ce fichier).
- **CI** : le workflow `ci-frontend.yml` valide lint + tests + build sur chaque push/PR touchant `frontend/**` (voir §19).

---

## 21. Flux utilisateur (chemin complet)

> Parcours « UI → logique → état → API → réponse → navigation » tels qu'implémentés dans le code.

### 21.1 Connexion : demande d'OTP

1. `/login` affiche `LoginScreen` (hero + carte `Brand` + formulaire).
2. Saisie : `setFromInput` → `normalizePhoneDigits` (filtre non-chiffres, max 9) ; affichage `formattedValue` (`6XX XX XX XX`) préfixé `+212`.
3. Submit (`handleSubmit`, submit du formulaire) : bloque si champ vide ou déjà `submitting` → `submit()` :
   - si `!phone.isValid` (**regex `^\+212[67]\d{8}$`**) → erreur de validation « Numéro de téléphone invalid. », `Input state="error"`, **aucun appel réseau** ;
   - sinon `status='submitting'` → `authApi.requestOtp({ phone: phone.fullPhone })` → `httpClient.post('/auth/register')` → **Gateway Nginx 8080** → `auth-service` → réponse `{ success: true, message, expiresAt }`.
4. Succès : `status='success'`, notice « Code envoyé. Il expire à HH:mm. » puis `navigate('/otp', { state: { phone, expiresAt } })`.
5. Échec : `status='idle'`, `console.error` (non exposé), `ErrorMessage` « Impossible d'envoyer le code. » + « Réessayez. » (relance `submit`).

### 21.2 Vérification de l'OTP puis ouverture de session

1. `/otp` : `OtpRoute` lit `location.state`. Si `phone` ou `expiresAt` manquant → `<Navigate to="/login" replace />`.
2. `OTPScreen` : compte à rebours `MM:SS` depuis `expiresAt` (serveur), `OTPInput` 6 cases (focus auto, backspace, paste).
3. Submit `verifyOtp` : contrôle `^\d{6}$` et non-expiration, puis `authApi.verifyOtp({ phone, otp })` → `POST /auth/verify-otp` → `auth-service` → `VerifyOtpResponse { accessToken, refreshToken, expiresIn, tokenType, user }`.
4. `onVerified(response)` → `useAuthStore.getState().setAuth(response)` : `expiresAt` calculé (`now + expiresIn`) et état **persisté dans localStorage** (clé `alkatra-auth`), puis `navigate('/farms', { replace: true })`.
5. Désormais `isAuthenticated()` est vraie : `RequireAuth` rend `<Outlet/>` dans `AppLayout`.
6. Erreurs : 401 → « Code OTP invalide ou expiré. » ; sinon message générique.

### 21.3 Renvoi d'OTP (sur `/otp`)

- Bouton « Renvoyer » (ou « Renvoyer dans Ns ») : cooldown 30 s → `authApi.requestOtp({ phone })` → nouvelle `expiresAt` mémorisée, champ OTP vidé, timers relancés. Échec → « Impossible de renvoyer le code. Réessayez. ».

### 21.4 Consultation et édition du profil

1. `/profile` est accessible par URL directe (aucun lien visible dans la `Navigation`, qui ne contient que « Fermes ») — `ProfileScreen` affiche un `LoadingSpinner` puis `userApi.getProfile()` → `GET /user/profile` (Bearer injecté par l'intercepteur) → `user-service` → `AuthUser`.
2. Résultat écrit dans le store via `updateUser` ; l'écran affiche `ProfileIdentity` + menu. En échec : « Impossible de charger votre profil. » + retry.
3. « Editeur mon profil » → `/profile/edit` : lit `user` du store (sinon `<Navigate to="/profile" />`), formulaire `name` + langue → `userApi.updateProfile` `PATCH /user/profile` → `AuthUser` mis à jour → `updateUser` → `navigate('/profile', { replace: true })`.
4. Déconnexion (Header, si `user`) : `useAuth().logout()` → `clearAuth()` (store remis à zéro, localStorage purgé) → `navigate('/login', { replace: true })`.

## 22. Limites et points de vigilance

Faits vérifiables dans le code actuel, à ne pas confondre avec une feuille de route :

- **Recommandations** : les vues de liste, de recommandation du jour et de feedback sont implémentées. Les appels utilisent les endpoints de recommandation derrière la gateway.
- **Aucun lazy-loading** : toutes les routes et écrans sont chargés dans le bundle initial (`App.tsx` → `router`) ; `React.lazy`/`Suspense` ne sont utilisés nulle part.
- **Déconnexion locale uniquement** : `clearAuth()` ne fait aucun appel backend ; le stockage local est simplement purgé.
- **Tokens en `localStorage`** (clé `alkatra-auth`) : choix du code actuel et non des cookies `httpOnly`.
- **i18n partielle** : trois langues initialisées, mais seul `Brand` consomme `t()` ; le reste est en dur en français.
- **`authApi.refresh` défini mais non utilisé par l'intercepteur** : le refresh est réalisé par un `axios.post` direct dans `client.ts`.
- **Pas d'intercepteur côté « login »** : le refresh ne s'applique pas aux endpoints `/auth/register`, `/auth/verify-otp`, `/auth/refresh`, `/auth/login` (protection contre la boucle infinie).
- **Pas de monitoring/télémétrie client configuré** (pas de Sentry, LogRocket, etc.) ; les erreurs API sont seulement `console.error`.

## Documents liés

- Contrats backend : [`docs/guides/auth-service.md`](auth-service.md), [`docs/guides/user-service.md`](user-service.md), [`docs/guides/api-gateway.md`](api-gateway.md).
- Références : [`docs/reference/ports-and-services.md`](../reference/ports-and-services.md) (gateway 8080, services 3001–3004), [`docs/architecture/project-overview.md`](../architecture/project-overview.md).
- La structure d'arborescence du monorepo est décrite dans [`docs/architecture/repository-map.md`](../architecture/repository-map.md).

- **Documents liés** : la planification par phases (Figma avant code, décisions d'architecture, historique) vit dans [`design_frontend.md`](../../design_frontend.md) à la racine du dépôt.

---

*Document tenu à jour au 19/08/2026 à partir du code réel du dépôt (branche `dev2-p1-s4`, incluant le merge de `dev1-frontend`).*