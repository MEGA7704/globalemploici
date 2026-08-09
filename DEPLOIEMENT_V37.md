# Déploiement V37

1. Déployer le contenu complet du dossier `dist/` sur Cloudflare Pages.
2. Conserver les bindings existants `JOB_DB` et `JOB_KV`.
3. Aucune nouvelle migration D1 n’est requise par V37 : la table `user_hidden_items` provient déjà de V36.
4. Ne pas remettre d’anciennes versions de `app.js` ou `_worker.js`.
5. Après déploiement, tester : Notifications, Messagerie, Mes candidatures, Recherche candidats, Paramètres et footer.
