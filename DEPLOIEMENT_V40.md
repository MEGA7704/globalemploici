# GLOBAL EMPLOI V40 — Âge minimum Demandeur

## Correction
L'inscription d'un compte **Demandeur d'emploi** est désormais strictement réservée aux personnes âgées de **18 ans ou plus**.

- Date de naissance obligatoire.
- Limite visible dans le formulaire d'inscription.
- Validation JavaScript avant envoi.
- Validation indépendante dans `POST /api/register` : un appel API direct avec un âge inférieur à 18 ans est refusé en HTTP 403.
- Les comptes Recruteur ne sont pas concernés par cette règle spécifique.
- Les CGU et la Politique de confidentialité intégrées en V39 restent inchangées.
