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
