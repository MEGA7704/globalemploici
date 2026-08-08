# Déploiement GLOBAL EMPLOI V27

## 1. Conserver les bindings Cloudflare
- D1 : `JOB_DB` → base `job_d1`
- KV : `JOB_KV`
- Pages Advanced Mode : `_worker.js` est copié dans `dist/` par `npm run build`.

## 2. Secrets Cloudflare
Configurer uniquement dans Cloudflare, jamais dans GitHub :
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_RECOVERY_TOKEN`

## 3. Premier appel API après déploiement
Le Worker V27 effectue une seule reconstruction contrôlée :
1. archive les anciennes tables sous `legacy_v26_*` ;
2. crée les tables canoniques propres ;
3. importe les comptes, profils, abonnements, offres, candidatures, propositions, messages, notifications et données Admin ;
4. convertit les anciennes liaisons `profile.id` vers `users.id` ;
5. écrit `schema_version = 27.0.0`.

Les appels suivants n'exécutent plus de modification de schéma.

## 4. Vérification
Après déploiement, ouvrir `/api/health`. La réponse attendue contient `"ok": true` et des compteurs de liaison à zéro.

Le projet inclut `npm run test:smoke` pour tester localement le Worker complet contre une base SQLite simulant D1.
