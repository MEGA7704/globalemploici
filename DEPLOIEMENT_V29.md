# GLOBAL EMPLOI V29 — Validation des inscriptions

## Correction principale
- Le formulaire Demandeur et Recruteur possède maintenant un gestionnaire de soumission robuste.
- Validation visible directement dans la fenêtre d'inscription.
- État du bouton : « Création du compte… » pendant l'enregistrement.
- Les erreurs API affichent le message, le code et la référence quand disponibles.
- POST natif `/api/register` disponible en secours si JavaScript ne s'exécute pas.
- Aucun mot de passe ne doit être envoyé dans l'URL.

## Tests exécutés
- Soumission navigateur Demandeur : OK.
- Soumission navigateur Recruteur : OK.
- POST `/api/register` JSON : OK.
- POST `/api/register` application/x-www-form-urlencoded : OK.
- Intégration Worker + D1 + KV : OK.
- Tests Admin / Recruteur / Demandeur existants : OK.

## Déploiement
Déployer le dossier `dist` généré par `npm run build` avec les bindings Cloudflare existants `JOB_DB` et `JOB_KV`.
