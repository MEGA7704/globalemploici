-- V26 : correction stricte des liaisons entre comptes, profils et données métier.
-- Identifiant canonique : users.id.

-- Chaque compte métier possède un profil.
INSERT INTO candidate_profiles(user_id,created_at,updated_at)
SELECT u.id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM users u
WHERE u.role='candidate'
  AND NOT EXISTS(SELECT 1 FROM candidate_profiles p WHERE p.user_id=u.id);

INSERT INTO recruiter_profiles(user_id,created_at,updated_at,verification_status)
SELECT u.id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'unverified'
FROM users u
WHERE u.role='recruiter'
  AND NOT EXISTS(SELECT 1 FROM recruiter_profiles p WHERE p.user_id=u.id);

-- Chaque compte métier possède au moins une ligne d'abonnement.
INSERT INTO subscriptions(user_id,plan,started_at,expires_at,status,created_at,updated_at)
SELECT u.id,'free',CURRENT_TIMESTAMP,'2099-12-31T23:59:59Z','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM users u
WHERE u.role IN ('candidate','recruiter')
  AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=u.id);

-- Anciennes offres liées par erreur à recruiter_profiles.id.
UPDATE jobs
SET recruiter_id=(SELECT rp.user_id FROM recruiter_profiles rp WHERE rp.id=jobs.recruiter_id LIMIT 1),
    updated_at=CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=jobs.recruiter_id AND u.role='recruiter')
  AND EXISTS(
    SELECT 1 FROM recruiter_profiles rp
    JOIN users u ON u.id=rp.user_id AND u.role='recruiter'
    WHERE rp.id=jobs.recruiter_id
  );

-- Anciennes candidatures liées par erreur à candidate_profiles.id.
UPDATE applications
SET candidate_id=(SELECT cp.user_id FROM candidate_profiles cp WHERE cp.id=applications.candidate_id LIMIT 1),
    updated_at=CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=applications.candidate_id AND u.role='candidate')
  AND EXISTS(
    SELECT 1 FROM candidate_profiles cp
    JOIN users u ON u.id=cp.user_id AND u.role='candidate'
    WHERE cp.id=applications.candidate_id
  );

-- Anciennes propositions liées par erreur aux identifiants de profils.
UPDATE recruitment_requests
SET recruiter_id=(SELECT rp.user_id FROM recruiter_profiles rp WHERE rp.id=recruitment_requests.recruiter_id LIMIT 1),
    updated_at=CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=recruitment_requests.recruiter_id AND u.role='recruiter')
  AND EXISTS(
    SELECT 1 FROM recruiter_profiles rp
    JOIN users u ON u.id=rp.user_id AND u.role='recruiter'
    WHERE rp.id=recruitment_requests.recruiter_id
  );

UPDATE recruitment_requests
SET candidate_id=(SELECT cp.user_id FROM candidate_profiles cp WHERE cp.id=recruitment_requests.candidate_id LIMIT 1),
    updated_at=CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=recruitment_requests.candidate_id AND u.role='candidate')
  AND EXISTS(
    SELECT 1 FROM candidate_profiles cp
    JOIN users u ON u.id=cp.user_id AND u.role='candidate'
    WHERE cp.id=recruitment_requests.candidate_id
  );

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_user_link ON candidate_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_profiles_user_link ON recruiter_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_recruiter_link ON jobs(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_link ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_link ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_recruiter_link ON recruitment_requests(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidate_link ON recruitment_requests(candidate_id);
