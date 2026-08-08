# GLOBAL EMPLOI V28 — correction boutons et routage public

Corrections principales :
- définition de `esc()` utilisée par les rendus de listes et détails ;
- définition complète de `registerModal()` pour Demandeur et Recruteur ;
- routage initial par hash (`#jobs`, `#candidates`, etc.) ;
- gestion `hashchange` pour navigation publique ;
- test navigateur automatique `scripts/test_public_buttons_v28.py`.

Déploiement : publier le dossier `dist/` généré par `npm run build` avec le Worker inclus.
