# GLOBAL EMPLOI V27 — Refonte complète de la couche de données

V27 archive automatiquement les anciennes tables en `legacy_v26_*`, recrée un schéma canonique propre, puis importe les anciennes données une seule fois. Le frontend et les routes API gardent leurs noms d'origine. `users.id` est l'unique clé métier. Aucune modification de schéma n'est exécutée pendant les requêtes normales après l'initialisation V27.

Bindings: `JOB_DB` (D1), `JOB_KV` (KV), `ASSETS` fourni par Cloudflare Pages. Secrets Super Admin uniquement dans Cloudflare.


## V29 — Correction validation inscription
Les formulaires Demandeur et Recruteur ont été renforcés avec validation visible, état de chargement, erreurs détaillées et POST natif de secours.
