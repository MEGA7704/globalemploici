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
