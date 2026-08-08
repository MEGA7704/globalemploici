PRAGMA foreign_keys = ON;

-- V24 : FREE reste accessible pour la consultation.
-- Les comptes STANDARD/BUSINESS conservent la priorité lorsqu'ils sont actifs.

UPDATE subscriptions
SET status='expired', updated_at=CURRENT_TIMESTAMP
WHERE plan IN ('standard','business')
  AND status='active'
  AND datetime(expires_at)<=datetime('now');

UPDATE subscriptions
SET status='expired', updated_at=CURRENT_TIMESTAMP
WHERE plan='free' AND status='active'
  AND EXISTS(
    SELECT 1 FROM subscriptions p
    WHERE p.user_id=subscriptions.user_id
      AND p.plan IN ('standard','business')
      AND p.status='active'
      AND datetime(p.expires_at)>datetime('now')
  );

UPDATE subscriptions
SET status='active', expires_at='2099-12-31T23:59:59Z', updated_at=CURRENT_TIMESTAMP
WHERE id IN (
  SELECT MAX(f.id)
  FROM subscriptions f
  JOIN users u ON u.id=f.user_id
  WHERE f.plan='free'
    AND u.role IN ('candidate','recruiter')
    AND NOT EXISTS(
      SELECT 1 FROM subscriptions p
      WHERE p.user_id=f.user_id
        AND p.plan IN ('standard','business')
        AND p.status='active'
        AND datetime(p.expires_at)>datetime('now')
    )
  GROUP BY f.user_id
);

INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status,created_at,updated_at)
SELECT u.id,'free',CURRENT_TIMESTAMP,'2099-12-31T23:59:59Z','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM users u
WHERE u.role IN ('candidate','recruiter')
  AND NOT EXISTS(
    SELECT 1 FROM subscriptions p
    WHERE p.user_id=u.id
      AND p.plan IN ('standard','business')
      AND p.status='active'
      AND datetime(p.expires_at)>datetime('now')
  )
  AND NOT EXISTS(
    SELECT 1 FROM subscriptions f WHERE f.user_id=u.id AND f.plan='free'
  );

-- Réactive seulement les comptes désactivés automatiquement par les anciennes versions.
-- Une désactivation explicite effectuée depuis l'Admin reste respectée.
UPDATE users
SET status='active', updated_at=CURRENT_TIMESTAMP
WHERE role IN ('candidate','recruiter')
  AND status='disabled'
  AND COALESCE((
    SELECT a.metadata
    FROM audit_logs a
    WHERE a.action='USER_STATUS_CHANGED'
      AND a.target_type='user'
      AND a.target_id=CAST(users.id AS TEXT)
    ORDER BY a.id DESC LIMIT 1
  ),'') NOT LIKE '%"status":"disabled"%';
