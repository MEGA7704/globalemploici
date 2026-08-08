PRAGMA foreign_keys = ON;
-- V11 : la logique de bascule payant -> FREE 7 jours est gérée par le Worker,
-- car elle doit aussi créer les notifications et supprimer les données liées en sécurité.
UPDATE subscriptions
SET status='expired', updated_at=CURRENT_TIMESTAMP
WHERE plan IN ('standard','business')
  AND status='active'
  AND datetime(expires_at)<=datetime('now');
