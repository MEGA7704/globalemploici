PRAGMA foreign_keys = ON;

-- GLOBAL EMPLOI V10 : toutes les formules FREE durent 7 jours.
UPDATE subscriptions
SET expires_at = strftime('%Y-%m-%dT%H:%M:%SZ', datetime(started_at, '+7 days')),
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'free'
  AND status = 'active';
