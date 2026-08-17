# Documentation du Frontend

## 1. Vue d'ensemble

Le frontend est une application monopage React + TypeScript construite avec Vite. Elle sert de couche client pour la plateforme Al Katra et se concentre actuellement sur le flux d'authentification : validation du numéro de téléphone, demande d'OTP, vérification d'OTP et gestion de session.

L'application est volontairement allégée. Elle orchestre l'interaction utilisateur et communique avec le backend via des modules API typés, tandis que le backend reste l'autorité pour la validation, la sécurité et les règles métier.

## 2. Architecture

Le frontend suit une structure en couches simple :

- Couche UI : composants React et modules CSS
- Couche écrans : écrans d'authentification et état au niveau de l'écran
- Couche API : client Axios et wrappers d'API par domaine
- Logique métier : normalisation des entrées, helpers de validation et état de session

Le principe principal est la séparation des préoccupations :

- les écrans gèrent le flux d'interaction
- les composants rendent la présentation
- les modules API gèrent les contrats d'endpoint
- le backend impose les règles réelles

## 3. Structure du projet

```text
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js
├── setupTests.ts
├── .env.example
├── public/
│   └── ...
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── api/
│   │   ├── auth.api.ts
│   │   └── client.ts
│   ├── components/
│   │   ├── auth/
│   │   │   └── Brand/
│   │   └── ui/
│   │       ├── Button/
│   │       ├── ErrorMessage/
│   │       ├── Input/
│   │       ├── OTPInput/
│   │       └── ...
│   ├── hooks/
│   │   └── usePhoneNumber.ts
│   ├── screens/
│   │   └── auth/
│   │       ├── LoginScreen/
│   │       └── OTPScreen/
│   ├── styles/
│   │   ├── global.css
│   │   └── tokens.css
│   ├── types/
│   │   ├── api.types.ts
│   │   └── auth.types.ts
│   └── ...
└── ...
```

## 4. Pile technologique

- React 18
- TypeScript
- Vite
- Axios pour les requêtes HTTP
- Modules CSS pour le style des composants
- Vitest + Testing Library pour les tests frontend

## 5. Flux d'authentification

Le flux d'authentification frontend actuel est un flux téléphone + OTP compatible avec le service d'authentification.

1. L'utilisateur saisit un numéro de téléphone marocain sur l'écran de connexion.
2. Le client valide le format pour une rétroaction UX immédiate.
3. Le frontend appelle l'endpoint backend pour demander un OTP.
4. Le backend retourne un timestamp d'expiration.
5. L'écran OTP est affiché et le compte à rebours commence.
6. L'utilisateur saisit un code à six chiffres.
7. Le frontend soumet l'OTP à l'endpoint de vérification.
8. En cas de succès, l'application stocke les tokens de session retournés et les données utilisateur.

## 6. Responsabilités des écrans

### LoginScreen

L'écran de connexion est responsable de :

- collecter le numéro de téléphone
- formater l'entrée pour l'affichage
- valider le format du téléphone en amont
- envoyer la demande d'OTP
- afficher les erreurs d'API ou de validation

### OTPScreen

L'écran OTP est responsable de :

- recevoir le numéro de téléphone et le timestamp d'expiration
- rendre les entrées à six chiffres
- compter à rebours le temps restant
- valider le format de l'OTP avant l'envoi
- vérifier le code par rapport au backend
- renvoyer un nouvel OTP quand c'est autorisé

## 7. Composants

Le projet maintient une limite claire entre la logique réutilisable de l'UI et la logique spécifique à l'écran.

### Composants UI réutilisables

Ces composants sont génériques et ne connaissent rien à la logique d'authentification :

- Button
- Input
- OTPInput
- ErrorMessage
- Card
- LoadingSpinner

### Composants spécifiques au domaine

Ces composants sont liés au flux d'authentification :

- Brand
- LoginScreen
- OTPScreen

Cela permet de maintenir la couche UI focalisée et d'éviter une ingénierie excessive de l'arborescence des composants.

## 8. Gestion d'état

L'application utilise l'état des composants locaux pour les préoccupations spécifiques à l'écran telles que :

- valeurs d'entrée
- statut de soumission
- erreurs en ligne
- compte à rebours OTP
- refroidissement du renvoi

L'état de session d'authentification est conservé séparé et géré à la limite appropriée de l'application. Le frontend ne stocke pas d'état métier non lié de manière globale.

## 9. Couche API

Le dossier API contient le client HTTP et les wrappers d'endpoint.

### httpClient

Une instance Axios partagée est créée dans le module client.

Elle est responsable de :

- définir l'URL de base
- imposer le timeout des requêtes
- envoyer le type de contenu JSON
- joindre les en-têtes d'authentification quand disponibles

### authApi

Le module d'API d'authentification enveloppe les endpoints du backend pour :

- demander un OTP
- vérifier un OTP
- rafraîchir la session si nécessaire

Les écrans appellent ces fonctions d'API au lieu d'utiliser Axios directement. Cela permet de maintenir la logique réseau séparée de la présentation.

## 10. Règles de validation

Le frontend inclut une validation légère pour une meilleure UX, mais le backend reste la source de vérité finale.

### Validation du téléphone

L'entrée du téléphone suit le contrat de téléphone marocain utilisé par le backend.

Forme attendue :

- commence par +212
- le deuxième chiffre est 6 ou 7
- le format total correspond à `^\+212[67]\d{8}$`

### Validation OTP

Le code OTP est une valeur numérique à six chiffres.

Forme attendue :

- exactement 6 caractères
- chiffres uniquement
- modèle `^\d{6}$`

Le frontend aide l'utilisateur en validant tôt, mais le backend valide toujours lors de la demande.

## 11. Gestion des erreurs

Les erreurs sont gérées au niveau de l'écran.

Comportement typique :

- les erreurs de validation sont affichées en ligne
- les erreurs d'API sont capturées et converties en messages lisibles
- les détails bruts des erreurs du backend ne sont pas exposés directement à l'utilisateur
- les actions de réessai sont disponibles quand c'est approprié

Cela permet de maintenir l'UI conviviale tout en préservant le backend comme autorité de justesse.

## 12. Configuration de l'environnement

Le frontend utilise des variables d'environnement pour la configuration.

La valeur principale est :

- `VITE_API_BASE_URL`

Cela est utilisé par le client Axios pour accéder au backend.

## 13. Flux de travail de développement

Flux de travail local typique :

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Commandes utiles :

```bash
npm run test
npm run test:watch
npm run build
npm run preview
```

## 14. Tests

Le projet utilise Vitest et Testing Library pour les tests frontend.

Les tests actuels couvrent :

- le comportement des boutons
- les états d'UI liés à la validation
- les interactions des écrans d'authentification

La suite de tests est focalisée sur le comportement observable de l'utilisateur plutôt que sur les détails d'implémentation.

## 15. Conventions actuelles

Le frontend suit actuellement quelques conventions pratiques :

- les fichiers de composants restent colocalisés avec leurs styles
- la logique d'écran reste proche de l'écran auquel elle appartient
- la logique d'API est isolée dans des modules d'API
- la validation est conviviale pour le client mais autoritaire côté serveur
- l'UI reste allégée et évite les abstractions inutiles

## 16. Considérations de sécurité

### Stockage des tokens

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
