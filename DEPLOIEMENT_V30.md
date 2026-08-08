# GLOBAL EMPLOI V30 — finalisation inscription

Correction ciblée du blocage « Création du compte… » :

1. La fermeture du formulaire ne dépend plus de `boot()` après un POST `/api/register` réussi.
2. Les requêtes frontend ont un délai maximal de 20 secondes et sortent proprement de l'état de chargement.
3. `/api/register`, `/api/login`, `/api/session` et `/api/logout` ne déclenchent plus la migration legacy V27 sur leur chemin critique.
4. L'inscription reste : users -> profil -> abonnement FREE -> session -> réponse 201.

Après déploiement, remplacer tout `dist/` et purger le cache Cloudflare si nécessaire.
