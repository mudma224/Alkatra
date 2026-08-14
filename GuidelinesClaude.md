# Backend guidelines : 
- Il faut respecter strictement l'architecture modulaire de NestJS : Module, Controller, Service/Provider, DTO, Guard, Interceptor, Pipe, etc., chacun avec une responsabilité claire.

- Il ne faut pas mettre de logique métier dans les Controllers. Le Controller doit principalement recevoir la requête, appeler le Service approprié et retourner la réponse.

- La logique métier doit être implémentée dans les Services/Providers appropriés.

- Il ne faut pas mettre de logique métier dans les DTOs. Les DTOs servent principalement à définir et valider la structure des données entrantes.

- Il ne faut pas mettre de logique métier dans les Entities. Les Entities représentent la structure et le comportement lié aux données persistées, mais les règles métier complexes doivent rester dans les Services/Domain logic appropriés.

- Toujours utiliser des DTOs pour les données entrantes des endpoints au lieu d'accepter directement des objets arbitraires.

- Toujours utiliser class-validator et class-transformer pour valider et transformer les données entrantes lorsque cela est pertinent.

- La validation côté frontend ne doit jamais être considérée comme une validation de sécurité. Le backend doit toujours revalider les données reçues.

- Ne jamais faire confiance aux données envoyées par le client.
- Toute règle métier importante doit être vérifiée côté backend même si elle est déjà vérifiée côté frontend.

- Les Guards doivent être utilisés pour les responsabilités d'authentification et d'autorisation lorsque cela correspond à leur rôle.

- L'authentification et l'autorisation doivent être clairement séparées : être authentifié ne signifie pas automatiquement être autorisé à effectuer une action.

- Ne jamais considérer qu'un utilisateur peut accéder à une ressource simplement parce qu'il connaît son ID. Vérifier systématiquement les permissions et l'appartenance à la ressource lorsque nécessaire.
Ne jamais exposer de données sensibles dans les réponses API : mots de passe, secrets, tokens internes, informations privées, etc.

- Les mots de passe doivent toujours être hashés avec une méthode adaptée et ne doivent jamais être stockés en clair.

- Les secrets, clés API, mots de passe DB, JWT secrets et credentials ne doivent jamais être hardcodés dans le code.

- Les variables d'environnement doivent être utilisées pour les secrets et les configurations dépendantes de l'environnement.

- Il faut valider les variables d'environnement au démarrage de l'application afin de détecter rapidement une configuration invalide.

- Ne jamais retourner directement une Entity complète au client si cela peut exposer des données qui ne doivent pas être publiques. Utiliser des Response DTOs/serializers lorsque nécessaire.

- Les réponses API doivent avoir une structure cohérente dans toute l'application.

- Les codes HTTP doivent être utilisés correctement : 200, 201, 204, 400, 401, 403, 404, 409, 422, 500, etc., selon le cas.

- Il ne faut pas utiliser 200 OK pour toutes les situations simplement parce que la requête a atteint le serveur.

- Les erreurs doivent être gérées avec les exceptions NestJS appropriées (BadRequestException, UnauthorizedException, ForbiddenException, NotFoundException, ConflictException, etc.).

- Ne jamais exposer les stack traces, détails internes de la base de données ou informations sensibles dans les réponses destinées au client.

- Les erreurs doivent être suffisamment informatives pour le frontend mais suffisamment génériques pour ne pas révéler d'informations sensibles.

- Ne pas utiliser try/catch partout sans raison. Utiliser try/catch uniquement lorsqu'il permet réellement de gérer, transformer ou enrichir une erreur.

- Ne jamais faire un catch qui ignore silencieusement une erreur.

- Les erreurs inattendues doivent être laissées au système global de gestion des exceptions lorsque le traitement local n'est pas nécessaire.

- Les appels à la base de données doivent rester dans les Services ou dans une couche d'accès aux données clairement définie, et non directement dans les Controllers.

- Ne pas dupliquer les requêtes DB dans plusieurs Services si une abstraction claire et réellement réutilisable est nécessaire.
Mais ne pas créer des repositories, helpers ou abstractions inutiles uniquement pour respecter un pattern.

- Toujours chercher si un Service, Repository, Guard, Pipe, Interceptor, DTO ou util existe déjà avant d'en créer un nouveau.

- Ne pas créer un nouveau module si une fonctionnalité appartient clairement à un module existant.
Chaque module doit représenter une responsabilité métier ou fonctionnelle cohérente.

- Éviter les modules gigantesques qui contiennent des fonctionnalités sans rapport entre elles.
Les dépendances entre modules doivent être explicites et minimisées.

- Ne pas créer de dépendances circulaires entre modules sauf nécessité exceptionnelle et justification claire.

- Il faut utiliser l'injection de dépendances de NestJS plutôt que d'instancier manuellement les Services avec new.

- Les Services doivent rester testables et ne doivent pas dépendre inutilement de détails d'implémentation.

- Ne pas utiliser de variables globales mutables pour partager l'état entre les requêtes.
Toute donnée liée à un utilisateur ou à une requête doit être correctement isolée afin d'éviter les fuites de données entre utilisateurs.

- Les opérations asynchrones doivent utiliser correctement async/await et gérer les erreurs associées.

- Ne jamais oublier await lorsqu'une opération asynchrone doit être terminée avant de continuer.

- Éviter les appels asynchrones séquentiels inutiles lorsqu'ils peuvent être exécutés en parallèle sans compromettre la logique métier.

- Éviter les requêtes N+1 vers la base de données. Toujours vérifier le nombre de requêtes générées par une opération lorsqu'elle travaille avec des relations ou des collections.

- Ne jamais charger plus de données que nécessaire depuis la base de données.

- Utiliser la pagination pour les endpoints qui peuvent retourner un grand nombre de données.

- Ne jamais retourner une collection potentiellement énorme sans limite ou pagination.

- Les filtres, tris et paramètres de pagination venant du client doivent être validés et contrôlés.

- Ne jamais construire manuellement des requêtes SQL en concaténant directement des valeurs venant du client.

- Utiliser les mécanismes paramétrés/ORM prévus pour éviter les SQL injections.

- Les opérations qui doivent être atomiques doivent utiliser des transactions.

- Lorsqu'une opération modifie plusieurs ressources dépendantes, vérifier si une transaction est nécessaire pour garantir la cohérence des données.

- Les contraintes importantes d'intégrité doivent être garanties au niveau de la base de données lorsque cela est pertinent, et pas uniquement dans le code applicatif.

- Ne pas considérer une vérification préalable comme suffisante pour garantir l'unicité ou l'intégrité lorsqu'une contrainte DB est nécessaire.

- Les migrations de base de données doivent être versionnées et reproductibles.

- Ne pas modifier manuellement la structure de production sans migration contrôlée.

- Ne jamais supprimer ou modifier des données en production sans comprendre précisément l'impact de l'opération.

- Les opérations destructives doivent être particulièrement vérifiées et protégées.

- Les endpoints doivent respecter les conventions REST déjà utilisées dans le projet.

- Les noms des routes doivent être cohérents et prévisibles.

- Ne pas créer des endpoints différents pour une même opération simplement parce que cela semble plus simple.

- Toujours vérifier si un endpoint existant peut être réutilisé avant d'en créer un nouveau.

- Les contrats API doivent rester cohérents entre frontend et backend.

- Toute modification d'un endpoint, DTO ou format de réponse pouvant affecter le frontend doit être explicitement identifiée.

- Ne jamais inventer silencieusement un contrat API qui n'existe pas.

- La documentation OpenAPI/Swagger doit rester synchronisée avec les endpoints, DTOs et réponses réelles.

- Les endpoints doivent être documentés suffisamment pour qu'un autre développeur puisse comprendre leur utilisation.

- Les paramètres, body, réponses et codes d'erreur importants doivent être correctement documentés.

- Les fichiers de configuration doivent être séparés du code métier.

- Les configurations dépendantes de l'environnement doivent être centralisées.

- Ne pas disperser des process.env.X partout dans l'application lorsqu'une configuration centralisée peut être utilisée.

- Les logs doivent être utiles, structurés et suffisamment informatifs pour diagnostiquer un problème.

- Ne jamais logger des mots de passe, tokens, secrets ou données personnelles sensibles.

- Les logs de debug temporaires doivent être supprimés ou désactivés avant la production.

- Il faut mettre en place une stratégie cohérente de logging et ne pas utiliser console.log partout comme système de logging production.

- Les endpoints sensibles doivent être protégés contre les abus lorsque nécessaire : rate limiting, throttling, contrôle des tentatives, etc.

- Les endpoints d'authentification doivent particulièrement prendre en compte le brute force et les abus.

- Les entrées utilisateur doivent toujours être considérées comme potentiellement malveillantes.
Les uploads de fichiers doivent être contrôlés : taille, type, extension, contenu lorsque nécessaire et emplacement de stockage.

- Ne jamais faire confiance au Content-Type fourni par le client pour déterminer à lui seul le type réel d'un fichier.

- Les ressources doivent vérifier les permissions au niveau du backend avant toute opération sensible : lecture, modification ou suppression.

- Les IDs provenant du client doivent être validés et ne doivent jamais suffire à déterminer l'autorisation d'accès.

- Il faut prendre en compte les problèmes d'IDOR/BOLA lors de la conception des endpoints.
- Ne jamais exposer automatiquement toutes les propriétés d'une Entity dans les réponses API.
Les données sensibles doivent avoir une stratégie claire de protection, de stockage et de transmission.

- Les JWT doivent être utilisés conformément à la stratégie d'authentification définie dans le projet et leurs secrets doivent rester côté serveur.

- Les tokens expirés, invalides ou révoqués doivent être correctement gérés selon l'architecture d'authentification.

- Les refresh tokens doivent être traités comme des informations sensibles et protégés correctement.

- Il faut éviter de mettre une logique d'autorisation complexe directement dans chaque Controller. Utiliser une abstraction appropriée lorsqu'elle est réellement réutilisable.

- Ne pas créer de Guards, Decorators, Interceptors ou Pipes custom sans besoin réel. Toujours vérifier si NestJS fournit déjà une solution adaptée.

- Les Pipes doivent être utilisés pour les responsabilités liées à la transformation et à la validation des données d'entrée.

- Les Interceptors doivent être utilisés pour les responsabilités transversales appropriées, pas pour cacher de la logique métier complexe.

- Les Middleware doivent être utilisés pour les traitements transversaux qui correspondent réellement à leur rôle, pas pour remplacer les Guards ou Services.

- Il faut choisir correctement entre Middleware, Guard, Pipe, Interceptor, Filter et Service selon la responsabilité du traitement.

- Il faut éviter de mettre toute la logique dans un seul Service. Si un Service devient extrêmement complexe, identifier les responsabilités qui peuvent être séparées proprement.

- Mais ne pas créer une multitude de petits Services uniquement pour réduire artificiellement la taille des fichiers.

- Il ne faut pas créer des utils inutiles. Un util doit résoudre un problème réellement réutilisable ou isoler une logique technique clairement identifiable.

- Il ne faut pas créer une abstraction simplement parce qu'un morceau de code apparaît une seule fois.
Il faut éviter la duplication de logique métier entre plusieurs Services.

- Une règle métier doit avoir une source de vérité clairement identifiable.
Il faut éviter les valeurs magiques dans le code. 
- Les constantes importantes doivent être nommées et centralisées lorsqu'elles sont réellement réutilisées.

- Il faut utiliser TypeScript correctement et éviter any.

- Les types doivent refléter le domaine réel et ne doivent pas être contournés avec des casts inutiles comme as any.

- Les types des réponses et des données internes doivent être suffisamment explicites pour éviter les erreurs silencieuses.

- Il faut utiliser des enums ou constantes lorsque le domaine possède un ensemble limité de valeurs bien définies.

- Il faut gérer correctement les valeurs null et undefined au lieu de supposer qu'une donnée existe toujours.

- Les opérations critiques doivent être idempotentes lorsqu'elles peuvent être répétées par le client ou un système distribué.

- Les tâches asynchrones, événements, queues et messages doivent être conçus en tenant compte des duplications, retries et échecs partiels.

- Lorsqu'un système distribué est utilisé, il ne faut jamais supposer qu'un message sera reçu exactement une seule fois sans mécanisme garantissant cette propriété.

- Les opérations avec Redis, Kafka, queues ou autres systèmes externes doivent gérer les erreurs, timeouts et indisponibilités.

- Ne jamais faire dépendre inutilement une requête HTTP d'un service externe lent ou non critique si cela peut être évité.

- Les appels vers des services externes doivent avoir des timeouts et une stratégie d'erreur appropriée lorsqu'ils sont critiques.

- Il faut éviter les dépendances fortes et inutiles entre microservices.

- Un microservice ne doit pas accéder directement à la base de données d'un autre microservice si l'architecture impose que chaque service possède ses propres données.

- La communication entre microservices doit passer par les mécanismes définis par l'architecture du projet : API, événements, messages, etc.

- Il faut respecter les frontières de responsabilité entre les microservices.

- Ne pas déplacer une logique métier d'un microservice vers un autre uniquement pour simplifier temporairement le code.


- Les opérations qui nécessitent plusieurs microservices doivent prendre en compte les problèmes de cohérence distribuée et d'échec partiel.

- Les endpoints doivent être conçus avec des timeouts, retries et comportements d'erreur appropriés lorsqu'ils dépendent de services externes.

- Il faut écrire des tests pour les règles métier importantes, les Services critiques, les Guards et les endpoints sensibles.

- Les tests ne doivent pas simplement vérifier que le code s'exécute ; ils doivent vérifier les comportements attendus et les cas d'erreur importants.

- Les tests doivent couvrir les cas nominaux, erreurs, permissions et cas limites des fonctionnalités critiques.

- Les mocks doivent être utilisés avec discernement. Ne pas mocker tellement de choses que le test ne vérifie plus réellement le comportement.

- Les changements importants doivent préserver les tests existants et ne pas les contourner simplement pour faire passer le build.

- Il faut vérifier le linting, le type checking, les tests et le build avant de considérer une fonctionnalité terminée.

- Ne pas modifier une partie du backend qui n'est pas nécessaire pour résoudre la tâche demandée.
- Ne pas faire de refactoring massif pendant une petite fonctionnalité sauf si le refactoring est réellement nécessaire.

- Avant de modifier un Service, Controller, Module, Entity ou DTO existant, vérifier où il est utilisé et quelles fonctionnalités pourraient être impactées.

- Avant de supprimer ou renommer quelque chose, rechercher toutes ses utilisations dans le projet.

- Toujours analyser l'architecture existante avant de créer une nouvelle solution.

- Toujours chercher si une fonctionnalité, abstraction, Service, DTO, Guard, Pipe, Repository ou util existe déjà avant d'en créer un nouveau.

- Ne pas ajouter une nouvelle librairie si une librairie déjà présente ou une fonctionnalité native de NestJS permet de résoudre correctement le problème.

- Toute nouvelle dépendance doit être justifiée par un besoin réel.

- Toute nouvelle abstraction architecturale importante doit être justifiée avant son implémentation.

 -Le code doit rester lisible par un autre développeur. Privilégier un code explicite, simple et maintenable plutôt qu'une architecture excessivement abstraite.

- Il faut privilégier la simplicité plutôt que l'over-engineering.

- L'architecture doit être proportionnelle à la complexité réelle du projet.

- Toute fonctionnalité doit être pensée en termes de sécurité, validation, performance, observabilité, maintenabilité et gestion des erreurs avant d'être considérée comme production-ready.

- Avant de considérer une tâche comme terminée, vérifier : compilation TypeScript, lint, tests, migrations, validation des DTOs, gestion des erreurs, permissions, sécurité et cohérence avec les contrats API.

- Une fonctionnalité n'est pas considérée comme production-ready simplement parce que le scénario nominal fonctionne. Les cas d'erreur, permissions, données invalides, données manquantes, concurrence et comportements inattendus doivent également être pris en compte.


# Frontend Guidelines : 
- Il ne faut pas implémenter dans le frontend une logique métier qui appartient au backend. Toute règle métier, autorisation, calcul critique ou validation métier doit rester dans le backend comme source de vérité.

- Si une vérification côté client est nécessaire pour améliorer l'UX, elle doit être cohérente avec la validation du backend, ne doit jamais remplacer la validation backend et doit être justifiée.
Le frontend ne doit jamais faire confiance aux données venant du client. Toute donnée importante doit être revalidée et sécurisée côté backend.

- Il ne faut pas créer des utils inutiles. Créer un util uniquement lorsqu'une logique est réellement réutilisée à plusieurs endroits ou lorsqu'elle permet de simplifier significativement un composant trop complexe.

- Il ne faut pas créer des hooks custom inutilement. Utiliser d'abord les hooks React existants et créer un custom hook uniquement lorsqu'une logique est réutilisable ou suffisamment complexe pour être isolée.

- Il ne faut pas créer des components s'ils ne sont pas réellement nécessaires. Un component doit avoir une responsabilité claire et apporter une vraie valeur en termes de réutilisation, lisibilité ou séparation des responsabilités.

- Toujours chercher si un component existant peut être réutilisé avant d'en créer un nouveau. Ne jamais dupliquer un component existant avec une légère modification si celui-ci peut être rendu configurable avec des props.

- Toujours privilégier la composition et les props plutôt que la duplication de components.
Chaque component doit avoir une responsabilité claire. Éviter les components qui mélangent UI, logique métier, appels API, gestion complexe du state et transformations de données.

- Il faut garder les components simples et lisibles. Si un component devient trop lourd, identifier précisément quelle responsabilité peut être extraite avant de créer plusieurs fichiers inutilement.

- Les appels API doivent être séparés de la présentation UI. Les components ne doivent pas contenir directement toute la logique de communication avec le backend lorsque cette logique peut être correctement isolée.

- La gestion des données serveur doit être séparée de la gestion du state purement UI. Ne pas utiliser un state global pour des données qui peuvent rester locales au component.

- Il ne faut pas utiliser Zustand ou un autre state manager global pour des données qui n'ont pas besoin d'être partagées entre plusieurs components.

- Il faut privilégier le state local avec useState lorsque l'état concerne uniquement un component ou une petite partie de l'interface.

- Le state global doit être utilisé uniquement lorsqu'une donnée doit réellement être partagée entre plusieurs parties indépendantes de l'application.

- Éviter de stocker dans le state des données qui peuvent être calculées à partir d'autres données. Utiliser une valeur dérivée lorsque cela est suffisant.

- Éviter useEffect lorsqu'il n'est pas nécessaire. Ne pas utiliser useEffect simplement pour calculer une valeur ou synchroniser des données qui peuvent être gérées directement avec React.

- Il faut éviter les re-renders inutiles et ne pas utiliser useMemo, useCallback ou React.memo sans raison mesurable ou justification claire.

- Les types TypeScript doivent être explicites et correctement définis. Éviter any sauf justification exceptionnelle.

- Les interfaces et types doivent être réutilisés lorsqu'ils représentent réellement le même concept métier. Ne pas créer plusieurs types différents pour représenter exactement la même donnée.

- Les données reçues du backend doivent respecter les contrats API définis. Ne pas inventer de propriétés, endpoints, structures de réponse ou comportements qui n'existent pas dans le backend.
Toute modification du contrat API doit être explicitement identifiée et ne doit pas être inventée silencieusement côté frontend.

- Les erreurs API doivent être gérées proprement. Ne jamais ignorer silencieusement une erreur venant du backend.

- Toujours prévoir les états loading, error, empty et success lorsqu'un écran dépend de données asynchrones.

- Les messages d'erreur affichés à l'utilisateur doivent être compréhensibles et adaptés à l'UX, sans exposer de détails techniques ou sensibles du backend.

- Il ne faut jamais exposer de secrets, clés privées, tokens sensibles ou variables d'environnement secrètes dans le code frontend.

- Toute donnée sensible doit être traitée conformément à la stratégie d'authentification définie côté backend.

- L'authentification et l'autorisation doivent rester des responsabilités du backend. Le frontend peut masquer/afficher des éléments selon l'état d'authentification pour l'UX, mais cela ne constitue jamais une sécurité.

- Les routes protégées côté frontend doivent être utilisées uniquement pour améliorer l'expérience utilisateur. La vraie protection des ressources doit toujours être faite côté backend.

- Il faut toujours respecter les conventions et l'architecture déjà présentes dans le projet avant d'introduire une nouvelle architecture ou librairie.

- Il ne faut pas ajouter une nouvelle librairie lorsqu'une fonctionnalité peut être correctement implémentée avec les outils déjà présents dans le projet.

- Avant d'installer une nouvelle dépendance, vérifier si une dépendance existante permet déjà de résoudre le problème.

- Il faut toujours réutiliser les composants du design system existant : Button, Input, Modal, Card, Badge, etc., avant d'en créer de nouveaux.

- Toujours chercher si un composant, hook, util, service ou helper existe déjà avant d'en créer un nouveau.

- Il faut maintenir une cohérence de design entre toute l'application : couleurs, typographie, spacing, border-radius, shadows, tailles, états et comportements doivent suivre le design system.

- Les valeurs de design doivent être centralisées lorsque cela est possible. Éviter de répéter des valeurs arbitraires comme des couleurs, espacements ou tailles différentes dans plusieurs composants.

- Il faut toujours centraliser le CSS réutilisable entre plusieurs components au lieu de créer des fichiers CSS individuels contenant de la duplication.

- Si Tailwind CSS est utilisé, il faut privilégier les classes et patterns existants du design system plutôt que d'introduire constamment de nouvelles valeurs arbitraires.

- Il ne faut pas créer de styles spécifiques lorsqu'un composant existant peut être configuré avec les variantes ou props prévues par le design system.

- Il faut respecter les états UI définis par le design system : default, hover, focus, active, disabled, loading, error, etc.

- Les interfaces doivent être responsive et fonctionner correctement sur les différentes tailles d'écran prévues par l'application.

- Il ne faut pas utiliser des valeurs fixes qui cassent inutilement le responsive design.
Les composants interactifs doivent être accessibles : utiliser les éléments HTML appropriés, labels, aria-* lorsque nécessaire, focus visible et navigation clavier.

- Ne pas utiliser un <div> ou un <span> comme bouton lorsqu'un <button> est approprié.

- Les formulaires doivent utiliser des labels et des messages d'erreur correctement associés aux champs.

- Les images doivent avoir un alt approprié lorsqu'elles apportent une information, et un alt="" lorsqu'elles sont purement décoratives.

- Il faut éviter les composants gigantesques contenant toute la logique d'une page. Une page doit orchestrer les différents composants plutôt que tout implémenter elle-même.

- Il faut séparer autant que possible les responsabilités : présentation UI, gestion du state, communication API et logique métier frontend doivent avoir des responsabilités clairement définies.

- Les noms de components, fonctions, variables, hooks et fichiers doivent être explicites et cohérents avec les conventions du projet.

- Il faut éviter les noms génériques comme data, handleData, utils, helpers lorsqu'un nom plus précis est possible.

- Il faut éviter la duplication de code. Si exactement la même logique apparaît plusieurs fois, vérifier d'abord si elle doit être factorisée.
Mais il ne faut pas factoriser prématurément du code qui n'est utilisé qu'une seule fois et qui reste parfaitement lisible.

- Il faut privilégier la simplicité et la lisibilité plutôt qu'une abstraction excessive.

- Ne pas créer une architecture complexe simplement pour respecter une règle d'abstraction. L'architecture doit être proportionnelle à la complexité réelle du projet.

- Il faut conserver une structure de dossiers cohérente et respecter la convention déjà utilisée dans le projet.

- Il ne faut pas déplacer ou renommer des fichiers existants sans raison claire, car cela peut casser des imports ou des conventions déjà établies.

- Avant de modifier un component existant, vérifier où il est utilisé afin de ne pas casser les autres écrans.

- Avant de supprimer un component, hook, util ou fichier, vérifier qu'il n'est plus utilisé ailleurs.
Toute nouvelle fonctionnalité doit être intégrée au système existant plutôt que développée comme une fonctionnalité isolée.

- Il faut gérer correctement les états de transition : loading, submitting, disabled, success, error et retry lorsqu'ils sont pertinents.

- Les actions utilisateur importantes doivent empêcher les doubles soumissions lorsque cela peut provoquer des requêtes dupliquées.

- Les données utilisateur doivent être correctement nettoyées/normalisées côté frontend uniquement lorsque cela est nécessaire pour l'UX, mais la validation finale reste toujours côté backend.

- Ne pas utiliser localStorage ou sessionStorage pour stocker des informations sensibles sans justification claire et validation de l'architecture de sécurité.

- Les logs de développement ne doivent pas exposer de données sensibles et doivent être supprimés ou contrôlés avant la production.

- Ne pas laisser de console.log, code mort, TODO temporaire ou workaround non documenté dans le code de production.

-
Il faut gérer les erreurs de manière prévisible et éviter les try/catch inutiles qui masquent les erreurs.

- Les composants doivent être testables. La logique complexe et les comportements importants doivent être suffisamment séparés pour pouvoir être testés facilement.

- Toute nouvelle fonctionnalité importante doit prendre en compte les cas nominaux, les cas d'erreur, les états vides et les cas limites.

- Avant de créer du nouveau code, toujours analyser le code existant et comprendre comment la fonctionnalité est déjà structurée.

- Ne jamais supposer qu'une fonctionnalité ou une abstraction n'existe pas. Toujours rechercher dans le projet avant de la recréer.

- Ne pas modifier une partie du projet qui n'est pas nécessaire pour résoudre la tâche demandée.

- Ne pas refactoriser massivement du code existant pendant l'implémentation d'une petite 
fonctionnalité, sauf si le refactoring est nécessaire pour garantir la qualité ou éviter une dette technique évidente.

- Toute décision architecturale ou ajout de dépendance important doit être justifié avant son implémentation.

- Le code doit rester compréhensible par un développeur débutant/intermédiaire qui rejoint le projet. Privilégier un code explicite, simple et maintenable plutôt qu'un code excessivement optimisé ou abstrait.

- Avant de considérer une tâche comme terminée, vérifier que le code compile, que TypeScript ne présente pas d'erreurs, que les imports sont corrects et que les fonctionnalités existantes ne sont pas cassées.

-Avant de considérer une fonctionnalité comme terminée, vérifier les principaux scénarios utilisateur et les états d'erreur associés.

- Toujours privilégier un code production-ready : sécurisé, typé, maintenable, responsive, accessible, cohérent avec le design system et aligné avec l'architecture existante.