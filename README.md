# GLOBAL EMPLOI V39

Version basée sur la V38 stable avec intégration juridique publique des documents fournis par MEGA SERVICES SARL U.

## Ajouts V39
- page publique `#cgu` contenant les Conditions Générales d’Utilisation fournies, sans modification du texte ;
- page publique `#confidentialite` contenant la Politique de confidentialité fournie, sans modification du texte ;
- liens visibles sous les actions principales de l’accueil ;
- liens visibles avant validation dans les formulaires d’inscription Demandeur/Recruteur ;
- liens ajoutés au footer premium ;
- documents DOCX sources conservés dans `public/legal/` et copiés dans `dist/legal/` ;
- routage public compatible avec les utilisateurs connectés ou non connectés.

Les liaisons API, les rôles, les abonnements et la base D1 ne sont pas modifiés par cette version.


## V40 — âge minimum Demandeur
- Inscription Demandeur réservée aux personnes âgées de 18 ans ou plus.
- Contrôle double : navigateur + API `/api/register`.
- La date de naissance est obligatoire et contrôlée côté serveur.
