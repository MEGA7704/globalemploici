# GLOBAL EMPLOI V32 — Design accueil

Cette version part de la V31 stable et modifie uniquement la présentation publique de l’accueil.

## Éléments conservés
- API et Worker V31
- D1 et KV existants
- IDs techniques des recherches et boutons
- `data-open-register` et `data-home-primary`
- routes `#home`, `#jobs`, `#candidates`, `#plans`
- inscription, connexion, pagination et espaces connectés

## Modifications visuelles
- Actions candidat/recruteur centrées
- Recherches populaires : Comptabilité, Informatique, Commercial, Marketing, Chauffeur, Maçonnerie
- Image Hero affichée en `contain`, sans recadrage des personnages
- Cartes flottantes supprimées
- Statistiques affichées sans cadre global
- Ligne rose sous les statistiques
- Trois cartes horizontales : Offres, Talents, Espace recruteurs
- Boutons `browseJobsHome` et `browseCandidatesHome` déplacés et centrés dans leurs cartes
- Sections supprimées : Domaines professionnels, Conseils carrière, À propos

## Déploiement
Exécuter `npm run build`, puis déployer le contenu complet de `dist/`. Conserver les bindings Cloudflare existants (`JOB_DB`, `JOB_KV`).
