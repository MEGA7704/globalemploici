# GLOBAL EMPLOI

Application Cloudflare Pages/Workers + D1 + KV pour la mise en relation entre demandeurs d'emploi et recruteurs.

## Configuration Cloudflare

- Branche GitHub : `main`
- Infrastructure prédéfinie : Aucune
- Commande de build : `npm run build`
- Répertoire de sortie : `dist`
- Répertoire racine : `/`

Bindings déjà déclarés dans `wrangler.jsonc` :

- D1 `JOB_DB` -> base `job_d1`
- KV `JOB_KV` -> namespace `job_kv`

## Installation

```bash
npm install
npm run build
```

## Initialiser D1

Appliquer la migration `migrations/0001_init.sql` à la base D1 avant la première connexion.

Avec Wrangler :

```bash
npx wrangler d1 execute job_d1 --remote --file=migrations/0001_init.sql
```

## Secrets obligatoires

Ne jamais les mettre dans GitHub, `wrangler.jsonc` ou le JavaScript frontend.

Configurer :

- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SESSION_SECRET`

Exemple avec Wrangler :

```bash
npx wrangler secret put SUPER_ADMIN_EMAIL
npx wrangler secret put SUPER_ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Pour un projet Pages connecté directement à GitHub, ajouter ces valeurs dans les variables/secrets du projet Cloudflare depuis le tableau de bord.

Le premier login correspondant à `SUPER_ADMIN_EMAIL` initialise automatiquement le compte Super Admin dans D1 et y stocke uniquement le hash du mot de passe.

## Sécurité incluse

- authentification côté Worker ;
- hash PBKDF2-SHA256 avec sel aléatoire ;
- sessions en KV via cookie `HttpOnly`, `Secure`, `SameSite=Lax` ;
- limitation des tentatives de connexion par IP + compte ;
- contrôle des rôles côté serveur ;
- isolation des profils par session ;
- invalidation des sessions après changement de mot de passe ;
- aucune base sensible complète dans `localStorage` ;
- activation des abonnements réservée au Super Admin.

## Wave

- STANDARD : 1 000 FCFA
- BUSINESS : 10 000 FCFA

Le lien Wave est intégré à l'interface avec le montant correspondant.

## Déploiement

Après configuration des bindings, secrets et migration D1 :

```bash
npm run build
```

Puis déployer `dist/` via Cloudflare Pages ou connecter le dépôt GitHub.

## Diagnostic serveur

Après déploiement, ouvrez :

`https://VOTRE-DOMAINE.pages.dev/api/health`

Réponse attendue :

```json
{"ok":true,"service":"GLOBAL EMPLOI","d1":"ok","kv":"ok","assets":"ok"}
```

Erreurs explicites possibles :

- `BINDING_MISSING` : un binding Cloudflare (`JOB_DB`, `JOB_KV` ou `ASSETS`) manque.
- `D1_NOT_INITIALIZED` : exécuter `migrations/0001_init.sql` sur la base D1 `job_d1`.
- `D1_UNAVAILABLE` : D1 est mal lié ou indisponible.
- `KV_UNAVAILABLE` : KV est mal lié ou indisponible.

Les erreurs serveur renvoient aussi une `reference` correspondant au CF-Ray quand disponible. Utilisez cette référence dans les logs Cloudflare pour retrouver l'erreur, sans exposer de secret dans le navigateur.

## V4 — Profil complet du demandeur d'emploi
La première inscription du demandeur reste volontairement courte : informations personnelles + création du compte. Après connexion, **Mon profil** permet de compléter : informations professionnelles, formations/diplômes, expériences, recherche d'emploi, documents, langues et préférences.

Le tableau de bord affiche un **pourcentage de complétude** et des recommandations (CV, expérience, compétences, diplôme, langues). La V4 ajoute aussi `migrations/0002_candidate_profile.sql` pour documenter l'évolution du schéma. Le Worker sait créer/compléter ce schéma candidat automatiquement lors du premier accès, afin de rester compatible avec une base D1 V3 déjà en production.

Les pièces jointes candidat sont stockées de façon privée dans D1, accessibles uniquement via une session valide. Limite volontaire : **700 Ko par fichier** pour éviter les erreurs de taille D1. Types acceptés : PDF, DOC, DOCX, JPG, PNG. Pour des documents plus volumineux en production, prévoir ultérieurement un bucket Cloudflare R2.

## V5 — Formulaire recruteur complet

La première inscription Recruteur demande uniquement les informations personnelles du recruteur et la création du compte. Après connexion, **Profil entreprise** permet de compléter : identité du recruteur, entreprise, informations administratives, besoins en recrutement, documents officiels et préférences.

Statuts de vérification : `unverified` → `pending` → `verified`. Le Super Admin peut valider ou renvoyer un dossier à compléter depuis Administration. Les nouveaux schémas sont créés/complétés automatiquement par le Worker pour rester compatibles avec une base D1 déjà utilisée. Le fichier `migrations/0003_recruiter_profile.sql` est fourni pour une initialisation manuelle d'une base qui n'a pas encore reçu ces colonnes.

Menu recruteur : Tableau de bord, Profil entreprise, Publier une offre, Mes offres, Candidatures reçues, Recherche de candidats, Favoris, Messages, Abonnement, Paiements et Paramètres.

## V7 — Navigation compte simplifiée
- La page d'accueil publique reste affichée après connexion.
- Les boutons Se connecter / S'inscrire sont remplacés uniquement par Mon compte.
- Aucun ancien espace connecté ni menu vertical latéral n'est affiché automatiquement.
- Les rubriques privées s'ouvrent uniquement après sélection dans le menu déroulant Mon compte.
- Les pages privées sont affichées en pleine largeur, sans ancienne sidebar.
- Le bouton « ← Accueil » permet de revenir à la page publique.


## V9 — Offres, candidatures et recrutement

- La page publique **Offres d'emploi** affiche uniquement les offres publiées par des recruteurs ayant un abonnement **STANDARD** ou **BUSINESS** actif.
- Recherche des offres par poste/métier et par ville.
- Les cartes d'offres sont cliquables et ouvrent le détail complet dans une fenêtre.
- **Je postule** est disponible uniquement pour les comptes Demandeur d'emploi. Les recruteurs ne peuvent pas candidater.
- Chaque candidature apparaît dans **Candidatures reçues** du recruteur avec les informations professionnelles et de contact du postulant.
- La page **Profils / Candidats** présente les candidats actifs sous forme de cartes, avec recherche par métier/compétence et ville.
- **Je recrute** est disponible uniquement pour les comptes Recruteur et crée une proposition visible par le candidat.
- La suppression d'un compte supprime ses publications et relations associées (offres, candidatures, profils, documents, propositions et données liées).
- Une migration complémentaire `migrations/0004_recruitment_marketplace.sql` est fournie. Le Worker sait aussi créer cette table à la demande.


## V10 — Règles d'abonnement

- La formule **FREE dure 7 jours** pour les Demandeurs d'emploi et les Recruteurs.
- Un compte FREE peut consulter les pages publiques, les offres visibles et les profils visibles.
- Un compte FREE ne peut pas utiliser **Je postule** ni **Je recrute**.
- Les offres créées par un recruteur FREE restent enregistrées mais **masquées du public**.
- Les profils/publications FREE restent également masqués.
- Dès qu'un abonnement **STANDARD** ou **BUSINESS** devient actif, les publications concernées deviennent automatiquement visibles.
- À l'expiration d'un abonnement STANDARD/BUSINESS, les publications sont automatiquement masquées jusqu'au renouvellement.
- Un compte qui reste uniquement FREE et n'a jamais eu de formule payante est automatiquement supprimé après l'expiration de ses 7 jours, avec ses publications et données liées.
- Les anciens comptes FREE recruteur initialement configurés à 24 heures sont normalisés à 7 jours depuis leur date de début.
- La migration `migrations/0005_free_7_days.sql` est incluse.


## V11 — Expiration des abonnements payants
À l'expiration d'un abonnement STANDARD ou BUSINESS, le compte repasse automatiquement en FREE pour 7 jours à compter de la date d'expiration du payant. Pendant ce délai, ses publications sont masquées et Je postule / Je recrute sont désactivés. Un renouvellement payant réactive automatiquement la visibilité. Sans nouvel abonnement payant actif à la fin des 7 jours, le compte et ses données liées sont supprimés automatiquement.


## V12 — Initialiser / Récupérer le Super Admin

La connexion propose maintenant **Initialiser / Récupérer le Super Admin**.

Secrets Cloudflare requis :
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_RECOVERY_TOKEN`
- `SESSION_SECRET`

La procédure demande l'adresse e-mail Super Admin et le jeton de récupération. Le Worker vérifie ces informations uniquement côté serveur contre les Secrets Cloudflare. Le mot de passe n'est jamais renvoyé au navigateur et n'est jamais inclus dans GitHub ou dans le ZIP.

Si le compte n'existe plus, il est recréé avec le rôle `super_admin`. S'il existe mais est bloqué, son rôle/statut sont restaurés et son mot de passe est réinitialisé à la valeur actuelle de `SUPER_ADMIN_PASSWORD`. `session_version` est incrémenté afin d'invalider toutes les anciennes sessions.

La route `GET /api/health` indique seulement si la configuration Super Admin est présente et si le compte existe/est actif ; elle ne révèle ni l'e-mail, ni le mot de passe, ni le jeton.

### Configuration Cloudflare
Dans **Variables and Secrets**, créer `SUPER_ADMIN_RECOVERY_TOKEN` comme Secret avec une valeur longue, aléatoire et différente du mot de passe administrateur. Ne jamais placer sa valeur dans le dépôt GitHub.


## V14 — Navigation, statistiques réelles et identité rose

- Les visiteurs voient uniquement **Accueil** dans la barre de navigation.
- Après connexion, les rubriques correspondant au rôle sont injectées horizontalement dans la même barre : Demandeur, Recruteur ou Super Admin.
- Les anciennes entrées publiques Offres d'emploi, Profils/Candidats, Entreprises, Métiers, Conseils, À propos et Contact ne sont plus affichées dans la barre principale.
- La zone statistique de l'accueil contient exactement trois indicateurs issus de D1 : offres d'emploi visibles, entreprises/recruteurs actifs et candidats actifs. Chaque indicateur affiche également le mouvement des 30 derniers jours.
- Le lien visible **Initialiser / Récupérer le Super Admin** a été retiré de la fenêtre de connexion. Les routes sécurisées V12/V13 restent disponibles côté serveur pour maintenance.
- Les tableaux de bord Demandeur, Recruteur et Super Admin utilisent désormais des métriques dynamiques réelles.
- Toute l'interface adopte une identité **rose amour** : rose profond, rose poudré, bordeaux rosé, dégradés, ombres douces et nuances.


## V15 — Navigation connectée et modules professionnels

- Le membre connecté peut cliquer sur **Accueil** et revenir à la page d’accueil complète sans fermer sa session.
- Sur ordinateur/tablette, la barre principale utilise deux lignes centrées : identité/compte sur la première, **Accueil + menus du rôle** sur la seconde. Les éléments se répartissent sur plusieurs lignes si nécessaire afin de rester visibles.
- Le menu Recruteur ne contient plus **Favoris**.
- Les espaces Demandeur, Recruteur et Super Admin disposent maintenant de modules complets et dynamiques : candidatures, propositions, offres, messages, notifications, paiements, gestion des membres, activations, vérifications, rapports et journal d’audit.
- Le Super Admin est un compte permanent : aucune date d’expiration, aucun abonnement requis et aucune suppression automatique liée aux règles FREE.
- Les trois statistiques d’accueil ont un fond rose en dégradé et un texte blanc, et restent alimentées par les données D1 réelles.


## V16 — Actions Super Admin complètes

Les menus Super Admin sont reliés à des modules fonctionnels :

- **Tableau de bord** : indicateurs D1 et accès rapides.
- **Membres** : recherche, profil détaillé, statut, abonnement, prolongation, notification, invalidation des sessions et suppression.
- **Activations** : onglets En attente / Activées / Rejetées / Historique, validation et rejet.
- **Vérifications** : filtre des dossiers recruteurs, validation, retour à compléter et accès au compte.
- **Offres** : recherche, statut, détails, recruteur, suspension/clôture/réactivation et suppression.
- **Candidatures** : suivi global par statut sans remplacer la décision du recruteur.
- **Rapports** : périodes 1/7/30/90/365 jours, indicateurs, impression et export CSV.
- **Journal** : recherche et filtres des actions sensibles enregistrées côté serveur.
- **Messages** : messagerie dédiée au support administratif, séparée des conversations privées candidat–recruteur.
- **Paramètres** : identité/support/prix/durées enregistrés dans D1 et sécurité du Super Admin. Les Secrets Cloudflare ne sont jamais exposés.

La migration `migrations/0007_admin_modules.sql` ajoute les tables `app_settings` et `support_messages`. Le Worker sait aussi les créer automatiquement si nécessaire.


## V17 — Compte Recruteur professionnel

- Tableau de bord recruteur enrichi avec offres créées/visibles, brouillons, clôturées, vues, candidatures, nouvelles candidatures, propositions et notifications.
- Publication d'offre complète avec prévisualisation, brouillon, niveau d'études, expérience, compétences, missions, profil recherché et conditions de travail.
- Mes offres : filtres, visibilité réelle, vues, candidatures, modification, duplication, changement de statut et suppression.
- Candidatures : pipeline Nouvelle / À l'étude / Présélectionnée / Entretien / Acceptée / Refusée.
- Recherche candidats : métier, ville, expérience, études et disponibilité.
- FREE peut consulter mais ne peut pas utiliser Je recrute, et ses publications restent masquées.
- Messagerie séparée du support administratif.
- Paramètres avec fermeture de toutes les sessions.
- Le renouvellement d'un abonnement payant est permis durant ses 7 derniers jours.


## V18 — Correction du chargement des pages

- Le moteur de navigation attend désormais réellement chaque fonction `render...()`.
- Une erreur API ou D1 ne laisse plus la page bloquée sur « Chargement des données… ».
- En cas d'échec, l'interface affiche le message serveur, la référence Cloudflare éventuelle et des boutons **Réessayer** / **Retour à l'accueil**.
- Les routes recruteur préparent explicitement les colonnes professionnelles avant leurs requêtes.
- Nouvelle route de diagnostic authentifiée : `GET /api/recruiter/health`.


## V19 — Demandeur professionnel et actions FREE

- Les boutons d'accueil **Je cherche un emploi** et **Je recrute** utilisent désormais une délégation de clic fiable.
- Visiteur non connecté :
  - **Je postule** ouvre l'inscription Demandeur.
  - **Je recrute** ouvre l'inscription Recruteur.
- Compte FREE connecté :
  - **Je postule** renvoie vers Abonnement pour un Demandeur.
  - **Je recrute** renvoie vers Abonnement pour un Recruteur.
- STANDARD/BUSINESS actif : les actions sont exécutées normalement.
- Le Super Admin ne reçoit aucun message d'abonnement et ne possède pas de menu Abonnement.
- Espace Demandeur enrichi : tableau de bord, recherche d'offres avancée, suivi des candidatures, aperçu du profil comme recruteur et notifications cliquables.


## V20 — Synchronisation générale et annuaires publics paginés

- Toutes les requêtes GET utilisent `cache: no-store` et chaque ouverture de page privée recharge la session et l'abonnement avant de récupérer les données du module.
- Le texte « Chargement des données… » a été retiré. Des squelettes visuels sans texte sont utilisés pendant les requêtes.
- Nouveau centre Super Admin **Demandes & inscriptions** : toutes les inscriptions présentes, demandes d'activation, vérifications, support, propositions « Je recrute » et candidatures sont centralisées sans filtre de statut.
- Les annuaires publics **Offres disponibles** et **Talents disponibles** sont accessibles aux visiteurs connectés ou non et utilisent une pagination serveur de 12 éléments par page.
- Le moteur de recherche de l'accueil ouvre la page dédiée aux offres avec les critères saisis.
- Deux boutons de consultation permettent d'ouvrir directement toutes les offres ou tous les talents.
- Les boutons **Je cherche un emploi** / **Je recrute** sont reliés directement aux inscriptions correspondantes pour les visiteurs non connectés.
- Pour les comptes FREE connectés, les actions professionnelles **Je postule** / **Je recrute** redirigent vers Abonnement ; STANDARD/BUSINESS actif exécute l'action.
- Le Super Admin ne reçoit aucun message d'abonnement.


## V21 — Corrections de synchronisation et actions FREE

- Suppression du double gestionnaire des boutons **Je cherche un emploi** / **Je recrute** : une seule logique de navigation est utilisée.
- Visiteur non connecté : ouverture directe de l’inscription correspondant au rôle.
- Demandeur FREE sur **Je cherche un emploi** et Recruteur FREE sur **Je recrute** : redirection directe vers **Abonnement**.
- Les boutons **Voir toutes les offres disponibles** et **Voir tous les talents disponibles** restent publics et accessibles sans inscription.
- Recherche publique enrichie : contrat, catégorie et date pour les offres ; expérience, études et disponibilité pour les talents.
- Les cartes publiques disposent maintenant de boutons **Voir l’offre / Voir le profil** et **Je postule / Je recrute** selon le rôle.
- Les écrans à chargement asynchrone sensibles affichent une erreur avec **Réessayer** et **Retour à l’accueil** au lieu de rester bloqués sur un chargement.
- Les plafonds de 500 / 2000 enregistrements ont été retirés des principales vues Super Admin afin que toutes les inscriptions et demandes restent accessibles.
- Le journal Admin n’est plus redéfini deux fois : la version filtrable reste active.
- Aucun secret Super Admin n’est ajouté au frontend, au README ou à `wrangler.jsonc`.
