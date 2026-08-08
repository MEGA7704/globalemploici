
## V30 — correction de finalisation de l’inscription
- Le formulaire se ferme immédiatement après la réponse 201 de `/api/register`.
- Le chargement post-inscription de `/api/session` ne peut plus maintenir le bouton en rotation.
- Timeout frontend de 20 s sur les appels API pour éviter tout chargement infini.
- Les routes register/login/session/logout ne déclenchent plus la reconstruction legacy sur leur chemin critique.

# GLOBAL EMPLOI V27 — Refonte complète de la couche de données

V27 archive automatiquement les anciennes tables en `legacy_v26_*`, recrée un schéma canonique propre, puis importe les anciennes données une seule fois. Le frontend et les routes API gardent leurs noms d'origine. `users.id` est l'unique clé métier. Aucune modification de schéma n'est exécutée pendant les requêtes normales après l'initialisation V27.

Bindings: `JOB_DB` (D1), `JOB_KV` (KV), `ASSETS` fourni par Cloudflare Pages. Secrets Super Admin uniquement dans Cloudflare.


## V29 — Correction validation inscription
Les formulaires Demandeur et Recruteur ont été renforcés avec validation visible, état de chargement, erreurs détaillées et POST natif de secours.
