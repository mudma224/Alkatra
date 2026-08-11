# Al Katra Bel Qatra — Frontend Documentation

> **Méthodologie de cet audit** : ce document a été produit en reconstruisant réellement l'arborescence `frontend/` livrée par DEV1 (à partir du guide d'implémentation Phase A + B), puis en l'inspectant fichier par fichier — `package.json`, `tsconfig.json`, `vite.config.ts`, tous les fichiers `src/**` — et en exécutant réellement `npm install`, `npm run build`, `npm run dev` et `npm run test` pour vérifier ce qui fonctionne effectivement, plutôt que de se fier au guide Phase 1 prévisionnel. Toute divergence entre le code réel et les guides de planification (Sprint 4, stack technique prévue) est signalée explicitement ci-dessous, jamais masquée.
>
> Légende utilisée dans ce document : ✅ Implemented · ⚠️ Partial · 🔵 Planned · ❌ Not implemented.

---

## 1. Vue d'ensemble

### Rôle du frontend

Le frontend est l'application web/PWA destinée au fermier final. À ce stade réel du code (Phase A + B), **son seul rôle fonctionnel est l'écran de connexion par numéro de téléphone** : saisie du numéro, validation, et demande d'un code OTP auprès du backend. Aucun autre écran n'existe dans le code.

### Objectif du MVP (tel que réellement livré)

Livrer un écran de Login pixel-fidèle à la maquette Figma, connecté au vrai contrat de `auth-service` (`POST /api/v1/auth/register`), avec une architecture volontairement minimale et réutilisable pour que DEV2 puisse y greffer les écrans suivants (OTP, Farm, etc.) sans tout reconstruire.

### Relation frontend / backend

Le frontend appelle **directement** `auth-service` (`http://localhost:3001/api/v1`), sans passer par la `gateway` Nginx prévue dans `docker-compose.yml` — le fichier de configuration réel de cette gateway (`infra/nginx/nginx.conf`) n'a jamais été fourni à DEV1, et `auth-service` autorise déjà les requêtes cross-origin (`app.enableCors({ origin: true, credentials: true })` dans son `main.ts`), donc l'appel direct fonctionne sans configuration supplémentaire.

**Point important vérifié dans le code** : l'écran de Login **n'appelle aucune API au chargement de la page** (aucun `useEffect` dans `LoginScreen.tsx`). L'appel réseau ne se déclenche qu'au clic sur « Envoyer OTP ». Le frontend peut donc être visualisé entièrement **sans que le backend soit démarré** — voir §16, étape 5.

### Schéma d'architecture (adapté au code réel)

Le code réel n'a **ni React Router, ni store Zustand, ni couche i18n**. Le schéma générique du brief est donc simplifié pour refléter ce qui existe vraiment :

```
User
 ↓
React Frontend (Vite)
 ↓
main.tsx → App.tsx
 ↓
<LoginScreen />               (rendu unique, inconditionnel — pas de routing)
 ↓
Components (Brand, Input, Button, ErrorMessage, LoadingSpinner)
 ↓
Hook local (usePhoneNumber)   (pas de store global)
 ↓
API Layer (src/api/client.ts, src/api/auth.api.ts)
 ↓
auth-service (POST /api/v1/auth/register) — appelé directement, sans gateway
```

---

## 2. Stack technique réellement utilisée

Versions relevées dans `frontend/package.json` (plages `^`) **et** versions réellement résolues lors d'un `npm install` exécuté pour cet audit (`node_modules/*/package.json` / `npm ls`). Comme les plages sont en `^`, les versions exactes installées par DEV2 pourront légèrement différer selon la date de son `npm install` — c'est un comportement normal de npm, pas une erreur.

| Technologie | Plage déclarée (`package.json`) | Version résolue (audit) | Utilisation réelle |
|---|---|---|---|
| React | `^18.3.1` | 18.3.1 | Rendu de l'UI |
| React DOM | `^18.3.1` | 18.3.1 | Rendu dans le DOM |
| TypeScript | `^5.6.3` | 5.9.3 | Typage statique, `tsc -b` avant build |
| Vite | `^5.4.9` | 5.4.21 | Dev server + bundler |
| @vitejs/plugin-react | `^4.3.2` | 4.7.0 | Support JSX/Fast Refresh pour Vite |
| Axios | `^1.7.7` | 1.19.0 | Client HTTP (`src/api/client.ts`) |
| Vitest | `^2.1.3` | 2.1.9 | Test runner |
| @testing-library/react | `^16.0.1` | 16.3.2 | Tests de composants |
| @testing-library/jest-dom | `^6.5.0` | 6.9.1 | Matchers Jest-DOM pour Vitest |
| jsdom | `^25.0.1` | 25.0.1 | Environnement DOM simulé pour les tests |

**Écarts avec la stack "prévue" (guide Phase 1, Sprint 4)** — à ne pas documenter comme implémentés :

| Techno prévue par le guide Phase 1 | État réel dans le code |
|---|---|
| Zustand (state management) | 🔵 Planned — absent de `package.json`, aucun store dans le code |
| React Router | 🔵 Planned — absent de `package.json`, aucune route configurée |
| i18next | 🔵 Planned — absent de `package.json`, textes FR codés en dur |
| vite-plugin-pwa | 🔵 Planned — absent de `package.json`, aucun manifest, aucun service worker |
| ESLint | ❌ Not implemented — aucun script `lint`, aucune dépendance ESLint dans `package.json` |

---

## 3. Structure réelle du frontend

Arborescence réellement présente (vérifiée fichier par fichier) :

```
frontend/
├── index.html
├── package.json
├── package-lock.json          (généré par npm install, pas versionné dans le guide source)
├── tsconfig.json
├── vite.config.ts
├── .env.example
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── setupTests.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   └── global.css
│   ├── types/
│   │   ├── auth.types.ts
│   │   └── api.types.ts
│   ├── api/
│   │   ├── client.ts
│   │   └── auth.api.ts
│   ├── hooks/
│   │   └── usePhoneNumber.ts
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Button.module.css
│   │   │   │   └── Button.test.tsx
│   │   │   ├── Input/
│   │   │   │   ├── Input.tsx
│   │   │   │   └── Input.module.css
│   │   │   ├── LoadingSpinner/
│   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   └── LoadingSpinner.module.css
│   │   │   └── ErrorMessage/
│   │   │       ├── ErrorMessage.tsx
│   │   │       └── ErrorMessage.module.css
│   │   └── auth/
│   │       └── Brand/
│   │           ├── Brand.tsx
│   │           └── Brand.module.css
│   └── screens/
│       └── auth/
│           └── LoginScreen/
│               ├── LoginScreen.tsx
│               ├── LoginScreen.module.css
│               └── LoginScreen.test.tsx
```


### Rôle de chaque dossier

| Dossier | Rôle | Fichiers présents | Dépendances importantes |
|---|---|---|---|
| `src/styles/` | Design tokens globaux (CSS custom properties) + reset minimal | `tokens.css`, `global.css` | Importés une seule fois dans `main.tsx` |
| `src/types/` | Contrats TypeScript des payloads/réponses API | `auth.types.ts`, `api.types.ts` | Utilisés par `src/api/` |
| `src/api/` | Couche HTTP — instance Axios + fonctions d'appel par domaine | `client.ts`, `auth.api.ts` | `axios`, `src/types/` |
| `src/hooks/` | Logique réutilisable avec état local | `usePhoneNumber.ts` | Aucune dépendance externe |
| `src/components/ui/` | Composants génériques réutilisables, sans logique métier | `Button`, `Input`, `LoadingSpinner`, `ErrorMessage` | `src/styles/tokens.css` (via variables CSS) |
| `src/components/auth/` | Composants spécifiques au flux d'authentification (copy fixe) | `Brand` | — |
| `src/screens/auth/LoginScreen/` | Écran complet — assemble composants, hook et API | `LoginScreen.tsx` | Tous les dossiers ci-dessus |

---

## 4. Architecture frontend

### Communication entre les couches

```
LoginScreen (screens/)
   ├─ utilise → usePhoneNumber (hooks/)         → état local du champ téléphone
   ├─ rend    → Brand, Input, Button, ErrorMessage (components/)
   └─ appelle → authApi.requestOtp() (api/)      → httpClient (Axios) → auth-service
```

- **Screens** : `LoginScreen` est le seul écran. Il détient l'état de formulaire (`status`, `error`, `successNotice`) via `useState` local — pas de store partagé.
- **Components** : purement présentationnels, pilotés par props (`state`, `disabled`, `loading`, etc.), aucun ne fait d'appel réseau lui-même.
- **Hooks** : `usePhoneNumber` centralise le formatage, la normalisation et la validation du numéro — réutilisable si un futur écran a besoin d'un champ téléphone.
- **Stores** : 🔵 Planned — aucun store Zustand n'existe. L'état est 100 % local au composant `LoginScreen`.
- **API** : `src/api/client.ts` exporte une instance Axios unique (`httpClient`) ; `src/api/auth.api.ts` expose `authApi.requestOtp()`, seule fonction API existante.
- **Types** : `RequestOtpPayload`, `RequestOtpResponse` (auth.types.ts) et `ApiErrorResponse` (api.types.ts) — c'est l'intégralité des types API actuellement définis.

---

## 5. Design System

Toutes les valeurs ci-dessous sont extraites de `src/styles/tokens.css` — aucune valeur inventée.

### Couleurs

| Nom du token | Valeur hex | Usage réel dans le code |
|---|---|---|
| `--color-primary-500` | `#1B4332` | Titre, bordure input "filled", fond bouton actif |
| `--color-accent-500` | `#94C857` | Lien "Réessayez.", lien "Sign up" |
| `--color-error-500` | `#D32F2F` | Bordure input erreur, texte du message d'erreur |
| `--color-neutral-black` | `#000000` | Texte du corps, préfixe "+212" |
| `--color-neutral-white` | `#FFFFFF` | Fond de la carte, texte du bouton actif |
| `--color-neutral-grey` | `#6B7280` | Bordure input par défaut, placeholder |
| `--color-neutral-grey-light` | `#DDE5E1` | Fond du bouton désactivé |

Il n'y a **pas** de tokens `Success` / `Warning` / `Info` distincts dans le code — seuls Primary, Neutral, Accent et Error existent réellement.

### Typographie

| Token | Valeur | Origine |
|---|---|---|
| `--font-family-base` | `'Inter', system-ui, -apple-system, sans-serif` | Chargée via Google Fonts dans `index.html` |
| `--font-size-title` | `24px` / `--font-weight-title: 500` | Titre "Al katra bel qatra" |
| `--font-size-subtitle` | `12px` / `--font-weight-subtitle: 400` | Sous-titre |
| `--font-size-label` | `16px` / `--font-weight-label: 500` | Label "Numéro de téléphone" |
| `--font-size-body`, `--font-weight-body`, `--font-size-button`, `--font-weight-button`, `--font-size-error`, `--font-size-footer` | `16px`/`400`, `16px`/`600`, `13px`, `14px` | ⚠️ Valeurs déduites par DEV1 (non issues d'une spec Figma explicite), utilisées de façon cohérente |

### Spacing / Radius

| Token | Valeur |
|---|---|
| `--radius-card` | `32px` |
| `--radius-input` | `12px` |
| `--radius-button` | `12px` |
| `--spacing-xs` → `--spacing-xl` | `4px, 8px, 16px, 24px, 32px` |

⚠️ Ces valeurs de layout sont également des choix de DEV1 (non extraites d'une spec chiffrée), à valider avec le design si besoin.

### Boutons, inputs, cards — états réellement codés

Voir §6.5 pour le détail exhaustif des états, ils sont identiques ici (Button/Input sont les seuls composants "form control" du design system actuel).

### Comment réutiliser le design system pour un nouveau composant

1. **Ne jamais écrire de couleur, taille ou espacement en dur.** Toujours consommer une variable CSS définie dans `src/styles/tokens.css` (ex. `color: var(--color-primary-500);`).
2. Si une nouvelle valeur est nécessaire (nouvelle couleur, nouveau spacing), l'ajouter **dans `tokens.css`** avec un nom cohérent avec la convention existante (`--color-*`, `--font-size-*`, `--spacing-*`, `--radius-*`), pas directement dans le composant.
3. Utiliser des **CSS Modules** (`NomDuComposant.module.css`), comme tous les composants existants — pas de `style={{ ... }}` inline, pas de CSS global en dehors de `styles/global.css`.
4. Placer un nouveau composant générique (sans logique métier) sous `components/ui/`, un composant lié à un flux métier (ex. auth, farm) sous `components/<domaine>/`.

---

## 6. Login Screen — documentation détaillée

### 6.1 Objectif

Permettre au fermier de saisir son numéro de téléphone marocain et de déclencher l'envoi d'un code OTP via `auth-service`. C'est **la seule étape implémentée** du flux d'authentification — l'écran de saisie du code OTP n'existe pas encore (§9, §15).

### 6.2 Structure

Structure réelle, telle que rendue par `LoginScreen.tsx` :

```
LoginScreen (div.page)
 ├── Hero              (div.hero — actuellement un dégradé CSS, PAS une image réelle, voir 6.6)
 │
 ├── Card (main.card)
 │    ├── Brand          (titre + sous-titre)
 │    └── form.form
 │         ├── Input        (label "Numéro de téléphone", préfixe "+212")
 │         ├── Button        ("Envoyer OTP")
 │         ├── ErrorMessage  (conditionnel — affiché seulement si `error` est défini)
 │         └── <p> succès    (conditionnel — affiché seulement après une requête réussie)
 │
 └── Footer (footer.footer)
      └── "Don't have an account ? Sign up"   (bouton statique, sans action)
```

### 6.3 Components utilisés

| Composant | Fichier | Rôle | Props réelles | État interne | Interactions |
|---|---|---|---|---|---|
| `Brand` | `components/auth/Brand/Brand.tsx` | Affiche le titre et le sous-titre fixes | *(aucune prop)* | Aucun | Aucune |
| `Input` | `components/ui/Input/Input.tsx` | Champ générique réutilisable, avec préfixe optionnel | `label?`, `state?` (`'default'\|'filled'\|'error'`), `prefix?`, `errorMessage?`, + toutes les props HTML natives d'`<input>` | Aucun (composant contrôlé, `forwardRef`) | `onChange`, focus visible au clavier |
| `Button` | `components/ui/Button/Button.tsx` | Bouton générique avec état chargement | `loading?`, `disabled?`, + props HTML natives de `<button>` | Aucun | `onClick` (via `type="submit"` dans le formulaire), bloqué si `disabled` ou `loading` |
| `LoadingSpinner` | `components/ui/LoadingSpinner/LoadingSpinner.tsx` | Spinner affiché dans `Button` pendant le chargement | `label?` | Aucun | Aucune (décoratif, `role="status"`) |
| `ErrorMessage` | `components/ui/ErrorMessage/ErrorMessage.tsx` | Affiche un message d'erreur avec action optionnelle | `id?`, `message`, `actionLabel?`, `onAction?` | Aucun | `onClick` sur `actionLabel` (relance la requête) |

### 6.4 Gestion du numéro de téléphone

Toute la logique est centralisée dans `src/hooks/usePhoneNumber.ts` :

- **Préfixe** : `+212` fixe, non éditable, affiché via la prop `prefix` de `Input`.
- **Nombre de chiffres attendu** : 9 chiffres locaux (constante `LOCAL_DIGITS_LENGTH = 9`), tronqués automatiquement au-delà.
- **Normalisation de la saisie** : `raw.replace(/\D/g, '').slice(0, 9)` — tout caractère non numérique est supprimé, quelle que soit la façon dont l'utilisateur tape ou colle le texte.
- **Formatage d'affichage** : regroupement `3-2-2-2`, ex. `617 50 36 77` (fonction `formatLocalDigits`).
- **Validation** : `MOROCCAN_PHONE_REGEX = /^\+212[67]\d{8}$/`, appliquée sur la valeur complète reconstruite `+212${digits}`. C'est exactement la regex utilisée côté backend dans `LoginDto`/`VerifyOtpDto` d'`auth-service`.
- **Messages d'erreur** : géré dans `LoginScreen.tsx`, pas dans le hook — voir §6.5 et §7.
- **État du bouton** : le bouton `Envoyer OTP` est désactivé **uniquement si le champ est vide** (`disabled={phone.isEmpty}`). Il reste actif même si le numéro est incomplet/invalide — la validation se déclenche au clic, pas en direct pendant la saisie (ce choix reproduit fidèlement les captures Figma fournies : un numéro incomplet + clic donne l'écran d'erreur avec un bouton toujours actif).

### 6.5 États UI

États réellement implémentés (vérifiés dans `Button.module.css`, `Input.module.css`, `LoginScreen.tsx`) :

| État | Composant | Déclencheur réel dans le code |
|---|---|---|
| `default` | Input | `phone.isEmpty === true` → bordure grise `#6B7280` |
| `filled` | Input | Champ non vide et pas d'erreur de validation → bordure verte `#1B4332` |
| `error` | Input | `error?.type === 'validation'` → bordure rouge `#D32F2F` |
| `disabled` (Input) | Input | `status === 'submitting'` → champ désactivé pendant l'envoi |
| `disabled` (Button) | Button | `phone.isEmpty === true` → fond gris `#DDE5E1`, texte gris |
| `loading` (Button) | Button | `status === 'submitting'` → spinner blanc, `aria-busy`, clics bloqués |
| `focus` | Input, Button, liens | `:focus-visible` → contour visible (couleur primaire ou accent selon l'élément) |

**Non implémentés / non pertinents ici** : il n'y a pas d'état `hover` explicitement défini par le design system pour l'Input (seul un `hover` inféré existe sur `Button.active` — assombrissement léger `#163a2b`, non issu d'une spec Figma). Aucun état `read-only` n'existe.

### 6.6 Image Hero

**Constat vérifié** : il n'existe **aucun fichier image réel** dans le repository livré (`public/` n'existe même pas, aucun `.png/.jpg/.svg/.webp` sous `src/`). La zone "hero" visible dans les captures Figma (photo + dégradé) est actuellement remplacée par un **placeholder purement CSS** :

```css
/* src/screens/auth/LoginScreen/LoginScreen.module.css */
.hero {
  height: 220px;
  background-color: #d9e4d9; /* couleur de secours */
  background-image: linear-gradient(180deg, rgba(27, 67, 50, 0.1), rgba(27, 67, 50, 0.55)),
    var(--login-hero-image, none);
  background-size: cover;
  background-position: center;
}
```

- **Où** : `div.hero` dans `LoginScreen.tsx`, stylée par `.hero` dans `LoginScreen.module.css`.
- **Nom de fichier** : aucun — aucune image n'est importée.
- **Import/référence** : la déclaration `var(--login-hero-image, none)` prévoit qu'une image soit injectée plus tard via une variable CSS (à définir, par ex. dans `tokens.css` ou en inline style), mais rien ne la définit actuellement — donc `none` s'applique et seul le dégradé de secours est visible.
- **Overlay** : un dégradé vertical (`rgba(27,67,50,0.1)` → `rgba(27,67,50,0.55)`) est superposé, pour assurer la lisibilité si une vraie photo est ajoutée plus tard.
- **`background-size`** : `cover`.
- **`background-position`** : `center`.
- **Comportement responsive** : la hauteur reste fixe à `220px` à toutes les tailles d'écran (aucune media query ne la modifie) ; seule la largeur du conteneur change (voir §11).

**Impact concret pour DEV2** : à l'ouverture du Login Screen, la zone hero apparaît comme un bandeau vert clair uni (pas de photo) — c'est normal et attendu dans l'état actuel du code, pas un bug. Voir Known Issues.

---

## 7. Login flow

Flux réellement codé dans `LoginScreen.tsx`, vérifié étape par étape :

```
User enters phone (onChange → usePhoneNumber.setFromInput)
       ↓
Click "Envoyer OTP" (handleSubmit, si champ non vide et pas déjà en cours)
       ↓
Validation client (regex /^\+212[67]\d{8}$/)
       ↓ invalide                              ↓ valide
Erreur "Numéro de téléphone invalid."     status = 'submitting' (bouton → spinner, champ désactivé)
(aucune requête envoyée)                        ↓
                                          authApi.requestOtp({ phone })
                                                 ↓
                                    POST /api/v1/auth/register  (auth-service, port 3001)
                                                 ↓ succès                     ↓ échec
                            status='success' + message de confirmation   status='idle'
                            onOtpRequested?.(phone, expiresAt)     "Impossible d'envoyer le code. Réessayez."
                            (callback — aucune navigation réelle,   (message fixe, jamais l'erreur brute)
                             voir §10)
```

### Détails vérifiés

| Aspect | Valeur réelle |
|---|---|
| API appelée | `authApi.requestOtp()` — `src/api/auth.api.ts` |
| Méthode HTTP | `POST` |
| Endpoint | `/auth/register` (concaténé à la `baseURL`, donc `POST {VITE_API_BASE_URL}/auth/register`) |
| Payload | `{ phone: string }` — ex. `{ "phone": "+212617503677" }` |
| Réponse attendue | `{ success: true, message: string, expiresAt: string (ISO) }` |
| Gestion des erreurs | Toute exception (réseau, 4xx, 5xx) est interceptée dans le `catch` de `submit()` ; l'erreur brute est loguée en `console.error` (jamais affichée), et le message fixe `"Impossible d'envoyer le code. Réessayez."` est affiché à la place |
| Navigation après succès | ❌ Aucune navigation réelle — un message inline s'affiche et le callback optionnel `onOtpRequested(phone, expiresAt)` est appelé (par défaut, `App.tsx` se contente d'un `console.info`) |
| Loading state | `status === 'submitting'` — champ désactivé, bouton en spinner, ré-entrance bloquée dans `handleSubmit` |

---

## 8. API Layer

Fichiers réellement présents sous `src/api/` : `client.ts` et `auth.api.ts` — **c'est l'intégralité de la couche API actuelle**.

| Fonction | HTTP | Endpoint | Payload | Response | Utilisation |
|---|---|---|---|---|---|
| `authApi.requestOtp(payload)` | `POST` | `/auth/register` | `RequestOtpPayload { phone }` | `RequestOtpResponse { success, message, expiresAt }` | Appelée uniquement dans `LoginScreen.tsx`, au clic sur "Envoyer OTP" |

### `httpClient`

- Instance Axios unique, créée dans `src/api/client.ts`.
- **Base URL** : `import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1'` — **une valeur de secours codée en dur existe**, donc la variable d'environnement n'est **pas obligatoire** pour que l'appel fonctionne en local (voir §13).
- **Timeout** : `15000` ms.
- **Headers par défaut** : `Content-Type: application/json`.

### Interceptors / JWT / refresh token

🔵 Planned — **aucun interceptor n'est configuré** (ni requête, ni réponse). Logique cohérente avec l'état actuel : aucun token n'existe encore côté frontend puisque l'écran OTP (qui recevrait le JWT) n'est pas implémenté. Il n'y a donc rien à intercepter pour l'instant.

### Error handling

Géré au niveau de l'appelant (`LoginScreen.tsx`), pas dans la couche API elle-même : `authApi.requestOtp()` ne fait aucune transformation d'erreur, elle laisse l'exception Axios remonter telle quelle. C'est `LoginScreen` qui décide de l'afficher (message fixe, jamais l'erreur brute — voir §7).

---

## 9. State management

❌ **Not implemented.** Aucune dépendance Zustand n'est présente dans `package.json`, aucun dossier `src/store/`. Tout l'état vit localement dans `LoginScreen.tsx` via trois `useState` :

```
LoginScreen (component)
   ├─ phone   → usePhoneNumber()      (digits, formattedValue, fullPhone, isValid, isEmpty)
   ├─ status  → useState<'idle'|'submitting'|'success'>
   ├─ error   → useState<FormError | null>
   └─ successNotice → useState<string | null>
```

Pas de persistance, pas de `localStorage`, pas d'état d'authentification global, pas de gestion de token — normal puisqu'aucun token n'est encore reçu par le frontend à ce stade (§8).

Schéma générique demandé par le brief, adapté : il n'y a **pas** de "Store action" ni de "Store update" réels aujourd'hui, uniquement :

```
Component (LoginScreen)
   ↓
setState local (via useState / usePhoneNumber)
   ↓
Re-render du composant
```

---

## 10. Routing

❌ **Not implemented.** Aucune dépendance `react-router-dom` (confirmé absente de `package.json` et de `node_modules` après `npm install`). `App.tsx` rend `<LoginScreen />` de façon **inconditionnelle**, sans notion de chemin (`path`) :

```tsx
function App() {
  return <LoginScreen onOtpRequested={...} />;
}
```

| Route | Screen | Protégée ? | Description |
|---|---|---|---|
| *(toutes, sans distinction)* | `LoginScreen` | Non | En l'absence de routeur, **toute URL servie par le serveur Vite affiche le même écran** — il n'existe pas de notion de route `/login` ou `/otp` dans le code |

- **Route par défaut** : il n'y en a pas au sens propre — c'est le seul écran qui existe.
- **Navigation** : aucune (pas de `<Link>`, pas de `navigate()`).
- **Protected routes** : non applicable, aucun mécanisme d'auth-guard n'existe côté frontend.
- **Redirects** : aucun.

Le seul "seam" prévu pour la navigation future est la prop `onOtpRequested` de `LoginScreen` (voir §7) — un futur routeur pourra l'utiliser pour naviguer vers `/otp` sans modifier `LoginScreen` lui-même.

---

## 11. Responsive design

- **Stratégie** : mobile-first — les styles par défaut (sans media query) ciblent le mobile ; **une seule** media query élargit la mise en page au-delà.
- **Breakpoints réellement présents dans le code** :

| Breakpoint | Fichier | Effet réel |
|---|---|---|
| `@media (min-width: 640px)` | `LoginScreen.module.css` | `.page` centre son contenu, `.hero`/`.card`/`.footer` sont contraints à `max-width: 480px` |
| `@media (prefers-reduced-motion: reduce)` | `LoadingSpinner.module.css` | Coupe l'animation du spinner |

- **Comportement à 375px / 390px** : aucune media query dédiée à ces largeurs — le layout est fluide par défaut (colonne unique, `width: 100%`, hero à hauteur fixe `220px`), donc 375px et 390px se comportent de façon identique (pas de règle spécifique à l'un ou l'autre).
- **Comportement desktop (≥640px)** : la carte, le hero et le footer sont recentrés avec une largeur maximale de `480px` — pas de mise en page "desktop" distincte, juste un plafond de largeur, conformément à la consigne de ne pas réinventer une maquette desktop.
- **Règle importante** : aucune position `absolute`/`fixed` n'est utilisée pour la mise en page ; tout repose sur `flex` + `margin` négatif (pour le chevauchement carte/hero).

---

## 12. PWA

❌ **Not implemented — intégralement.**

Vérifié : pas de dépendance `vite-plugin-pwa` dans `package.json`, pas de `manifest.json`, pas de `public/` (donc pas d'icônes), aucun enregistrement de service worker dans `main.tsx`, aucune configuration `VitePWA(...)` dans `vite.config.ts`.

Il n'y a donc **rien à vérifier dans l'onglet Application de Chrome DevTools** aujourd'hui — l'application n'est pas installable, n'a pas de `theme-color`, pas de `display: standalone`, pas de cache offline. Ce sera à construire lors d'une itération future (voir Phase 1 / Sprint 4 prévu).

---

## 13. Configuration et variables d'environnement

| Variable | Obligatoire ? | Exemple (`.env.example`) | Utilisation |
|---|---|---|---|
| `VITE_API_BASE_URL` | **Non** — une valeur de secours est codée en dur dans `src/api/client.ts` (`http://localhost:3001/api/v1`) | `VITE_API_BASE_URL=http://localhost:3001/api/v1` | Base URL de tous les appels Axios (`httpClient`) |

**Précision demandée par le brief** : pour afficher le Login Screen (sans cliquer sur "Envoyer OTP"), **aucune variable d'environnement n'est nécessaire** — la page se rend entièrement sans réseau. La variable ne devient pertinente qu'au moment où l'utilisateur soumet le formulaire et que le frontend a besoin de savoir quelle URL de backend contacter.

Aucun secret n'est stocké côté frontend (aucun token, clé API, ou mot de passe dans le code ou dans `.env.example`).

---

## 14. Scripts npm

Scripts réellement définis dans `frontend/package.json` — **liste exhaustive, rien de plus n'existe** :

| Script | Commande réelle | Fonctionne (vérifié lors de cet audit) ? |
|---|---|---|
| `npm run dev` | `vite` | ✅ Oui — serveur démarré, page servie, aucune erreur de transformation |
| `npm run build` | `tsc -b && vite build` | ❌ **Non — échoue actuellement.** Voir Known Issues §K.1 |
| `npm run preview` | `vite preview` | ⚠️ Non testé indépendamment lors de cet audit (dépend d'un `build` réussi au préalable, donc actuellement inutilisable tant que K.1 n'est pas corrigé) |
| `npm run test` | `vitest run` | ✅ Oui — 8/8 tests passent (2 fichiers) |
| `npm run test:watch` | `vitest` | Non testé en mode watch (équivalent de `test` sans l'option `run`) |

**`npm run lint` n'existe pas** — aucun script `lint` n'est défini, et ESLint n'est pas une dépendance du projet. Ne pas exécuter cette commande, elle échouera avec `Missing script: "lint"`.

---

## 15. État actuel du frontend

| Fonctionnalité | État | Fichiers concernés |
|---|---|---|
| Setup React + Vite + TypeScript | ✅ | `package.json`, `vite.config.ts`, `tsconfig.json` |
| Design tokens (couleurs, typographie) | ✅ | `src/styles/tokens.css` |
| Image hero réelle (asset issu de Figma) | ❌ | — (placeholder CSS dans `LoginScreen.module.css`, voir §6.6) |
| Composants UI (Button, Input, ErrorMessage, LoadingSpinner) | ✅ | `src/components/ui/` |
| Composant Brand | ✅ | `src/components/auth/Brand/` |
| Login Screen (saisie téléphone + soumission) | ✅ | `src/screens/auth/LoginScreen/` |
| Validation téléphone (+212, 9 chiffres) | ✅ | `src/hooks/usePhoneNumber.ts` |
| API client (Axios) | ✅ | `src/api/client.ts` |
| Auth API — `requestOtp()` | ✅ | `src/api/auth.api.ts` |
| Écran OTP | 🔵 Planned | — |
| Écran Register / Sign up | 🔵 Planned | — (lien "Sign up" présent visuellement, sans action) |
| Auth store (Zustand) | 🔵 Planned | — |
| Routing (React Router) | 🔵 Planned | — |
| i18n (FR/AR/Darija) | 🔵 Planned | — (FR codé en dur) |
| PWA (manifest, service worker) | 🔵 Planned | — |
| Farm screens | 🔵 Planned | — |
| Recommendation screens | 🔵 Planned | — |
| Tests unitaires (Vitest) | ✅ | `Button.test.tsx`, `LoginScreen.test.tsx` (8 tests, tous verts) |
| `npm run build` | ❌ Cassé | voir Known Issues §K.1 |
| `npm run lint` | ❌ Absent du projet | `package.json` |
| Intégration monorepo (`turbo.json`, workspace racine) | ❌ | `frontend/` est livré comme package npm autonome, pas encore rattaché au monorepo Turborepo du projet |

---

## 16. Guide DEV2 — lancer le frontend

### Prérequis

- **Node.js** : aucune contrainte n'est déclarée dans `package.json` (pas de champ `engines`), mais Vite 5 requiert Node.js **18+** (recommandé : Node 20 LTS ou plus récent — cet audit a été réalisé avec Node 22.22.2).
- **npm** : fourni avec Node, aucune version minimale spécifique documentée dans le projet.
- **Git** : pour récupérer le code.
- Aucune autre dépendance système n'est requise pour lancer uniquement le frontend.

### Étape 1 — Récupérer le code

```bash
git clone <url-du-repo>
cd <nom-du-repo>
git pull origin <votre-branche>
```

### Étape 2 — Se placer dans `frontend`

```bash
cd frontend
```

### Étape 3 — Installer les dépendances

```bash
npm install
```

À exécuter **dans `frontend/`**, pas à la racine du monorepo : à ce stade du code, `frontend/` est un package npm autonome (pas de `workspaces` racine le référençant), donc `npm install` doit être lancé directement dans ce dossier pour que `node_modules/` s'y crée.

### Étape 4 — Configuration

```bash
cp .env.example .env
```

Contenu de `.env.example` :

```bash
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

Cette variable **n'est pas obligatoire** pour voir le Login Screen (§13) — une valeur de secours est déjà codée en dur dans `src/api/client.ts`. La copier reste une bonne pratique pour rendre la configuration explicite.

### Étape 5 — Backend : nécessaire ou non ?

**Le Login Screen peut être visualisé sans démarrer le backend.** Confirmé dans le code : `LoginScreen.tsx` ne contient aucun `useEffect` ni aucun appel API au chargement — la page se rend uniquement à partir de son état local.

Le backend (`auth-service`, port `3001`) n'est nécessaire que si vous voulez tester le clic sur **"Envoyer OTP"** jusqu'au bout (sinon vous obtiendrez l'écran d'erreur "Impossible d'envoyer le code. Réessayez.", ce qui est un comportement correct et attendu si le backend n'est pas lancé).

### Étape 6 — Lancer le frontend

```bash
npm run dev
```

Port réel confirmé (`vite.config.ts` ne redéfinit pas `server.port`, donc c'est le défaut Vite) :

```
http://localhost:5173
```

### Étape 7 — Voir le Login Screen

Ouvrir :

```
http://localhost:5173/
```

Aucune autre route n'existe (§10) — cette seule URL affiche déjà le Login Screen dans son intégralité.

### Étape 8 — Vérification visuelle

```
□ Page chargée
□ Bandeau "hero" visible (⚠️ actuellement un aplat vert dégradé, PAS une photo — normal, voir §6.6)
□ Titre "Al katra bel qatra" + sous-titre visibles
□ Champ "Numéro de téléphone" visible, avec préfixe "+212"
□ Bouton "Envoyer OTP" visible, grisé tant que le champ est vide
□ Saisie d'un chiffre → le bouton devient vert foncé et le champ passe en bordure verte
□ Bas de page "Don't have an account ? Sign up" visible
□ Aucune erreur dans la console du navigateur au chargement
```

---

## 17. Troubleshooting DEV2

### `npm install` échoue

Causes possibles :
- Node.js trop ancien (< 18) → mettre à jour Node.
- Cache npm corrompu → `npm cache clean --force` puis réessayer.
- Exécuté à la racine du monorepo au lieu de `frontend/` → se replacer dans `frontend/` (§16, étape 2/3).

### `npm run dev` échoue

- Vérifier que `npm install` a bien été exécuté dans `frontend/` (dossier `node_modules/` présent).
- Lire l'erreur affichée dans le terminal — Vite affiche généralement une erreur de syntaxe ou d'import précise.

### `npm run build` échoue

**C'est un comportement connu et actuel du projet — voir Known Issues §K.1.** Ce n'est pas une erreur d'installation de DEV2. `npm run dev` continue de fonctionner normalement malgré cet échec de build.

### Port 5173 déjà utilisé

```bash
# Libérer le port, ou lancer sur un autre port :
npm run dev -- --port 5174
```

### Page blanche

- Ouvrir la console du navigateur (F12) et regarder les erreurs JS.
- Vérifier le terminal où tourne `npm run dev` pour une erreur de compilation Vite.
- Vérifier qu'aucune route particulière n'est demandée dans l'URL — il n'y a pas de routing (§10), donc toute URL doit afficher le même contenu ; une page blanche indique une vraie erreur JS, pas un problème de route.

### Image Hero absente

**Normal, pas un bug d'installation.** Aucune image n'existe dans le repository (§6.6) — ni dans `public/` (qui n'existe pas), ni dans `src/assets/` (qui n'existe pas non plus). La zone hero affiche un dégradé CSS de secours. Rien à corriger côté installation.

### API errors

- **Frontend running** (`npm run dev` actif) mais **backend non démarré** → cliquer sur "Envoyer OTP" affichera `Impossible d'envoyer le code. Réessayez.` — c'est le comportement attendu (§7), pas un bug.
- **Backend running** mais requête toujours en échec → vérifier que `auth-service` répond bien sur `http://localhost:3001/health`, et que `VITE_API_BASE_URL` (ou la valeur de secours) pointe vers le bon port.
- **CORS** : non pertinent ici — `auth-service` autorise déjà toutes les origines (§1), aucune configuration CORS côté frontend n'est nécessaire ou présente.

---

## 18. Workflow Dev1 → Dev2

```
Dev1
 ↓ développe
Frontend components/screens (composants ui/, Brand, LoginScreen)
 ↓ commit + push
Git branch (ex. feature/login-screen)
 ↓ pull request / merge
Dev2
 ↓
git pull
 ↓
cd frontend && npm install
 ↓
npm run dev   (vérifie que le Login Screen s'affiche toujours correctement)
 ↓
Develop Farm screens (nouveaux dossiers, réutilisation des composants ui/)
```

### Commandes Git utiles

```bash
git status
git pull origin <branche>
git checkout -b feature/<nom-de-la-fonctionnalite>
cd frontend
npm install     # à refaire après chaque pull qui modifie package.json
npm run dev
```

### Ce que DEV2 peut modifier librement

- Créer de nouveaux dossiers sous `src/screens/` pour les futurs écrans (Farm, etc.).
- Créer de nouveaux composants sous `src/components/ui/` ou `src/components/<domaine>/`.
- Ajouter de nouvelles fonctions dans `src/api/` pour de nouveaux endpoints.
- Ajouter de nouveaux tokens dans `src/styles/tokens.css` s'ils manquent.

### Ce que DEV2 devrait éviter de modifier sans coordination avec DEV1

- `src/components/ui/*` existants (Button, Input, ErrorMessage, LoadingSpinner) — ce sont des primitives partagées ; les faire évoluer sans concertation peut casser le Login Screen.
- `src/screens/auth/LoginScreen/*` — écran déjà validé visuellement contre Figma.
- `src/styles/tokens.css` — modifier une valeur existante (plutôt qu'en ajouter une nouvelle) change l'apparence de tout ce qui la consomme.
- `src/hooks/usePhoneNumber.ts` — sa regex doit rester synchronisée avec le backend (`auth-service`).

---

## 19. Convention pour continuer le développement

Architecture à suivre pour tout nouvel écran, adaptée de celle déjà en place pour `LoginScreen` :

```
New screen (ex. FarmListScreen)
   ↓
src/screens/<domaine>/<NomEcran>/<NomEcran>.tsx  (+ .module.css, + .test.tsx)
   ↓
Composants réutilisables
   ├─ génériques      → src/components/ui/      (ex. Card, Badge — s'ils n'existent pas déjà)
   └─ métier          → src/components/<domaine>/  (ex. FarmCard sous components/farm/)
   ↓
API layer
   └─ src/api/<domaine>.api.ts   (ex. farm.api.ts, sur le modèle de auth.api.ts)
   ↓
Types
   └─ src/types/<domaine>.types.ts   (ex. farm.types.ts, sur le modèle de auth.types.ts)
   ↓
Store (si un état partagé entre écrans devient nécessaire)
   └─ 🔵 à introduire seulement à ce moment-là — ne pas ajouter Zustand "au cas où"
```

**Où placer précisément les éléments mentionnés dans le brief Phase 1** (aucun n'existe encore, à créer selon ce patron) :

| Élément prévu | Emplacement à suivre |
|---|---|
| `FarmListScreen` | `src/screens/farm/FarmListScreen/` |
| `FarmCard` | `src/components/farm/FarmCard/` |
| `ParcelDetailScreen` | `src/screens/farm/ParcelDetailScreen/` |
| Appels API Farm | `src/api/farm.api.ts` |
| Store Zustand (si introduit) | `src/store/` (dossier à créer) |
| Types Farm | `src/types/farm.types.ts` |

---

## 20. Definition of Done — Frontend actuel

État réel après inspection (pas de case cochée par défaut) :

```
[x] npm install fonctionne                → vérifié, 182 packages installés sans erreur
[ ] npm run build fonctionne              → ÉCHOUE actuellement (voir Known Issues §K.1)
[x] Login screen accessible               → http://localhost:5173/, vérifié
[ ] Hero image visible                    → placeholder CSS uniquement, aucune vraie image (§6.6)
[x] No console errors (transform Vite)    → aucune erreur de transformation au démarrage ;
                                             non vérifié dans un vrai navigateur graphique (sandbox headless)
[x] Phone input fonctionne                → vérifié via les tests (LoginScreen.test.tsx)
[x] Validation fonctionne                 → vérifié via les tests (regex backend respectée)
[x] Button states fonctionnent            → vérifié via les tests (Button.test.tsx)
[ ] Responsive mobile fonctionne          → non vérifié visuellement (pas de navigateur graphique
                                             disponible pour cet audit) ; le CSS mobile-first est en
                                             place et une seule media query desktop existe (§11)
```

---

## 21. Résumé pour DEV2

### TL;DR

```bash
git pull
cd frontend
npm install
npm run dev
```

Puis ouvrir :

```
http://localhost:5173
```

**Le backend n'est pas nécessaire pour simplement voir le Login Screen** — il ne devient utile qu'au moment de tester réellement l'envoi d'un OTP (bouton "Envoyer OTP").

---

## Known Issues

### K.1 — `npm run build` échoue (bug réel, confirmé lors de cet audit)

**Symptôme** :

```
src/api/client.ts(3,29): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/components/auth/Brand/Brand.tsx(1,20): error TS2307: Cannot find module './Brand.module.css' ...
src/components/ui/Button/Button.tsx(3,20): error TS2307: Cannot find module './Button.module.css' ...
... (même erreur pour ErrorMessage, Input, LoadingSpinner, LoginScreen)
```

**Cause** : il manque un fichier `src/vite-env.d.ts` contenant `/// <reference types="vite/client" />`. C'est ce fichier qui déclare, pour TypeScript, le type de `import.meta.env` **et** les déclarations de module ambiantes pour les imports `*.module.css`. Sans lui, `tsc -b` échoue sur ces deux points.

**Impact réel, vérifié** :
- `npm run dev` **n'est pas affecté** — Vite transforme le code avec esbuild sans vérification de types complète, donc le serveur de développement démarre et sert correctement le Login Screen (vérifié : titre correct, module CSS chargé avec un `200`).
- `npm run build` (qui lance `tsc -b` avant `vite build`) **échoue** et ne produit aucun artefact de production.
- `npm run preview` est donc également inutilisable tant que `build` échoue.

**Correction attendue** (à faire par DEV1, pas appliquée ici conformément à la consigne de ne modifier aucun fichier du projet dans le cadre de cet audit) : ajouter un fichier `frontend/src/vite-env.d.ts` avec le contenu suivant :

```ts
/// <reference types="vite/client" />
```

C'est le fichier standard généré par tout template officiel Vite + TypeScript ; son absence ici est un oubli lors du scaffolding initial.

### K.2 — Image hero manquante

Aucun asset image réel n'a été fourni/intégré (§6.6). Ce n'est pas bloquant pour le fonctionnement de l'application, mais l'écran ne ressemble pas encore visuellement à 100 % à la maquette Figma (photo absente).

### K.3 — Aucun `.gitignore`

Le dossier `frontend/` tel que livré ne contient pas de `.gitignore`. À créer avant tout commit pour éviter de versionner `node_modules/`, `dist/` et `.env`.

### K.4 — `frontend/` non intégré au monorepo

`frontend/` est un package npm autonome (son propre `package.json`, sa propre installation) — il n'est pas référencé par un `turbo.json` ou un `package.json` racine avec des `workspaces`. Si le reste du monorepo Al Katra Bel Qatra utilise Turborepo, l'intégration reste à faire.




