# GLOBAL EMPLOI V31 — correction des délais de chargement

## Cause corrigée
La V30 appelait `ensureRuntimeSchema()` avant presque toutes les routes API privées. Cette fonction pouvait renommer des tables, recréer le schéma, importer les tables `legacy_v26_*` et vérifier toute la base avant d'afficher une simple page. Sur Cloudflare D1, ce travail pouvait dépasser le délai du navigateur et provoquer :

> Impossible de charger cette section — Le serveur met trop de temps à répondre.

## Comportement V31
- Aucune migration, archive, import legacy ou réparation globale n'est exécutée lors de la navigation.
- `/api/session` lit uniquement KV + l'utilisateur D1 + son abonnement.
- Les pages Demandeur lisent uniquement les données du `users.id` connecté.
- Les pages Recruteur lisent uniquement les données du `users.id` connecté.
- Les pages Admin lisent directement les tables métier, sans lancer `ensureRuntimeSchema()` ni `ensureDataLinkage()`.
- `/api/health` et `/api/data-linkage` restent des diagnostics explicites ; ils ne bloquent plus les menus.

## Base D1 existante
Cette version est conçue pour utiliser directement la base D1 déjà en service. Elle ne renomme pas les tables et ne réimporte pas les données lors des requêtes.

## Déploiement
Déployer le contenu complet de `dist/` sur Cloudflare Pages. Conserver les bindings :
- `JOB_DB` → D1 existante
- `JOB_KV` → KV existant

Ne pas supprimer la base D1 existante.
