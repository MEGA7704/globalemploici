# Déploiement GLOBAL EMPLOI V36

1. Déployer l’intégralité de `dist/` sur Cloudflare Pages.
2. Conserver les bindings existants `JOB_DB` et `JOB_KV`.
3. Appliquer la migration D1 `migrations/0002_v36_client_actions.sql` pour créer la table de masquage client.
4. Aucun bootstrap ou migration globale n’est exécuté pendant l’ouverture des menus.
5. Vérifier ensuite Notifications, Messagerie, Mes candidatures, Propositions, Abonnement, Paramètres et le footer.

La table `user_hidden_items` conserve les suppressions locales des messages/propositions sans effacer les données administratives. Si la migration n’a pas encore été appliquée, elle est créée uniquement lors de la première action de suppression concernée, jamais lors de la simple consultation d’un menu.
