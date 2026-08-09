# GLOBAL EMPLOI V36 — Actions clients & Support

V36 est basée sur la branche stable V35/V31 et ajoute les corrections métier demandées sans réintroduire les migrations lourdes dans les menus.

## Corrections principales
- bouton **Contacter le support** dans Notifications et Messagerie avec le même popup dédié ;
- formulaire support retiré de Paramètres ;
- état **lu/non lu** des notifications persistant dans D1 + lecture individuelle ;
- suppression des notifications du compte client ;
- masquage individuel des messages reçus et propositions de recrutement, avec conservation de la copie source pour l’Admin ;
- cycle candidature **Annuler → Réactiver / Retirer** ;
- une candidature retirée disparaît des listes Demandeur/Recruteur mais reste dans l’administration avec le statut `withdrawn` ;
- blocage frontend + backend d’une nouvelle demande d’activation lorsque STANDARD/BUSINESS est encore actif ;
- **Supprimer définitivement mon compte** envoie désormais une demande officielle au support ; seul le Super Admin conserve l’action de suppression définitive ;
- footer légal centré pour **MEGA SERVICES SARL U**.

## Tests inclus
- `scripts/test_v36_member_actions.mjs`
- `scripts/test_v36_frontend.py`
- tests V31 sans runtime bootstrap ;
- tests des boutons publics et inscription.

Voir `DEPLOIEMENT_V36.md`.
